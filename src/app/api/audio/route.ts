import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P4 오디오/듣기 (껍데기) =======================================================
// 계약·검증·레이트리밋만. 실제 TTS 생성/캐시는 후속(P4-core).
// 응답 계약: { status, verseRef, voice, url, message }  (url 은 코어 구현 후 MinIO 캐시 URL)
//
// TODO(P4-core):
//  - MinIO(bible-audio) 캐시 조회 → 있으면 url 반환
//  - 없으면 ElevenLabs TTS 생성(ELEVENLABS_API_KEY 서버 전용) → MinIO 업로드 → verse_audio 행 기록 → url
//  - 보이스/길이 상한 + 월 예산·알림 + 사용자 쿼터(C3). 본문 라이선스의 2차저작물(TTS) 조항 확인(C1).
const RATE = 30;
const WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const rl = rateLimit(`audio:${clientIp(req)}`, RATE, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const sp = req.nextUrl.searchParams;
  const verseRef = (sp.get("verseRef") ?? "").trim();
  const voice = (sp.get("voice") ?? "default").trim();
  if (!verseRef) {
    return NextResponse.json({ error: "verseRef 가 필요합니다." }, { status: 400 });
  }

  // --- 껍데기 응답 (코어 미구현) ---
  return NextResponse.json({
    status: "coming_soon",
    verseRef,
    voice,
    url: null,
    message: "말씀 듣기(TTS)는 준비 중입니다. 곧 제공됩니다.",
  });
}
