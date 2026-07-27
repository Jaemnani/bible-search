import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// === P5-core 구절별 설교영상·책 =====================================================
// 크롤러(crawler/fetch_verse_media.py)가 NAS verse_media 에 적재한 데이터를 PostgREST 로 읽는다.
//
// 수집은 무료 쿼터 때문에 **장/권 단위**로 한다(절 30,944개는 무료로 불가능).
// 그래서 조회도 좁은 것부터 넓은 것 순으로 되짚는다:  "John:3:16" → "John:3" → "John".
//
// 저작권: 영상은 링크/메타만 저장돼 있고 썸네일은 공식 URL 핫링크다(재호스팅 금지).
const RATE = 60;
const WINDOW_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 3000;
const MAX_ITEMS = 12;

const VERSE_REF = /^([A-Za-z0-9][A-Za-z0-9 ]{0,39}):(\d{1,3}):(\d{1,3})$/;

interface MediaRow {
  verse_ref: string;
  type: "video" | "book";
  title: string;
  url: string;
  thumb_key: string | null;
  source: string | null;
  rank: number;
}

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
  const m = VERSE_REF.exec(verseRef);
  if (!m) {
    return NextResponse.json({ error: "verseRef 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const [, bookEn, chapter] = m;
  const refs = [verseRef, `${bookEn}:${chapter}`, bookEn]; // 좁은 것 → 넓은 것

  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) {
    return NextResponse.json({
      status: "unconfigured",
      verseRef,
      media: [],
      message: "설교영상·책 데이터 서버가 아직 연결되지 않았습니다.",
    });
  }

  const q = new URLSearchParams({
    verse_ref: `in.(${refs.map((r) => `"${r}"`).join(",")})`,
    select: "verse_ref,type,title,url,thumb_key,source,rank",
    order: "rank.asc",
    limit: String(MAX_ITEMS * 2),
  });

  let rows: MediaRow[];
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/rest/v1/verse_media?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      next: { revalidate: 300 },
    });
    if (!r.ok) throw new Error(String(r.status));
    rows = (await r.json()) as MediaRow[];
  } catch {
    return NextResponse.json({
      status: "unavailable",
      verseRef,
      media: [],
      message: "설교영상·책 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    });
  }

  // 절 > 장 > 권 순으로, 각 그룹 안에서는 rank 순.
  const weight = (ref: string) => refs.indexOf(ref);
  const media = rows
    .sort((a, b) => weight(a.verse_ref) - weight(b.verse_ref) || a.rank - b.rank)
    .slice(0, MAX_ITEMS)
    .map((row) => ({
      type: row.type,
      title: row.title,
      url: row.url,
      thumb: row.thumb_key ?? undefined,
      source: row.source ?? undefined,
      scope:
        row.verse_ref === verseRef ? "verse"
        : row.verse_ref === `${bookEn}:${chapter}` ? "chapter"
        : "book",
    }));

  return NextResponse.json({
    status: media.length > 0 ? "ok" : "empty",
    verseRef,
    media,
    message: media.length > 0 ? undefined : "이 구절에 대해 아직 수집된 설교영상·책이 없습니다.",
  });
}
