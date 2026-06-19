import { NextRequest, NextResponse } from "next/server";
import { searchVerses } from "@/lib/reader";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const RATE_LIMIT = 60; // 정적 인메모리 검색 → 분당 60
const WINDOW_MS = 60_000;

// GET /api/reader/search?q=ㅎㄴㄴ → 자음/본문 절 검색
export async function GET(req: NextRequest) {
  const rl = rateLimit(`reader-search:${clientIp(req)}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ query: q, hits: [] });
  if (q.length > 100) {
    return NextResponse.json({ error: "검색어가 너무 깁니다." }, { status: 400 });
  }
  const hits = searchVerses(q, 50);
  return NextResponse.json({ query: q, hits });
}
