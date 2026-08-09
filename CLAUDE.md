# Control Tee site — agent notes

Nairobi design studio portfolio. Vanilla HTML/CSS/JS. No build tools. Vercel + Supabase.

## Build context (read first — this repo is not greenfield)

This is a ground-up v3 rebuild. Two older Control Tee codebases exist and share the
same live Supabase project (`ccaggjhyeygyosbdnxmq`):

- `controltee/vividsourcesolutions` — the old site (posters/videos tables).
  **Its GitHub repo is now this project's deploy target — see Deployment below.**
- `controltee/Control-Tee` → deployed at `control-tee.vercel.app` — the previous
  rebuild this repo will eventually replace. Richer live schema. Left alone.

Decisions (2026-07-17):
- Build fresh here; leave the other two local folders alone.
- REUSE the live DB `ccaggjhyeygyosbdnxmq` with additive-only migrations — no
  renames, no drops. Show Jesse every migration before it runs (he applies them
  in the dashboard; the anon key can't do DDL).

## Deployment (decided 2026-07-18)

Jesse repurposed the `vividsourcesolutions` GitHub repo to host this site. This
repo's `origin` is `github.com/controltee/vividsourcesolutions`; Vercel deploys
from its main → live at **controlteestudios.vercel.app**. The old flat-file site
is preserved on the remote branch `pre-rebuild-old-site`.

Deploy by pushing to origin. Neither `vercel` nor `gh` is installed on this
machine. css/js are cached `max-age=3600`, so code changes need a hard-reload
(Ctrl+Shift+R) to show up — content changes via /admin appear instantly.

## Live schema mapping (reconciled + applied, Phase 2)

The new frontend reads the live tables directly. Reuse live column names.
Migrations 001 (schema), 002 (backfill), 003 (RLS), 004 (media dimensions) and
005 (contact/social rows) are applied — verified against the live DB 2026-07-19.
006 (client banner dimensions) applied 2026-07-24 — read its header first, two
of its four columns turned out redundant against live ones.
Note 005 is misnamed: it creates no `site_settings` table, it inserts key-value
rows into the existing `site_content`.

- `categories` (id, name, slug, sort_order, description) — sort_order added.
- `projects`: reuse title, category_id, client_id, `cover_url` (banner),
  description, `date_made` (text, e.g. "May 2026" — use this, NOT a `year`),
  sort_order. ADDED: slug (routing), summary (home card), layout
  ('gallery'|'deck'|'reel'), is_published (publish gate), banner_w/banner_h
  (zero-CLS), services[].
- `project_media` IS the gallery/"assets" table (project_id, `media_url` = the
  image url). ADDED: width/height (backfilled by 004 — all 40 rows populated; the
  project page still tolerates nulls), alt, kind ('image'|'video'), caption,
  sort_order.
- Routing is by slug: `project.html?p=<slug>`.
- RLS: anon reads published projects + their media only; authenticated admin has
  full access. Everything else already had correct policies.
- Live-only features the new site does NOT render yet (data untouched):
  `posters` (home marquee), `videos` (grid), `site_content` (editable text).

## Hard rules
- No build step. No npm packages at runtime. No frameworks.
- No new dependencies without asking Jesse first.
- All colors and fonts come from css/tokens.css. Never hardcode a hex value.
- Every <img> has explicit width and height attributes.
- All project images go through scripts/optimize-images.mjs. No raw JPEG/PNG in production.
- Client logos in the home marquee render in their OWN colours (2026-08-09). The
  old brightness(0)/invert(1) flattening is gone. A dark-ink logo on a
  transparent background is therefore low-contrast on the dark ground — fix that
  with a better export in /admin, never by reintroducing a blanket filter.
- Service role key never touches this repo.
- Respect prefers-reduced-motion on every animation.

## Layout model
The left rail is a persistent shell. It is identical on every page. Only the right
pane changes. Do not re-render the rail on navigation.

**Every category disclosure renders CLOSED** (2026-08-09). The rail used to open
each populated category on a first visit and remember the open set for the
session, so visitors met a wall of expanded lists nobody asked for. A group now
opens only when someone presses it — including the category of the project being
viewed, which used to be force-opened underneath you. Nothing persists;
`ct:rail:open` is gone, and the cookie notice no longer claims to store menu
state.

## Client grouping (added 2026-07-24)
Repeat work for one client reads as ONE body of work, in all three surfaces:
- **Home grid** — a client with 2+ published projects collapses into a single
  card (client name, count chip, project titles) linking to the client page. One
  project, or no client at all, still renders as a plain project card.
- **Rail** — inside its category, such a client becomes a label (linking to the
  client page) with its projects nested under a rule. NOT a nested `<details>`:
  that would put two clicks where there used to be one.
- **Admin → Projects** — the same projects are boxed under the client's name,
  and the Client dropdown shows each client's project count.

`clients.name` is the organisation's REAL name — project pages print it under
"Client", and the client URL is built from it. `clients.card_title` (sql/007,
optional) overrides only the home-card heading, the client-page h1 and the rail
label. Editing a card title therefore never rewrites a project page and never
breaks a link. Everything that builds the slug uses `name`, never `card_title`.

Routing is `client.html?c=<slugify(client.name)>`. `clients` has NO slug column
and this needed no migration — js/client.js pulls the (small) client list and
matches on the slugified name, falling back to a raw client id. If a slug column
is ever added, that resolver is the only place that has to change.

Card markup lives in js/project-card.js and is shared by home.js and client.js —
home.js boots the homepage on import, so client.js cannot borrow from it.

Picking "+ Add new client…" and typing a name that already exists reuses the
existing client (matched on slug) instead of minting a duplicate row.

**Admin → Clients** opens ONE CLIENT at a time: its card at the top, all its
work beneath. The work is grouped by category, because that is what decides the
order on the client's own page (category first, then position within it). ↑/↓
move a project past its next sibling FROM THE SAME CLIENT and then renumber that
whole category 0..n-1, which also resolves the sort_order ties the seed data has.
Editing a project from here opens the same project editor the Projects tab uses —
one form, not a second to keep in step — and Save/Cancel return to the client
rather than to the projects list.

**Ordering has two modes, decided by whether sql/008 has run.** That migration
adds `projects.client_sort_order`, a position within the CLIENT that is
independent of category. Applied (it is, on the live DB), the client's work is
ONE list it can order freely, category becomes a label on the row, and the
arrows write `client_sort_order`, renumbering the client's run 0..n-1. Not
applied, everything falls back to the category-scoped `projects.sort_order`: the
view groups by category and the arrows only move a project among its
category-mates. Both paths are live in the code and tested; the probe is
`'client_sort_order' in row`, since PostgREST omits a column it does not have.
`js/client.js` sorts the same way, preferring the client position and falling
back to category order, and a project with no position sorts last so newly added
work lands at the end. Saving a project under a client assigns it the next free
position; moving it to another client re-positions it; detaching clears it.

The client editor's card section edits the PARENT card: its banner
(`clients.banner_url` + the `banner_w`/`banner_h` added by 006) and subtitle
(`clients.description`).
`banner_url` and `description` are LIVE columns predating this rebuild — reused,
not duplicated, which is why Riara University's old banner shows on the new card
with no re-upload. 006's `cover_url`/`summary` are dead; see that file.
Both fall back to the first project's cover / the list of project titles when
unset, so a client that has never been touched renders exactly as before.
Clients are only CREATED from the project form — no add form on this tab, since
a client with no work renders nowhere.

`banner_url` is also read by the other deployed site sharing this DB, so editing
a client banner here changes control-tee.vercel.app too. A banner uploaded by
the old admin has no stored dimensions; opening that client in the Clients tab
measures the image and folds the result into the next save.

Anything reading `clients` uses `select('*')`, never a named column list:
PostgREST errors on a column it doesn't know, so a named list would break every
page until 006 is applied in the dashboard.

## Theme, chrome and the opening sequence (added 2026-08-09)

**Dark is the default.** `js/theme-init.js` now stamps `data-theme` on `<html>`
on EVERY load — `light` only if the visitor chose it, `dark` otherwise — so the
OS preference no longer decides a first visit. The `@media (prefers-color-scheme:
light)` block in tokens.css is consequently only reachable with JS disabled; it
is kept as that fallback, not as a live path. The rail toggle still wins and
still persists to `ct:theme`.

**Scrollbars are the studio's, not the browser's.** tokens.css paints them in
`--paper` on no track, plus `color-scheme` so native chrome sits on the right
ground. `scrollbar-color` INHERITS so `:root` reaches every scroll container;
`scrollbar-width` does NOT, hence the one `*` rule. The `::-webkit-scrollbar`
block below it is for Safari < 18.2 only — Chromium ignores those pseudo-elements
once the standard properties are set.

**Never use `--ink` as a foreground on a `--paper` fill.** `--ink` is the page
GROUND and flips to the warm off-white on the light theme, so ink-on-paper turns
pale-on-yellow. Use `--moss` (a brand colour, dark in both themes) for text on a
yellow fill, and `--accent-ink` for accent text/outlines. The skip link had this
bug and was fixed at the same time as the intro button.

**The opening sequence** (`css/intro.css`, `js/intro.js`, `js/intro-gate.js`,
markup at the top of index.html) is the home page's arrival: logo, `CTRL + T`,
CTRL spelled out (Creativity Transformation Resonance Language), the motto
Command To Transform, then "Explore my workspace".

- Index only, and it plays EVERY load — reload, or any arrival back at the site
  (Jesse's call, 2026-08-09). It briefly ran once per session; nothing is
  remembered about it now and there is no state to clear.
- The acronym is the one multi-part stage: each term animates on its own
  `--i`-derived delay, so C/T/R/L land in order. The `<ul>` therefore carries no
  `.intro__stage` — it only holds the base delay its children count from.
- `intro-gate.js` is render-blocking and NOT a module, like theme-init.js: a
  deferred module would drop the panel onto a page already being read. It only
  stamps `data-intro="pending"`; intro.css keys everything (display, the scroll
  lock) off that attribute, so with JS off the panel never shows.
- The gate arms a 6s failsafe that clears the attribute. `intro.js` cancels it
  as its first statement. That pair is what stops a broken module stranding a
  visitor behind a panel with a dead button.
- `intro.js` deliberately does NOT statically import `js/supabase.js`. A module
  whose dependency graph fails to resolve never evaluates at all, so an esm.sh
  outage would take the sequence down with it — no internal try/catch can help.
  The client is pulled in with a dynamic `import()` instead; only the logo
  depends on the network, and it is raced against a 600ms budget after which the
  "Control Tee" wordmark in the markup is the centrepiece.
- Every stage animates with BOTH keyframe ends stated. An implicit `to` resolves
  to the element's own computed style, which here is the `opacity: 0` the stages
  start at — the reveal would fade in and straight back out.

## Two media modes
Projects have a `layout` field: 'gallery' | 'deck' | 'reel'.
- gallery = mixed-aspect posters in a column-count grid, click opens lightbox
- deck    = brand case-study slides, one per row, full media-column width, NO gap
            between them (seamless Behance-style vertical flow), no lightbox, no
            captions rendered. Height is natural, NOT locked to 16:9 — forcing an
            aspect would crop multi-panel artwork. Upload 1920px wide, any height.
- reel    = video, poster frame + click to play
One template (project.html), three renderers. Never fork the template.

## Commands
- npm run img -- <folder>   (inside /scripts) — optimize a batch of images
- git push origin main      — deploy (Vercel builds from the remote; no CLI here)

## Style
Type and motion are the studio's signature. Restraint reads as confidence.
Nothing bounces. Nothing spins.

**Motion vocabulary (widened 2026-08-09): fade, short translation, and a soft
blur that resolves.** The old fade-plus-slide read as shallow — a slide alone
never says the element was anywhere but flush on the page, so entrances
registered as "something changed" rather than as movement you watched. Entrance
durations went up with it (`--dur-slow` 560ms→760ms, plus a new `--dur-entrance`
for the intro logo) on a new `--ease-entrance` with a longer tail. Interaction
timings (`--dur-fast`/`--dur-base`) are unchanged in character: a hover must
answer a pointer immediately.

`filter: blur(0)` is not free — it keeps a compositing layer and a stacking
context for the life of the page. Anything that blurs many elements must drop
the filter to `none` when it finishes; `revealOnScroll` in js/util.js does this
on transitionend, which is why its listener is not `{once: true}`.

**The interface scale came down ~20% (2026-08-09).** The reduction is graduated,
not flat: display type and all spacing took the full fifth, the two prose steps
took far less, because a literal 20% puts body copy near 11px. `--rail-width`
205→164px and the grid's min column 200→164px went with it.
