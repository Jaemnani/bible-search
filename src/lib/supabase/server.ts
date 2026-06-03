import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase 미설정 시 null 반환 → 인증/사용기록 라우트는 비활성, 검색·익명 랜덤은 동작.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context: cookies are read-only.
            // Middleware refresh will handle session updates.
          }
        },
      },
    },
  );
}
