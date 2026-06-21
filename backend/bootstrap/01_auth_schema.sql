-- bootstrap/01_auth_schema.sql — DB 최초 1회 자동 실행(00_roles 다음).
-- GoTrue 마이그레이션이 auth.users 등을 CREATE 하지만 스키마는 미리 있어야 함
-- (없으면 "schema auth does not exist"로 GoTrue 기동 실패). 여기서 선생성.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
