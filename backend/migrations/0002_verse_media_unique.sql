-- ============================================================================
-- P5-core: 크롤러가 verse_media 를 upsert 할 수 있게 (verse_ref, url) 유니크 제약 추가.
-- PostgREST 의 on_conflict=verse_ref,url + Prefer: resolution=merge-duplicates 가 이 제약을 요구한다.
-- (재실행 안전 — 기존 중복을 먼저 정리한 뒤 제약을 건다.)
-- ============================================================================

delete from public.verse_media a
  using public.verse_media b
 where a.id > b.id
   and a.verse_ref = b.verse_ref
   and a.url = b.url;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.verse_media'::regclass
       and conname = 'verse_media_ref_url_key'
  ) then
    alter table public.verse_media
      add constraint verse_media_ref_url_key unique (verse_ref, url);
  end if;
end $$;
