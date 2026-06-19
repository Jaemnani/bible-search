#!/usr/bin/env python3
"""
구절별 설교영상·책 수집 (껍데기/dry-run).

현재: 실제 외부 호출 없이 어떤 절을 대상으로 할지만 로그([would-fetch])로 보여주고,
      run.sh 의 Discord digest 가 파싱할 [done]/[warn] 요약 라인을 출력한다.

TODO(P5-core):
  - YouTube Data API search(설교영상) — 쿼터(기본 1만 unit/일) 배분, 링크/메타만 저장(저작권),
    썸네일은 공식 URL 핫링크(재호스팅 금지).
  - 책 추천 API(알라딘/구글북스 등) — 제휴/출처 표기.
  - 결과를 PostgREST verse_media 에 upsert (SUPABASE_URL + SUPABASE_SERVICE_KEY, RLS 우회).
  - 증분/예산(step·drain)·재시도·체크포인트(docs 06), Discord 알림(docs 05).

사용:  python3 fetch_verse_media.py [--book Genesis] [--limit 20]
"""
import argparse
import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def load_books():
    p = os.path.join(DATA, "books_index.json")
    if not os.path.exists(p):
        print("[warn] books_index.json 없음 — scripts/build_indexes.py 먼저 실행", file=sys.stderr)
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", help="대상 book_en (생략 시 전체)")
    ap.add_argument("--limit", type=int, default=10, help="dry-run 으로 보여줄 절 수")
    args = ap.parse_args()

    books = load_books()
    if args.book:
        books = [b for b in books if b["book_en"] == args.book]

    have_keys = bool(os.environ.get("SUPABASE_SERVICE_KEY")) and bool(os.environ.get("YOUTUBE_API_KEY"))
    if not have_keys:
        print("[warn] SUPABASE_SERVICE_KEY/YOUTUBE_API_KEY 미설정 — dry-run(적재 안 함)")

    shown = 0
    for b in books:
        for ch in range(1, b["chapter_count"] + 1):
            vcount = b["verse_counts"][ch - 1]
            for v in range(1, vcount + 1):
                if shown >= args.limit:
                    print(f"[done] verse-media: {shown}개 절 대상 표시(dry-run, 적재 0 — 코어 미구현)")
                    return 0
                ref = f'{b["book_en"]}:{ch}:{v}'
                print(f"[would-fetch] {ref}  → YouTube 설교 + 책 추천 → verse_media")
                shown += 1

    print(f"[done] verse-media: {shown}개 절 대상 표시(dry-run, 적재 0 — 코어 미구현)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
