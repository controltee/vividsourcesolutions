// home.js — the project grid. Fetches published projects, orders them by
// category then project sort order, and renders banner cards.

import { qs, el } from './util.js';
import { supabase } from './supabase.js';
import { SUPABASE_URL } from './config.js';

const WIDTHS = [640, 1280, 1920];
const SIZES = '(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw';

// --- Data ------------------------------------------------------------------
async function loadProjects() {
  const [cats, projs] = await Promise.all([
    supabase.from('categories').select('id, sort_order'),
    supabase
      .from('projects')
      .select('id, title, slug, summary, cover_url, banner_w, banner_h, category_id, sort_order')
      .eq('is_published', true),
  ]);
  if (cats.error) throw cats.error;
  if (projs.error) throw projs.error;

  const catOrder = new Map(cats.data.map((c) => [c.id, c.sort_order ?? 0]));
  return projs.data
    .filter((p) => p.slug)
    .sort(
      (a, b) =>
        (catOrder.get(a.category_id) ?? 999) - (catOrder.get(b.category_id) ?? 999) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.title.localeCompare(b.title)
    );
}

// --- Image URLs ------------------------------------------------------------
// Single source of truth for banner image URLs. Today: Supabase on-the-fly
// transforms (WebP via content negotiation, same host as the raw object).
// When the offline pipeline (Phase 5) produces stored AVIF/WebP variants,
// swap the body of `transformUrl` / add an AVIF <source> — nothing else changes.
//
// The transform endpoint does NOT infer height from width — passing width
// alone stretches the image to the source's full height (verified against the
// live endpoint). Height must always be computed from the known aspect ratio
// and passed explicitly.
function transformUrl(coverUrl, width, bannerW, bannerH) {
  if (!coverUrl || !coverUrl.includes('/object/public/')) return null;
  if (!bannerW || !bannerH) return null; // no known aspect ratio — do not risk a distorted crop
  const path = coverUrl.split('/object/public/')[1];
  const height = Math.round((width * bannerH) / bannerW);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${path}?width=${width}&height=${height}&quality=75`;
}

function pictureFor(project, { eager, priority }) {
  const { cover_url: coverUrl, banner_w: bw, banner_h: bh } = project;
  const srcset = transformUrl(coverUrl, 1280, bw, bh)
    ? WIDTHS.map((w) => `${transformUrl(coverUrl, w, bw, bh)} ${w}w`).join(', ')
    : false;

  const img = el('img', {
    class: 'project-card__img',
    src: transformUrl(coverUrl, 1280, bw, bh) || coverUrl,
    srcset,
    sizes: srcset ? SIZES : false,
    width: bw || false,
    height: bh || false,
    alt: '', // decorative: the visible card title is the link's accessible name
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    fetchpriority: priority ? 'high' : false,
  });
  if (bw && bh) {
    // Dynamic value from asset dimensions — set via CSSOM (CSP-safe), the one
    // sanctioned use of inline style per the spec.
    img.style.aspectRatio = `${bw} / ${bh}`;
  }

  const picture = el('picture', { class: 'project-card__picture' });
  if (srcset) picture.append(el('source', { type: 'image/webp', srcset, sizes: SIZES }));
  picture.append(img);
  return picture;
}

// --- Render ----------------------------------------------------------------
function card(project, opts) {
  return el(
    'a',
    { class: 'project-card', href: `/project.html?p=${encodeURIComponent(project.slug)}` },
    pictureFor(project, opts),
    el(
      'div',
      { class: 'project-card__text' },
      el('h2', { class: 'project-card__title' }, project.title),
      project.summary ? el('p', { class: 'project-card__summary' }, project.summary) : null
    )
  );
}

function render(projects) {
  const grid = qs('#project-grid');
  if (!grid) return;
  grid.setAttribute('aria-busy', 'false');
  if (!projects.length) {
    grid.replaceChildren(el('p', { class: 'pane__msg' }, 'No published work yet.'));
    return;
  }
  grid.replaceChildren(
    ...projects.map((p, i) => card(p, { eager: i < 4, priority: i === 0 }))
  );
}

// --- Boot ------------------------------------------------------------------
(async () => {
  try {
    render(await loadProjects());
  } catch (err) {
    console.error('[home] could not load projects:', err);
    const grid = qs('#project-grid');
    if (grid) {
      grid.setAttribute('aria-busy', 'false');
      grid.replaceChildren(el('p', { class: 'pane__msg' }, 'Work couldn’t load — please refresh.'));
    }
  }
})();
