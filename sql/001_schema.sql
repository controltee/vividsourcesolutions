-- 001 · Additive schema changes for the new frontend
--
-- CONTEXT
-- This runs against the EXISTING live database (ccaggjhyeygyosbdnxmq), which is
-- shared with the currently-deployed control-tee.vercel.app. It is NOT a
-- create-from-scratch schema. Every statement is additive and defaulted, so it
-- cannot break the live site, and every statement guards on IF [NOT] EXISTS so
-- it is safe to run more than once.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run. Oldest first
-- (001, then 002, then 003).
--
-- WHY EACH COLUMN
-- The new site reuses live columns where it can (title, category_id, client_id,
-- cover_url, description, date_made, sort_order). These are the fields it needs
-- that do not exist yet.

-- categories: the rail + home order projects by category.sort_order.
alter table public.categories
  add column if not exists sort_order int not null default 0;

-- projects: slug routing, publish gate, layout renderer, home-card summary,
-- banner intrinsic size (zero-CLS), services list, updated_at.
alter table public.projects
  add column if not exists slug         text,
  add column if not exists summary      text,
  add column if not exists services     text[]      not null default '{}',
  add column if not exists layout       text        not null default 'gallery',
  add column if not exists is_published boolean      not null default true,
  add column if not exists banner_w     int,
  add column if not exists banner_h     int,
  add column if not exists updated_at   timestamptz  not null default now();

-- Only the three renderers the new project page implements.
alter table public.projects drop constraint if exists projects_layout_check;
alter table public.projects
  add constraint projects_layout_check check (layout in ('gallery','deck','reel'));

-- project_media is the per-project gallery ("assets"). The new site needs
-- intrinsic dimensions (zero-CLS), alt text (a11y), an explicit order, and a
-- kind flag. Dimensions are left nullable here and backfilled by the image
-- pipeline / admin at upload time; existing rows are handled in 002.
alter table public.project_media
  add column if not exists kind       text not null default 'image',
  add column if not exists width      int,
  add column if not exists height     int,
  add column if not exists alt        text not null default '',
  add column if not exists caption    text,
  add column if not exists sort_order int  not null default 0;

alter table public.project_media drop constraint if exists project_media_kind_check;
alter table public.project_media
  add constraint project_media_kind_check check (kind in ('image','video'));

-- Verify:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name in ('categories','projects','project_media')
--    order by table_name, ordinal_position;
