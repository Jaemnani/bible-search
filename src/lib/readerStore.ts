/**
 * 리더 로컬 저장소 (로컬 우선, localStorage). 추후 NAS 동기화 시 이 레코드(+updated 타임스탬프)를
 * tombstone/LWW 로 올린다. 모든 주석은 불변 절-ID(key="book_en:chapter:verse")로 키잉.
 *
 * .md 내보내기를 오프라인 자립적으로 하려고 각 주석에 절 메타(book_ko/chapter/verse/ko)를 함께 저장.
 */

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export interface VerseMeta {
  book_en: string;
  book_ko: string;
  chapter: number;
  verse: number;
  ko: string;
}

export interface HighlightRec { color: HighlightColor; meta: VerseMeta; updated: number }
export interface NoteRec { md: string; meta: VerseMeta; updated: number }
export interface DrawingRec { png: string; meta: VerseMeta; updated: number }

export interface ReaderSettings {
  fontSize: number;            // px
  theme: "light" | "sepia" | "dark";
  showEn: boolean;
}
export interface ReadingPosition { book_en: string; chapter: number }

const K = {
  highlights: "bible.reader.highlights",
  notes: "bible.reader.notes",
  drawings: "bible.reader.drawings",
  settings: "bible.reader.settings",
  position: "bible.reader.position",
};

export const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 18, theme: "light", showEn: false };

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota 초과 등 무시 */
  }
}

// 컬렉션(맵) 로더/세터
export const loadHighlights = () => read<Record<string, HighlightRec>>(K.highlights, {});
export const loadNotes = () => read<Record<string, NoteRec>>(K.notes, {});
export const loadDrawings = () => read<Record<string, DrawingRec>>(K.drawings, {});
export const saveHighlights = (m: Record<string, HighlightRec>) => write(K.highlights, m);
export const saveNotes = (m: Record<string, NoteRec>) => write(K.notes, m);
export const saveDrawings = (m: Record<string, DrawingRec>) => write(K.drawings, m);

export const loadSettings = (): ReaderSettings => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) });
export const saveSettings = (s: ReaderSettings) => write(K.settings, s);
export const loadPosition = (): ReadingPosition | null => read<ReadingPosition | null>(K.position, null);
export const savePosition = (p: ReadingPosition) => write(K.position, p);

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: "#fde68a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
};

/** 모든 노트/하이라이트/낙서를 정준 순서(book→chapter→verse)로 .md 문자열 생성. */
export function exportMarkdown(
  bookOrder: Record<string, number>,
  dateStr: string,
): string {
  const highlights = loadHighlights();
  const notes = loadNotes();
  const drawings = loadDrawings();
  const keys = new Set([...Object.keys(highlights), ...Object.keys(notes), ...Object.keys(drawings)]);
  if (keys.size === 0) return `# 말씀곳간 노트 (${dateStr})\n\n_저장된 노트가 없습니다._\n`;

  const sorted = [...keys].sort((a, b) => {
    const [ba, ca, va] = parseKey(a);
    const [bb, cb, vb] = parseKey(b);
    return (bookOrder[ba] ?? 999) - (bookOrder[bb] ?? 999) || ca - cb || va - vb;
  });

  const lines: string[] = [`# 말씀곳간 노트 (${dateStr})`, ""];
  for (const key of sorted) {
    const meta = (notes[key]?.meta ?? highlights[key]?.meta ?? drawings[key]?.meta)!;
    lines.push(`## ${meta.book_ko} ${meta.chapter}:${meta.verse}`);
    if (meta.ko) lines.push(`> ${meta.ko}`);
    if (highlights[key]) lines.push(`- 하이라이트: ${highlights[key].color}`);
    if (notes[key]?.md) {
      lines.push("", notes[key].md.trim(), "");
    }
    if (drawings[key]) lines.push("- _그림 메모 있음_");
    lines.push("");
  }
  return lines.join("\n");
}

function parseKey(key: string): [string, number, number] {
  const i = key.lastIndexOf(":");
  const j = key.lastIndexOf(":", i - 1);
  return [key.slice(0, j), Number(key.slice(j + 1, i)), Number(key.slice(i + 1))];
}
