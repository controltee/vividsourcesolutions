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
// --- Pillars -----------------------------------------------------------------
// The homepage sells two things. The database files work under five categories,
// and that table is SHARED with the other deployed site, so it cannot be
// restructured (CLAUDE.md forbids renames and drops). This map is the entire
// bridge between the two — a presentation grouping, no migration, no risk to
// the other site, and the rail is untouched.
//
// Posters sit under Branding: they are identity artifacts. Campaigns sit under
// Content Production because that is the pipeline product the hero sells.
const PILLAR_BY_CATEGORY = {
  'brand-identity-systems': 'branding',
  'poster-designs': 'branding',
  'social-and-marketing-campaigns': 'content',
  'motion-design': 'content',
  'video-editing': 'content',
};
// A category added in /admin that nobody has mapped yet still has to show up
// somewhere — silently hiding published work would be far worse than filing it
// under the wrong heading. Branding is an arbitrary but deliberate default; the
// fix is to add the slug above.
const DEFAULT_PILLAR = 'branding';

async function loadProjects() {
  const [cats, projs, clients] = await Promise.all([
    supabase.from('categories').select('id, slug, sort_order'),
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
  const catPillar = new Map(
    cats.data.map((c) => [c.id, PILLAR_BY_CATEGORY[c.slug] || DEFAULT_PILLAR])
  );
  const clientById = new Map((clients.data || []).map((c) => [c.id, c]));
  return projs.data
    .filter((p) => p.slug)
    .map((p) => ({
      ...p,
      client: p.client_id ? clientById.get(p.client_id) || null : null,
      pillar: catPillar.get(p.category_id) || DEFAULT_PILLAR,
    }))
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

// The rotating half of the headline. The static prefix ("We build creative
// systems that") lives in work.html and never moves; these complete it.
//
// Ordered on purpose. The pipeline line goes first because it is the only one
// of the four a competitor could not paste onto their own site — it names a
// specific, time-bound operational pain — and it is what a visitor reads if
// they read exactly one.
const HERO_PHRASES = [
  'fill your content pipeline for the next 90 days.',
  'turn unshaped ideas into premium brands.',
  'make your brand look like the industry leader.',
  'kill the friction between strategy and execution.',
];

// Types a phrase in, holds it, deletes it, moves to the next, and wraps.
// Timings are deliberately uneven: typing is slower than deleting, and a full
// phrase is held far longer than the empty pause, which is what makes it read
// as typing rather than as a flicker. setTimeout per character (not
// setInterval) so each phase can have its own pace.
//
// Speed is per-phrase, not per-character: these lines are ~45 characters where
// the old headline was 6, so a fixed per-character delay would make a full
// cycle take the better part of a minute. Each phrase types in a little over
// two seconds regardless of its length.
function typeLoop(node, phrases) {
  const TYPE_TOTAL_MS = 2200;
  const DELETE_TOTAL_MS = 700;
  const HOLD_FULL = 2600;
  const HOLD_EMPTY = 400;

  let phrase = 0;
  let count = 0;
  let deleting = false;

  const step = () => {
    const text = phrases[phrase];
    node.textContent = text.slice(0, count);
    let delay;
    if (!deleting) {
      if (count < text.length) {
        count += 1;
        delay = TYPE_TOTAL_MS / text.length;
      } else {
        deleting = true;
        delay = HOLD_FULL;
      }
    } else if (count > 0) {
      count -= 1;
      delay = DELETE_TOTAL_MS / text.length;
    } else {
      deleting = false;
      phrase = (phrase + 1) % phrases.length;
      delay = HOLD_EMPTY;
    }
    setTimeout(step, delay);
  };
  step();
}

// The band's height is reserved by an invisible copy of the LONGEST phrase, so
// the headline cannot grow or shrink mid-rotation and shove the page down —
// which, at three wrapped lines on a phone, it otherwise would on every cycle.
// Longest is computed rather than hardcoded so editing HERO_PHRASES can never
// leave the reservation stale.
function initHero() {
  const typeEl = qs('#home-intro-type');
  const sizerEl = qs('#home-intro-sizer');
  if (!typeEl || !sizerEl) return;

  const longest = HERO_PHRASES.reduce((a, b) => (b.length > a.length ? b : a));
  sizerEl.textContent = longest;

  // Reduced motion gets the lead phrase, printed once. Same contract the rest
  // of the site keeps: the information is never carried by the animation.
  if (prefersReducedMotion()) {
    typeEl.textContent = HERO_PHRASES[0];
    return;
  }
  typeLoop(typeEl, HERO_PHRASES);
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
  // adding clients slows the loop down rather than making it race. The
  // per-logo figure tracks the rendered logo size: the marks are ~35% smaller
  // than they were, so the track is ~35% shorter, and holding the old 6s per
  // logo would have quietly slowed the drift by the same proportion.
  track.style.setProperty('--marquee-duration', `${Math.max(18, logos.length * 4)}s`);
  section.hidden = false;
}

// Overrides the hero's SUB-copy from site_content. The headline itself is no
// longer editable from /admin: it is now one sentence split across a static
// prefix, a rotating clause and a visually-hidden completion, and arbitrary
// text dropped into that structure produces a sentence that does not parse.
// The words are in work.html and js/home.js — a code change, deliberately,
// because they are the page's conversion copy.
//
// Everything here is an enhancement. The band already rendered with real copy
// and a working CTA before this ran, so a failed fetch costs nothing.
async function applyEditableIntro() {
  const bodyEl = qs('#home-intro-body');
  if (!bodyEl) return;
  const { data, error } = await supabase
    .from('site_content')
    .select('id, content')
    .in('id', ['home_intro', 'about_body']);
  if (error || !data?.length) return;

  const values = Object.fromEntries(data.map((r) => [r.id, r.content]));
  const body = (values.home_intro || '').trim() || firstParagraphText(values.about_body);
  if (body) bodyEl.textContent = body;
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

// A grouped client card carries the pillar of its FIRST project — the same rule
// that already decides where the group lands in the running order. A client
// whose work spans both pillars therefore appears once, under whichever it led
// with, rather than being split into two half-cards.
const itemPillar = (item) =>
  item.kind === 'client' ? item.projects[0]?.pillar || DEFAULT_PILLAR : item.project.pillar;

const PILLAR_GRIDS = [
  { pillar: 'branding', gridId: '#grid-branding', sectionId: '#pillar-branding' },
  { pillar: 'content', gridId: '#grid-content', sectionId: '#pillar-content' },
];

function render(projects) {
  const items = groupByClient(projects);
  // Eagerness is decided across the page, not per pillar: the first few cards
  // the visitor actually sees are the ones worth loading up front, and they are
  // all in the first pillar.
  let rank = 0;

  for (const { pillar, gridId, sectionId } of PILLAR_GRIDS) {
    const grid = qs(gridId);
    const section = qs(sectionId);
    if (!grid || !section) continue;
    grid.setAttribute('aria-busy', 'false');

    const mine = items.filter((item) => itemPillar(item) === pillar);
    // An empty pillar hides its whole section. A heading with nothing under it
    // reads as something broken, and on a page selling two things it quietly
    // says one of them isn't real work yet.
    if (!mine.length) {
      section.hidden = true;
      grid.replaceChildren();
      continue;
    }
    section.hidden = false;
    grid.replaceChildren(
      ...mine.map((item) => {
        const opts = { eager: rank < 4, priority: rank === 0 };
        rank += 1;
        return item.kind === 'client' ? clientCard(item, opts) : projectCard(item.project, opts);
      })
    );
    revealOnScroll(qsa('.project-card', grid));
  }

  // Both pillars empty: say so once, in the first section, rather than leaving
  // the visitor on a page whose entire middle has vanished.
  if (!items.length) {
    const first = qs('#pillar-branding');
    if (first) {
      first.hidden = false;
      qs('#grid-branding').replaceChildren(
        el('p', { class: 'pane__msg' }, 'No published work yet.')
      );
    }
  }
}

// --- Boot ----------------------------------------------------------------
(async () => {
  // First, and synchronously: the headline and its height reservation. This
  // touches no network, so the hero is settled before anything can shift it.
  initHero();

  for (const { gridId } of PILLAR_GRIDS) {
    qs(gridId)?.replaceChildren(...cardSkeletons(3));
  }

  // Fired alongside the projects rather than before them: the work is the point
  // of the page and must not wait on editable copy or on logos.
  applyEditableIntro().catch((err) => console.error('[home] intro copy failed:', err));
  renderMarquee().catch((err) => console.error('[home] logo marquee failed:', err));

  try {
    render(await loadProjects());
  } catch (err) {
    console.error('[home] could not load projects:', err);
    // The message goes in the first pillar and the second is hidden, so the
    // failure reads as one problem rather than as two broken sections.
    const first = qs('#grid-branding');
    if (first) {
      first.setAttribute('aria-busy', 'false');
      first.replaceChildren(el('p', { class: 'pane__msg' }, 'Work couldn’t load. Please refresh.'));
    }
    const second = qs('#pillar-content');
    if (second) second.hidden = true;
  }
})();
