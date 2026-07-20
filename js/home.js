// home.js — the project grid. Fetches published projects, orders them by
// category then project sort order, and renders banner cards.

import { qs, qsa, el, revealOnScroll } from './util.js';
import { supabase } from './supabase.js';
import { pictureFor } from './image.js';

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

// --- Studio synopsis --------------------------------------------------------
// Prefers home-specific copy (home_headline / home_intro) and falls back to the
// About rows, so the band reads correctly before those keys are ever filled in.
// The keys need no migration: the admin's settings form upserts them on save.
// about_body stores markup; we take the first paragraph's TEXT only — this band
// never renders HTML, unlike about.js which deliberately does.
function firstParagraphText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const p = doc.querySelector('p');
  return (p ? p.textContent : doc.body.textContent).trim();
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Types the headline in, holds it, deletes it, then repeats. Timings are
// deliberately uneven: typing is slower than deleting, and the full word is
// held far longer than the empty pause, which is what makes it read as typing
// rather than as a flicker. setTimeout per character (not setInterval) so each
// phase can have its own pace.
function typeLoop(node, text) {
  const TYPE_MS = 110;
  const DELETE_MS = 55;
  const HOLD_FULL = 2000;
  const HOLD_EMPTY = 500;
  let count = 0;
  let deleting = false;

  const step = () => {
    node.textContent = text.slice(0, count);
    let delay;
    if (!deleting) {
      if (count < text.length) {
        count += 1;
        delay = TYPE_MS;
      } else {
        deleting = true;
        delay = HOLD_FULL;
      }
    } else if (count > 0) {
      count -= 1;
      delay = DELETE_MS;
    } else {
      deleting = false;
      delay = HOLD_EMPTY;
    }
    setTimeout(step, delay);
  };
  step();
}

// --- Client logo marquee ----------------------------------------------------
async function renderMarquee() {
  const section = qs('#logo-marquee');
  const track = qs('#marquee-track');
  if (!section || !track) return;

  const { data, error } = await supabase
    .from('partner_logos')
    .select('id, name, logo_url')
    .order('created_at');
  if (error) return;

  const logos = (data || []).filter((l) => l.logo_url);
  if (!logos.length) return; // no logos: the section stays hidden entirely

  // The list is rendered twice. The CSS translates the track by exactly -50%,
  // so when the first copy scrolls out the second is already in its place and
  // the loop is seamless. The duplicate is aria-hidden with empty alt so the
  // same client is not announced twice.
  const item = (logo, isDuplicate) =>
    el(
      'li',
      { class: 'marquee__item', 'aria-hidden': isDuplicate ? 'true' : false },
      el('img', {
        src: logo.logo_url,
        alt: isDuplicate ? '' : logo.name || '',
        loading: 'lazy',
        width: 176,
        height: 44,
      })
    );

  track.replaceChildren(...logos.map((l) => item(l, false)), ...logos.map((l) => item(l, true)));

  // Constant pixels-per-second regardless of how many logos there are, so
  // adding clients slows the loop down rather than making it race.
  track.style.setProperty('--marquee-duration', `${Math.max(24, logos.length * 6)}s`);
  section.hidden = false;
}

async function renderIntro() {
  const section = qs('#home-intro');
  if (!section) return;
  const { data, error } = await supabase
    .from('site_content')
    .select('id, content')
    .in('id', ['home_headline', 'home_intro', 'about_headline', 'about_body']);
  // A missing synopsis is not worth blocking the work on: leave the band hidden
  // and let the grid carry the page, exactly as before this section existed.
  if (error || !data?.length) return;

  const values = Object.fromEntries(data.map((r) => [r.id, r.content]));
  // Defaults to the brand mark rather than the About heading: "Creativity"
  // works as a section title but is thin as the homepage h1. Set home_headline
  // in /admin to override this.
  const headline = (values.home_headline || '').trim() || 'CTRL+T';
  const body = (values.home_intro || '').trim() || firstParagraphText(values.about_body);

  // The h1's accessible name is the complete headline, always, so a screen
  // reader never hears a half-typed word.
  const titleEl = qs('#home-intro-title');
  const typeEl = qs('#home-intro-type');
  titleEl.setAttribute('aria-label', headline);
  if (prefersReducedMotion()) {
    typeEl.textContent = headline;
  } else {
    typeLoop(typeEl, headline);
  }
  const bodyEl = qs('#home-intro-body');
  bodyEl.textContent = body;
  bodyEl.hidden = !body;
  section.hidden = false;
}

// --- Render ----------------------------------------------------------------
function card(project, { eager, priority }) {
  const picture = pictureFor(project.cover_url, project.banner_w, project.banner_h, {
    alt: '', // decorative: the visible card title is the link's accessible name
    sizes: SIZES,
    loading: eager ? 'eager' : 'lazy',
    priority,
  });
  picture.classList.add('project-card__picture');

  return el(
    'a',
    { class: 'project-card reveal', href: `/project.html?p=${encodeURIComponent(project.slug)}` },
    picture,
    el(
      'div',
      { class: 'project-card__text' },
      el('h2', { class: 'project-card__title' }, project.title),
      project.summary ? el('p', { class: 'project-card__summary' }, project.summary) : null
    )
  );
}

// Placeholder cards shown while the real projects load — keeps the grid from
// flashing empty and reserves layout.
function skeletons(grid, count = 6) {
  grid.replaceChildren(
    ...Array.from({ length: count }, () =>
      el(
        'div',
        { class: 'project-card project-card--skeleton', 'aria-hidden': 'true' },
        el('div', { class: 'skeleton skeleton--banner' }),
        el('div', { class: 'skeleton skeleton--line' })
      )
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
  grid.replaceChildren(...projects.map((p, i) => card(p, { eager: i < 4, priority: i === 0 })));
  revealOnScroll(qsa('.project-card', grid));
}

// --- Boot ----------------------------------------------------------------
(async () => {
  const grid = qs('#project-grid');
  if (grid) skeletons(grid);
  // Fire the synopsis alongside the projects rather than before them: the work
  // is the point of the page and must not wait on the copy.
  renderIntro().catch((err) => console.error('[home] synopsis failed:', err));
  renderMarquee().catch((err) => console.error('[home] logo marquee failed:', err));
  try {
    render(await loadProjects());
  } catch (err) {
    console.error('[home] could not load projects:', err);
    if (grid) {
      grid.setAttribute('aria-busy', 'false');
      grid.replaceChildren(el('p', { class: 'pane__msg' }, 'Work couldn’t load. Please refresh.'));
    }
  }
})();
