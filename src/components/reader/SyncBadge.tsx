"use client";

import { useEffect, useState } from "react";
import { RefreshCw, LogIn, LogOut, X, Loader2 } from "lucide-react";
import { getSupabase, isSyncConfigured } from "@/lib/sync/client";
import { syncReader } from "@/lib/sync/syncEngine";

// 로그인(GoTrue 매직링크) + 로컬↔NAS 동기화. env(NEXT_PUBLIC_SUPABASE_*) 미설정 시 렌더 안 함(익명 유지).
export function SyncBadge() {
  const sb = getSupabase();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  if (!isSyncConfigured() || !sb) return null;

  async function sendLink() {
    if (!sb || !emailInput.trim()) return;
    setBusy(true); setStatus(null);
    const redirect = typeof window !== "undefined" ? window.location.origin + "/read" : undefined;
    const { error } = await sb.auth.signInWithOtp({ email: emailInput.trim(), options: { emailRedirectTo: redirect } });
    setStatus(error ? error.message : "이메일의 로그인 링크를 확인하세요.");
    setBusy(false);
  }
  async function doSync() {
    if (!userId) return;
    setBusy(true); setStatus(null);
    try { await syncReader(userId); setStatus("동기화 완료"); }
    catch { setStatus("동기화 실패"); }
    finally { setBusy(false); }
  }
  async function logout() { await sb?.auth.signOut(); setOpen(false); setStatus(null); }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded-md p-2 hover:bg-black/5"
        title={email ? `${email} · 동기화` : "로그인/동기화"}>
        {email ? <RefreshCw size={17} /> : <LogIn size={17} />}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">{email ? "동기화" : "로그인"}</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={15} /></button>
          </div>

          {email ? (
            <div className="space-y-2">
              <p className="truncate text-xs text-gray-500">{email}</p>
              <button onClick={doSync} disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 지금 동기화
              </button>
              <button onClick={logout} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <LogOut size={14} /> 로그아웃
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                placeholder="이메일" className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none" />
              <button onClick={sendLink} disabled={busy || !emailInput.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} 로그인 링크 받기
              </button>
              <p className="text-[0.7rem] text-gray-400">로그인하면 하이라이트·메모가 기기 간 동기화됩니다.</p>
            </div>
          )}
          {status && <p className="mt-2 text-xs text-primary/80">{status}</p>}
        </div>
      )}
    </div>
  );
}
