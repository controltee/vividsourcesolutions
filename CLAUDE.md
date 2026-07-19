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

The new frontend reads the live tables directly. Reuse live column names. All
migrations in sql/ (001 schema, 002 backfill, 003 RLS, 004 media dimensions,
005 contact/social rows) are applied — verified against the live DB 2026-07-19.
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
Nothing bounces. Nothing spins. Fades and short translations only.
