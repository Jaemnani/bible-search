#!/usr/bin/env python3
"""
리더 앱용 파생 인덱스 생성 (1회성, public/data/bible.json 기반).

산출물:
  public/data/books_index.json   — 책별 메타 + 장/절 수 (카테고리·네비게이션용)
  public/data/verse_chosung.json — 절 id 순서 초성 문자열 배열 (오프라인 자음검색용)

불변 절-ID 규약: bible.json 의 `key` = "{book_en}:{chapter}:{verse}". 사용자 데이터(하이라이트·노트·낙서)는
이 key 로만 묶는다. 단락/passage ID 는 재생성 시 변동하므로 사용 금지.

실행:  python3 scripts/build_indexes.py
"""

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "public", "data")

# 한글 음절 초성 19자
CHOSUNG = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
]
SYLLABLE_BASE = 0xAC00
SYLLABLE_LAST = 0xD7A3
# 호환 자모 자음 영역(사용자가 직접 입력한 ㄱ..ㅎ 통과)
COMPAT_CONSONANTS = set("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")


def to_chosung(text: str) -> str:
    """한글 음절→초성, 호환 자음→그대로, 공백→공백, 그 외→제거. 다중 공백은 1개로."""
    out = []
    for ch in text:
        code = ord(ch)
        if SYLLABLE_BASE <= code <= SYLLABLE_LAST:
            out.append(CHOSUNG[(code - SYLLABLE_BASE) // 588])
        elif ch in COMPAT_CONSONANTS:
            out.append(ch)
        elif ch.isspace():
            out.append(" ")
        # 그 외(구두점·라틴·숫자)는 초성검색 대상 아님 → 제거
    # 다중 공백 정리
    return " ".join("".join(out).split())


def main() -> int:
    bible_path = os.path.join(DATA, "bible.json")
    if not os.path.exists(bible_path):
        print(f"[err] {bible_path} 없음", file=sys.stderr)
        return 1
    with open(bible_path, encoding="utf-8") as f:
        bible = json.load(f)

    # id 연속·정렬 가정 검증
    ids = [v["id"] for v in bible]
    if ids != list(range(len(bible))):
        print("[err] bible.json id 가 0..N-1 연속 정렬이 아님 — 초성 배열 정합 불가", file=sys.stderr)
        return 1

    # --- books_index ---
    books = []  # 정준 순서 유지(파일 등장 순)
    by_book = {}
    for v in bible:
        be = v["book_en"]
        if be not in by_book:
            entry = {
                "book_en": be,
                "book_ko": v["book_ko"],
                "testament": v["testament"],
                "genre": v["genre"],
                "chapters": {},  # chapter -> max verse
            }
            by_book[be] = entry
            books.append(entry)
        ch = v["chapter"]
        prev = by_book[be]["chapters"].get(ch, 0)
        if v["verse"] > prev:
            by_book[be]["chapters"][ch] = v["verse"]

    books_index = []
    for e in books:
        ch_nums = sorted(e["chapters"].keys())
        verse_counts = [e["chapters"][c] for c in ch_nums]
        books_index.append({
            "book_en": e["book_en"],
            "book_ko": e["book_ko"],
            "testament": e["testament"],
            "genre": e["genre"],
            "chapter_count": len(ch_nums),
            "verse_counts": verse_counts,      # index i = 장(i+1) 절 수
            "verse_total": sum(verse_counts),
        })

    # --- verse_chosung (id 순서 배열) ---
    chosung = [to_chosung(v["ko"]) for v in bible]

    bi_path = os.path.join(DATA, "books_index.json")
    cs_path = os.path.join(DATA, "verse_chosung.json")
    with open(bi_path, "w", encoding="utf-8") as f:
        json.dump(books_index, f, ensure_ascii=False, separators=(",", ":"))
    with open(cs_path, "w", encoding="utf-8") as f:
        json.dump(chosung, f, ensure_ascii=False, separators=(",", ":"))

    genres = []
    for e in books_index:
        if e["genre"] not in genres:
            genres.append(e["genre"])
    print(f"[ok] books_index.json — {len(books_index)}권, 장합계 {sum(e['chapter_count'] for e in books_index)}, "
          f"절합계 {sum(e['verse_total'] for e in books_index)}")
    print(f"[ok] 장르(카테고리): {', '.join(genres)}")
    print(f"[ok] verse_chosung.json — {len(chosung)}절 ({os.path.getsize(cs_path)//1024} KB)")
    print(f"[sample] {bible[0]['key']}  ko='{bible[0]['ko'][:18]}'  cho='{chosung[0]}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
