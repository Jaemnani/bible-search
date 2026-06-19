import { loadBible, type BibleVerse } from "@/lib/passages";
import { toChosung, isChosungQuery } from "@/lib/chosung";

// 리더용 절 DTO (본문 표시에 필요한 필드만)
export interface ReaderVerse {
  key: string;       // 불변 절-ID "book_en:chapter:verse"
  book_en: string;
  book_ko: string;
  chapter: number;
  verse: number;
  ko: string;
  en: string;
}

function toReaderVerse(v: BibleVerse): ReaderVerse {
  return {
    key: v.key,
    book_en: v.book_en,
    book_ko: v.book_ko,
    chapter: v.chapter,
    verse: v.verse,
    ko: v.ko,
    en: v.en,
  };
}

// 장 단위 조회 — loadBible() 메모리 캐시에서 필터.
export function getChapter(bookEn: string, chapter: number): ReaderVerse[] {
  return loadBible()
    .filter((v) => v.book_en === bookEn && v.chapter === chapter)
    .sort((a, b) => a.verse - b.verse)
    .map(toReaderVerse);
}

// --- 자음(초성) + 본문 검색 인덱스 (로드 시 1회 캐시) ---
let chosungIndex: string[] | null = null;
function getChosungIndex(): string[] {
  if (chosungIndex) return chosungIndex;
  chosungIndex = loadBible().map((v) => toChosung(v.ko));
  return chosungIndex;
}

export interface VerseHit {
  key: string;
  book_ko: string;
  book_en: string;
  chapter: number;
  verse: number;
  ko: string;
}

// 초성 쿼리면 초성 인덱스 substring, 아니면 본문(ko) substring(+ 초성 폴백).
export function searchVerses(query: string, limit = 50): VerseHit[] {
  const q = query.trim();
  if (!q) return [];
  const bible = loadBible();
  const hits: VerseHit[] = [];

  if (isChosungQuery(q)) {
    const idx = getChosungIndex();
    const qc = toChosung(q).replace(/\s+/g, "");
    if (!qc) return [];
    for (let i = 0; i < bible.length && hits.length < limit; i++) {
      if (idx[i].replace(/\s+/g, "").includes(qc)) hits.push(toHit(bible[i]));
    }
    return hits;
  }

  // 완성형/혼합: 본문 우선, 부족하면 초성 폴백
  for (let i = 0; i < bible.length && hits.length < limit; i++) {
    if (bible[i].ko.includes(q)) hits.push(toHit(bible[i]));
  }
  if (hits.length < limit) {
    const idx = getChosungIndex();
    const qc = toChosung(q).replace(/\s+/g, "");
    const seen = new Set(hits.map((h) => h.key));
    for (let i = 0; i < bible.length && hits.length < limit; i++) {
      if (qc && idx[i].replace(/\s+/g, "").includes(qc) && !seen.has(bible[i].key)) {
        hits.push(toHit(bible[i]));
      }
    }
  }
  return hits;
}

function toHit(v: BibleVerse): VerseHit {
  return {
    key: v.key,
    book_ko: v.book_ko,
    book_en: v.book_en,
    chapter: v.chapter,
    verse: v.verse,
    ko: v.ko,
  };
}
