#!/usr/bin/env python3
"""
성경 데이터 파싱 스크립트
NIV(영어) + 개역개정(한글) → bible.json 통합 파일 생성
"""

import re
import json
import os
from pathlib import Path

# 책 이름 매핑 (영어 → 한국어 정식명, 장르, 신/구약)
BOOK_META = {
    # 구약 - 모세오경
    "Genesis":       {"ko": "창세기",     "testament": "OT", "genre": "모세오경"},
    "Exodus":        {"ko": "출애굽기",   "testament": "OT", "genre": "모세오경"},
    "Leviticus":     {"ko": "레위기",     "testament": "OT", "genre": "모세오경"},
    "Numbers":       {"ko": "민수기",     "testament": "OT", "genre": "모세오경"},
    "Deuteronomy":   {"ko": "신명기",     "testament": "OT", "genre": "모세오경"},
    # 구약 - 역사서
    "Joshua":        {"ko": "여호수아",   "testament": "OT", "genre": "역사서"},
    "Judges":        {"ko": "사사기",     "testament": "OT", "genre": "역사서"},
    "Ruth":          {"ko": "룻기",       "testament": "OT", "genre": "역사서"},
    "1Samuel":       {"ko": "사무엘상",   "testament": "OT", "genre": "역사서"},
    "2Samuel":       {"ko": "사무엘하",   "testament": "OT", "genre": "역사서"},
    "1Kings":        {"ko": "열왕기상",   "testament": "OT", "genre": "역사서"},
    "2Kings":        {"ko": "열왕기하",   "testament": "OT", "genre": "역사서"},
    "1Chronicles":   {"ko": "역대상",     "testament": "OT", "genre": "역사서"},
    "2Chronicles":   {"ko": "역대하",     "testament": "OT", "genre": "역사서"},
    "Ezra":          {"ko": "에스라",     "testament": "OT", "genre": "역사서"},
    "Nehemiah":      {"ko": "느헤미야",   "testament": "OT", "genre": "역사서"},
    "Esther":        {"ko": "에스더",     "testament": "OT", "genre": "역사서"},
    # 구약 - 시가서
    "Job":           {"ko": "욥기",       "testament": "OT", "genre": "시가서"},
    "Psalms":        {"ko": "시편",       "testament": "OT", "genre": "시가서"},
    "Proverbs":      {"ko": "잠언",       "testament": "OT", "genre": "시가서"},
    "Ecclesiastes":  {"ko": "전도서",     "testament": "OT", "genre": "시가서"},
    "SongofSolomon": {"ko": "아가",       "testament": "OT", "genre": "시가서"},
    # 구약 - 대예언서
    "Isaiah":        {"ko": "이사야",     "testament": "OT", "genre": "대예언서"},
    "Jeremiah":      {"ko": "예레미야",   "testament": "OT", "genre": "대예언서"},
    "Lamentations":  {"ko": "예레미야애가","testament": "OT", "genre": "대예언서"},
    "Ezekiel":       {"ko": "에스겔",     "testament": "OT", "genre": "대예언서"},
    "Daniel":        {"ko": "다니엘",     "testament": "OT", "genre": "대예언서"},
    # 구약 - 소예언서
    "Hosea":         {"ko": "호세아",     "testament": "OT", "genre": "소예언서"},
    "Joel":          {"ko": "요엘",       "testament": "OT", "genre": "소예언서"},
    "Amos":          {"ko": "아모스",     "testament": "OT", "genre": "소예언서"},
    "Obadiah":       {"ko": "오바댜",     "testament": "OT", "genre": "소예언서"},
    "Jonah":         {"ko": "요나",       "testament": "OT", "genre": "소예언서"},
    "Micah":         {"ko": "미가",       "testament": "OT", "genre": "소예언서"},
    "Nahum":         {"ko": "나훔",       "testament": "OT", "genre": "소예언서"},
    "Habakkuk":      {"ko": "하박국",     "testament": "OT", "genre": "소예언서"},
    "Zephaniah":     {"ko": "스바냐",     "testament": "OT", "genre": "소예언서"},
    "Haggai":        {"ko": "학개",       "testament": "OT", "genre": "소예언서"},
    "Zechariah":     {"ko": "스가랴",     "testament": "OT", "genre": "소예언서"},
    "Malachi":       {"ko": "말라기",     "testament": "OT", "genre": "소예언서"},
    # 신약 - 복음서
    "Matthew":       {"ko": "마태복음",   "testament": "NT", "genre": "복음서"},
    "Mark":          {"ko": "마가복음",   "testament": "NT", "genre": "복음서"},
    "Luke":          {"ko": "누가복음",   "testament": "NT", "genre": "복음서"},
    "John":          {"ko": "요한복음",   "testament": "NT", "genre": "복음서"},
    # 신약 - 역사서
    "Acts":          {"ko": "사도행전",   "testament": "NT", "genre": "역사서"},
    # 신약 - 바울서신
    "Romans":        {"ko": "로마서",     "testament": "NT", "genre": "바울서신"},
    "1Corinthians":  {"ko": "고린도전서", "testament": "NT", "genre": "바울서신"},
    "2Corinthians":  {"ko": "고린도후서", "testament": "NT", "genre": "바울서신"},
    "Galatians":     {"ko": "갈라디아서", "testament": "NT", "genre": "바울서신"},
    "Ephesians":     {"ko": "에베소서",   "testament": "NT", "genre": "바울서신"},
    "Philippians":   {"ko": "빌립보서",   "testament": "NT", "genre": "바울서신"},
    "Colossians":    {"ko": "골로새서",   "testament": "NT", "genre": "바울서신"},
    "1Thessalonians":{"ko": "데살로니가전서","testament": "NT", "genre": "바울서신"},
    "2Thessalonians":{"ko": "데살로니가후서","testament": "NT", "genre": "바울서신"},
    "1Timothy":      {"ko": "디모데전서", "testament": "NT", "genre": "바울서신"},
    "2Timothy":      {"ko": "디모데후서", "testament": "NT", "genre": "바울서신"},
    "Titus":         {"ko": "디도서",     "testament": "NT", "genre": "바울서신"},
    "Philemon":      {"ko": "빌레몬서",   "testament": "NT", "genre": "바울서신"},
    # 신약 - 일반서신
    "Hebrews":       {"ko": "히브리서",   "testament": "NT", "genre": "일반서신"},
    "James":         {"ko": "야고보서",   "testament": "NT", "genre": "일반서신"},
    "1Peter":        {"ko": "베드로전서", "testament": "NT", "genre": "일반서신"},
    "2Peter":        {"ko": "베드로후서", "testament": "NT", "genre": "일반서신"},
    "1John":         {"ko": "요한일서",   "testament": "NT", "genre": "일반서신"},
    "2John":         {"ko": "요한이서",   "testament": "NT", "genre": "일반서신"},
    "3John":         {"ko": "요한삼서",   "testament": "NT", "genre": "일반서신"},
    "Jude":          {"ko": "유다서",     "testament": "NT", "genre": "일반서신"},
    # 신약 - 예언서
    "Revelation":    {"ko": "요한계시록", "testament": "NT", "genre": "예언서"},
}

