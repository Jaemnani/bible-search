#!/usr/bin/env python3
"""
빈/플레이스홀더 메타데이터 단락만 타깃 백필 (단락별 단일-객체 방식)
────────────────────────────────────────────────
passages.json 에서 core_meaning 이 비었거나 theme_title 이 "단락" 인 단락만 골라,
**그 단락의 절들만** LLM에 주고 "쪼개지 말고 하나로 요약"시켜 메타데이터를 채운다.
(장 전체+범위목록 방식은 LLM이 제멋대로 재분할해 범위가 어긋났음 — 그래서 단일-객체로.)

실행: python3 scripts/backfill_passage_meta.py
필요: .env.local 의 GEMINI_API_KEY, public/data/{passages,bible}.json
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_passages as gp  # noqa: E402

SINGLE_TEMPLATE = """다음은 {label} 한 단락의 본문입니다 (형식 "절: 한국어 / English").
이 단락 전체를 **하나의 단위**로 보고 메타데이터를 작성하세요. 절대 더 쪼개지 마세요.
- theme_title: 8~15자, 핵심 주제
- characteristics: 2~4개 짧은 한 문장
- core_meaning: 핵심 의미와 적용점 한두 문장

[출력] 반드시 아래 JSON 객체 하나만. 다른 텍스트 금지.
{{"theme_title":"...","characteristics":["..."],"core_meaning":"..."}}

[본문]
{block}
"""


def needs_meta(p):
    return (not (p.get("core_meaning") or "").strip()) or (p.get("theme_title") or "").strip() in ("", "단락")


def meta_for_passage(p, vmap, api_key):
    lines = []
    for k in p["verse_keys"]:
        v = vmap.get(k)
        if v:
            lines.append(f"{v['verse']}: {v.get('ko','')} / {v.get('en','')}")
    block = "\n".join(lines)
    prompt = SINGLE_TEMPLATE.format(label=p["range_label"], block=block)
    raw = gp.call_gemini(prompt, api_key)
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    # 첫 균형 JSON 객체만 추출 (뒤 잉여 텍스트 'Extra data' 방지)
    start = text.find("{")
    if start >= 0:
        depth = 0
        for j in range(start, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    text = text[start:j + 1]
                    break
    obj = json.loads(text)
    cm = str(obj.get("core_meaning", "")).strip()
    tt = str(obj.get("theme_title", "")).strip()
    if not cm or not tt:
        return None
    return {
        "theme_title": tt,
        "characteristics": [str(c).strip() for c in (obj.get("characteristics") or []) if str(c).strip()],
        "core_meaning": cm,
    }


def main():
    root = Path(__file__).parent.parent
    pass_path = root / "public" / "data" / "passages.json"
    bible_path = root / "public" / "data" / "bible.json"
    if not pass_path.exists() or not bible_path.exists():
        print("❌ passages.json / bible.json 없음")
        return 1

    api_key = gp.load_api_key(root)
    passages = json.load(open(pass_path, encoding="utf-8"))
    vmap = {v["key"]: v for v in json.load(open(bible_path, encoding="utf-8"))}

    targets = [p for p in passages if needs_meta(p)]
    print(f"대상 단락 {len(targets)}개")
    if not targets:
        print("✅ 채울 단락 없음")
        return 0

    fixed = 0
    for i, p in enumerate(targets, 1):
        try:
            m = meta_for_passage(p, vmap, api_key)
        except RuntimeError as e:
            print(f"⛔ 중단: {e}. 진행분 저장.")
            break
        except Exception as e:
            print(f"  [{i}/{len(targets)}] {p['id']} 실패: {e}")
            time.sleep(gp.REQ_INTERVAL)
            continue
        if m:
            p["theme_title"] = m["theme_title"]
            p["characteristics"] = m["characteristics"]
            p["core_meaning"] = m["core_meaning"]
            fixed += 1
            print(f"  [{i}/{len(targets)}] {p['id']} → {m['theme_title']}")
        else:
            print(f"  [{i}/{len(targets)}] {p['id']} → 빈 응답")
        with open(pass_path, "w", encoding="utf-8") as f:
            json.dump(passages, f, ensure_ascii=False, indent=0)
        time.sleep(gp.REQ_INTERVAL)

    remain = sum(1 for p in passages if needs_meta(p))
    print(f"\n✅ 백필 완료: {fixed}개 채움 | 남은 미완 {remain}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
