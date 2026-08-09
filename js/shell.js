// shell.js — renders the persistent rail nav from live data and drives the
// mobile drawer. Disclosure state is deliberately NOT kept: see renderNav.

import { qs, qsa, el, slugify } from './util.js';
import { supabase } from './supabase.js';

const NAV_KEY = 'ct:nav:v4'; // v4: client labels follow card_title — bump invalidates old caches
const NAV_TTL = 5 * 60 * 1000; // 5 minutes
const SITE_KEY = 'ct:site';
const SITE_TTL = 5 * 60 * 1000;
// Written by the admin (localStorage, so it is visible to every tab on this
// origin) after each successful save. Any cache entry older than this stamp is
// stale — that is what stops a just-edited project showing under its old
// category until the TTL happens to lapse.
const STAMP_KEY = 'ct:content-stamp';
const DESKTOP = window.matchMedia('(min-width: 900px)');

// A cached entry is only good if it is inside its TTL AND was written after the
// last admin edit. Reading the stamp is wrapped because localStorage throws in
// some privacy modes; treating that as "no stamp" just falls back to TTL-only
// behaviour, which is the old, still-correct-if-slower path.
function contentStamp() {
  try {
    const raw = Number(localStorage.getItem(STAMP_KEY));
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function cacheIsFresh(cached, ttl) {
  return Boolean(cached) && Date.now() - cached.t < ttl && cached.t >= contentStamp();
}

// --- Nav data --------------------------------------------------------------
// All categories (ordered) + their published projects. Empty categories are
// kept so the menu reflects the studio's full range of work; they render with
// a muted "no work yet" note and start collapsed.
// Cached in sessionStorage so moving between pages doesn't re-hit the network.
async function loadNav() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(NAV_KEY));
    if (cacheIsFresh(cached, NAV_TTL) && Array.isArray(cached.groups)) {
      return cached.groups;
    }
  } catch {
    /* corrupt cache — refetch */
  }

  const [cats, projs] = await Promise.all([
    supabase.from('categories').select('id, name, slug, sort_order').order('sort_order'),
    supabase
      .from('projects')
      // clients(*) rather than clients(name): the rail label follows card_title
      // when it is set, and a named embed would error on any client column
      // PostgREST has not seen yet (sql/007).
      .select('id, title, slug, category_id, client_id, sort_order, clients(*)')
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
    items: nestRepeatClients(byCategory.get(c.id) || []),
  }));

  sessionStorage.setItem(NAV_KEY, JSON.stringify({ t: Date.now(), groups }));
  return groups;
}

// Two jobs for the same client should read as one entry with its work nested
// under it, not as two neighbouring links that look like unrelated projects.
// Only clients with MORE THAN ONE project in this category get nested — a
// one-off would just be a heading with a single item under it, which is noise.
// Each nested group keeps the grid position of the client's first project, so
// the sort_order set in the admin still decides the running order.
function nestRepeatClients(projects) {
  const counts = new Map();
  for (const p of projects) {
    if (p.client_id) counts.set(p.client_id, (counts.get(p.client_id) || 0) + 1);
  }

  const emitted = new Set();
  const items = [];
  for (const p of projects) {
    if (!p.client_id || counts.get(p.client_id) < 2) {
      items.push({ type: 'project', slug: p.slug, title: p.title });
      continue;
    }
    if (emitted.has(p.client_id)) continue;
    emitted.add(p.client_id);
    const name = p.clients?.name || 'Client';
    items.push({
      type: 'client',
      // Label follows card_title so the rail reads the same as the home card.
      name: p.clients?.card_title?.trim() || name,
      // The route resolves on the canonical NAME, never the card title, so
      // retitling never breaks a link: slugify(name), id as a fallback.
      slug: slugify(name) || String(p.client_id),
      projects: projects
        .filter((sib) => sib.client_id === p.client_id)
        .map((sib) => ({ slug: sib.slug, title: sib.title })),
    });
  }
  return items;
}

// --- Nav render ------------------------------------------------------------
// Every category renders CLOSED (2026-08-09). The rail used to open each
// populated category on a first visit and then remember what you had open for
// the rest of the session, which meant arriving at a wall of expanded lists
// nobody had asked to see. A disclosure now opens when, and only when, someone
// presses it — including the category of the project being viewed, which used
// to be force-opened underneath you.
//
// Nothing persists, so `ct:rail:open` in sessionStorage is gone with it.
function projectItem(project, activeSlug) {
  const active = project.slug === activeSlug;
  return el(
    'li',
    {},
    el(
      'a',
      {
        href: `/project.html?p=${encodeURIComponent(project.slug)}`,
        class: active ? 'is-active' : false,
        'aria-current': active ? 'page' : false,
      },
      project.title
    )
  );
}

