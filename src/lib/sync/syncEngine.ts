"use client";

import { getSupabase } from "./client";
import { planSync, type RemoteRow } from "./planSync";
import {
  loadHighlights, saveHighlights, loadNotes, saveNotes,
  type HighlightRec, type NoteRec, type HighlightColor, type VerseMeta,
} from "@/lib/readerStore";

// 불변 절-ID "book_en:chapter:verse" → 최소 메타(서버엔 meta 미저장 → pull 시 ref 로 복원).
function deriveMeta(ref: string): VerseMeta {
  const i = ref.lastIndexOf(":");
  const j = ref.lastIndexOf(":", i - 1);
  const book_en = ref.slice(0, j);
  return { book_en, book_ko: book_en, chapter: Number(ref.slice(j + 1, i)), verse: Number(ref.slice(i + 1)), ko: "" };
}

/** 하이라이트 동기화(LWW). 로컬 삭제 전파는 후속(tombstone) — 현재는 additive + 원격삭제 반영. */
async function syncHighlights(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const local = loadHighlights();
  const localUpdated: Record<string, number> = {};
  for (const [k, v] of Object.entries(local)) localUpdated[k] = v.updated;

  const { data } = await sb.from("highlights").select("verse_ref, color, updated_at, deleted").eq("user_id", userId);
  const rows = (data ?? []) as { verse_ref: string; color: string; updated_at: string; deleted: boolean }[];
  const remoteByRef = new Map(rows.map((r) => [r.verse_ref, r]));
  const remote: RemoteRow[] = rows.map((r) => ({ verse_ref: r.verse_ref, updated_ms: Date.parse(r.updated_at), deleted: r.deleted }));

  const plan = planSync(localUpdated, remote);
  const next = { ...local };
  for (const p of plan.pull) {
    if (p.deleted) { delete next[p.ref]; continue; }
    const r = remoteByRef.get(p.ref)!;
    next[p.ref] = { color: r.color as HighlightColor, meta: next[p.ref]?.meta ?? deriveMeta(p.ref), updated: Date.parse(r.updated_at) };
  }
  saveHighlights(next);

  const toUpsert = plan.push.map((ref) => ({
    user_id: userId, verse_ref: ref, color: local[ref].color,
    updated_at: new Date(local[ref].updated).toISOString(), deleted: false,
  }));
  if (toUpsert.length) await sb.from("highlights").upsert(toUpsert, { onConflict: "user_id,verse_ref" });
}

/** 노트(.md) 동기화(LWW). */
async function syncNotes(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const local = loadNotes();
  const localUpdated: Record<string, number> = {};
  for (const [k, v] of Object.entries(local)) localUpdated[k] = v.updated;

  const { data } = await sb.from("notes").select("verse_ref, body_md, updated_at, deleted").eq("user_id", userId);
  const rows = (data ?? []) as { verse_ref: string; body_md: string; updated_at: string; deleted: boolean }[];
  const remoteByRef = new Map(rows.map((r) => [r.verse_ref, r]));
  const remote: RemoteRow[] = rows.map((r) => ({ verse_ref: r.verse_ref, updated_ms: Date.parse(r.updated_at), deleted: r.deleted }));

  const plan = planSync(localUpdated, remote);
  const next = { ...local };
  for (const p of plan.pull) {
    if (p.deleted) { delete next[p.ref]; continue; }
    const r = remoteByRef.get(p.ref)!;
    next[p.ref] = { md: r.body_md, meta: next[p.ref]?.meta ?? deriveMeta(p.ref), updated: Date.parse(r.updated_at) };
  }
  saveNotes(next);

  const toUpsert: Array<{ user_id: string; verse_ref: string; body_md: string; updated_at: string; deleted: boolean }> =
    plan.push.map((ref) => ({
      user_id: userId, verse_ref: ref, body_md: local[ref].md,
      updated_at: new Date(local[ref].updated).toISOString(), deleted: false,
    }));
  if (toUpsert.length) await sb.from("notes").upsert(toUpsert, { onConflict: "user_id,verse_ref" });
}

/** 로그인 사용자 기준 로컬 ↔ NAS 양방향 동기화. */
export async function syncReader(userId: string): Promise<void> {
  await syncHighlights(userId);
  await syncNotes(userId);
}

// 참고: HighlightRec/NoteRec 는 readerStore 와 동일 형태 — 타입 정합 확인용 import.
export type { HighlightRec, NoteRec };
