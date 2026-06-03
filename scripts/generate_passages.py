#!/usr/bin/env python3
"""
단락(passage) 사전 생성 — 하이브리드(LLM 주제분할 + 결정적 길이 정규화)
────────────────────────────────────────────────────────────────────
파이프라인 (장 단위):
  A. LLM 주제 분할     : Gemini 2.5 Flash-Lite, ko+en 본문 + 장르별 target/min/max
  B. 경계 스냅          : 단락 시작점들로 연속·완전 커버 세그먼트 구성 (겹침/공백 자동 해소, filler 없음)
  C. (생략 — B가 흡수)
  D. MAX 강제           : 길이 > max 세그먼트를 verse 임베딩 유사도 valley에서 분할
  E. MIN 강제           : 길이 < min 세그먼트를 centroid 코사인 가까운 이웃과 병합
  F. 메타 백필          : 분할/병합/빈 메타 세그먼트만 메타데이터 재생성 (Flash-Lite 1회/장)
  G. build_records      : passage_id={book}:{chapter}:{vs}-{ve} 스킴 유지 → passages.json

길이 일관성·폴백·필러 제거는 B/D/E 결정적 후처리가 보장하므로
LLM은 주제 경계만 담당 (최저비용 Flash-Lite). LLM 완전 실패 시에도
장 전체 블록이 아니라 target 크기 균등 분할로 대체한다.

실행:
  python3 scripts/generate_passages.py                # 전체
  python3 scripts/generate_passages.py --limit 2      # 처음 2장 스모크 테스트
  python3 scripts/generate_passages.py --book Genesis # 한 책만
  python3 scripts/generate_passages.py --restart      # 체크포인트 무시

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
  - public/data/embeddings_dense.bin (verse 임베딩 — 먼저 생성)
  - pip install numpy
"""

import argparse
import json
import os
import re
import struct
import sys
import time
import urllib.request
import urllib.error
import numpy as np
from pathlib import Path


def classify_429(err_body: str):
    """429 분류 → ('daily', 0) | ('rate', retry_delay_seconds)."""
    nb = err_body.lower().replace(" ", "")
    if "perday" in nb or "daily" in nb:
        return ("daily", 0.0)
    m = re.search(r'"retrydelay"\s*:\s*"(\d+(?:\.\d+)?)s"', err_body.lower())
    return ("rate", float(m.group(1)) if m else 0.0)

# ─── 티어 ─────────────────────────────────────────────────
PAID_TIER = True
REQ_INTERVAL = 0.4 if PAID_TIER else 13.0
# ─────────────────────────────────────────────────────────

# ─── 장르별 길이 한계 (min, target, max) — verse.genre 기준 ──
GENRE_BOUNDS = {
    "시가서":   (1, 3, 6),    # 시편/잠언/욥/전도/아가 — 짧은 단위 허용 (min=1)
    "복음서":   (3, 6, 9),
    "역사서":   (4, 7, 11),   # 서사 — 긴 단위 허용 (구약 역사서 + 사도행전)
    "모세오경": (4, 7, 11),
    "바울서신": (2, 5, 8),
    "일반서신": (2, 5, 8),
    "대예언서": (3, 5, 9),
    "소예언서": (3, 5, 9),
    "예언서":   (3, 5, 9),
}
DEFAULT_BOUNDS = (3, 5, 9)


def get_bounds(genre: str):
    return GENRE_BOUNDS.get(genre, DEFAULT_BOUNDS)


def load_api_key(root: Path) -> str:
    env = root / ".env.local"
    if not env.exists():
        raise FileNotFoundError(f"{env} 가 없습니다.")
    for line in env.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise ValueError("GEMINI_API_KEY 항목을 .env.local에서 찾을 수 없습니다.")


