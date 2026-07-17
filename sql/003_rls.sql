-- 003 · Row Level Security
--
-- ⚠ DO NOT RUN THIS BLIND. RLS is the real security boundary and this DB is
-- shared with the live site. First run the inspection query at the bottom of
-- this file and share the result, so we can confirm no pre-existing "read all"
-- policy is left in place that would defeat the publish gate on `projects`.
--
-- Model: the public (anon) may READ published content only; an authenticated
-- admin may do everything (including reading unpublished drafts). Every policy
-- is dropped-if-exists first, so this script is safe to re-run.

-- ── categories ── public reads all; admin full access ──────────────────────
alter table public.categories enable row level security;
drop policy if exists "anon read categories" on public.categories;
create policy "anon read categories" on public.categories
  for select to anon using (true);
drop policy if exists "auth all categories" on public.categories;
create policy "auth all categories" on public.categories
  for all to authenticated using (true) with check (true);

-- ── clients ── public reads all (needed to show client names on projects) ──
alter table public.clients enable row level security;
drop policy if exists "anon read clients" on public.clients;
create policy "anon read clients" on public.clients
  for select to anon using (true);
drop policy if exists "auth all clients" on public.clients;
create policy "auth all clients" on public.clients
  for all to authenticated using (true) with check (true);

-- ── projects ── public reads PUBLISHED only; admin sees everything ─────────
alter table public.projects enable row level security;
drop policy if exists "anon read published projects" on public.projects;
create policy "anon read published projects" on public.projects
  for select to anon using (is_published = true);
drop policy if exists "auth all projects" on public.projects;
create policy "auth all projects" on public.projects
  for all to authenticated using (true) with check (true);

-- ── project_media ── public reads media of PUBLISHED projects only ─────────
alter table public.project_media enable row level security;
drop policy if exists "anon read media of published projects" on public.project_media;
create policy "anon read media of published projects" on public.project_media
  for select to anon using (
    exists (
      select 1 from public.projects p
       where p.id = project_media.project_id and p.is_published = true
    )
  );
drop policy if exists "auth all project_media" on public.project_media;
create policy "auth all project_media" on public.project_media
  for all to authenticated using (true) with check (true);

-- ── posters / videos / site_content ── live-site public content ────────────
-- The new site does not render these, but the DEPLOYED site still does, so they
-- stay publicly readable. Admin keeps full access.
alter table public.posters enable row level security;
drop policy if exists "anon read posters" on public.posters;
create policy "anon read posters" on public.posters for select to anon using (true);
drop policy if exists "auth all posters" on public.posters;
create policy "auth all posters" on public.posters for all to authenticated using (true) with check (true);

alter table public.videos enable row level security;
drop policy if exists "anon read videos" on public.videos;
create policy "anon read videos" on public.videos for select to anon using (true);
drop policy if exists "auth all videos" on public.videos;
create policy "auth all videos" on public.videos for all to authenticated using (true) with check (true);

alter table public.site_content enable row level security;
drop policy if exists "anon read site_content" on public.site_content;
create policy "anon read site_content" on public.site_content for select to anon using (true);
drop policy if exists "auth all site_content" on public.site_content;
create policy "auth all site_content" on public.site_content for all to authenticated using (true) with check (true);

-- ── Storage: portfolio_assets bucket ──────────────────────────────────────
-- VERIFY FIRST in Storage -> Policies. The bucket is already public-read in
-- production; only add these if equivalents are not already present, to avoid
-- duplicating or fighting existing storage policies.
--
-- drop policy if exists "public read portfolio_assets" on storage.objects;
-- create policy "public read portfolio_assets" on storage.objects
--   for select to anon, authenticated using (bucket_id = 'portfolio_assets');
-- drop policy if exists "auth write portfolio_assets" on storage.objects;
-- create policy "auth write portfolio_assets" on storage.objects
--   for insert to authenticated with check (bucket_id = 'portfolio_assets');
-- drop policy if exists "auth update portfolio_assets" on storage.objects;
-- create policy "auth update portfolio_assets" on storage.objects
--   for update to authenticated using (bucket_id = 'portfolio_assets');
-- drop policy if exists "auth delete portfolio_assets" on storage.objects;
-- create policy "auth delete portfolio_assets" on storage.objects
--   for delete to authenticated using (bucket_id = 'portfolio_assets');

-- ── INSPECTION (run this FIRST, paste the result back) ─────────────────────
-- Shows every existing policy so we can spot a pre-existing permissive read
-- policy that would defeat the publish gate above.
--   select schemaname, tablename, policyname, roles, cmd, qual, with_check
--     from pg_policies
--    where schemaname in ('public','storage')
--    order by tablename, policyname;
