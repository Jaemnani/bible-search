/**
 * 한글 초성(자음) 검색 유틸 — 카테고리/책/장/절 본문 자음검색의 공유 알고리즘 spec.
 *
 * 웹은 이 유틸로 런타임 계산(성경 본문 번들 → 로드 시 in-memory 초성 인덱스, 30k절 ~수십ms).
 * Android(Kotlin)·iOS(Swift)는 이 동일 알고리즘을 포팅한다(파생 파일 대신 알고리즘을 공유).
 * 빌드타임 사전계산이 필요하면 scripts/build_indexes.py 로 verse_chosung.json 생성 가능.
 */

// 한글 음절 초성 19자 (유니코드 음절 분해 순서)
const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const COMPAT_CONSONANTS = new Set("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ");

/** 문자열의 초성 문자열을 반환. 한글 음절→초성, 호환 자음→그대로, 공백→공백, 그 외→제거. */
export function toChosung(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
      out += CHOSUNG[Math.floor((code - SYLLABLE_BASE) / 588)];
    } else if (COMPAT_CONSONANTS.has(ch)) {
      out += ch;
    } else if (/\s/.test(ch)) {
      out += " ";
    }
    // 그 외(구두점·라틴·숫자)는 초성검색 대상 아님 → 제거
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 쿼리가 '초성/자음 위주'인지 — 자음검색 모드 판별용(완성형 한글이 거의 없을 때 true). */
export function isChosungQuery(q: string): boolean {
  const compat = [...q].filter((c) => COMPAT_CONSONANTS.has(c)).length;
  const syllable = [...q].filter((c) => {
    const code = c.codePointAt(0)!;
    return code >= SYLLABLE_BASE && code <= SYLLABLE_LAST;
  }).length;
  return compat > 0 && compat >= syllable;
}

/**
 * 초성 부분일치. 쿼리·대상 모두 초성화한 뒤 공백 제거하고 substring 비교(자음검색은 recall 우선).
 * targetChosung 을 미리 계산해 두면(인덱스) 반복 호출 시 toChosung 비용 절약.
 */
export function matchesChosung(query: string, target: string, targetChosung?: string): boolean {
  const q = toChosung(query).replace(/\s+/g, "");
  if (!q) return false;
  const t = (targetChosung ?? toChosung(target)).replace(/\s+/g, "");
  return t.includes(q);
}

/** 절 본문 배열 → 초성 인덱스(런타임 1회 계산해 캐시). 반환 배열은 입력과 동일 순서. */
export function buildChosungIndex(texts: string[]): string[] {
  return texts.map((t) => toChosung(t));
}
