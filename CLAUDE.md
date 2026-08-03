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
from its main → live at **controlteestudios.com**. The old flat-file site is
preserved on the remote branch `pre-rebuild-old-site`.

The Vercel-issued `controlteestudios.vercel.app` no longer serves the site: a
301 in vercel.json bounces it to the custom domain, so old links keep working
and only one hostname is canonical. That redirect needs the domain to stay
ATTACHED in Vercel — removing it from Settings → Domains instead makes the old
URL a dead end. Per-deployment `*.vercel.app` URLs cannot be removed at all;
only Deployment Protection hides them.

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
- Service role key never touches this repo.
- Respect prefers-reduced-motion on every animation.

## Layout model
The left rail is a persistent shell. It is identical on every page. Only the right
pane changes. Do not re-render the rail on navigation.

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

## Two media modes
Projects have a `layout` field: 'gallery' | 'deck' | 'reel'.
- gallery = mixed-aspect posters in a column-count grid, click opens lightbox
- deck    = brand case-study slides, one per row, full media-column width, NO gap
            between them (seamless Behance-style vertical flow), no lightbox, no
            captions rendered. Height is natural, NOT locked to 16:9 — forcing an
            aspect would crop multi-panel artwork. Upload 1920px wide, any height.
- reel    = video. EVERY video row on the project, in order — a showreel is
            rarely one film. Images on a reel project are ignored.
One template (project.html), three renderers. Never fork the template.

## Video (added 2026-08-02, sql/009)

A video is never an embedded player. Both sources render identically: a still
WE host, then one button under it reading "Press to see full video". A YouTube
row's button is a link out; an uploaded file's button swaps the still for a
`<video>` in place, so no video bytes download until asked for. Embedding
YouTube would pull in their script, their cookies and their chrome, and need
youtube.com added to the CSP's frame-src — see `js/video.js`, which owns URL
parsing for both the site and the admin. `videoBlock()` in js/project.js is
shared by reel and deck.

`project_media.kind` is now 'image' | 'video' | 'youtube'. On a video row
`width`/`height` describe the POSTER, not the footage — that is the box the
page reserves, and the video fills exactly it. `poster_url` null means "borrow
projects.cover_url", so a video added without a poster still renders.

Video files upload AS-IS: there is no browser-side transcode, because doing it
properly means ffmpeg, and in a page that is a ~30MB wasm build (a new runtime
dependency, which is banned) or a server we don't have. Compress offline first:
`npm run vid -- <file-or-folder>` inside /scripts, which needs system ffmpeg
(free, not an npm package) and emits mp4 + webm + a poster jpg. The admin
refuses uploads over 45MB and warns over 6MB.

**Anything longer than a few seconds belongs on YouTube, not Supabase Storage.**
The free tier's monthly egress is spent by one 40MB file served a few hundred
times. That is the whole reason the YouTube path exists.

## Routing: the front door is the process page (2026-08-03)

- `/` (`index.html`, `css/process.css`, `js/process.js`) — **the process page.**
  Four stages of how a project runs, then ONE link into the work.
- `/work.html` (`css/home.css`, `js/home.js`) — the portfolio: hero, two
  pillars, the grids, the marquee. This is the old homepage, moved by `git mv`.
  The css and js keep the `home` name because `client.html` shares the
  stylesheet.

Anything linking back to the grid must say `/work.html`, not `/`. The four
"← Back to work" links in `js/project.js` and `js/client.js` are the ones that
already caught this out. The rail's brand still points at `/`, because that is
what a logo means; the rail's **Work** link is how people already inside reach
the grid.

**Why the method comes before the work.** Clients who value a clearly run
project pay more for one, and that quality was invisible until someone had
already hired the studio. The page also settles the logo-versus-identity
question before anyone writes in, and its "includes N rounds" lines draw the
scope boundary as craft rather than as a fee. That is the qualifying the
estimator used to attempt with numbers.

Stage copy in `index.html` is marked DRAFT and is meant to be rewritten. What
must survive a rewrite is listed in the comment above it.

### Motion on the landing page

Read `css/process.css` before changing any of it. Two things are already
settled and are expensive to rediscover:

- **There is no scroll-linked animation, deliberately.** The thread was built
  with `animation-timeline: view()` first. Measured, the finished page scrolls a
  total of 256px at 1280x900, so the line reached about a quarter of its length
  and stopped there permanently. Entry-triggered transitions always complete.
  Do not "upgrade" it without re-measuring the page's real scroll range.
- **The thread is a scaled element, not a dashed SVG.** `stroke-dashoffset`
  with `pathLength="1"` renders dashed once the viewBox is stretched by a
  non-uniform `preserveAspectRatio`. `transform: scaleY()` has no unit
  ambiguity and is composited.

Everything animates `transform` and `opacity` only, and there is no JS
animation loop anywhere on the page.

