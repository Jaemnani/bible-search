/**
 * 아주 작은 인메모리 TTL 캐시 (서버 전용).
 *
 * 같은 구절에 같은 질문이 반복될 때 무료 할당량을 아끼는 용도. 프로세스 로컬이라 인스턴스가
 * 재활용되는 동안만 유효하고(Fluid Compute 기준 적중률은 꽤 나온다), 사라져도 정확성엔 영향이 없다.
 */

interface Entry<T> { value: T; expires: number }

const MAX_ENTRIES = 200;
const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  // 최근 사용을 뒤로 옮겨 LRU 유사 동작
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = 60 * 60 * 1000): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}