// A repeat client: the label links to their client page, and their projects sit
// nested underneath. Deliberately NOT a second <details> inside the category's
// one — nesting disclosures would put two clicks between the rail and a project
// that used to take one, and the whole point is to make the relationship
// visible at a glance.
function clientItem(item, active) {
  const isActive = item.slug === active.client;
  return el(
    'li',
    { class: 'rail__client' },
    el(
      'a',
      {
        class: isActive ? 'rail__client-label is-active' : 'rail__client-label',
        href: `/client.html?c=${encodeURIComponent(item.slug)}`,
        'aria-current': isActive ? 'page' : false,
      },
      item.name,
      el('span', { class: 'rail__client-count', 'aria-hidden': 'true' }, String(item.projects.length))
    ),
    el(
      'ul',
      { class: 'rail__sublist' },
      ...item.projects.map((project) => projectItem(project, active.project))
    )
  );
}

function renderNav(groups, active) {
  const nav = qs('#rail-nav');
  if (!nav) return;

  const details = groups.map((group) => {
    const empty = group.items.length === 0;
    const summary = el('summary', { class: 'rail__group-label' }, group.name);

    const list = empty
      ? el('p', { class: 'rail__empty' }, 'No published work yet.')
      : el(
          'ul',
          { class: 'rail__list' },
          ...group.items.map((item) =>
            item.type === 'client' ? clientItem(item, active) : projectItem(item, active.project)
          )
        );

    const groupEl = el(
      'details',
      {
        class: empty ? 'rail__group rail__group--empty' : 'rail__group',
        'data-slug': group.slug,
      },
      summary,
      list
    );
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
    if (cacheIsFresh(cached, SITE_TTL)) return cached.settings;
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
  // Note: #contact-link points at /contact.html (the inquiry form) — it is
  // deliberately NOT rewritten to a mailto:, since the form is the better
  // route. contact_email is surfaced on the contact page instead.
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

// --- Theme toggle (light / dark) --------------------------------------------
const THEME_KEY = 'ct:theme';

function currentTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initThemeToggle() {
  const btn = qs('#theme-toggle');
  if (!btn) return;
  const labelEl = btn.querySelector('.theme-toggle__label');

  const sync = () => {
    const isLight = currentTheme() === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    if (labelEl) labelEl.textContent = isLight ? 'Dark mode' : 'Light mode';
  };
  sync();

  btn.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked — theme still applies for this page load */
    }
    sync();
  });
}

// --- Cookie notice ----------------------------------------------------------
// The site sets no advertising/analytics cookies — only functional storage
// (theme, a short nav cache). So this is a dismissible NOTICE, not
// a consent gate: there is nothing to withhold pending consent.
const COOKIE_KEY = 'ct:cookie-notice';

function initCookieNotice() {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(COOKIE_KEY) === 'dismissed';
  } catch {
    dismissed = true; // storage blocked — don't nag on every page
  }
  if (dismissed) return;

  const accept = el('button', { class: 'cookie-notice__accept', type: 'button' }, 'Got it');
  const notice = el(
    'aside',
    { class: 'cookie-notice', role: 'note', 'aria-label': 'Cookie notice' },
    el(
      'p',
      { class: 'cookie-notice__text' },
      'We only store what makes this site work: your theme choice and a short cache of the project list. No ad tracking. ',
      el('a', { href: '/cookies.html' }, 'Cookie policy')
    ),
    accept
  );

  accept.addEventListener('click', () => {
    try {
      localStorage.setItem(COOKIE_KEY, 'dismissed');
    } catch {
      /* not critical */
    }
    notice.remove();
  });

  document.body.append(notice);
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
  initThemeToggle();
  initClock();
  initCookieNotice();
  // `?p` on project.html, `?c` on client.html. Both are read here so the rail
  // can highlight a client label as the current page too.
  const params = new URLSearchParams(location.search);
  const active = { project: params.get('p'), client: params.get('c') };
  try {
    const groups = await loadNav();
    if (!groups.length) {
      renderNavMessage('No published work yet.');
    } else {
      renderNav(groups, active);
    }
  } catch (err) {
    console.error('[shell] could not load the project nav:', err);
    renderNavMessage('Work couldn’t load. Please refresh.');
  }

  try {
    applySiteSettings(await loadSiteSettings());
  } catch (err) {
    console.error('[shell] could not load site settings, keeping static footer links:', err);
  }
}

init();
