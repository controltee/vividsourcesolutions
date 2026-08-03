// project.js — one template, three renderers (gallery | deck | reel), switched
// on project.layout. Never fork this into per-layout HTML files.

import { qs, qsa, el, revealOnScroll } from './util.js';
import { supabase } from './supabase.js';
import { pictureFor } from './image.js';
import { openLightbox } from './lightbox.js';
import { isVideoKind, youtubeId, youtubeWatchUrl } from './video.js';

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
      el('a', { href: '/work.html' }, '← Back to work')
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
    el('a', { class: 'project__back', href: '/work.html' }, '← Back to work'),
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

// --- Video block (shared by reel and deck) -----------------------------------
// One shape for every video the site shows, whoever hosts it: a still, then one
// button. YouTube rows link out (no embed — see video.js); uploaded files swap
// the still for a real <video> in place, so not a byte of video downloads until
// somebody asks for it.
//
// On a video row width/height describe the POSTER, not the footage (sql/009).
// With no poster of its own the row borrows the project banner, which is why a
// reel added in a hurry still renders something.
function videoBlock(m, project, label, { showCaption = true } = {}) {
  const ownPoster = Boolean(m.poster_url);
  const posterUrl = ownPoster ? m.poster_url : project.cover_url || null;
  const posterW = ownPoster ? m.width : project.banner_w;
  const posterH = ownPoster ? m.height : project.banner_h;

  const frame = el('div', { class: 'reel__frame' });
  frame.append(
    posterUrl
      ? pictureFor(posterUrl, posterW, posterH, {
          alt: m.alt || `${label} — still`,
          sizes: '(max-width: 1100px) 100vw, 70vw',
          loading: 'lazy',
        })
      : el('div', { class: 'reel__placeholder' }, label)
  );

  const ytId = m.kind === 'youtube' ? youtubeId(m.media_url) : null;
  let cta;
  if (ytId) {
    cta = el(
      'a',
      {
        class: 'reel__cta',
        href: youtubeWatchUrl(ytId),
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `Press to see the full video for ${label} on YouTube (opens in a new tab)`,
      },
      'Press to see full video',
      el('span', { class: 'reel__cta-glyph', 'aria-hidden': 'true' }, '↗')
    );
  } else {
    cta = el('button', { class: 'reel__cta', type: 'button' }, 'Press to see full video');
    cta.addEventListener('click', () => {
      const video = el('video', {
        src: m.media_url,
        poster: posterUrl || false,
        controls: true,
        playsinline: true,
        autoplay: true,
        preload: 'metadata',
      });
      frame.replaceChildren(video);
      cta.remove();
      video.focus();
    });
  }

  return el(
    'div',
    { class: 'reel__item' },
    frame,
    cta,
    showCaption && m.caption ? el('p', { class: 'reel__caption' }, m.caption) : null
  );
}

// --- Mode: deck --------------------------------------------------------------
function renderDeck(media, project) {
  const title = project.title;
  const container = el('div', { class: 'deck' });
  media.forEach((m, i) => {
    const media_el = isVideoKind(m.kind)
      ? // No caption here: deck renders none at all (see below), and the button
        // under the still is the only chrome this layout tolerates.
        videoBlock(m, project, `${title}, slide ${i + 1} of ${media.length}`, { showCaption: false })
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
// A reel is every video on the project, in order — a motion showreel is rarely
// one film. Images on a reel project are ignored rather than half-rendered
// between the videos; put them on a gallery project instead.
function renderReel(media, project) {
  const videos = media.filter((m) => isVideoKind(m.kind));
  if (!videos.length) {
    return el('div', { class: 'reel' }, el('p', { class: 'pane__msg' }, 'Video coming soon.'));
  }
  return el(
    'div',
    { class: 'reel' },
    ...videos.map((m, i) => {
      const label =
        videos.length > 1 ? `${project.title}, video ${i + 1} of ${videos.length}` : project.title;
      const block = videoBlock(m, project, label);
      block.classList.add('reveal');
      return block;
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

  document.title = `${project.title} · Control Tee`;

  // select('*') rather than a named list: PostgREST errors on a column it does
  // not know, so naming poster_url here would break every project page until
  // sql/009 is applied in the dashboard. Same reasoning as `clients` (CLAUDE.md).
  const { data: media, error: mediaError } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');

  if (mediaError) console.error('[project] gallery failed to load:', mediaError);

  const mediaList = media || [];
  let mediaEl;
  if (project.layout === 'deck') mediaEl = renderDeck(mediaList, project);
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
