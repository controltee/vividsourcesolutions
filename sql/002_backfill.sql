-- 002 · Backfill the two existing projects and the five categories
--
-- Runs after 001. Idempotent: slug updates guard on `slug is null`, so re-running
-- will not overwrite anything you later edit in the admin panel.

-- Category order in the rail / home. Adjust to taste (or later via the admin).
update public.categories set sort_order = 0 where slug = 'brand-identity-systems';
update public.categories set sort_order = 1 where slug = 'poster-designs';
update public.categories set sort_order = 2 where slug = 'social-and-marketing-campaigns';
update public.categories set sort_order = 3 where slug = 'motion-design';
update public.categories set sort_order = 4 where slug = 'video-editing';

-- Project slugs (routing), layout, and real banner dimensions (measured: 1440x1080).
update public.projects
   set slug = 'pageantry-branding-campaign',
       layout = 'gallery',
       banner_w = 1440, banner_h = 1080
 where id = '891d2e96-1415-463f-aeb5-a4d5e913ccf8' and slug is null;

update public.projects
   set slug = 'cultural-week-2026-pride-of-asili',
       layout = 'gallery',
       banner_w = 1440, banner_h = 1080
 where id = 'c88b593c-a8df-4aba-9207-673d800dec13' and slug is null;

-- Enforce slug uniqueness going forward (the new admin generates slugs).
create unique index if not exists projects_slug_key on public.projects(slug);

-- Give the 40 existing gallery images a stable order from their upload time.
-- (width/height stay null until measured by the pipeline; the project page
-- tolerates missing dimensions and the admin captures them for new uploads.)
with ordered as (
  select id, row_number() over (partition by project_id order by created_at) - 1 as rn
    from public.project_media
)
update public.project_media m
   set sort_order = ordered.rn
  from ordered
 where m.id = ordered.id and m.sort_order = 0;

-- OPTIONAL, run only after you've confirmed every project has a slug:
--   alter table public.projects alter column slug set not null;
