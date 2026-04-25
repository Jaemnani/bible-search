import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadPassages,
  loadPassageIdSet,
  hydratePassage,
} from "@/lib/passages";

const MAX_USED_IDS = 10000;

export async function POST(req: NextRequest) {
  try {
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let usedSet: Set<string>;
    let wasReset = false;
    const anonymous = !user;

    if (user) {
      const { data, error } = await supabase
        .from("used_passages")
        .select("passage_id")
        .eq("user_id", user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      usedSet = new Set((data ?? []).map((r) => r.passage_id));
    } else {
      const rawUsed: unknown = body?.used_ids;
      const validIds = loadPassageIdSet();
      const list = Array.isArray(rawUsed) ? rawUsed : [];
      if (list.length > MAX_USED_IDS) {
        return NextResponse.json(
          { error: "사용 기록이 너무 많습니다." },
          { status: 400 },
        );
      }
      usedSet = new Set(
        list.filter((x): x is string => typeof x === "string" && validIds.has(x)),
      );
    }

    let available = passages.filter((p) => !usedSet.has(p.id));

    if (available.length === 0) {
      wasReset = true;
      if (user) {
        await supabase.from("used_passages").delete().eq("user_id", user.id);
      }
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
      anonymous,
    });
  } catch (err) {
    console.error("/api/random error:", err);
    return NextResponse.json(
      { error: "랜덤 추천 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
