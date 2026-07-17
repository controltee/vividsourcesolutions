// shell.js — renders the persistent rail nav, keeps disclosure state across
// navigation, and drives the mobile drawer.
//
// PHASE 1: the nav payload is hardcoded below. In Phase 2 this is replaced by a
// fetch from Supabase (categories + published projects), cached in sessionStorage
// under `ct:nav`. Everything else here is final.

import { qs, qsa, el } from './util.js';

const OPEN_KEY = 'ct:rail:open';
const DESKTOP = window.matchMedia('(min-width: 900px)');

// --- Fake nav data (Phase 1 only) ------------------------------------------
const NAV = [
  {
    slug: 'brand-identity',
    name: 'Brand identity',
    projects: [
      { slug: 'control-tee-portfolio', title: 'Control Tee Portfolio' },
      { slug: 'futta', title: 'Futta' },
      { slug: 'kijana-initiative', title: 'Kijana Initiative' },
      { slug: 'oa-social', title: 'OA Social' },
      { slug: 'rakwifi', title: 'RakWiFi' },
      { slug: 'ruso-sports', title: 'Ruso Sports' },
    ],
  },
  {
    slug: 'event-branding',
    name: 'Event branding',
    projects: [
      { slug: 'muze-club', title: 'Muze Club' },
      { slug: 'rusa-2025', title: 'RUSA 2025' },
      { slug: 'tedx-riara', title: 'TEDx Riara' },
    ],
  },
  {
    slug: 'motion-design',
    name: 'Motion design',
    projects: [
      { slug: 'january-2026', title: 'January 2026' },
      { slug: 'mg-motion', title: 'MG Motion' },
      { slug: 'portfolio-banner', title: 'Portfolio Banner' },
    ],
  },
  {
    slug: 'video-production',
    name: 'Video production',
    projects: [{ slug: 'riara-university', title: 'Riara University' }],
  },
];

// --- Disclosure open-state persistence -------------------------------------
function readOpenState(groups) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(OPEN_KEY));
    if (Array.isArray(stored)) return new Set(stored);
  } catch {
    /* corrupt value — fall through to default */
  }
  // First visit: everything open.
  const all = new Set(groups.map((g) => g.slug));
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

    const group_el = el(
      'details',
      {
        class: 'rail__group',
        'data-slug': group.slug,
        open: openSlugs.has(group.slug),
      },
      summary,
      list
    );
    group_el.addEventListener('toggle', () => persistOpenState());
    return group_el;
  });

  nav.replaceChildren(...details);
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
  // A tapped project link both navigates and dismisses the drawer.
  rail.addEventListener('click', (event) => {
    if (event.target.closest('a')) close({ restoreFocus: false });
  });
  // Crossing into desktop layout must not leave a stuck locked body.
  DESKTOP.addEventListener('change', (event) => {
    if (event.matches) close({ restoreFocus: false });
  });
}

// --- Boot ------------------------------------------------------------------
const activeSlug = new URLSearchParams(location.search).get('p');
renderNav(NAV, activeSlug);
initDrawer();
