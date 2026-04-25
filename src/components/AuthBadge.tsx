"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLocalUsedIds, clearLocalUsedIds } from "@/lib/usedPassagesStore";

export function AuthBadge() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      setEmail(session?.user?.email ?? null);

      if (event === "SIGNED_IN") {
        const localIds = getLocalUsedIds();
        if (localIds.length > 0) {
          try {
            const res = await fetch("/api/random/migrate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passage_ids: localIds }),
            });
            if (res.ok) {
              const data = await res.json();
              clearLocalUsedIds();
              setMigrateMsg(`${data.inserted}개 사용 기록을 동기화했습니다`);
              setTimeout(() => setMigrateMsg(null), 4000);
            }
          } catch {
            // 실패해도 로그인 자체는 유효; localStorage 는 다음 기회에 다시 시도.
          }
        }
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!loaded) {
    return <div className="h-6" />;
  }

  return (
    <div className="flex items-center gap-3 text-[0.72rem]">
      {migrateMsg && (
        <span className="text-primary/80">{migrateMsg}</span>
      )}
      {email ? (
        <>
          <span className="text-muted-foreground truncate max-w-[14ch]">
            {email}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              로그아웃
            </button>
          </form>
        </>
      ) : (
        <Link
          href="/auth/login"
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          로그인하고 동기화
        </Link>
      )}
    </div>
  );
}
