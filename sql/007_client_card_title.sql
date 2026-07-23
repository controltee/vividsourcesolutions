-- 007 · A card title for the client, separate from the client's name
--
-- CONTEXT
-- `clients.name` is the canonical name of the organisation. It is what the
-- project page prints under "Client", what the admin's Client dropdown lists,
-- and — importantly — what the client page URL is built from
-- (client.html?c=slugify(name)).
--
-- The home grid and the client page heading want something else: a title that
-- reads well as a card. "Riara University Students' Association" on the card,
-- while the project page still says "Riara University Students' Association
-- (RUSA)". Before this column those were the same string, so tuning the card
-- also rewrote every project page and changed the client's URL.
--
-- card_title is OPTIONAL. Empty (the state every existing row starts in) means
-- the card falls back to `name`, which is exactly today's behaviour — so this
-- migration cannot change how the live site looks until a title is typed in.
--
-- NOTE the URL deliberately keeps following `name`, not card_title. Editing a
-- card title therefore never breaks an existing link to a client page.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.
--
-- RLS: none needed. `clients` already carries public-read + authenticated-write
-- policies (confirmed in 003).

alter table public.clients
  add column if not exists card_title text;

-- OPTIONAL cleanup, unrelated to the above and safe to skip. 006 added two
-- columns that turned out to duplicate live ones (banner_url / description) and
-- are now dead. Run these only if you want them gone:
--
--   alter table public.clients drop column if exists cover_url;
--   alter table public.clients drop column if exists summary;

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='clients'
--    order by ordinal_position;
