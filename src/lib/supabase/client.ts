import { createBrowserClient } from "@supabase/ssr";

// Supabase 미설정(.env.local 에 NEXT_PUBLIC_SUPABASE_* 없음) 시 null 반환 →
// 앱은 크래시 없이 익명 모드(검색 + localStorage 랜덤)로 동작한다.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