# 한글 책 이름 → 영어 키 역매핑
KO_TO_EN = {v["ko"]: k for k, v in BOOK_META.items()}


# ──────────────────────────────────────────────
# 감정/상황 태그 매핑 (책별 특화 → 장르별 폴백)
# 임베딩에 약하게 포함시켜 감정 검색 정확도 향상
# ──────────────────────────────────────────────
BOOK_EMOTION_TAGS: dict[str, str] = {
    # 구약 시가서 특화
    "Psalms":        "위로 탄식 찬양 감사 기쁨 슬픔 두려움 평안 외로움 절망 하나님의 사랑 보호하심 은혜",
    "Proverbs":      "지혜 결단 인도하심 올바른 길 훈계 관계 말 교만 겸손 부지런함",
    "Job":           "고난 시련 인내 의심 고통 회복 하나님의 주권 억울함",
    "Ecclesiastes":  "허무 인생의 의미 지혜 공허함 하나님 만족",
    "SongofSolomon": "사랑 관계 헌신 아름다움",
    # 구약 예언서 특화
    "Isaiah":        "위로 소망 구원 새 힘 두려워하지 말라 회복 새로운 시작 인도하심 구속",
    "Jeremiah":      "소망 회복 언약 미래 계획 하나님의 계획",
    "Lamentations":  "슬픔 탄식 회복 소망 고난 자비",
    "Ezekiel":       "회복 새로운 마음 소망 하나님의 영광",
    "Daniel":        "담대함 믿음 하나님의 주권 핍박 승리",
    "Hosea":         "사랑 회복 용서 돌아옴",
    "Jonah":         "도피 회개 용서 하나님의 자비",
    # 신약 복음서 특화
    "Matthew":       "사랑 은혜 치유 용서 구원 천국 믿음 염려하지 말라",
    "Mark":          "치유 기적 믿음 구원 즉각적 행동",
    "Luke":          "은혜 자비 치유 용서 소외된 자 기쁨 낮은 자",
    "John":          "사랑 영생 빛 믿음 하나님의 사랑 평안 위로 보혜사",
    # 신약 서신서 특화
    "Romans":        "은혜 구원 믿음 평안 소망 담대함 하나님의 사랑 고난 중 소망",
    "1Corinthians":  "사랑 은사 믿음 공동체 부활 소망",
    "2Corinthians":  "위로 고난 은혜 능력 회복 자족",
    "Galatians":     "자유 은혜 믿음 성령의 열매",
    "Ephesians":     "은혜 하나님의 사랑 공동체 기도 전신갑주 담대함",
    "Philippians":   "기쁨 감사 평안 자족 담대함 만족 염려하지 말라",
    "Colossians":    "감사 새로운 삶 평안 그리스도 중심",
    "1Thessalonians":"소망 위로 재림 격려 믿음",
    "2Thessalonians":"인내 소망 담대함",
    "1Timothy":      "믿음 기도 지도력 경건",
    "2Timothy":      "담대함 믿음 인내 끝까지",
    "Hebrews":       "믿음 인내 소망 완성 구름 같은 증인",
    "James":         "시련 인내 지혜 믿음 행함 기도",
    "1Peter":        "고난 소망 인내 위로 나그네 삶",
    "2Peter":        "성장 말씀 믿음",
    "1John":         "사랑 빛 하나님의 사랑 용서 확신",
    "Revelation":    "소망 승리 위로 재림 인내 영원",
}

