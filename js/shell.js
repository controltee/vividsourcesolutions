// shell.js — renders the persistent rail nav from live data, keeps disclosure
// state across navigation, and drives the mobile drawer.

import { qs, qsa, el } from './util.js';
import { supabase } from './supabase.js';

const OPEN_KEY = 'ct:rail:open';
const NAV_KEY = 'ct:nav:v2'; // v2: now includes empty categories — bump invalidates old caches
const NAV_TTL = 5 * 60 * 1000; // 5 minutes
const SITE_KEY = 'ct:site';
const SITE_TTL = 5 * 60 * 1000;
const DESKTOP = window.matchMedia('(min-width: 900px)');

// --- Nav data --------------------------------------------------------------
// All categories (ordered) + their published projects. Empty categories are
// kept so the menu reflects the studio's full range of work; they render with
// a muted "no work yet" note and start collapsed.
// Cached in sessionStorage so moving between pages doesn't re-hit the network.
async function loadNav() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(NAV_KEY));
    if (cached && Array.isArray(cached.groups) && Date.now() - cached.t < NAV_TTL) {
      return cached.groups;
    }
  } catch {
    /* corrupt cache — refetch */
  }

  const [cats, projs] = await Promise.all([
    supabase.from('categories').select('id, name, slug, sort_order').order('sort_order'),
    supabase
      .from('projects')
      .select('id, title, slug, category_id, sort_order')
      .eq('is_published', true)
      .order('sort_order')
      .order('title'),
  ]);
  if (cats.error) throw cats.error;
  if (projs.error) throw projs.error;

  const byCategory = new Map();
  for (const p of projs.data) {
    if (!p.slug) continue; // never link a project with no slug
    if (!byCategory.has(p.category_id)) byCategory.set(p.category_id, []);
    byCategory.get(p.category_id).push(p);
  }

  const groups = cats.data.map((c) => ({
    slug: c.slug,
    name: c.name,
    projects: (byCategory.get(c.id) || []).map((p) => ({ slug: p.slug, title: p.title })),
  }));

  sessionStorage.setItem(NAV_KEY, JSON.stringify({ t: Date.now(), groups }));
  return groups;
}

// --- Disclosure open-state persistence -------------------------------------
function readOpenState(groups) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(OPEN_KEY));
    if (Array.isArray(stored)) return new Set(stored);
  } catch {
    /* corrupt value — fall through to default */
  }
  // First visit: open categories that have work; leave empty ones collapsed.
  const populated = new Set(groups.filter((g) => g.projects.length).map((g) => g.slug));
  persistOpenState(populated);
  return populated;
}

function persistOpenState(set) {
  const slugs = set ?? new Set(qsa('.rail__group[open]').map((d) => d.dataset.slug));
  sessionStorage.setItem(OPEN_KEY, JSON.stringify([...slugs]));
}

// --- Nav render ------------------------------------------------------------
function renderNav(groups, activeSlug) {
  const nav = qs('#rail-nav');
  if (!nav) return;

  const openSlugs = readOpenState(groups);
  const activeGroup = groups.find((g) => g.projects.some((p) => p.slug === activeSlug));
  if (activeGroup) openSlugs.add(activeGroup.slug); // auto-open the active project's group

  const details = groups.map((group) => {
    const empty = group.projects.length === 0;
    const summary = el('summary', { class: 'rail__group-label' }, group.name);

    const list = empty
      ? el('p', { class: 'rail__empty' }, 'No published work yet.')
      : el(
          'ul',
          { class: 'rail__list' },
          ...group.projects.map((project) => {
            const active = project.slug === activeSlug;
            const link = el(
              'a',
              {
                href: `/project.html?p=${encodeURIComponent(project.slug)}`,
                class: active ? 'is-active' : false,
                'aria-current': active ? 'page' : false,
              },
              project.title
            );
            return el('li', {}, link);
          })
        );

    const groupEl = el(
      'details',
      {
        class: empty ? 'rail__group rail__group--empty' : 'rail__group',
        'data-slug': group.slug,
        open: openSlugs.has(group.slug),
      },
      summary,
      list
    );
    groupEl.addEventListener('toggle', () => persistOpenState());
    return groupEl;
  });

  nav.replaceChildren(...details);
}

