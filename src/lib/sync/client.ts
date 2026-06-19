"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// NAS App API(GoTrue + PostgREST) 클라이언트. env 미설정 시 null → 로그인/동기화 비활성(익명 로컬 전용).
//   NEXT_PUBLIC_SUPABASE_URL      예: https://<DOMAIN>  또는 http://<NAS_IP>:8081
//   NEXT_PUBLIC_SUPABASE_ANON_KEY GoTrue/PostgREST 공용 anon 키
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

export function isSyncConfigured(): boolean {
  return getSupabase() !== null;
}
