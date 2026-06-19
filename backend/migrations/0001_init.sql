-- ============================================================================
-- 0001_init — 성경 리더 백엔드 스키마 + RLS + 동기화(LWW/tombstone)
--
-- 키잉 규약: 모든 절 참조는 불변 절-ID  verse_ref = "{book_en}:{chapter}:{verse}" (C2).
-- 동기화: 사용자별 행에 updated_at(LWW) + deleted(tombstone). 클라이언트는
--   pull: updated_at > last_sync 인 행, push: upsert(updated_at 갱신)/삭제는 deleted=true.
-- 인증: auth.uid() 는 PostgREST 가 검증한 JWT 의 sub 클레임(UUID). 제공자 무관
--   (self-host GoTrue 또는 동일 JWT_SECRET 으로 서명하는 호스티드) — 스키마는 동일.
-- ============================================================================

-- --- auth.uid() 헬퍼 (Supabase 호환) -----------------------------------------
create schema if not exists auth;
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ============================================================================
-- 사용자별 데이터 (RLS: 본인 행만) — 동기화 대상
-- ============================================================================

-- 하이라이트
create table if not exists public.highlights (
  user_id    uuid        not null,
  verse_ref  text        not null,
  color      text        not null,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, verse_ref)
);

-- 노트(.md 본문)
create table if not exists public.notes (
  user_id    uuid        not null,
  verse_ref  text        not null,
  body_md    text        not null default '',
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, verse_ref)
);

-- 자유낙서(이미지는 MinIO bible-notes 버킷, image_key 로 참조)
create table if not exists public.drawings (
  user_id    uuid        not null,
  verse_ref  text        not null,
  image_key  text        not null,
  meta       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, verse_ref)
);

-- AI 교차검증 기록/투표 (knowai arena 패턴)
create table if not exists public.ai_cross_checks (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null,
  verse_ref  text        not null,
  prompt     text,
  model      text,
  output     text,
  vote       text,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false
);

create index if not exists highlights_user_idx on public.highlights(user_id, updated_at);
create index if not exists notes_user_idx       on public.notes(user_id, updated_at);
create index if not exists drawings_user_idx     on public.drawings(user_id, updated_at);
create index if not exists cross_user_idx        on public.ai_cross_checks(user_id, updated_at);

-- authenticated 에 쓰기 권한(읽기는 bootstrap 기본권한). RLS 로 본인 행만 제한.
grant insert, update, delete on public.highlights, public.notes, public.drawings to authenticated;
grant insert, update, delete on public.ai_cross_checks to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- RLS: 본인(user_id = auth.uid()) 행만 모든 작업 허용
do $$
declare t text;
begin
  for t in select unnest(array['highlights','notes','drawings','ai_cross_checks']) loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('create policy "own_select" on public.%I for select to authenticated using (user_id = auth.uid());', t);
    execute format('drop policy if exists "own_insert" on public.%I;', t);
    execute format('create policy "own_insert" on public.%I for insert to authenticated with check (user_id = auth.uid());', t);
    execute format('drop policy if exists "own_update" on public.%I;', t);
    execute format('create policy "own_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format('drop policy if exists "own_delete" on public.%I;', t);
    execute format('create policy "own_delete" on public.%I for delete to authenticated using (user_id = auth.uid());', t);
  end loop;
end $$;

-- ============================================================================
-- 전역 캐시(읽기 공개, 쓰기 service_role) — 사용자 무관
-- ============================================================================

-- 구절 TTS 캐시 (ElevenLabs → MinIO bible-audio). P4-core 에서 적재.
create table if not exists public.verse_audio (
  verse_ref  text        not null,
  voice      text        not null default 'default',
  url        text        not null,
  created_at timestamptz not null default now(),
  primary key (verse_ref, voice)
);

-- 구절별 설교영상·책 (크롤러 적재 = P5). 영상은 링크/메타만(저작권).
create table if not exists public.verse_media (
  id         bigint generated always as identity primary key,
  verse_ref  text        not null,
  type       text        not null check (type in ('video','book')),
  title      text        not null,
  url        text        not null,
  thumb_key  text,
  source     text,
  rank       int         not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists verse_audio_ref_idx on public.verse_audio(verse_ref);
create index if not exists verse_media_ref_idx  on public.verse_media(verse_ref, rank);

-- 공개 read 정책 (anon + authenticated). 쓰기는 service_role(bypassrls) 가 직접.
do $$
declare t text;
begin
  for t in select unnest(array['verse_audio','verse_media']) loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "public_read" on public.%I;', t);
    execute format('create policy "public_read" on public.%I for select to anon, authenticated using (true);', t);
  end loop;
end $$;
