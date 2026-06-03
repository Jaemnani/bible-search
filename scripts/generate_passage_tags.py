#!/usr/bin/env python3
"""
단락별 구조화 감정/필요 태그 생성 (통제어휘)
────────────────────────────────────────────────
passages.json 의 각 단락에 emotion_tags / need_tags 를 부여(고정 통제어휘).
런타임 검색에서 쿼리 확장 결과와 교집합 부스트에 사용 → 확장 호출이
느리거나 스킵돼도 안정적으로 동작.

배치(기본 18개/요청)로 Flash-Lite 호출. 통제어휘 밖 값은 폐기.
passages.json 에 필드 추가 후 in-place 저장(체크포인트로 resume).

실행:
  python3 scripts/generate_passage_tags.py
  python3 scripts/generate_passage_tags.py --restart

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
  - public/data/passages.json (generate_passages.py 먼저)
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


def classify_429(err_body: str):
    """429 분류 → ('daily', 0) | ('rate', retry_delay_seconds)."""
    nb = err_body.lower().replace(" ", "")
    if "perday" in nb or "daily" in nb:
        return ("daily", 0.0)
    m = re.search(r'"retrydelay"\s*:\s*"(\d+(?:\.\d+)?)s"', err_body.lower())
    return ("rate", float(m.group(1)) if m else 0.0)

PAID_TIER = True
REQ_INTERVAL = 0.4 if PAID_TIER else 13.0
BATCH_SIZE = 18

EMOTIONS = ["불안", "슬픔", "두려움", "외로움", "분노", "지침", "죄책감", "허무", "기쁨", "감사"]
NEEDS    = ["위로", "용기", "지혜", "용서", "평안", "소망", "힘", "회복", "인도"]
EMO_SET, NEED_SET = set(EMOTIONS), set(NEEDS)


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
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }).encode("utf-8")

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"Content-Type": "application/json"}, method="POST",
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


PROMPT_TEMPLATE = """당신은 성경 단락을 감정·필요 태그로 분류하는 전문가입니다.

각 단락에 대해 아래 **고정 목록에서만** 태그를 고르세요. 목록 밖 단어는 절대 사용 금지.
- 감정(emotion_tags): {emotions}
- 필요(need_tags): {needs}

규칙:
- 각 목록에서 가장 관련 깊은 1~3개만 선택 (억지로 채우지 말 것).
- 해당 없으면 빈 배열.

[출력 형식] 반드시 아래 JSON만. 다른 텍스트 금지.
{{"results":[{{"id":"...","emotion_tags":["..."],"need_tags":["..."]}}]}}

[단락 목록]
{items}
"""


def build_prompt(batch):
    lines = []
    for p in batch:
        title = (p.get("theme_title") or "").strip()
        meaning = (p.get("core_meaning") or "").strip()
        lines.append(f'- id: {p["id"]} | 주제: {title} | 의미: {meaning}')
    return PROMPT_TEMPLATE.format(
        emotions=", ".join(EMOTIONS), needs=", ".join(NEEDS),
        items="\n".join(lines),
    )


def parse_results(raw: str):
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    return json.loads(text).get("results", [])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--restart", action="store_true", help="기존 태그 무시하고 전부 재생성")
    args = parser.parse_args()

    root = Path(__file__).parent.parent
    pass_path = root / "public" / "data" / "passages.json"
    if not pass_path.exists():
        print("❌ passages.json 없음. generate_passages.py 먼저 실행하세요.")
        return 1

    api_key = load_api_key(root)
    with open(pass_path, encoding="utf-8") as f:
        passages = json.load(f)

    by_id = {p["id"]: p for p in passages}

    pending = [
        p for p in passages
        if args.restart or "emotion_tags" not in p or "need_tags" not in p
    ]
    print("=" * 55)
    print("  단락 감정/필요 태그 생성 (통제어휘, Flash-Lite)")
    print(f"  대상: {len(pending)} / 전체 {len(passages)} 단락  |  배치 {BATCH_SIZE}")
    print("=" * 55)

    t0 = time.time()
    n_batches = (len(pending) + BATCH_SIZE - 1) // BATCH_SIZE
    for bi in range(n_batches):
        batch = pending[bi * BATCH_SIZE:(bi + 1) * BATCH_SIZE]
        try:
            results = parse_results(call_gemini(build_prompt(batch), api_key))
        except RuntimeError as e:
            print(f"⛔ 중단: {e}. 진행분 저장.")
            break
        except Exception as e:
            print(f"  ⚠ 배치 {bi+1} 실패: {e} — 빈 태그로 채움")
            results = []

        got = {r.get("id"): r for r in results if isinstance(r, dict)}
        for p in batch:
            r = got.get(p["id"], {})
            p["emotion_tags"] = [t for t in (r.get("emotion_tags") or []) if t in EMO_SET][:3]
            p["need_tags"]    = [t for t in (r.get("need_tags") or []) if t in NEED_SET][:3]

        # 체크포인트: 매 배치마다 저장
        with open(pass_path, "w", encoding="utf-8") as f:
            json.dump(passages, f, ensure_ascii=False, indent=0)

        elapsed = time.time() - t0
        eta = (elapsed / (bi + 1)) * (n_batches - bi - 1)
        print(f"  [{bi+1}/{n_batches}] {len(batch)}개 태깅  경과 {elapsed/60:.1f}분  ETA {eta/60:.1f}분")
        if bi < n_batches - 1:
            time.sleep(REQ_INTERVAL)

    # 커버리지 리포트
    tagged = sum(1 for p in passages if p.get("emotion_tags") or p.get("need_tags"))
    print()
    print("=" * 55)
    print(f"✅ 태그 생성 완료. 태그 보유 단락: {tagged}/{len(passages)}")
    print("=" * 55)
    return 0


if __name__ == "__main__":
    sys.exit(main())
