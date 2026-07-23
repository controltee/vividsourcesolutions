// home.js — the project grid. Fetches published projects, orders them by
// category then project sort order, and renders banner cards.

import { qs, qsa, el, revealOnScroll, slugify } from './util.js';
import { supabase } from './supabase.js';
import { pictureFor } from './image.js';
import { CARD_SIZES, projectCard, cardSkeletons } from './project-card.js';

// --- Data ------------------------------------------------------------------
// Clients are fetched as their own (tiny) table rather than embedded on each
// project, because the grouped card needs the client's OWN banner and subtitle,
// not just its name. select('*') keeps this working whether or not sql/006 has
// been applied — PostgREST errors on a named column it doesn't know, but is
// happy to return one row shape short.
async function loadProjects() {
  const [cats, projs, clients] = await Promise.all([
    supabase.from('categories').select('id, sort_order'),
    supabase
      .from('projects')
      .select(
        'id, title, slug, summary, cover_url, banner_w, banner_h, category_id, client_id, sort_order'
      )
      .eq('is_published', true),
    supabase.from('clients').select('*'),
  ]);
  if (cats.error) throw cats.error;
  if (projs.error) throw projs.error;

  const catOrder = new Map(cats.data.map((c) => [c.id, c.sort_order ?? 0]));
  const clientById = new Map((clients.data || []).map((c) => [c.id, c]));
  return projs.data
    .filter((p) => p.slug)
    .map((p) => ({ ...p, client: p.client_id ? clientById.get(p.client_id) || null : null }))
    .sort(
      (a, b) =>
        (catOrder.get(a.category_id) ?? 999) - (catOrder.get(b.category_id) ?? 999) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.title.localeCompare(b.title)
    );
}

// --- Client grouping ---------------------------------------------------------
// Repeat work for the same client should read as ONE body of work, not as two
// unrelated tiles that happen to share a name. So any client with more than one
// published project collapses into a single card that opens their client page;
// a client with one project, and anything with no client at all, still renders
// as the plain project card it always did.
//
// The group takes the grid position of its FIRST project, so the
// category/sort_order ordering Jesse sets in the admin still decides where a
// client lands on the page.
function groupByClient(projects) {
  const byClient = new Map();
  for (const p of projects) {
    if (!p.client_id) continue;
    if (!byClient.has(p.client_id)) byClient.set(p.client_id, []);
    byClient.get(p.client_id).push(p);
  }

  const emitted = new Set();
  const items = [];
  for (const p of projects) {
    const siblings = p.client_id ? byClient.get(p.client_id) : null;
    if (!siblings || siblings.length < 2) {
      items.push({ kind: 'project', project: p });
      continue;
    }
    if (emitted.has(p.client_id)) continue;
    emitted.add(p.client_id);
    items.push({
      kind: 'client',
      client: p.client,
      // card_title (sql/007) is the card's heading when set; `name` stays the
      // organisation's real name and is what project pages print. The SLUG
      // always follows `name`, never the card title, so retitling a card can
      // never break a link to that client's page.
      name: p.client?.card_title?.trim() || p.client?.name || 'Client',
      slug: slugify(p.client?.name) || p.client_id,
      projects: siblings,
    });
  }
  return items;
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
        // Placeholder intrinsic ratio only — CSS fixes the height and lets the
        // width follow the real mark once it loads. Square, because every logo
        // currently in partner_logos is (they are uploaded as trimmed marks,
        // not wordmarks); the old 4:1 reserved a slot three times too wide and
        // snapped shut on load.
        width: 200,
        height: 200,
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
// One card standing in for every project a repeat client has.
//
// The banner is the client's OWN one when set in the admin's Clients tab.
// `banner_url` is a live column that predates this rebuild, so a client the old
// codebase already gave a banner to keeps it. Otherwise it falls back to the
// first project's banner that actually has one, so the card is never an empty
// tile just because the top project is missing artwork.
//
// banner_w/banner_h may be null on a banner uploaded by the old admin; pictureFor
// then returns a plain <img> with no srcset rather than risking a distorted
// crop. Opening that client in the admin and saving fills the dimensions in.
function clientCardMedia(group) {
  const own = group.client;
  if (own?.banner_url) {
    return { cover_url: own.banner_url, banner_w: own.banner_w, banner_h: own.banner_h };
  }
  return group.projects.find((p) => p.cover_url) || group.projects[0];
}

function clientCard(group, { eager, priority }) {
  const lead = clientCardMedia(group);
  const picture = pictureFor(lead.cover_url, lead.banner_w, lead.banner_h, {
    alt: '',
    sizes: CARD_SIZES,
    loading: eager ? 'eager' : 'lazy',
    priority,
  });
  picture.classList.add('project-card__picture');

  const count = group.projects.length;
  return el(
    'a',
    {
      class: 'project-card project-card--client reveal',
      href: `/client.html?c=${encodeURIComponent(group.slug)}`,
    },
    el(
      'div',
      { class: 'project-card__frame' },
      picture,
      // aria-hidden: the count is repeated verbatim in the summary below, which
      // is inside the link's accessible name. Announcing it twice is noise.
      el('span', { class: 'project-card__count', 'aria-hidden': 'true' }, `${count} projects`)
    ),
    el(
      'div',
      { class: 'project-card__text' },
      el('h2', { class: 'project-card__title' }, group.name),
      // The client's own subtitle wins when set; otherwise the card keeps
      // listing what's inside it, which is what tells a visitor the tile opens
      // onto more than one thing.
      el(
        'p',
        { class: 'project-card__summary' },
        group.client?.description?.trim() ||
          `${count} projects · ${group.projects.map((p) => p.title).join(', ')}`
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
  const items = groupByClient(projects);
  grid.replaceChildren(
    ...items.map((item, i) => {
      const opts = { eager: i < 4, priority: i === 0 };
      return item.kind === 'client' ? clientCard(item, opts) : projectCard(item.project, opts);
    })
  );
  revealOnScroll(qsa('.project-card', grid));
}

// --- Boot ----------------------------------------------------------------
(async () => {
  const grid = qs('#project-grid');
  if (grid) grid.replaceChildren(...cardSkeletons());
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