### `html.js` gates every hidden-to-animate state

`js/theme-init.js` stamps `.js` on `<html>` before first paint. Any rule that
hides something so JavaScript can reveal it later **must** be gated on that
class — `.js .reveal`, `.js .process__stage > *`, `.js .process__thread`.
Ungated, a visitor with scripting off, or any page whose module graph fails to
load, gets a blank page instead of an unanimated one.

That failure is not hypothetical: `js/supabase.js` pulls the client from
esm.sh, so anything importing it statically dies with that CDN. **`js/process.js`
imports `analytics.js` dynamically for exactly this reason** — the landing page
must render with no network in its path.

## The portfolio page as a conversion page (2026-08-02)

`/work.html` sells two things and asks for one action. Structure, top to bottom:
hero (headline + sub-copy + ONE CTA) → two pillars → work split by pillar →
logo marquee.

- **The hero is static HTML, not fetched.** It carries the site's only call to
  action, so it must render on first paint with no network in the path — it used
  to be `hidden` until a Supabase read succeeded. `home.js` still overrides the
  BODY copy from `site_content.home_intro`; the headline is code, deliberately,
  because it is one sentence split across a static prefix, a rotating clause and
  a visually-hidden completion, and arbitrary admin text does not parse into it.
- **The h1's accessible name never changes.** The rotating clause is
  `aria-hidden` decoration; a `.visually-hidden` span completes the sentence for
  screen readers and for crawlers, which do not run the animation.
- **Height is reserved by `.home-intro__sizer`** — an invisible copy of the
  longest phrase, filled by JS from the same list it rotates. That is what stops
  the page shoving downward on every rotation. Do not replace it with a fixed
  `min-height`: the phrases wrap to a different number of lines at different
  widths, and only a real element re-measures.
- **ONE call to action.** The old pair ("View selected work" / "More about the
  studio") is gone. If a second button is ever added above the fold, the single
  focal point is gone with it.
- **Two pillars are a PRESENTATION grouping**, not a schema change:
  `PILLAR_BY_CATEGORY` in js/home.js maps the five live category slugs onto
  Branding / Content Production. The categories table is shared with the other
  deployed site and cannot be restructured. An unmapped category falls into
  Branding rather than vanishing.

The contact form's required set is name, email, project type. The message is
optional on purpose — required lifts lead quality and costs volume; optional
keeps both. Company was removed outright.

## No money on the site (2026-08-03)

There was an estimator at `/estimate.html`. It is gone, along with its budget
question, and **nothing on the public site names a price, a range, or a
currency** — no figures, no bands, no "from KES". Pricing is named by Jesse in
conversation, with the context of an actual brief in front of him.

This is a positioning decision, not a temporary state waiting on real numbers.
Do not reintroduce a calculator, a "starting from" line, or a budget dropdown on
the inquiry form. The qualifying that the estimator was trying to do is done by
the process page instead: it anchors on how the work is run, which is the thing
clients pay a premium for, rather than on a figure the site cannot defend.

`/estimate.html` 301s to `/contact.html` in vercel.json so old links survive.

## Analytics (sql/010, js/analytics.js)

First-party, in our own database, because Jesse reads the numbers in /admin.
That rules out Vercel Web Analytics (data lives in Vercel, no Hobby API) and
every hosted tool. A row is a path, a referrer HOST and a timestamp — no
cookies, no IP, nothing identifying, which is why the existing cookie notice
already covers it.

`recordView()` fires from shell.js, which no admin page loads, so Jesse editing
his own site is never counted. Every call is fire-and-forget: analytics must
never be able to break a page.

**The counts are directionally true, not audited.** anon can INSERT and the anon
key is public, so fabricated rows are possible. The admin tab says so. Do not
present these figures as measured evidence.

## What "protecting" the site can and cannot do

`js/protect.js` blocks right-click and drag ON MEDIA ONLY. It is a deterrent
and is documented as one — anything the browser renders is already in the
visitor's cache, every Storage URL is in the page source, and disabling JS
disables all of it. Do NOT extend it to block devtools, F12, Ctrl+U, or the
context menu page-wide: those checks are bypassed just as easily, fire on
innocent shortcuts, and break assistive tech. The only real measure for an
image that must not circulate is not shipping it at full resolution.

The Supabase URL and anon key in js/config.js are PUBLIC BY DESIGN and cannot
be hidden from a browser or from anyone pasting the site into an AI tool. RLS
(sql/003) is the actual security boundary. Hiding the key is not a goal; keeping
RLS correct is.

## Commands
- npm run img -- <folder>   (inside /scripts) — optimize a batch of images
- git push origin main      — deploy (Vercel builds from the remote; no CLI here)

## Style
Type and motion are the studio's signature. Restraint reads as confidence.
Nothing bounces. Nothing spins. Fades and short translations only.
