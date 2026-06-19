import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P3 AI 질문 (껍데기) ===========================================================
// 계약·검증·레이트리밋만 구현. 실제 LLM 호출은 후속(P3-core)에서.
// 응답 계약: { status, verseRef, answer, message }  (answer 는 코어 구현 후 채워짐)
//
// TODO(P3-core):
//  - 서버에서 Gemini 호출(GEMINI_API_KEY 서버 전용, 클라 노출 금지)
//  - 구절+질문 프롬프트(구절 본문 포함), 구절별 답변 캐시 공유(C3)
//  - 로그인 게이팅 + 사용자별 일일 쿼터(knowai arena_daily_usage 패턴)
const RATE = 20;
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`ai-ask:${clientIp(req)}`, RATE, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const verseRef = String(body?.verseRef ?? "").trim();
  const question = String(body?.question ?? "").trim();
  if (!verseRef || !question) {
    return NextResponse.json({ error: "verseRef·question 이 필요합니다." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "질문이 너무 깁니다." }, { status: 400 });
  }

  // --- 껍데기 응답 (코어 미구현) ---
  return NextResponse.json({
    status: "coming_soon",
    verseRef,
    answer: null,
    message: "AI 질문 기능은 준비 중입니다. 곧 제공됩니다.",
  });
}
