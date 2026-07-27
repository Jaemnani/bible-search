import { loadBible, loadBibleMap, type BibleVerse } from "@/lib/passages";
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

/**
 * 절 하나 + 앞뒤 문맥. AI 기능이 **클라이언트가 보낸 본문을 믿지 않고** 서버에서 직접 읽기 위한 통로.
 * (클라 본문을 그대로 프롬프트에 넣으면 변조된 "성경 본문"으로 답을 유도할 수 있다.)
 */
export interface VerseContext {
  verse: ReaderVerse;
  before: ReaderVerse[];
  after: ReaderVerse[];
}

export function getVerseContext(key: string, radius = 3): VerseContext | null {
  const target = loadBibleMap().get(key);
  if (!target) return null;
  const chapter = getChapter(target.book_en, target.chapter);
  const i = chapter.findIndex((v) => v.key === key);
  if (i < 0) return null;
  return {
    verse: chapter[i],
    before: chapter.slice(Math.max(0, i - radius), i),
    after: chapter.slice(i + 1, i + 1 + radius),
  };
}

// --- 자음(초성) + 본문 검색 인덱스 (로드 시 1회 캐시, 공백 제거 상태로 저장) ---
let chosungIndex: string[] | null = null;
function getChosungIndex(): string[] {
  if (chosungIndex) return chosungIndex;
  chosungIndex = loadBible().map((v) => toChosung(v.ko).replace(/\s+/g, ""));
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
      if (idx[i].includes(qc)) hits.push(toHit(bible[i]));
    }
    return hits;
  }

  // 완성형/혼합: 본문 우선, 부족하면 초성 폴백
  for (let i = 0; i < bible.length && hits.length < limit; i++) {
    if (bible[i].ko.includes(q)) hits.push(toHit(bible[i]));
  }
  const qc = toChosung(q).replace(/\s+/g, "");
  if (hits.length < limit && qc) {
    const idx = getChosungIndex();
    const seen = new Set(hits.map((h) => h.key));
    for (let i = 0; i < bible.length && hits.length < limit; i++) {
      if (idx[i].includes(qc) && !seen.has(bible[i].key)) {
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
