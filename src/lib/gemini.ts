/**
 * Gemini 공용 호출 헬퍼 (서버 전용).
 *
 * 검색(`/api/search`)은 자체 구현을 그대로 쓰고, P3(AI 질문·교차검증)처럼 새로 붙는 기능이 이 헬퍼를 쓴다.
 * 무료 운영이 전제라 모델은 **gemini-2.5-flash-lite**(무료 티어 존재) 하나로 고정한다.
 *
 * 실패(키 없음·429·타임아웃·JSON 깨짐)는 예외를 던지지 않고 `{ ok:false, reason }` 으로 돌려준다 —
 * 호출부가 "열화모드"로 정직하게 안내할 수 있도록.
 */

const MODEL = "gemini-2.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiFail = "no_key" | "quota" | "timeout" | "http" | "parse";

export type GeminiResult<T> = { ok: true; data: T } | { ok: false; reason: GeminiFail };

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const GEMINI_FAIL_MESSAGE: Record<GeminiFail, string> = {
  no_key: "AI 기능이 설정되지 않았습니다(GEMINI_API_KEY).",
  quota: "무료 사용 한도를 넘었습니다. 잠시 후 다시 시도해주세요.",
  timeout: "AI 응답이 지연되어 중단했습니다. 다시 시도해주세요.",
  http: "AI 서버 오류로 답변을 받지 못했습니다.",
  parse: "AI 응답을 해석하지 못했습니다. 다시 시도해주세요.",
};

interface GeminiJsonOptions {
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** JSON 모드로 1회 호출하고 파싱까지 마친 결과를 돌려준다. */
export async function geminiJson<T>({
  prompt,
  temperature = 0.2,
  maxOutputTokens = 1024,
  timeoutMs = 20_000,
}: GeminiJsonOptions): Promise<GeminiResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "timeout" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(body)) {
      console.error(`[Gemini] 할당량 소진: ${res.status} - ${body.slice(0, 160)}`);
      return { ok: false, reason: "quota" };
    }
    console.error(`[Gemini] 호출 실패: ${res.status} - ${body.slice(0, 160)}`);
    return { ok: false, reason: "http" };
  }

  try {
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    if (!jsonStr) return { ok: false, reason: "parse" };
    return { ok: true, data: JSON.parse(jsonStr) as T };
  } catch {
    return { ok: false, reason: "parse" };
  }
}