def call_gemini(prompt: str, api_key: str, retries: int = 6) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash-lite:generateContent?key={api_key}"
    )
    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        },
    }).encode("utf-8")

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            if e.code in (400, 401, 403) and (
                "API_KEY_INVALID" in err_body or "API key" in err_body
                or "PERMISSION_DENIED" in err_body or "expired" in err_body.lower()
            ):
                raise RuntimeError("API 키가 만료되었거나 무효입니다. .env.local 의 GEMINI_API_KEY 를 갱신하세요.")
            if e.code == 429:
                kind, rd = classify_429(err_body)
                if kind == "daily":
                    raise RuntimeError("일일 API 할당량 초과")
                wait = rd if rd > 0 else 15 * (2 ** attempt)
                if attempt == retries - 1:
                    raise RuntimeError("속도 제한(429) 재시도 한도 초과 — 잠시 후 다시 실행하면 체크포인트부터 이어집니다.")
                print(f"  ⏳ 분당 속도제한(429) → {wait:.0f}초 대기 ({attempt+1}/{retries})...")
                time.sleep(wait)
            else:
                # 503 등 일시 오류도 재시도 (이전엔 즉시 raise → 장 전체 폴백 유발)
                print(f"  ⚠ HTTP {e.code} (시도 {attempt+1}/{retries}): {err_body[:160]}")
                if attempt == retries - 1:
                    raise
                time.sleep(5 * (attempt + 1))
        except RuntimeError:
            raise
        except Exception as e:
            print(f"  ❌ 오류 (시도 {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))

    raise RuntimeError(f"재시도 {retries}회 모두 실패.")


# ─── verse 임베딩 로드 (embeddings_dense.bin) ──────────────
def load_verse_embeddings(path: Path):
    """row i ↔ bible[i] (verse id i). 반환: (total, dim) float32 또는 None"""
    if not path.exists():
        return None
    with open(path, "rb") as f:
        total = struct.unpack("<I", f.read(4))[0]
        dim   = struct.unpack("<I", f.read(4))[0]
        vmin  = struct.unpack("<d", f.read(8))[0]
        scale = struct.unpack("<d", f.read(8))[0]
        q = np.frombuffer(f.read(), dtype=np.uint8).reshape(total, dim)
    return q.astype(np.float32) * scale + vmin


def _cos(a, b) -> float:
    na = float(np.linalg.norm(a)); nb = float(np.linalg.norm(b))
    if na * nb < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# ─── A: 분할 프롬프트 (ko + en + 장르별 길이) ───────────────
PROMPT_TEMPLATE = """당신은 성경 본문을 자연스러운 주제 단락으로 분할하고 각 단락의 의미를 정리하는 전문가입니다.

아래는 {book_ko}({book_en}) {chapter}장의 모든 구절입니다 (형식 "절: 한국어 / English").

[규칙]
1. 본문을 자연스러운 주제 단락으로 분할하세요. 이 장르({genre})의 권장 길이는 약 {tgt}절이며 가급적 {mn}~{mx}절 범위를 지키세요.
2. **모든 절을 빠짐없이 포함**, 단락은 연속적이어야 합니다(절 번호 겹침/공백 금지).
3. 각 단락마다 작성:
   - verse_start, verse_end (정수)
   - theme_title: 8~15자, 단락의 핵심 주제
   - characteristics: 2~4개 짧은 한 문장 (문학 장르/화자/대상/표현 양식 등)
   - core_meaning: 핵심 의미와 적용점 한두 문장

[출력 형식] 반드시 아래 JSON만 반환. 다른 텍스트 금지.
{{"paragraphs":[{{"verse_start":<int>,"verse_end":<int>,"theme_title":"...","characteristics":["...","..."],"core_meaning":"..."}}]}}

[본문]
{verses_block}
"""


def build_split_prompt(book_en, book_ko, chapter, genre, verses) -> str:
    mn, tgt, mx = get_bounds(genre)
    verses_block = "\n".join(
        f"{v['verse']}: {v.get('ko','')} / {v.get('en','')}" for v in verses
    )
    return PROMPT_TEMPLATE.format(
        book_en=book_en, book_ko=book_ko, chapter=chapter, genre=genre,
        mn=mn, tgt=tgt, mx=mx, verses_block=verses_block,
    )


def parse_paragraphs(raw: str):
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    parsed = json.loads(text)
    paragraphs = parsed.get("paragraphs")
    if not isinstance(paragraphs, list) or not paragraphs:
        raise ValueError("paragraphs 비어있음")
    return paragraphs


# ─── F: 메타 백필 프롬프트 ─────────────────────────────────
BACKFILL_TEMPLATE = """아래는 {book_ko}({book_en}) {chapter}장 본문입니다 (형식 "절: 한국어 / English").

지정된 각 단락 범위에 대해 메타데이터를 작성하세요:
- theme_title: 8~15자, 핵심 주제
- characteristics: 2~4개 짧은 한 문장
- core_meaning: 핵심 의미와 적용점 한두 문장

[출력 형식] 반드시 아래 JSON만. 다른 텍스트 금지.
{{"items":[{{"verse_start":<int>,"verse_end":<int>,"theme_title":"...","characteristics":["..."],"core_meaning":"..."}}]}}

[메타데이터가 필요한 단락 범위]
{ranges}

[본문]
{verses_block}
"""


def backfill_meta(book_en, book_ko, chapter, verses, ranges, api_key):
    """ranges = [(vs,ve), ...] → {(vs,ve): {theme_title, characteristics, core_meaning}}"""
    if not ranges:
        return {}
    verses_block = "\n".join(
        f"{v['verse']}: {v.get('ko','')} / {v.get('en','')}" for v in verses
    )
    ranges_str = ", ".join(f"{a}-{b}" for a, b in ranges)
    prompt = BACKFILL_TEMPLATE.format(
        book_en=book_en, book_ko=book_ko, chapter=chapter,
        ranges=ranges_str, verses_block=verses_block,
    )
    try:
        raw = call_gemini(prompt, api_key)
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        items = json.loads(text).get("items", [])
    except Exception as e:
        print(f"    ⚠ 메타 백필 실패: {e} — 빈 메타 유지")
        return {}
    out = {}
    for it in items:
        try:
            vs, ve = int(it["verse_start"]), int(it["verse_end"])
        except (KeyError, TypeError, ValueError):
            continue
        out[(vs, ve)] = {
            "theme_title": str(it.get("theme_title", "")).strip() or "단락",
            "characteristics": [
                str(c).strip() for c in (it.get("characteristics") or []) if str(c).strip()
            ],
            "core_meaning": str(it.get("core_meaning", "")).strip(),
        }
    return out


# ─── B: 시작점 기반 연속 세그먼트 (겹침/공백/필러 해소) ─────
def segments_from_paragraphs(paragraphs, total_verses):
    """
    LLM 단락들의 verse_start 집합을 경계점으로 삼아 1..N 을 연속 세그먼트로 분할.
    각 세그먼트는 시작점이 일치하는 단락의 메타데이터를 상속.
    유효 단락이 없으면 None 반환(상위에서 균등분할로 대체).
    """
    metas = {}
    starts = set()
    for p in paragraphs:
        # verse_start 만 경계로 사용 (verse_end 는 쓰지 않으므로 누락돼도 무방).
        try:
            vs = int(p["verse_start"])
        except (KeyError, TypeError, ValueError):
            continue
        if vs < 1:
            vs = 1
        if vs > total_verses:
            continue
        starts.add(vs)
        metas.setdefault(vs, {
            "theme_title": str(p.get("theme_title", "")).strip() or "단락",
            "characteristics": [
                str(c).strip() for c in (p.get("characteristics") or []) if str(c).strip()
            ],
            "core_meaning": str(p.get("core_meaning", "")).strip(),
        })
    if not starts:
        return None
    starts.add(1)  # 1절부터 시작 보장
    starts = sorted(starts)

    segs = []
    for i, s in enumerate(starts):
        e = (starts[i + 1] - 1) if i + 1 < len(starts) else total_verses
        if e < s:
            continue
        m = metas.get(s, {"theme_title": "단락", "characteristics": [], "core_meaning": ""})
        segs.append({
            "vs": s, "ve": e,
            "theme_title": m["theme_title"],
            "characteristics": m["characteristics"],
            "core_meaning": m["core_meaning"],
            "_needs_meta": False,
        })
    return segs


def even_chunks(total_verses, bounds):
    """LLM 완전 실패 시 target 크기 균등 분할 (장 전체 블록 방지). 전부 _needs_meta."""
    mn, tgt, mx = bounds
    segs = []
    v = 1
    while v <= total_verses:
        e = min(v + tgt - 1, total_verses)
        # 마지막 조각이 너무 짧으면 직전 조각에 흡수 (max 한도 내)
        if 0 < total_verses - e < mn and (e - v + 1) + (total_verses - e) <= mx:
            e = total_verses
        segs.append({
            "vs": v, "ve": e, "theme_title": "단락",
            "characteristics": [], "core_meaning": "", "_needs_meta": True,
        })
        v = e + 1
    return segs


# ─── D: MAX 강제 (유사도 valley 분할) ──────────────────────
def _split_range(vs, ve, bounds, vec_by_vnum):
    """[vs,ve] 가 max 초과면 인접절 유사도 최저점에서 재귀 분할. 반환: [(a,b), ...]"""
    mn, tgt, mx = bounds
    L = ve - vs + 1
    if L <= mx:
        return [(vs, ve)]
    # 양쪽이 모두 >= mn 이 되는 분할점 후보 (분할점 = 그 절 이후에서 자름)
    lo = vs + mn - 1
    hi = ve - mn
    if hi < lo:  # 안전장치 — 정중앙 분할
        mid = (vs + ve) // 2
        return _split_range(vs, mid, bounds, vec_by_vnum) + _split_range(mid + 1, ve, bounds, vec_by_vnum)
    best_v, best_sim = lo, 2.0
    for v in range(lo, hi + 1):
        a = vec_by_vnum.get(v); b = vec_by_vnum.get(v + 1)
        sim = _cos(a, b) if (a is not None and b is not None) else 1.0
        if sim < best_sim:
            best_sim, best_v = sim, v
    left = _split_range(vs, best_v, bounds, vec_by_vnum)
    right = _split_range(best_v + 1, ve, bounds, vec_by_vnum)
    return left + right


def enforce_max(segs, bounds, vec_by_vnum):
    mn, tgt, mx = bounds
    out = []
    for seg in segs:
        L = seg["ve"] - seg["vs"] + 1
        if L <= mx:
            out.append(seg)
            continue
        for (a, b) in _split_range(seg["vs"], seg["ve"], bounds, vec_by_vnum):
            out.append({
                "vs": a, "ve": b, "theme_title": "단락",
                "characteristics": [], "core_meaning": "", "_needs_meta": True,
            })
    return out


# ─── E: MIN 강제 (centroid 코사인 가까운 이웃과 병합) ───────
def _centroid(vs, ve, vec_by_vnum):
    vs_list = [vec_by_vnum[v] for v in range(vs, ve + 1) if v in vec_by_vnum]
    if not vs_list:
        return None
    return np.mean(np.stack(vs_list), axis=0)


def enforce_min(segs, bounds, vec_by_vnum):
    mn, tgt, mx = bounds
    if mn <= 1:
        return segs  # 시가서 등 — 단독 절 허용
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for i, seg in enumerate(segs):
            L = seg["ve"] - seg["vs"] + 1
            if L >= mn:
                continue
            c = _centroid(seg["vs"], seg["ve"], vec_by_vnum)
            cands = []  # (neighbor_index, cosine)
            for j in (i - 1, i + 1):
                if 0 <= j < len(segs):
                    merged_len = max(seg["ve"], segs[j]["ve"]) - min(seg["vs"], segs[j]["vs"]) + 1
                    if merged_len > mx:
                        continue
                    cj = _centroid(segs[j]["vs"], segs[j]["ve"], vec_by_vnum)
                    sim = _cos(c, cj) if (c is not None and cj is not None) else 0.0
                    cands.append((j, sim))
            if not cands:
                continue
            j = max(cands, key=lambda t: t[1])[0]
            a, b = (i, j) if i < j else (j, i)
            merged = {
                "vs": min(segs[a]["vs"], segs[b]["vs"]),
                "ve": max(segs[a]["ve"], segs[b]["ve"]),
                "theme_title": "단락", "characteristics": [], "core_meaning": "",
                "_needs_meta": True,
            }
            segs = segs[:a] + [merged] + segs[b + 1:]
            changed = True
            break
    return segs


def build_records(book_en, book_ko, chapter, testament, genre, segs):
    records = []
    for s in segs:
        vs, ve = s["vs"], s["ve"]
        pid = f"{book_en}:{chapter}:{vs}-{ve}"
        records.append({
            "id": pid,
            "book_en": book_en,
            "book_ko": book_ko,
            "chapter": chapter,
            "verse_start": vs,
            "verse_end": ve,
            "range_label": f"{book_ko} {chapter}:{vs}-{ve}" if vs != ve else f"{book_ko} {chapter}:{vs}",
            "verse_keys": [f"{book_en}:{chapter}:{v}" for v in range(vs, ve + 1)],
            "testament": testament,
            "genre": genre,
            "theme_title": s["theme_title"],
            "characteristics": s["characteristics"],
            "core_meaning": s["core_meaning"],
        })
    return records


def process_chapter(ch, emb, api_key):
    """한 장 → 정규화된 단락 records"""
    book_en, book_ko = ch["book_en"], ch["book_ko"]
    chapter, genre = ch["chapter"], ch["genre"]
    verses = ch["verses"]
    total = len(verses)
    bounds = get_bounds(genre)

    # verse 번호 → 임베딩 벡터
    vec_by_vnum = {}
    if emb is not None:
        for v in verses:
            idx = v.get("id")
            if isinstance(idx, int) and 0 <= idx < emb.shape[0]:
                vec_by_vnum[v["verse"]] = emb[idx]

    # A: LLM 주제 분할
    segs = None
    try:
        raw = call_gemini(build_split_prompt(book_en, book_ko, chapter, genre, verses), api_key)
        paragraphs = parse_paragraphs(raw)
        segs = segments_from_paragraphs(paragraphs, total)  # B
    except RuntimeError:
        raise  # 할당량 초과 등 — 상위에서 중단
    except Exception as e:
        print(f"  ⚠ {book_en} {chapter}장 분할 실패: {e} — 균등 분할 대체")
        segs = None

    if not segs:
        segs = even_chunks(total, bounds)

    # D: MAX 강제 → E: MIN 강제
    segs = enforce_max(segs, bounds, vec_by_vnum)
    segs = enforce_min(segs, bounds, vec_by_vnum)

    # F: 메타 백필 (분할/병합/빈 메타만)
    need = [
        (s["vs"], s["ve"]) for s in segs
        if s.get("_needs_meta") or not s["core_meaning"].strip() or not s["theme_title"].strip()
    ]
    if need:
        filled = backfill_meta(book_en, book_ko, chapter, verses, need, api_key)
        for s in segs:
            key = (s["vs"], s["ve"])
            if key in filled:
                s["theme_title"] = filled[key]["theme_title"]
                s["characteristics"] = filled[key]["characteristics"]
                s["core_meaning"] = filled[key]["core_meaning"]
            elif not s["theme_title"].strip():
                s["theme_title"] = "단락"

    return build_records(book_en, book_ko, chapter, ch["testament"], genre, segs), len(need)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="처리할 장 수 제한 (스모크)")
    parser.add_argument("--book", type=str, default=None, help="특정 책(book_en)만")
    parser.add_argument("--restart", action="store_true", help="체크포인트 무시")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    bible_path = root / "public" / "data" / "bible.json"
    emb_path   = root / "public" / "data" / "embeddings_dense.bin"
    out_path   = root / "public" / "data" / "passages.json"
    prog_path  = root / "public" / "data" / "passage_progress.json"

    if not bible_path.exists():
        print("❌ bible.json 없음.")
        return 1

    api_key = load_api_key(root)

    with open(bible_path, encoding="utf-8") as f:
        bible = json.load(f)

    emb = load_verse_embeddings(emb_path)
    if emb is None:
        print("⚠ embeddings_dense.bin 없음 — 길이 정규화의 분할/병합은 정중앙·인접 기준으로 동작.")

    # (book_en, chapter) 그룹화 — bible.json 순서 보존
    chapters_order = []
    chapters = {}
    for v in bible:
        key = (v["book_en"], v["chapter"])
        if key not in chapters:
            chapters[key] = {
                "book_en": v["book_en"], "book_ko": v["book_ko"],
                "chapter": v["chapter"], "testament": v.get("testament", ""),
                "genre": v.get("genre", ""), "verses": [],
            }
            chapters_order.append(key)
        chapters[key]["verses"].append(v)

    if args.book:
        chapters_order = [k for k in chapters_order if k[0] == args.book]
    if args.limit > 0:
        chapters_order = chapters_order[:args.limit]

    done_keys = set()
    all_records = []
    if not args.restart and prog_path.exists() and out_path.exists():
        with open(prog_path) as f:
            prog = json.load(f)
        done_keys = set(tuple(k) for k in prog.get("done", []))
        with open(out_path, encoding="utf-8") as f:
            all_records = json.load(f)
        print(f"⏩ 이전 진행 발견: {len(done_keys)} 장 완료, 재개")

    pending = [k for k in chapters_order if k not in done_keys]
    total_pending = len(pending)
    print("=" * 55)
    print("  단락 사전 생성 (하이브리드: Flash-Lite 분할 + 결정적 정규화)")
    print(f"  대상: {total_pending} 장 / 전체 {len(chapters_order)} 장")
    print(f"  임베딩: {'있음' if emb is not None else '없음'}")
    print("=" * 55)

    t0 = time.time()
    backfill_calls = 0
    for i, key in enumerate(pending, 1):
        ch = chapters[key]
        try:
            records, n_backfill = process_chapter(ch, emb, api_key)
        except RuntimeError as e:
            print(f"⛔ 중단: {e}. 진행분 저장.")
            break
        backfill_calls += 1 if n_backfill else 0
        all_records.extend(records)
        done_keys.add(key)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(all_records, f, ensure_ascii=False, indent=0)
        with open(prog_path, "w", encoding="utf-8") as f:
            json.dump({"done": sorted(list(done_keys))}, f, ensure_ascii=False)

        elapsed = time.time() - t0
        eta = (elapsed / i) * (total_pending - i)
        print(f"  [{i}/{total_pending}] {ch['book_en']} {ch['chapter']}장 → "
              f"{len(records)}개 단락  경과 {elapsed/60:.1f}분  ETA {eta/60:.1f}분")

        if i < total_pending:
            time.sleep(REQ_INTERVAL)

    if len(done_keys) >= len(chapters_order) and prog_path.exists():
        prog_path.unlink()

    print()
    print("=" * 55)
    print(f"✅ 단락 생성 완료: {len(all_records)}개 단락 → {out_path}")
    print(f"   메타 백필 발생 장 수: {backfill_calls}")
    print("=" * 55)
    return 0


if __name__ == "__main__":
    sys.exit(main())
