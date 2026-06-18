import { NextRequest, NextResponse } from "next/server";
import {
  loadPassages,
  loadPassageIdSet,
  hydratePassage,
} from "@/lib/passages";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const MAX_USED_IDS = 10000;
const RANDOM_RATE_LIMIT = 60; // 정적 데이터만 읽어 가벼움 → 분당 60회
const RATE_WINDOW_MS = 60_000;

// 익명 전용: 사용 기록은 클라이언트 localStorage 가 보유하고, 요청 본문 used_ids 로 전달된다.
// (로그인/DB 경로는 제거 — Supabase 미사용.)
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`random:${clientIp(req)}`, RANDOM_RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const passages = loadPassages();
    if (passages.length === 0) {
      return NextResponse.json(
        {
          error:
            "단락 데이터가 없습니다. scripts/generate_passages.py 를 실행하세요.",
        },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawUsed: unknown = body?.used_ids;
    const validIds = loadPassageIdSet();
    const list = Array.isArray(rawUsed) ? rawUsed : [];
    if (list.length > MAX_USED_IDS) {
      return NextResponse.json(
        { error: "사용 기록이 너무 많습니다." },
        { status: 400 },
      );
    }
    let usedSet = new Set(
      list.filter((x): x is string => typeof x === "string" && validIds.has(x)),
    );

    let wasReset = false;
    let available = passages.filter((p) => !usedSet.has(p.id));

    if (available.length === 0) {
      // 모든 단락 소진 → 초기화 (클라이언트는 was_reset 으로 localStorage 비움).
      wasReset = true;
      usedSet = new Set();
      available = passages;
    }

    const picked = available[Math.floor(Math.random() * available.length)];
    const hydrated = hydratePassage(picked, false);

    return NextResponse.json({
      passage: hydrated,
      total_passages: passages.length,
      used_count: usedSet.size,
      was_reset: wasReset,
      anonymous: true,
    });
  } catch (err) {
    console.error("/api/random error:", err);
    return NextResponse.json(
      { error: "랜덤 추천 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