function renderNavMessage(text) {
  const nav = qs('#rail-nav');
  if (nav) nav.replaceChildren(el('p', { class: 'rail__msg' }, text));
}

// --- Footer: contact + socials, editable from the admin's Site Settings tab -
// Reuses site_content (id/content key-value rows). The static HTML already
// has real fallback links, so a fetch failure or missing row changes nothing.
const SITE_CONTENT_IDS = [
  'contact_email',
  'social_instagram_url',
  'social_behance_url',
  'social_linkedin_url',
  'logo_url',
  'brand_tagline',
];

async function loadSiteSettings() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SITE_KEY));
    if (cached && Date.now() - cached.t < SITE_TTL) return cached.settings;
  } catch {
    /* corrupt cache — refetch */
  }

  const { data, error } = await supabase
    .from('site_content')
    .select('id, content')
    .in('id', SITE_CONTENT_IDS);
  if (error) throw error;

  const settings = Object.fromEntries(data.map((row) => [row.id, row.content]));
  sessionStorage.setItem(SITE_KEY, JSON.stringify({ t: Date.now(), settings }));
  return settings;
}

function applySiteSettings(settings) {
  const contactLink = qs('#contact-link');
  if (settings.contact_email && contactLink) {
    contactLink.href = `mailto:${settings.contact_email}`;
  }

  const socialSettingKey = { instagram: 'social_instagram_url', behance: 'social_behance_url', linkedin: 'social_linkedin_url' };
  for (const link of qsa('.rail__social a[data-social]')) {
    const url = settings[socialSettingKey[link.dataset.social]];
    if (url) link.href = url;
  }

  // Logo: if uploaded via the admin, replace the wordmark with the image in
  // both the rail brand and the mobile top bar. Falls back to the wordmark.
  if (settings.logo_url) {
    for (const brand of qsa('.rail__brand, .topbar__brand')) {
      brand.replaceChildren(el('img', { class: 'brand-logo', src: settings.logo_url, alt: 'Control Tee' }));
    }
  }

  // Optional short tagline under the rail brand.
  const tagline = qs('#brand-tagline');
  if (tagline && settings.brand_tagline) {
    tagline.textContent = settings.brand_tagline;
    tagline.hidden = false;
  }
}

// --- Clock: the studio's local (Nairobi) time, bottom of the rail ------------
function initClock() {
  const clock = qs('#rail-clock');
  if (!clock) return;
  const tick = () => {
    const time = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    clock.textContent = `Nairobi · ${time}`;
    clock.dateTime = new Date().toISOString();
  };
  tick();
  setInterval(tick, 1000);
}

// --- Mobile drawer ---------------------------------------------------------
function focusables(container) {
  return qsa(
    'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    container
  ).filter((node) => node.offsetParent !== null);
}

function initDrawer() {
  const toggle = qs('#rail-toggle');
  const scrim = qs('#scrim');
  const rail = qs('#rail');
  if (!toggle || !scrim || !rail) return;

  const isOpen = () => document.body.classList.contains('rail-open');

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(rail);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  function open() {
    document.body.classList.add('rail-open');
    toggle.setAttribute('aria-expanded', 'true');
    focusables(rail)[0]?.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen()) return;
    document.body.classList.remove('rail-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  scrim.addEventListener('click', () => close());
  rail.addEventListener('click', (event) => {
    if (event.target.closest('a')) close({ restoreFocus: false });
  });
  DESKTOP.addEventListener('change', (event) => {
    if (event.matches) close({ restoreFocus: false });
  });
}

// --- Boot ------------------------------------------------------------------
async function init() {
  initDrawer(); // independent of nav data
  initClock();
  const activeSlug = new URLSearchParams(location.search).get('p');
  try {
    const groups = await loadNav();
    if (!groups.length) {
      renderNavMessage('No published work yet.');
    } else {
      renderNav(groups, activeSlug);
    }
  } catch (err) {
    console.error('[shell] could not load the project nav:', err);
    renderNavMessage('Work couldn’t load — please refresh.');
  }

  try {
    applySiteSettings(await loadSiteSettings());
  } catch (err) {
    console.error('[shell] could not load site settings — keeping static footer links:', err);
  }
}

init();
