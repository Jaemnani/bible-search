// anon / service_role JWT 발급 — JWT_SECRET 으로 HS256 서명.
// supabase-js 가 Authorization: Bearer <key> 로 보내면 PostgREST 가 같은 JWT_SECRET 으로 검증.
//   사용:  node gen-keys.mjs "<JWT_SECRET>"   (또는 JWT_SECRET 환경변수)
// 의존성 없음(Node 내장 crypto).
import crypto from "node:crypto";

const secret = process.argv[2] || process.env.JWT_SECRET;
if (!secret) {
  console.error("usage: node gen-keys.mjs <JWT_SECRET>");
  process.exit(1);
}
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function sign(role) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ role, iss: "bible-selfhost" }));
  const data = `${header}.${payload}`;
  const sig = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}
console.log("ANON_KEY (공개 — 클라이언트 SUPABASE_KEY):\n" + sign("anon") + "\n");
console.log("SERVICE_KEY (비밀 — 서버/크롤러 전용, 클라 노출 금지):\n" + sign("service_role"));
// 참고: 로그인 사용자 토큰은 인증 제공자가 {role:'authenticated', sub:'<user-uuid>'} 로 발급
//       (동일 JWT_SECRET) → auth.uid() 가 sub 를 읽어 RLS 가 본인 행만 허용.
