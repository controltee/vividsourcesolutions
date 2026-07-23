// client.js — one client's body of work. Reached from the grouped card on the
// home grid and from the client label in the rail.
//
// Routing: `client.html?c=<slug>`, where the slug is slugify(client.name). The
// live `clients` table has no slug column and CLAUDE.md keeps migrations
// additive and manual, so the slug is derived rather than stored: this page
// pulls the (small) client list and matches on the slugified name. A raw client
// id also resolves, which keeps any hand-written link working.

import { qs, qsa, el, revealOnScroll, slugify } from './util.js';
import { supabase } from './supabase.js';
import { pictureFor } from './image.js';
import { projectCard, cardSkeletons } from './project-card.js';

const pane = qs('#pane');

// Styled with the client-head classes rather than project.css's .project__empty
// so this page keeps to the one stylesheet it loads.
function notFound(heading, message) {
  document.title = `${heading} · Control Tee`;
  pane.replaceChildren(
    el(
      'div',
      { class: 'client-head' },
      el('a', { class: 'client-head__back', href: '/' }, '← Back to work'),
      el('h1', { class: 'client-head__title' }, heading),
      el('p', { class: 'client-head__count' }, message)
    )
  );
}

function skeleton() {
  pane.replaceChildren(
    el(
      'div',
      { class: 'client-head', 'aria-busy': 'true' },
      el('div', { class: 'skeleton skeleton--title', 'aria-hidden': 'true' }),
      el('div', { class: 'skeleton skeleton--line', 'aria-hidden': 'true' })
    ),
    el('div', { class: 'project-grid' }, ...cardSkeletons(3))
  );
}

// select('*') rather than a named column list, so this page keeps working
// whether or not sql/006 (the client banner columns) has been applied yet.
async function resolveClient(key) {
  const { data, error } = await supabase.from('clients').select('*');
  if (error) throw error;
  return (data || []).find((c) => slugify(c.name) === key || String(c.id) === key) || null;
}

async function load() {
  const key = new URLSearchParams(location.search).get('c');
  if (!key) {
    notFound('Client not found', 'That link is missing a client. Head back to the work to pick one.');
    return;
  }

  const client = await resolveClient(key);
  if (!client) {
    notFound('Client not found', 'We couldn’t find that client. They may have been renamed or removed.');
    return;
  }

  // Category order decides the sequence here exactly as it does on the home
  // grid, so a client's work is not silently reshuffled between the two pages.
  const [cats, projs] = await Promise.all([
    supabase.from('categories').select('id, sort_order'),
    supabase
      .from('projects')
      .select('id, title, slug, summary, cover_url, banner_w, banner_h, category_id, sort_order')
      .eq('is_published', true)
      .eq('client_id', client.id),
  ]);
  if (projs.error) throw projs.error;

  const catOrder = new Map((cats.data || []).map((c) => [c.id, c.sort_order ?? 0]));
  const projects = (projs.data || [])
    .filter((p) => p.slug)
    .sort(
      (a, b) =>
        (catOrder.get(a.category_id) ?? 999) - (catOrder.get(b.category_id) ?? 999) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.title.localeCompare(b.title)
    );

  document.title = `${client.name} · Control Tee`;

  // The same banner the home card uses, when one is set. Decorative: the h1
  // right below it already names the client, so alt would only repeat it.
  let banner = null;
  if (client.banner_url) {
    banner = pictureFor(client.banner_url, client.banner_w, client.banner_h, {
      alt: '',
      sizes: '(max-width: 1100px) 100vw, 70vw',
      loading: 'eager',
      priority: true,
    });
    banner.classList.add('client-head__banner');
  }

  const head = el(
    'header',
    { class: 'client-head' },
    el('a', { class: 'client-head__back', href: '/' }, '← Back to work'),
    banner,
    el('p', { class: 'client-head__eyebrow' }, 'Client'),
    el('h1', { class: 'client-head__title' }, client.name),
    client.description?.trim()
      ? el('p', { class: 'client-head__summary' }, client.description.trim())
      : null,
    el(
      'p',
      { class: 'client-head__count' },
      projects.length === 1 ? '1 project' : `${projects.length} projects`
    )
  );

  const grid = projects.length
    ? el(
        'div',
        { class: 'project-grid' },
        ...projects.map((p, i) => projectCard(p, { eager: i < 4, priority: i === 0 }))
      )
    : el('p', { class: 'pane__msg' }, 'No published work for this client yet.');

  pane.replaceChildren(head, grid);
  revealOnScroll(qsa('.project-card', pane));
}

skeleton();
load().catch((err) => {
  console.error('[client] failed to load:', err);
  notFound('Something went wrong', 'This page didn’t load properly. Please refresh, or head back to the work.');
});
