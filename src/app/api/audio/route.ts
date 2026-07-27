import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P4-core(1) 오디오/듣기 =========================================================
// 무료 우선 전략: 유료 TTS(ElevenLabs 등)를 쓰지 않고도 듣기가 동작해야 한다.
//
//   1) NAS 캐시(verse_audio)에 mp3 가 있으면  → { status:"ready",  url }      = 고품질 재생
//   2) 없으면                                → { status:"device", url:null } = 기기 내장 TTS(무료)
//
// 클라이언트는 url 이 오면 <audio>, 아니면 Web Speech API(=기기 음성)로 읽는다.
// 따라서 SUPABASE_* 환경변수가 아예 없어도(개발/무료 운영) 기능은 정상 동작한다.
//
// TODO(P4-core(2), 선택): NAS 배치로 mp3 를 사전 생성해 MinIO(bible-audio)+verse_audio 에 적재.
//   엔진만 갈아끼우면 되고 이 계약은 그대로다. 본문 라이선스의 2차저작물(TTS) 조항 확인(C1).
const RATE = 30;
const WINDOW_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 2000;

// "Genesis:1:1" / "1 Samuel:2:3" 형태의 불변 절 ID
const VERSE_REF = /^[A-Za-z0-9][A-Za-z0-9 ]{0,39}:\d{1,3}:\d{1,3}$/;
const VOICE = /^[A-Za-z0-9_-]{1,32}$/;

/** verse_audio 캐시 조회. 미설정·오류·타임아웃은 모두 null(=기기 TTS 폴백) — 재생을 막지 않는다. */
async function lookupCachedUrl(verseRef: string, voice: string): Promise<string | null> {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  const q = new URLSearchParams({
    verse_ref: `eq.${verseRef}`,
    voice: `eq.${voice}`,
    select: "url",
    limit: "1",
  });
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/rest/v1/verse_audio?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ url?: unknown }>;
    const url = rows?.[0]?.url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null; // NAS 다운/미설정 — 듣기는 기기 음성으로 계속된다
  }
}

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
  const voiceRaw = (sp.get("voice") ?? "default").trim();
  const voice = VOICE.test(voiceRaw) ? voiceRaw : "default";
  if (!verseRef) {
    return NextResponse.json({ error: "verseRef 가 필요합니다." }, { status: 400 });
  }
  if (!VERSE_REF.test(verseRef)) {
    return NextResponse.json({ error: "verseRef 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const url = await lookupCachedUrl(verseRef, voice);

  if (url) {
    return NextResponse.json(
      { status: "ready", verseRef, voice, url, engine: "cache" },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  return NextResponse.json(
    {
      status: "device",
      verseRef,
      voice,
      url: null,
      engine: "device",
      message: "기기 내장 음성으로 읽어드립니다.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
