// project-card.js — the banner card used by every project grid: the home page
// and the per-client page. It lives here rather than in home.js because home.js
// boots the homepage on import, so client.js cannot borrow from it without
// running the homepage renderer as a side effect. One card, one definition.

import { el, projectHref } from './util.js';
import { pictureFor } from './image.js';

export const CARD_SIZES = '(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw';

export function projectCard(project, { eager = false, priority = false } = {}) {
  const picture = pictureFor(project.cover_url, project.banner_w, project.banner_h, {
    alt: '', // decorative: the visible card title is the link's accessible name
    sizes: CARD_SIZES,
    loading: eager ? 'eager' : 'lazy',
    priority,
  });
  picture.classList.add('project-card__picture');

  return el(
    'a',
    { class: 'project-card reveal', href: projectHref(project.slug) },
    picture,
    el(
      'div',
      { class: 'project-card__text' },
      el('h2', { class: 'project-card__title' }, project.title),
      project.summary ? el('p', { class: 'project-card__summary' }, project.summary) : null
    )
  );
}

/** Placeholder cards shown while the real projects load — keeps a grid from
 * flashing empty and reserves layout. */
export function cardSkeletons(count = 6) {
  return Array.from({ length: count }, () =>
    el(
      'div',
      { class: 'project-card project-card--skeleton', 'aria-hidden': 'true' },
      el('div', { class: 'skeleton skeleton--banner' }),
      el('div', { class: 'skeleton skeleton--line' })
    )
  );
}
