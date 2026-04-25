/**
 * 활성 로그인 provider 목록 — 추후 한 항목만 추가하면 새 로그인 방식 활성화.
 *
 * - kind "oauth": Google/GitHub 등 OAuth (Supabase 대시보드에서 활성화 + redirect URL 등록 필요)
 * - kind "magiclink": 이메일 매직링크 (Supabase Auth 기본값으로 사용 가능)
 */

export type AuthProviderKind = "oauth" | "magiclink";

export interface AuthProviderConfig {
  id: string;
  label: string;
  kind: AuthProviderKind;
  /** kind="oauth" 일 때 Supabase 로 넘기는 provider 식별자 */
  supabaseProvider?:
    | "google"
    | "github"
    | "apple"
    | "kakao"
    | "azure"
    | "facebook";
}

export const AUTH_PROVIDERS: AuthProviderConfig[] = [
  {
    id: "google",
    label: "Google로 시작하기",
    kind: "oauth",
    supabaseProvider: "google",
  },
  // 추후 추가 예시:
  // { id: "github", label: "GitHub으로 시작하기", kind: "oauth", supabaseProvider: "github" },
  // { id: "magiclink", label: "이메일로 로그인", kind: "magiclink" },
];
