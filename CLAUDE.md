# Control Tee site — agent notes

Nairobi design studio portfolio. Vanilla HTML/CSS/JS. No build tools. Vercel + Supabase.

## Build context (read first — this repo is not greenfield)

This is a ground-up v3 rebuild. Two older Control Tee codebases exist and share the
same live Supabase project (`ccaggjhyeygyosbdnxmq`):

- `controltee/vividsourcesolutions` — the old site (posters/videos tables).
- `controltee/Control-Tee` → deployed at `control-tee.vercel.app` — the current
  rebuild this repo will eventually replace. Richer live schema.

Decisions (2026-07-17):
- Build fresh here; leave the other two repos alone.
- REUSE the live DB `ccaggjhyeygyosbdnxmq` with additive-only migrations — no
  renames, no drops. Do NOT run the spec's raw `create table` statements against
  it; reshape the data model to fit the live schema and show Jesse every migration
  before running it. The live DB already has projects/categories/clients/posters/
  videos/site-text and a `portfolio_assets` storage bucket.
- The spec's `layout` values (gallery/deck/reel) differ from the live
  `projects.layout_type` (marquee/stack/embed) — reconcile at Phase 2 before the
  "Two media modes" section below is treated as final.

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
- deck    = fixed 16:9 brand slides, one per row, full pane width, no lightbox
- reel    = video, poster frame + click to play
One template (project.html), three renderers. Never fork the template.

## Commands
- npm run img -- <folder>   (inside /scripts) — optimize a batch of images
- vercel --prod             — deploy

## Style
Type and motion are the studio's signature. Restraint reads as confidence.
Nothing bounces. Nothing spins. Fades and short translations only.
