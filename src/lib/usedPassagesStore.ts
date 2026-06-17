/**
 * 사용된 단락(used passages) 저장 — 익명 전용.
 *
 * 사용 기록은 브라우저 localStorage(`bible.used_passages`)에 보관한다.
 * - fetchRandom: localStorage 의 used_ids 를 동봉해 /api/random 호출(서버가 제외 후 1건 추천).
 * - toggle: localStorage 만 갱신(서버 호출 없음).
 * - was_reset === true 응답 시 localStorage 를 비운다.
 */

export interface RandomPassageResponse {
  passage: HydratedPassageDTO;
  total_passages: number;
  used_count: number;
  was_reset: boolean;
  anonymous: boolean;
}

export interface HydratedPassageDTO {
  id: string;
  range_label: string;
  book_ko: string;
  book_en: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  testament: string;
  genre: string;
  theme_title: string;
  characteristics: string[];
  core_meaning: string;
  verses: { verse: number; ko: string; en: string }[];
  is_used: boolean;
}

export interface UsedPassagesStore {
  fetchRandom(): Promise<RandomPassageResponse>;
  toggle(passage_id: string, used: boolean): Promise<void>;
  isUsed(passage_id: string): Promise<boolean>;
}

const LOCAL_KEY = "bible.used_passages";

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
}

function clearLocal(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_KEY);
}

class AnonymousStore implements UsedPassagesStore {
  async fetchRandom(): Promise<RandomPassageResponse> {
    const used_ids = readLocal();
    const res = await fetch("/api/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ used_ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "랜덤 추천을 불러오지 못했습니다.");
    }
    const data: RandomPassageResponse = await res.json();
    if (data.was_reset) clearLocal();
    return data;
  }

  async toggle(passage_id: string, used: boolean): Promise<void> {
    const ids = new Set(readLocal());
    if (used) ids.add(passage_id);
    else ids.delete(passage_id);
    writeLocal([...ids]);
  }

  async isUsed(passage_id: string): Promise<boolean> {
    return readLocal().includes(passage_id);
  }
}

export function getUsedPassagesStore(): UsedPassagesStore {
  return new AnonymousStore();
}
