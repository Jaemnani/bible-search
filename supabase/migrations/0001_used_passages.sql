-- 랜덤 구절 추천 기능: 사용자별 "사용된 단락" 기록
-- passage_id 는 public/data/passages.json 의 단락 식별자 (예: "John:3:14-21")

create table if not exists public.used_passages (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  passage_id  text        not null,
  used_at     timestamptz not null default now(),
  primary key (user_id, passage_id)
);

create index if not exists used_passages_user_idx
  on public.used_passages(user_id);

alter table public.used_passages enable row level security;

drop policy if exists "select own" on public.used_passages;
create policy "select own"
  on public.used_passages
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own" on public.used_passages;
create policy "insert own"
  on public.used_passages
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own" on public.used_passages;
create policy "delete own"
  on public.used_passages
  for delete
  using (auth.uid() = user_id);
