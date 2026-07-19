// project.js — one template, three renderers (gallery | deck | reel), switched
// on project.layout. Never fork this into per-layout HTML files.

import { qs, qsa, el, revealOnScroll } from './util.js';
import { supabase } from './supabase.js';
import { pictureFor } from './image.js';
import { openLightbox } from './lightbox.js';

const pane = qs('#pane');

// Skeleton shown while the project + its media load.
function projectSkeleton() {
  pane.replaceChildren(
    el(
      'div',
      { class: 'project', 'aria-busy': 'true' },
      el(
        'div',
        { class: 'project__meta' },
        el('div', { class: 'skeleton skeleton--line', 'aria-hidden': 'true' }),
        el('div', { class: 'skeleton skeleton--title', 'aria-hidden': 'true' }),
        el('div', { class: 'skeleton skeleton--line', 'aria-hidden': 'true' })
      ),
      el(
        'div',
        { class: 'project__media' },
        el('div', { class: 'skeleton skeleton--banner', 'aria-hidden': 'true' })
      )
    )
  );
}

function notFound(heading, message) {
  pane.replaceChildren(
    el(
      'div',
      { class: 'project__empty' },
      el('h1', {}, heading),
      el('p', {}, message),
      el('a', { href: '/' }, '← Back to work')
    )
  );
}

function renderMeta(project) {
  const facts = [];
  facts.push(
    el('div', {}, el('dt', {}, 'Client'), el('dd', {}, project.clients?.name || 'Independent'))
  );
  if (project.date_made) {
    facts.push(el('div', {}, el('dt', {}, 'Date'), el('dd', {}, project.date_made)));
  }
  if (project.categories?.name) {
    facts.push(el('div', {}, el('dt', {}, 'Category'), el('dd', {}, project.categories.name)));
  }

  const meta = el(
    'div',
    { class: 'project__meta' },
    el('a', { class: 'project__back', href: '/' }, '← Back to work'),
    project.clients?.name ? el('p', { class: 'project__client' }, project.clients.name) : null,
    el('h1', { class: 'project__title' }, project.title),
    el('dl', { class: 'project__facts' }, ...facts),
    project.services?.length
      ? el(
          'ul',
          { class: 'project__services' },
          ...project.services.map((s) => el('li', {}, s))
        )
      : null,
    project.description
      ? el(
          'div',
          { class: 'project__description' },
          ...project.description.split(/\n{2,}/).map((para) => el('p', {}, para))
        )
      : null
  );
  return meta;
}

// --- Mode: gallery -----------------------------------------------------------
function renderGallery(media, title) {
  const container = el('div', { class: 'gallery' });
  const lightboxItems = media.map((m, i) => ({
    src: m.media_url,
    alt: m.alt || `${title}, image ${i + 1} of ${media.length}`,
    caption: m.caption,
  }));

  media.forEach((m, i) => {
    const picture = pictureFor(m.media_url, m.width, m.height, {
      alt: m.alt || `${title}, image ${i + 1} of ${media.length}`,
      sizes: '(max-width: 700px) 90vw, 45vw',
      loading: i < 2 ? 'eager' : 'lazy',
    });
    const button = el('button', { class: 'gallery__item reveal', type: 'button' }, picture);
    button.addEventListener('click', () => openLightbox(lightboxItems, i, button));
    container.append(button);
  });

  return container;
}

// --- Mode: deck --------------------------------------------------------------
function renderDeck(media, title) {
  const container = el('div', { class: 'deck' });
  media.forEach((m, i) => {
    const media_el =
      m.kind === 'video'
        ? el('video', { src: m.media_url, controls: true, playsinline: true, preload: 'none' })
        : pictureFor(m.media_url, m.width, m.height, {
            alt: m.alt || `${title}, slide ${i + 1} of ${media.length}`,
            sizes: '(max-width: 1100px) 100vw, 70vw',
            loading: i < 2 ? 'eager' : 'lazy',
          });
    // No figcaption in deck mode: captions between slides break the seamless
    // flow this layout exists for. The caption stays in the DB and still shows
    // in gallery mode; alt above carries the accessible description either way.
    const figure = el('figure', { class: 'deck__item reveal' }, media_el);
    container.append(figure);
  });
  return container;
}

// --- Mode: reel ----------------------------------------------------------------
function renderReel(media, project) {
  const videoRow = media.find((m) => m.kind === 'video');
  if (!videoRow) {
    return el(
      'div',
      { class: 'reel' },
      el('p', { class: 'pane__msg' }, 'Video coming soon.')
    );
  }
  // Hosting a real video file from Supabase Storage is explicitly out of
  // scope (see CLAUDE.md / build spec §8) until Cloudflare Stream or Mux is
  // set up — this renderer is built and wired, the source is pluggable.
  return el(
    'div',
    { class: 'reel' },
    el('video', {
      src: videoRow.media_url,
      poster: project.cover_url || false,
      controls: true,
      playsinline: true,
      preload: 'none',
    })
  );
}

// --- Boot --------------------------------------------------------------------
async function loadProject() {
  const slug = new URLSearchParams(location.search).get('p');
  if (!slug) {
    notFound('Project not found', 'That link is missing a project. Head back to the work to pick one.');
    return;
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select('*, categories(name), clients(name)')
    .eq('slug', slug)
    .single();

  if (error || !project) {
    notFound('Project not found', 'We couldn’t find that project. It may have been moved or removed.');
    return;
  }

  document.title = `${project.title} — Control Tee`;

  const { data: media, error: mediaError } = await supabase
    .from('project_media')
    .select('media_url, width, height, alt, caption, kind, sort_order')
    .eq('project_id', project.id)
    .order('sort_order');

  if (mediaError) console.error('[project] gallery failed to load:', mediaError);

  const mediaList = media || [];
  let mediaEl;
  if (project.layout === 'deck') mediaEl = renderDeck(mediaList, project.title);
  else if (project.layout === 'reel') mediaEl = renderReel(mediaList, project);
  else mediaEl = renderGallery(mediaList, project.title);
  mediaEl.classList.add('project__media');

  pane.replaceChildren(el('div', { class: 'project' }, renderMeta(project), mediaEl));
  revealOnScroll(qsa('.reveal', pane));
}

projectSkeleton();
loadProject().catch((err) => {
  console.error('[project] failed to load:', err);
  notFound('Something went wrong', 'This project didn’t load properly. Please refresh, or head back to the work.');
});
