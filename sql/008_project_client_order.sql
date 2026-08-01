-- 008 · A client-scoped order for a client's projects
--
-- CONTEXT
-- `projects.sort_order` is scoped to a CATEGORY. That is the right scope for
-- the home grid, which walks categories in order and lays out the projects
-- inside each one, and nothing here changes that.
--
-- It is the wrong scope for a client. A client's page (client.html) lists that
-- client's work and orders it category-first, then by sort_order within the
-- category. So a client with work in two categories can never interleave it:
-- every Brand Identity project is forced above every Poster, whatever the story
-- the page should tell. The admin's client view has the same ceiling — its
-- arrows can only move a project among its category-mates, because that is all
-- sort_order can express.
--
-- client_sort_order gives each project a position within ITS CLIENT, entirely
-- independent of category. Two projects in different categories can then sit
-- next to each other on the client page in whatever order reads best.
--
-- SAFE BY DEFAULT
-- The column is nullable and the backfill below reproduces the order the site
-- shows TODAY. Applying this migration therefore changes nothing visible: it
-- only makes the existing order editable. Projects with no client stay null and
-- are never consulted — they have no client page to appear on.
--
-- Anything reading it must tolerate its absence (PostgREST errors on a column
-- it has not seen), the same way js/client.js and the admin already use
-- select('*') and probe for card_title. Until the frontend is updated this
-- column is simply inert.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once: the column add is idempotent, and the backfill
-- only fills rows that are still null, so a re-run never renumbers work you
-- have since arranged by hand.
--
-- RLS: none needed. `projects` already carries the anon-read-published +
-- authenticated-write policies from 003, and they are column-agnostic.

-- 1 ------------------------------------------------------------------- column
alter table public.projects
  add column if not exists client_sort_order integer;

-- 2 ----------------------------------------------------------------- backfill
-- Numbers each client's UNNUMBERED projects in the order the site currently
-- shows them: category sort_order first, then the project's position inside
-- that category, then title as the tie-break. That is exactly the comparator in
-- js/client.js, so the first render after this migration is identical to the
-- last render before it.
--
-- The new positions start AFTER the client's current highest, rather than at 0.
-- On the first run that is a no-op — nothing is numbered yet, so every client
-- starts at 0 and runs to n-1. On any later run it is what makes the migration
-- safe to repeat: a project added after the first run is APPENDED to the end of
-- its client's order instead of being ranked back into the middle of it, which
-- would collide with a position already assigned by hand in the admin.
--
-- Only rows where client_sort_order IS NULL are touched, so an order you have
-- arranged in the admin is never renumbered. To deliberately reset a client
-- back to category order, null their column first:
--   update public.projects set client_sort_order = null where client_id = '<id>';
with existing as (
  select client_id, max(client_sort_order) as max_position
    from public.projects
   where client_id is not null
     and client_sort_order is not null
   group by client_id
),
unnumbered as (
  select
    p.id,
    p.client_id,
    row_number() over (
      partition by p.client_id
      order by
        coalesce(c.sort_order, 999),
        coalesce(p.sort_order, 0),
        p.title
    ) - 1 as offset_position
  from public.projects p
  left join public.categories c on c.id = p.category_id
  where p.client_id is not null
    and p.client_sort_order is null
)
update public.projects p
   set client_sort_order =
         unnumbered.offset_position + coalesce(existing.max_position + 1, 0)
  from unnumbered
  left join existing on existing.client_id = unnumbered.client_id
 where unnumbered.id = p.id;

-- 3 -------------------------------------------------------------------- index
-- The client page and the admin's client view both filter by client_id and sort
-- by this column. Small table today, but the index costs nothing and keeps the
-- ordering cheap as the portfolio grows.
create index if not exists projects_client_order_idx
  on public.projects (client_id, client_sort_order);

-- VERIFY -----------------------------------------------------------------
-- Column is present and nullable:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='projects'
--      and column_name='client_sort_order';
--
-- Every client's work numbered from 0 with no gaps and no duplicates:
--   select cl.name,
--          count(*)                        as projects,
--          min(p.client_sort_order)        as first,
--          max(p.client_sort_order)        as last,
--          count(distinct p.client_sort_order) as distinct_positions
--     from public.projects p
--     join public.clients cl on cl.id = p.client_id
--    where p.client_id is not null
--    group by cl.name
--    order by cl.name;
--   -- expect: first = 0, last = projects - 1, distinct_positions = projects
--
-- Nothing unclaimed:
--   select count(*) as unnumbered
--     from public.projects
--    where client_id is not null and client_sort_order is null;
--   -- expect: 0
