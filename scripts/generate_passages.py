#!/usr/bin/env python3
"""
랜덤 추천용 단락(passage) 사전 생성 스크립트
────────────────────────────────────────────────
bible.json 을 (book_en, chapter) 단위로 묶고, Gemini 2.5 Flash Lite 에게
자연 단락(보통 3~7절) 으로 분할 + 단락별 (theme_title, characteristics,
core_meaning) 을 한 번에 받아 public/data/passages.json 에 캐시.

각 단락에는 영구 식별자 passage_id (예: "John:3:14-21") 를 부여한다.
이 ID 는 DB(used_passages.passage_id), localStorage, 클라이언트, 미래의
다른 기능 모두에서 단락을 가리키는 단일 키.

실행:
  python3 scripts/generate_passages.py                # 전체
  python3 scripts/generate_passages.py --limit 2      # 처음 2장 스모크 테스트
  python3 scripts/generate_passages.py --book Genesis # 한 책만
  python3 scripts/generate_passages.py --restart      # 체크포인트 무시

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# ─── 티어 ─────────────────────────────────────────────────
PAID_TIER = True
REQ_INTERVAL = 0.4 if PAID_TIER else 13.0
# ─────────────────────────────────────────────────────────


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
            if e.code == 429:
                wait = 15 * (2 ** attempt)
                if "RESOURCE_EXHAUSTED" in err_body or "quota" in err_body.lower():
                    raise RuntimeError("일일 API 할당량 초과")
                print(f"  ⏳ 429 → {wait}초 대기 ({attempt+1}/{retries})...")
                time.sleep(wait)
            else:
                print(f"  ❌ HTTP {e.code}: {err_body[:200]}")
                raise
        except RuntimeError:
            raise
        except Exception as e:
            print(f"  ❌ 오류 (시도 {attempt+1}/{retries}): {e}")
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))

    raise RuntimeError(f"재시도 {retries}회 모두 실패.")


PROMPT_TEMPLATE = """당신은 성경 본문을 자연스러운 단락으로 분할하고 각 단락의 의미를 정리하는 전문가입니다.

아래는 {book_ko}({book_en}) {chapter}장의 모든 구절입니다.

[규칙]
1. 본문을 자연스러운 단락(narrative/thematic paragraph)으로 분할하세요. 보통 한 단락은 3~7절이지만, 본문 흐름에 따라 1~12절까지 허용됩니다.
2. **모든 절을 빠짐없이 포함**해야 하며, 단락들이 연속적이어야 합니다(절 번호 겹침/공백 금지).
3. 각 단락마다 다음을 작성하세요:
   - verse_start, verse_end (정수)
   - theme_title: 8~15자, 단락의 핵심 주제(예: "들리신 인자와 영생")
   - characteristics: 단락의 특징을 2~4개 짧은 한 문장으로 (문학 장르/화자/대상/표현 양식 등)
   - core_meaning: 단락의 핵심 의미와 적용점을 한두 문장으로

[출력 형식]
반드시 아래 JSON만 반환하세요. 다른 텍스트 금지.
{{"paragraphs":[{{"verse_start":<int>,"verse_end":<int>,"theme_title":"...","characteristics":["...","..."],"core_meaning":"..."}}]}}

