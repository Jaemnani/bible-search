import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPassageIdSet } from "@/lib/passages";

const MAX_MIGRATE = 10000;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const raw = body?.passage_ids;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "passage_ids 배열이 필요합니다." },
        { status: 400 },
      );
    }
    if (raw.length > MAX_MIGRATE) {
      return NextResponse.json(
        { error: "마이그레이션 건수가 너무 많습니다." },
        { status: 400 },
      );
    }

    const validIds = loadPassageIdSet();
    const ids = Array.from(
      new Set(
        raw
          .filter((x): x is string => typeof x === "string")
          .filter((id) => validIds.has(id)),
      ),
    );

    if (ids.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    const rows = ids.map((passage_id) => ({
      user_id: user.id,
      passage_id,
    }));
    // ignoreDuplicates 로 충돌 행은 건너뛰므로, .select() 가 돌려주는 실제 삽입 행만 카운트.
    const { data, error } = await supabase
      .from("used_passages")
      .upsert(rows, { onConflict: "user_id,passage_id", ignoreDuplicates: true })
      .select("passage_id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: data?.length ?? 0 });
  } catch (err) {
    console.error("/api/random/migrate error:", err);
    return NextResponse.json(
      { error: "동기화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