# 장르별 기본 태그 (책별 태그 없을 때 폴백)
GENRE_EMOTION_TAGS: dict[str, str] = {
    "모세오경": "믿음 순종 언약 창조 구원 인도하심 하나님의 신실하심",
    "역사서":   "인도하심 승리 믿음 실패 회복 하나님의 신실하심 순종",
    "시가서":   "위로 찬양 감사 기쁨 슬픔 탄식 지혜 사랑 평안 두려움",
    "대예언서": "회개 소망 구원 위로 심판 회복 새로운 시작 두려워하지 말라",
    "소예언서": "회개 심판 소망 인도하심 회복 하나님께로 돌아옴",
    "복음서":   "사랑 은혜 치유 용서 구원 영생 기쁨 믿음 염려하지 말라",
    "역사서":   "담대함 성령 선교 박해 믿음 공동체",
    "바울서신": "은혜 평안 사랑 믿음 소망 감사 위로 담대함 기쁨 자족",
    "일반서신": "믿음 시련 인내 소망 겸손 위로 사랑",
    "예언서":   "소망 승리 재림 인내 위로 영원",
}


def get_emotion_tags(book_en: str, genre: str) -> str:
    """책 이름 → 감정 태그 (책별 우선, 장르 폴백)"""
    return BOOK_EMOTION_TAGS.get(book_en) or GENRE_EMOTION_TAGS.get(genre, "믿음 소망 사랑")


def remove_footnotes(text: str) -> str:
    """개역개정 각주 기호 제거: 1) 2) 3) 등"""
    return re.sub(r'\d+\)', '', text).strip()


def parse_english(filepath: str) -> dict:
    """NIV 영어 성경 파싱"""
    verses = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Book:Chapter:Verse Text — 첫 두 콜론만 분리
            parts = line.split(':', 2)
            if len(parts) < 3:
                continue
            book = parts[0].replace(' ', '')
            try:
                chapter = int(parts[1])
                # verse number는 텍스트 앞 숫자
                rest = parts[2].strip()
                verse_match = re.match(r'^(\d+)\s+(.*)', rest)
                if not verse_match:
                    continue
                verse = int(verse_match.group(1))
                text = verse_match.group(2).strip()
            except (ValueError, IndexError):
                continue

            key = f"{book}:{chapter}:{verse}"
            verses[key] = text

    print(f"  영어(NIV) 파싱 완료: {len(verses):,}개 구절")
    return verses


