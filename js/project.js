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

// --- Video -------------------------------------------------------------------
// A tall film at the media column's full width runs well past the bottom of the
// screen — a 9:16 cut in a 735px column is over 1300px high, so the controls are
// off-screen the moment it starts. This is the ceiling on how tall a video may
// get, in vh.
const VIDEO_MAX_VH = 78;

/** Gives a <video> the shape of its own footage.
 *
 * aspect-ratio holds the box before a byte arrives, so nothing shifts. The
 * height cap is expressed as a WIDTH, in --video-max on the figure: capping
 * height directly would leave the box at full width with the picture
 * letterboxed inside it, whereas narrowing the box keeps it filled and simply
 * makes a tall video smaller. The width is derived from the same ratio, so the
 * cap costs nothing on anything wider than about 4:3 and never crops.
 *
 * It goes on the FIGURE rather than the video because the description has to
 * match: a caption running the full column width under a video narrowed to half
 * of it reads as belonging to something else.
 *
 * Both are skipped when the dimensions are unknown — an old row, or a codec the
 * uploading browser could not read. css/project.css then falls back to 16:9 at
 * full width. */
function sizeVideo(figure, video, m) {
  if (!m.width || !m.height) return;
  video.style.aspectRatio = `${m.width} / ${m.height}`;
  figure.style.setProperty('--video-max', `calc(${VIDEO_MAX_VH}vh * ${m.width} / ${m.height})`);
}

/** A video plus its description, used by gallery and deck alike.
 *
 * ANY ASPECT RATIO. The intrinsic size is written by the admin when the file is
 * uploaded, and is set here as a CSS aspect-ratio so the box is the shape of the
 * footage — vertical, square, ultrawide — and holds its space before a single
 * byte of video arrives. Nothing is cropped and nothing shifts.
 *
 * The dimensions can legitimately be missing: an old row, or a codec the
 * uploading browser could not decode to read them. 16:9 is the fallback, set in
 * css/project.css, so the worst case is a letterboxed box rather than a
 * collapsed one.
 *
 * `caption` is the description typed in the admin. Unlike an image caption it
 * IS rendered in deck mode: a video already interrupts that mode's seamless
 * column with its own controls, so the argument for keeping text out between
 * slides does not apply to it. */
function videoFigure(m, { eager = false } = {}) {
  const video = el('video', {
    src: m.media_url,
    controls: true,
    playsinline: true,
    preload: eager ? 'metadata' : 'none',
    'aria-label': m.alt || false,
  });
  const figure = el(
    'figure',
    { class: 'media-video reveal' },
    video,
    m.caption ? el('figcaption', { class: 'media-video__caption' }, m.caption) : null
  );
  sizeVideo(figure, video, m);
  return figure;
}

// --- Mode: gallery -----------------------------------------------------------
function renderGallery(media, title) {
  const container = el('div', { class: 'gallery' });

  // The lightbox is an IMAGE viewer, so it is built from the images alone. That
  // is also why the index passed to openLightbox is the image's position in
  // this filtered list and not its position in `media` — with a video partway
  // down a gallery the two disagree, and clicking a poster would open its
  // neighbour. Videos play in place instead: putting a <video> behind a click
  // that opens a modal only puts a step between the visitor and the play button.
  const images = media.filter((m) => m.kind !== 'video');
  const lightboxItems = images.map((m, i) => ({
    src: m.media_url,
    alt: m.alt || `${title}, image ${i + 1} of ${images.length}`,
    caption: m.caption,
  }));

  let imageIndex = 0;
  media.forEach((m, i) => {
    if (m.kind === 'video') {
      container.append(videoFigure(m, { eager: i < 2 }));
      return;
    }
    const position = imageIndex++;
    const picture = pictureFor(m.media_url, m.width, m.height, {
      alt: m.alt || `${title}, image ${position + 1} of ${images.length}`,
      sizes: '(max-width: 700px) 90vw, 45vw',
      loading: i < 2 ? 'eager' : 'lazy',
    });
    const button = el('button', { class: 'gallery__item reveal', type: 'button' }, picture);
    button.addEventListener('click', () => openLightbox(lightboxItems, position, button));
    container.append(button);
  });

  return container;
}

// --- Mode: deck --------------------------------------------------------------
function renderDeck(media, title) {
  const container = el('div', { class: 'deck' });
  media.forEach((m, i) => {
    // A video is the one thing in this mode that gets its description rendered
    // — see videoFigure. It also carries its own aspect ratio, which a slide
    // does not need because an image's own height already sets one.
    if (m.kind === 'video') {
      const figure = videoFigure(m, { eager: i < 2 });
      figure.classList.add('deck__item');
      container.append(figure);
      return;
    }
    const media_el = pictureFor(m.media_url, m.width, m.height, {
      alt: m.alt || `${title}, slide ${i + 1} of ${media.length}`,
      sizes: '(max-width: 1100px) 100vw, 70vw',
      loading: i < 2 ? 'eager' : 'lazy',
    });
    // No figcaption for a SLIDE in deck mode: text between slides breaks the
    // seamless flow this layout exists for. The caption stays in the DB and
    // still shows in gallery mode; alt carries the accessible description.
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
  // Videos ARE hosted from Supabase Storage now — uploaded from the admin's
  // gallery manager alongside the images, same bucket, same row shape.
  const video = el('video', {
    src: videoRow.media_url,
    poster: project.cover_url || false,
    controls: true,
    playsinline: true,
    preload: 'metadata',
    'aria-label': videoRow.alt || false,
  });
  const figure = el(
    'figure',
    { class: 'reel' },
    video,
    videoRow.caption ? el('figcaption', { class: 'media-video__caption' }, videoRow.caption) : null
  );
  // The project's own aspect ratio, so a vertical reel is not letterboxed into
  // a widescreen box and nothing shifts once the file starts loading.
  sizeVideo(figure, video, videoRow);
  return figure;
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
