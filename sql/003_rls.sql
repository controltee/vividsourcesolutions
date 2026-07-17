-- 003 · Row Level Security — the publish gate
--
-- Inspection (pg_policies) confirmed the live DB already implements the model we
-- want on EVERY table: public read + authenticated full access, plus correct
-- storage policies on portfolio_assets (public read; authenticated
-- insert/update/delete). Nothing there needs changing.
--
-- The ONLY problem: `projects` and `project_media` each have a
--   "Allow public read on X"  {public} SELECT USING (true)
-- policy, which lets anyone read UNPUBLISHED drafts. RLS policies are OR'd, so
-- adding a gate is not enough — we replace those two policies with a
-- published-only gate. The authenticated admin keeps full read/write (incl.
-- drafts) through the existing "Allow auth all projects" and
-- "Allow all with all project_media" policies, so the CMS is unaffected.
--
-- Requires 001 (adds projects.is_published). Idempotent: drop-then-create.

-- projects: the public sees published projects only.
drop policy if exists "Allow public read on projects" on public.projects;
drop policy if exists "anon read published projects" on public.projects;
create policy "anon read published projects" on public.projects
  for select to anon using (is_published = true);

-- project_media: the public sees gallery images of published projects only.
drop policy if exists "Allow public read on project_media" on public.project_media;
drop policy if exists "anon read media of published projects" on public.project_media;
create policy "anon read media of published projects" on public.project_media
  for select to anon using (
    exists (
      select 1 from public.projects p
       where p.id = project_media.project_id and p.is_published = true
    )
  );

-- Everything else (categories, clients, posters, videos, site_content,
-- partner_logos, project_images, storage.objects) already has correct
-- public-read + authenticated-write policies — deliberately left untouched.
--
-- Verify the gate after running (should return the count of published rows,
-- not all rows), from an anon context:
--   -- with the anon key, GET /rest/v1/projects should now omit is_published=false rows.