[본문]
{verses_block}
"""


def build_prompt(book_en: str, book_ko: str, chapter: int, verses: list) -> str:
    verses_block = "\n".join(f"{v['verse']}: {v['ko']}" for v in verses)
    return PROMPT_TEMPLATE.format(
        book_en=book_en, book_ko=book_ko, chapter=chapter,
        verses_block=verses_block,
    )


def parse_paragraphs(raw: str):
    """Gemini 응답에서 paragraphs 배열 추출."""
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


def normalize_paragraphs(paragraphs: list, total_verses: int) -> list:
    """
    검증/정규화:
      - verse_start/end 범위 강제 클리핑
      - 정렬 후 빈 구간을 단독 단락으로 보충
      - 겹침이 있으면 다음 단락의 시작을 직전 끝+1 로 이동
    """
    cleaned = []
    for p in paragraphs:
        try:
            vs = int(p["verse_start"])
            ve = int(p["verse_end"])
        except (KeyError, TypeError, ValueError):
            continue
        if vs < 1: vs = 1
        if ve > total_verses: ve = total_verses
        if ve < vs: continue
        cleaned.append({
            "verse_start": vs,
            "verse_end": ve,
            "theme_title": str(p.get("theme_title", "")).strip() or "단락",
            "characteristics": [
                str(c).strip() for c in (p.get("characteristics") or [])
                if str(c).strip()
            ],
            "core_meaning": str(p.get("core_meaning", "")).strip(),
        })

    cleaned.sort(key=lambda x: x["verse_start"])

    # 겹침 해소 + 빈 구간 보충
    result = []
    cursor = 1
    for p in cleaned:
        if p["verse_start"] > cursor:
            # 빈 구간 보충: LLM이 누락한 절들을 단독 단락으로 추가
            result.append({
                "verse_start": cursor,
                "verse_end": p["verse_start"] - 1,
                "theme_title": "본문",
                "characteristics": [],
                "core_meaning": "",
                "_filler": True,
            })
        if p["verse_start"] < cursor:
            p["verse_start"] = cursor
            if p["verse_end"] < p["verse_start"]:
                continue
        result.append(p)
        cursor = p["verse_end"] + 1

    if cursor <= total_verses:
        result.append({
            "verse_start": cursor,
            "verse_end": total_verses,
            "theme_title": "본문",
            "characteristics": [],
            "core_meaning": "",
            "_filler": True,
        })

    return result


def build_records(book_en, book_ko, chapter, testament, genre, paragraphs):
    records = []
    for p in paragraphs:
        vs, ve = p["verse_start"], p["verse_end"]
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
            "theme_title": p["theme_title"],
            "characteristics": p["characteristics"],
            "core_meaning": p["core_meaning"],
        })
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0,
                        help="처리할 장(chapter) 수 제한 (스모크 테스트)")
    parser.add_argument("--book", type=str, default=None,
                        help="특정 책(book_en) 만 처리")
    parser.add_argument("--restart", action="store_true",
                        help="체크포인트 무시하고 처음부터")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    bible_path = root / "public" / "data" / "bible.json"
    out_path = root / "public" / "data" / "passages.json"
    prog_path = root / "public" / "data" / "passage_progress.json"

    if not bible_path.exists():
        print("❌ bible.json 없음.")
        return 1

    api_key = load_api_key(root)

    with open(bible_path, encoding="utf-8") as f:
        bible = json.load(f)

    # (book_en, chapter) 그룹화 — bible.json 순서를 보존
    chapters_order = []
    chapters = {}
    for v in bible:
        key = (v["book_en"], v["chapter"])
        if key not in chapters:
            chapters[key] = {
                "book_en": v["book_en"],
                "book_ko": v["book_ko"],
                "chapter": v["chapter"],
                "testament": v.get("testament", ""),
                "genre": v.get("genre", ""),
                "verses": [],
            }
            chapters_order.append(key)
        chapters[key]["verses"].append(v)

    if args.book:
        chapters_order = [k for k in chapters_order if k[0] == args.book]
    if args.limit > 0:
        chapters_order = chapters_order[:args.limit]

    # 체크포인트
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
    print(f"=" * 55)
    print(f"  단락 사전 생성 (Gemini 2.5 Flash Lite)")
    print(f"  대상: {total_pending} 장 / 전체 {len(chapters_order)} 장")
    print(f"  티어: {'유료' if PAID_TIER else '무료'}, REQ_INTERVAL={REQ_INTERVAL}s")
    print(f"=" * 55)

    t0 = time.time()
    for i, key in enumerate(pending, 1):
        ch = chapters[key]
        prompt = build_prompt(ch["book_en"], ch["book_ko"], ch["chapter"], ch["verses"])
        try:
            raw = call_gemini(prompt, api_key)
            paragraphs = parse_paragraphs(raw)
        except RuntimeError as e:
            print(f"⛔ 중단: {e}. 진행분 저장.")
            break
        except Exception as e:
            print(f"  ⚠ {ch['book_en']} {ch['chapter']}장 분할 실패: {e} — 단일 단락으로 처리")
            paragraphs = [{
                "verse_start": 1, "verse_end": len(ch["verses"]),
                "theme_title": f"{ch['book_ko']} {ch['chapter']}장",
                "characteristics": [], "core_meaning": "",
            }]

        normalized = normalize_paragraphs(paragraphs, len(ch["verses"]))
        records = build_records(
            ch["book_en"], ch["book_ko"], ch["chapter"],
            ch["testament"], ch["genre"], normalized,
        )
        all_records.extend(records)
        done_keys.add(key)

        # 매 장마다 체크포인트 갱신 (resume 안전)
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

    # 완료 시 진행 파일 정리
    if len(done_keys) >= len(chapters_order) and prog_path.exists():
        prog_path.unlink()

    print()
    print("=" * 55)
    print(f"✅ 단락 생성 완료: {len(all_records)}개 단락 → {out_path}")
    print("=" * 55)
    return 0


if __name__ == "__main__":
    sys.exit(main())
