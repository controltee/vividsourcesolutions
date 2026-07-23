-- 006 · Client-level card settings (the parent card on the home grid)
--
-- APPLIED 2026-07-24. Running it revealed that `clients` ALREADY had a
-- `banner_url` column (with a 1920x1080 banner set on Riara University by the
-- old codebase) and a `description` column (empty on every row). Per CLAUDE.md
-- — reuse live column names — the code was switched to those two, which is why
-- Riara's existing banner appears on the new client card without a re-upload.
--
-- So of the four columns below, only banner_w / banner_h are actually used.
-- cover_url and summary are DEAD and can be dropped whenever convenient:
--
--   alter table public.clients drop column if exists cover_url;
--   alter table public.clients drop column if exists summary;
--
-- They are left in place rather than dropped here because CLAUDE.md forbids
-- destructive migrations without Jesse's say-so, and two empty nullable columns
-- cost nothing. Do NOT drop banner_url or description — both are live and read
-- by the other deployed site sharing this database.
--
-- CONTEXT
-- A client with 2+ published projects collapses into ONE card on the home grid
-- and gets its own client.html page (see CLAUDE.md "Client grouping"). Until
-- now that card had to borrow the first project's banner, so the only way to
-- change what Riara University looks like on the homepage was to re-crop a
-- project cover — which also changed that project's own card.
--
-- These columns give the client card its own banner and subtitle, editable from
-- the admin's new Clients tab. All four are nullable with no default: a client
-- that has none behaves exactly as it does today (falls back to the first
-- project's cover), so this migration cannot change how the live site looks
-- until Jesse actually sets one.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once (every statement guards on IF NOT EXISTS).
--
-- RLS: none needed. `clients` already carries public-read + authenticated-write
-- policies (confirmed in 003), which is exactly what the card and the admin
-- need. No policy is added, changed, or dropped here.

alter table public.clients
  -- The card banner. banner_w/banner_h are the intrinsic pixel size, stored so
  -- the card reserves its space before the image loads (zero CLS) and so
  -- image.js can build a correct srcset — it refuses to transform without a
  -- known aspect ratio rather than risk a distorted crop.
  add column if not exists cover_url text,
  add column if not exists banner_w  int,
  add column if not exists banner_h  int,
  -- Optional subtitle for the client card and the client page. Left empty, the
  -- card keeps listing the client's project titles as it does now.
  add column if not exists summary   text;

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='clients'
--    order by ordinal_position;
