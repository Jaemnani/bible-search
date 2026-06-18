import type { NextRequest } from "next/server";

/**
 * 경량 인메모리 고정창(fixed-window) 레이트리밋 — 외부 인프라(Redis 등) 없이 동작.
 *
 * 한계: 서버리스 인스턴스마다 메모리가 분리되어 전역 일관성은 없다(인스턴스 수만큼 한도가
 * 곱해질 수 있음). 그래도 단일 인스턴스로 쏟아지는 폭주를 막아 비용 남용을 크게 줄인다.
 * 강한 보호가 필요하면 Vercel Firewall(레이트리밋) + Gemini 키 예산 한도를 함께 둘 것.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000; // 메모리 폭주 방지 상한

function sweep(now: number) {
  // 상한 초과 시에만 만료 엔트리 청소(매 호출 비용 회피).
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** 다음 창까지 남은 초(429 Retry-After 용) */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    sweep(now);
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** 클라이언트 IP 추출 — Vercel은 x-forwarded-for를 항상 세팅한다(첫 항목이 원 IP). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
