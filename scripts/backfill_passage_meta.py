#!/usr/bin/env python3
"""
빈/플레이스홀더 메타데이터 단락만 타깃 백필
────────────────────────────────────────────────
passages.json 에서 core_meaning 이 비었거나 theme_title 이 "단락" 인 단락만
골라, 장 단위로 묶어 메타데이터를 재생성한다(generate_passages.backfill_meta 재사용).

실행:
  python3 scripts/backfill_passage_meta.py

필요:
  - .env.local 에 GEMINI_API_KEY=xxx
  - public/data/passages.json, bible.json
"""

import collections
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_passages as gp  # noqa: E402


def needs_meta(p):
    return (not (p.get("core_meaning") or "").strip()) or (p.get("theme_title") or "").strip() in ("", "단락")


def main():
    root = Path(__file__).parent.parent
    pass_path = root / "public" / "data" / "passages.json"
    bible_path = root / "public" / "data" / "bible.json"
    if not pass_path.exists() or not bible_path.exists():
        print("❌ passages.json / bible.json 없음")
        return 1

    api_key = gp.load_api_key(root)
    passages = json.load(open(pass_path, encoding="utf-8"))
    bible = json.load(open(bible_path, encoding="utf-8"))

    # 장별 verse 목록
    ch_verses = collections.defaultdict(list)
    ch_meta = {}
    for v in bible:
        key = (v["book_en"], v["chapter"])
        ch_verses[key].append(v)
        ch_meta[key] = (v["book_ko"],)

    targets = [p for p in passages if needs_meta(p)]
    by_chapter = collections.defaultdict(list)
    for p in targets:
        by_chapter[(p["book_en"], p["chapter"])].append(p)

    print(f"대상 단락 {len(targets)}개 / {len(by_chapter)}개 장")
    if not targets:
        print("✅ 채울 단락 없음")
        return 0

    CHUNK = 6  # 한 요청당 범위 수 — 출력 토큰 초과(truncation) 방지
    fixed = 0
    chapters = list(by_chapter.items())
    for i, ((book_en, chapter), ps) in enumerate(chapters, 1):
        verses = ch_verses.get((book_en, chapter), [])
        book_ko = ch_meta.get((book_en, chapter), (book_en,))[0]
        try:
            for j in range(0, len(ps), CHUNK):
                sub = ps[j:j + CHUNK]
                ranges = [(p["verse_start"], p["verse_end"]) for p in sub]
                filled = gp.backfill_meta(book_en, book_ko, chapter, verses, ranges, api_key)
                for p in sub:
                    m = filled.get((p["verse_start"], p["verse_end"]))
                    if m and m["core_meaning"].strip():
                        p["theme_title"] = m["theme_title"]
                        p["characteristics"] = m["characteristics"]
                        p["core_meaning"] = m["core_meaning"]
                        fixed += 1
                time.sleep(gp.REQ_INTERVAL)
        except RuntimeError as e:
            print(f"⛔ 중단: {e}. 진행분 저장.")
            with open(pass_path, "w", encoding="utf-8") as f:
                json.dump(passages, f, ensure_ascii=False, indent=0)
            break
        # 매 장마다 저장 (resume 안전)
        with open(pass_path, "w", encoding="utf-8") as f:
            json.dump(passages, f, ensure_ascii=False, indent=0)
        done = len([p for p in ps if (p.get('core_meaning') or '').strip()])
        print(f"  [{i}/{len(chapters)}] {book_en} {chapter}장 → {done}/{len(ps)} 채움")

    remain = sum(1 for p in passages if needs_meta(p))
    print(f"\n✅ 백필 완료: {fixed}개 채움 | 남은 미완 {remain}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
