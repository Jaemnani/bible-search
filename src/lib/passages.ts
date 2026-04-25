import fs from "fs";
import path from "path";

export interface BibleVerse {
  id: number;
  key: string;
  book_en: string;
  book_ko: string;
  chapter: number;
  verse: number;
  testament: string;
  genre: string;
  ko: string;
  en: string;
  embed_text?: string;
}

export interface Passage {
  id: string;
  book_en: string;
  book_ko: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  range_label: string;
  verse_keys: string[];
  testament: string;
  genre: string;
  theme_title: string;
  characteristics: string[];
  core_meaning: string;
}

export interface HydratedVerse {
  verse: number;
  ko: string;
  en: string;
}

export interface HydratedPassage extends Passage {
  verses: HydratedVerse[];
  is_used: boolean;
}

let bibleCache: BibleVerse[] | null = null;
let bibleMapCache: Map<string, BibleVerse> | null = null;
let passagesCache: Passage[] | null = null;
let passageIdSetCache: Set<string> | null = null;

function dataPath(file: string): string {
  return path.join(process.cwd(), "public", "data", file);
}

export function loadBible(): BibleVerse[] {
  if (bibleCache) return bibleCache;
  const p = dataPath("bible.json");
  if (!fs.existsSync(p)) {
    bibleCache = [];
    return bibleCache;
  }
  bibleCache = JSON.parse(fs.readFileSync(p, "utf-8"));
  return bibleCache!;
}

export function loadBibleMap(): Map<string, BibleVerse> {
  if (bibleMapCache) return bibleMapCache;
  const map = new Map<string, BibleVerse>();
  for (const v of loadBible()) {
    map.set(v.key, v);
  }
  bibleMapCache = map;
  return map;
}

export function loadPassages(): Passage[] {
  if (passagesCache) return passagesCache;
  const p = dataPath("passages.json");
  if (!fs.existsSync(p)) {
    passagesCache = [];
    return passagesCache;
  }
  passagesCache = JSON.parse(fs.readFileSync(p, "utf-8"));
  return passagesCache!;
}

export function loadPassageIdSet(): Set<string> {
  if (passageIdSetCache) return passageIdSetCache;
  passageIdSetCache = new Set(loadPassages().map((p) => p.id));
  return passageIdSetCache;
}

export function hydratePassage(p: Passage, isUsed: boolean): HydratedPassage {
  const map = loadBibleMap();
  const verses: HydratedVerse[] = p.verse_keys.map((k) => {
    const v = map.get(k);
    return {
      verse: v?.verse ?? 0,
      ko: v?.ko ?? "",
      en: v?.en ?? "",
    };
  });
  return { ...p, verses, is_used: isUsed };
}
