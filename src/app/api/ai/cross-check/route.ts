import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P3 AI 교차검증 (껍데기) =======================================================
// aib.vote(knowai) 다중 LLM 비교를 구절 해석에 적용할 계약. 지금은 구조만.
// 응답 계약: { status, verseRef, results: {model, output}[], message }
//
// TODO(P3-core):
//  - knowai compare.ts 패턴: OpenRouter 다중모델 Promise.all fan-out
//  - 모델 목록/라우팅(textgen-provider-map), 사용자 투표 저장(ai_cross_checks)
//  - 구절별 결과 캐시 공유 + 모델 수 상한 + 사용자 쿼터(C3)
const RATE = 10; // 다중모델이라 더 엄격
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`ai-cross:${clientIp(req)}`, RATE, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const verseRef = String(body?.verseRef ?? "").trim();
  if (!verseRef) {
    return NextResponse.json({ error: "verseRef 가 필요합니다." }, { status: 400 });
  }

  // --- 껍데기 응답 (코어 미구현) ---
  return NextResponse.json({
    status: "coming_soon",
    verseRef,
    results: [],
    // 코어 구현 시 채워질 모델 슬롯(현재는 UI 자리표시용 라벨만)
    planned_models: ["Claude", "GPT", "Gemini"],
    message: "AI 교차검증 기능은 준비 중입니다. 곧 제공됩니다.",
  });
}
