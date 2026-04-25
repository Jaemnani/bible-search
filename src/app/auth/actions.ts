"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AUTH_PROVIDERS } from "@/lib/auth/providers";

export async function signInWithProvider(formData: FormData) {
  const providerId = String(formData.get("provider_id") ?? "");
  const provider = AUTH_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) {
    redirect(`/auth/login?error=${encodeURIComponent("알 수 없는 로그인 방식")}`);
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ??
    (hdrs.get("host") ? `https://${hdrs.get("host")}` : "");

  if (provider!.kind === "oauth") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider!.supabaseProvider!,
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
    }
    if (data?.url) {
      redirect(data.url);
    }
  }

  if (provider!.kind === "magiclink") {
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      redirect(`/auth/login?error=${encodeURIComponent("이메일을 입력하세요")}`);
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(`/auth/login?info=${encodeURIComponent("이메일을 확인하세요")}`);
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
