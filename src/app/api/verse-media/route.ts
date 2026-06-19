import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P5 구절별 설교영상·책 (껍데기) ================================================
// 계약·검증·레이트리밋만. 실제 데이터는 크롤러(crawler/)가 verse_media 테이블에 적재한 뒤
// 이 엔드포인트가 PostgREST 에서 조회하도록 후속 구현(P5-core).
// 응답 계약: { status, verseRef, media: {type, title, url, thumb, source}[], message }
//
// TODO(P5-core):
//  - PostgREST verse_media?verse_ref=eq.<ref>&order=rank 조회(SUPABASE_URL/ANON_KEY)
//  - 영상은 링크/메타만(저작권), 썸네일은 공식 URL 핫링크(재호스팅 금지)
const RATE = 60;
const WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const rl = rateLimit(`verse-media:${clientIp(req)}`, RATE, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const verseRef = (req.nextUrl.searchParams.get("verseRef") ?? "").trim();
  if (!verseRef) {
    return NextResponse.json({ error: "verseRef 가 필요합니다." }, { status: 400 });
  }

  // --- 껍데기 응답 (크롤 데이터 미적재) ---
  return NextResponse.json({
    status: "coming_soon",
    verseRef,
    media: [],
    message: "이 구절의 설교영상·책 추천은 준비 중입니다. 곧 제공됩니다.",
  });
}
