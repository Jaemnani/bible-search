/**
 * 사용된 단락(used passages) 추상화 — 익명/로그인 모두 같은 인터페이스로 사용.
 *
 * - 익명: localStorage 에 passage_id 목록 저장. fetchRandom 때 used_ids 동봉.
 *         toggle 은 localStorage 만 갱신 (서버 호출 없음).
 * - 로그인: 서버가 DB 에서 used 를 읽고 자동 제외. toggle 은 /api/random/toggle 호출.
 *
 * was_reset === true 가 응답에 포함되면 클라이언트는 localStorage 도 비운다.
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

export function getLocalUsedIds(): string[] {
  return readLocal();
}

export function clearLocalUsedIds(): void {
  clearLocal();
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

class AuthedStore implements UsedPassagesStore {
  async fetchRandom(): Promise<RandomPassageResponse> {
    const res = await fetch("/api/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "랜덤 추천을 불러오지 못했습니다.");
    }
    return res.json();
  }

  async toggle(passage_id: string, used: boolean): Promise<void> {
    const res = await fetch("/api/random/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passage_id, used }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "사용 상태를 갱신하지 못했습니다.");
    }
  }

  async isUsed(_passage_id: string): Promise<boolean> {
    // 로그인 상태에서는 fetchRandom 응답의 is_used 를 신뢰; 단독 조회 미지원.
    return false;
  }
}

export function getUsedPassagesStore(authenticated: boolean): UsedPassagesStore {
  return authenticated ? new AuthedStore() : new AnonymousStore();
}
