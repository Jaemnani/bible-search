-- ============================================================================
-- bootstrap/00_roles.sql — Supabase 클라우드가 제공하던 역할을 self-host 에서 생성.
-- docker-entrypoint-initdb.d 로 DB 최초 1회 자동 실행(데이터 디렉토리가 빈 경우만).
-- 마이그레이션(0001~)이 anon/authenticated 역할을 참조하므로 반드시 선행.
--
-- 주의: 'CHANGE_ME_SAME_AS_ENV' 를 .env 의 AUTHENTICATOR_PASSWORD 와 동일하게.
--       (initdb 시 변수 치환 안 됨 — README 의 sed 단계로 치환.)
-- ============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;          -- 로그인 사용자(JWT role=authenticated)
create role service_role nologin noinherit bypassrls; -- 서버/크롤러 적재(RLS 우회)

create role authenticator noinherit login password 'CHANGE_ME_SAME_AS_ENV';
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;

-- 이후 생성 테이블 기본 권한: anon/authenticated read, service_role 전체.
-- (사용자별 테이블의 insert/update/delete 권한은 0001 마이그레이션에서 authenticated 에 명시 부여.)
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
