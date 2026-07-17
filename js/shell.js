// shell.js — renders the persistent rail nav from live data, keeps disclosure
// state across navigation, and drives the mobile drawer.

import { qs, qsa, el } from './util.js';
import { supabase } from './supabase.js';

const OPEN_KEY = 'ct:rail:open';
const NAV_KEY = 'ct:nav';
const NAV_TTL = 5 * 60 * 1000; // 5 minutes
const DESKTOP = window.matchMedia('(min-width: 900px)');

// --- Nav data --------------------------------------------------------------
// Categories + published projects, grouped, ordered, empty categories dropped.
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

  const groups = cats.data
    .filter((c) => byCategory.has(c.id)) // hide categories with no published work
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      projects: byCategory.get(c.id).map((p) => ({ slug: p.slug, title: p.title })),
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
  const all = new Set(groups.map((g) => g.slug)); // first visit: everything open
  persistOpenState(all);
  return all;
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
    const summary = el('summary', { class: 'rail__group-label' }, group.name);

    const list = el(
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
      { class: 'rail__group', 'data-slug': group.slug, open: openSlugs.has(group.slug) },
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
  const activeSlug = new URLSearchParams(location.search).get('p');
  try {
    const groups = await loadNav();
    if (!groups.length) {
      renderNavMessage('No published work yet.');
      return;
    }
    renderNav(groups, activeSlug);
  } catch (err) {
    console.error('[shell] could not load the project nav:', err);
    renderNavMessage('Work couldn’t load — please refresh.');
  }
}

init();
