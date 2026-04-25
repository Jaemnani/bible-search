import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPassageIdSet } from "@/lib/passages";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다.", anonymous: true },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const passageId = String(body?.passage_id ?? "");
    const used = Boolean(body?.used);

    if (!passageId) {
      return NextResponse.json(
        { error: "passage_id 가 필요합니다." },
        { status: 400 },
      );
    }
    if (!loadPassageIdSet().has(passageId)) {
      return NextResponse.json(
        { error: "알 수 없는 단락입니다." },
        { status: 400 },
      );
    }

    if (used) {
      const { error } = await supabase
        .from("used_passages")
        .upsert(
          { user_id: user.id, passage_id: passageId },
          { onConflict: "user_id,passage_id" },
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("used_passages")
        .delete()
        .eq("user_id", user.id)
        .eq("passage_id", passageId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, passage_id: passageId, used });
  } catch (err) {
    console.error("/api/random/toggle error:", err);
    return NextResponse.json(
      { error: "사용 상태를 갱신하지 못했습니다." },
      { status: 500 },
    );
  }
}
