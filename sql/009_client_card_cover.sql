-- 009 · Give the client CARD its own image, separate from the client PAGE banner
--
-- CONTEXT
-- A client with 2+ published projects appears in two places, and until now both
-- drew the same file out of `clients.banner_url`:
--
--   1. the home grid, as one card — roughly portrait, cropped to the card
--   2. their own page (client.html), as a wide header banner
--
-- One image cannot serve both. A 1920x1080 banner cropped into a card loses its
-- edges; an image cropped for the card is far too tall across the page header.
-- Riara University and RUSA are the live examples.
--
-- SO: banner_url keeps its current job — the WIDE banner at the top of the
-- client's page — and the card gets its own image in `cover_url`.
--
-- WHY cover_url ALREADY EXISTS AND THIS ONLY ADDS TWO COLUMNS
-- 006 added cover_url/summary, then discovered `clients` already had live
-- banner_url/description columns and switched to those, leaving cover_url dead
-- (see the header of sql/006_client_cover.sql, which offers to drop it). It is
-- exactly the column this needs, so it is being brought into use rather than
-- dropped and re-added under another name. Only its dimensions are missing:
-- banner_w/banner_h are spoken for by banner_url.
--
-- DO NOT drop banner_url or description. Both are live, and banner_url is read
-- by the other deployed site sharing this database (control-tee.vercel.app).
--
-- NOTHING CHANGES UNTIL AN IMAGE IS SET. Both columns are nullable with no
-- default, and the card falls back exactly as it does today: cover_url, then
-- banner_url, then the first project's own banner. A client nobody has touched
-- renders identically before and after this migration.
--
-- The site also runs correctly WITHOUT this migration. PostgREST omits a column
-- it does not have, so `'cover_w' in client` is a reliable probe; the admin
-- hides the card-image field until it can actually save it, and the public
-- pages fall back to banner_url. Same pattern as sql/008.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once (every statement guards on IF NOT EXISTS).
--
-- RLS: none needed. `clients` already carries public-read + authenticated-write
-- policies (confirmed in 003), which is what the card and the admin need. No
-- policy is added, changed, or dropped here.

alter table public.clients
  -- cover_url already exists (006) and is unused; these are its intrinsic pixel
  -- dimensions, stored so the card reserves its space before the image loads
  -- (zero CLS) and so image.js can build a correct srcset — it refuses to
  -- transform without a known aspect ratio rather than risk a distorted crop.
  add column if not exists cover_w int,
  add column if not exists cover_h int;

-- In case a database somewhere never ran 006, this makes 009 self-sufficient.
alter table public.clients
  add column if not exists cover_url text;

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='clients'
--    order by ordinal_position;
