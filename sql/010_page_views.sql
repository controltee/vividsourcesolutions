-- 010 · First-party page analytics
--
-- CONTEXT
-- Jesse wants the numbers inside /admin, not in a third party's dashboard. That
-- rules out Vercel Web Analytics (its data lives in Vercel and has no Hobby-tier
-- API to pull from) and every hosted tool, so the site counts its own views into
-- its own database. No npm package, no third-party script, no cookies — which
-- fits this codebase's rules better than any hosted option would.
--
-- WHAT IS AND ISN'T STORED
-- No cookies, no fingerprint, no IP address, no user id. A row is: which path,
-- which referrer host, and when. That is deliberately not enough to identify a
-- person, which is why the existing cookie notice already covers it and needs
-- no new consent gate.
--
-- HONEST LIMITATION — READ THIS
-- Inserting is open to the anon role, and the anon key is public by design, so
-- anyone reading the page source could post fabricated rows. Nobody bothers
-- targeting a studio portfolio, and nothing sensitive is stored, but these
-- numbers are DIRECTIONALLY TRUE, not audited. Do not quote them in a pitch as
-- if they were measured by a third party.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Until it runs, the beacon in js/analytics.js fails silently (by design — a
-- missing analytics table must never break a page) and the admin's Analytics
-- tab says the migration is outstanding.

create table if not exists public.page_views (
  id         bigserial primary key,
  -- The pathname plus its query, e.g. '/project.html?p=riara-rebrand'. Capped:
  -- an unbounded text column reachable by the public role is a place to dump
  -- data, and no real path on this site is close to 300 characters.
  path       text not null check (length(path) between 1 and 300),
  -- HOST only ('instagram.com'), never the full referring URL — a full referrer
  -- can carry search terms and private path segments from the linking site.
  -- Null means a direct visit or a referrer the browser withheld.
  referrer   text check (referrer is null or length(referrer) <= 120),
  -- 'estimate_start' | 'estimate_complete' | 'estimate_submit' mark the funnel;
  -- null is an ordinary page view. One table rather than two: the volumes are
  -- tiny and the admin reads them together.
  event      text check (event is null or length(event) <= 40),
  created_at timestamptz not null default now()
);

-- Every admin query is "recent rows, newest first", and the funnel counts filter
-- on event. Without these the table scans, which is free at a hundred rows and
-- is not at a hundred thousand.
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_event_idx on public.page_views (event) where event is not null;

alter table public.page_views enable row level security;

-- The public may WRITE a view and may never read one. Traffic figures are the
-- studio's business, and a select policy here would publish them to anyone who
-- found the anon key — which is everyone.
drop policy if exists "anon insert page views" on public.page_views;
create policy "anon insert page views" on public.page_views
  for insert to anon with check (true);

drop policy if exists "auth read page views" on public.page_views;
create policy "auth read page views" on public.page_views
  for select to authenticated using (true);

-- Pruning. The admin only ever looks back 90 days, so older rows are cost with
-- no reader. There is no cron on this project, so the admin panel calls this
-- when the Analytics tab loads — cheap, and it means the table cannot grow
-- without bound just because nobody remembered to prune it.
create or replace function public.prune_page_views()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.page_views where created_at < now() - interval '90 days';
$$;

revoke all on function public.prune_page_views() from public, anon;
grant execute on function public.prune_page_views() to authenticated;

-- Verify:
--   select count(*) from public.page_views;
--   select policyname, cmd, roles from pg_policies where tablename = 'page_views';