def parse_korean(filepath: str) -> dict:
    """개역개정 한글 성경 파싱"""
    verses = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # 책이름:장:절 본문 형식
            parts = line.split(':', 2)
            if len(parts) < 3:
                continue
            book_ko = parts[0].strip()
            try:
                chapter = int(parts[1])
                rest = parts[2].strip()
                verse_match = re.match(r'^(\d+)\s+(.*)', rest)
                if not verse_match:
                    continue
                verse = int(verse_match.group(1))
                text = verse_match.group(2).strip()
                text = remove_footnotes(text)
            except (ValueError, IndexError):
                continue

            # 한국어 책 이름 → 영어 키로 변환
            book_en = KO_TO_EN.get(book_ko)
            if not book_en:
                continue

            key = f"{book_en}:{chapter}:{verse}"
            verses[key] = text

    print(f"  한국어(개역개정) 파싱 완료: {len(verses):,}개 구절")
    return verses


def build_bible_json(en_verses: dict, ko_verses: dict) -> list:
    """영/한 구절 매핑 후 최종 JSON 데이터 생성"""
    # 한국어 구절 기준으로 순서 유지
    result = []
    idx = 0

    # 전체 키 집합 (한/영 합집합)
    all_keys = sorted(
        ko_verses.keys(),
        key=lambda k: (
            list(BOOK_META.keys()).index(k.split(':')[0]) if k.split(':')[0] in BOOK_META else 999,
            int(k.split(':')[1]),
            int(k.split(':')[2])
        )
    )

    ko_only = 0
    en_only = 0
    both = 0

    for key in all_keys:
        book_en, chapter_str, verse_str = key.split(':')
        chapter = int(chapter_str)
        verse = int(verse_str)

        ko_text = ko_verses.get(key, '')
        en_text = en_verses.get(key, '')

        if ko_text and en_text:
            both += 1
        elif ko_text:
            ko_only += 1
        else:
            en_only += 1

        meta = BOOK_META.get(book_en, {})
        book_ko = meta.get("ko", book_en)
        testament = meta.get("testament", "OT")
        genre = meta.get("genre", "기타")

        # 임베딩용 텍스트:
        # 1) 메타데이터 prefix 제거 (감정 벡터 희석 방지)
        # 2) 한글 + 영어 병합 (BGE-M3 다국어 의미 공간 풍부화)
        # 3) 감정 태그 약하게 포함 (도메인 갭 해소)
        emotion_tags = get_emotion_tags(book_en, genre)
        embed_text = f"{ko_text} {en_text} | 태그: {emotion_tags}"

        result.append({
            "id": idx,
            "key": key,
            "book_en": book_en,
            "book_ko": book_ko,
            "chapter": chapter,
            "verse": verse,
            "testament": testament,
            "genre": genre,
            "ko": ko_text,
            "en": en_text,
            "embed_text": embed_text,
        })
        idx += 1

    print(f"\n  매핑 결과:")
    print(f"    한/영 모두 있음: {both:,}개")
    print(f"    한국어만:        {ko_only:,}개")
    print(f"    영어만:          {en_only:,}개")
    print(f"    총 구절:         {len(result):,}개")

    return result


def main():
    root = Path(__file__).parent.parent
    en_file = root / "datas" / "BIBLE_ENGLISH_NewInternationalVersion.txt"
    ko_file = root / "datas" / "BIBLE_KOREAN_RevisedTranslation.txt"
    out_dir = root / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "bible.json"

    print("=" * 50)
    print("성경 데이터 파싱 시작")
    print("=" * 50)

    print("\n[1/3] 영어(NIV) 파싱 중...")
    en_verses = parse_english(str(en_file))

    print("\n[2/3] 한국어(개역개정) 파싱 중...")
    ko_verses = parse_korean(str(ko_file))

    print("\n[3/3] 통합 JSON 생성 중...")
    bible_data = build_bible_json(en_verses, ko_verses)

    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(bible_data, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = os.path.getsize(out_file) / 1024 / 1024
    print(f"\n✅ 저장 완료: {out_file}")
    print(f"   파일 크기: {size_mb:.1f}MB")
    print(f"   총 구절 수: {len(bible_data):,}개")


if __name__ == "__main__":
    main()
