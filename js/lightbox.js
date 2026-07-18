// lightbox.js — gallery mode only. Native <dialog>, arrow-key + on-screen nav,
// wraps at both ends, preloads neighbours, returns focus to the trigger.

import { el } from './util.js';

let dialogEl = null;
let items = []; // [{ src, alt, caption }]
let index = 0;
let triggerEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;

  const img = el('img', { class: 'lightbox__img', alt: '' });
  const caption = el('p', { class: 'lightbox__caption' });
  const counter = el('p', { class: 'lightbox__counter' });
  const figure = el('figure', { class: 'lightbox__figure' }, img, caption, counter);

  const close = el('button', { class: 'lightbox__close', type: 'button', 'aria-label': 'Close' }, '×');
  const prev = el(
    'button',
    { class: 'lightbox__nav lightbox__nav--prev', type: 'button', 'aria-label': 'Previous image' },
    '‹'
  );
  const next = el(
    'button',
    { class: 'lightbox__nav lightbox__nav--next', type: 'button', 'aria-label': 'Next image' },
    '›'
  );

  dialogEl = el('dialog', { class: 'lightbox' }, figure, close, prev, next);
  document.body.append(dialogEl);

  close.addEventListener('click', closeLightbox);
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialogEl.addEventListener('click', (event) => {
    if (event.target === dialogEl) closeLightbox(); // backdrop click
  });
  dialogEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === 'ArrowRight') show(index + 1);
  });
  // Belt-and-suspenders: 'close' fires for every close path per spec
  // (button/backdrop/Escape/form[method=dialog]), so this is the catch-all —
  // but closeLightbox() also restores focus directly for the paths this code
  // triggers itself, in case a host environment's dialog implementation
  // doesn't dispatch 'close' reliably.
  dialogEl.addEventListener('close', restoreFocus);

  return dialogEl;
}

function restoreFocus() {
  triggerEl?.focus();
}

function closeLightbox() {
  dialogEl.close();
  restoreFocus();
}

function preload(src) {
  const img = new Image();
  img.src = src;
}

function show(newIndex) {
  index = (newIndex + items.length) % items.length; // wrap both ends
  const item = items[index];
  const img = dialogEl.querySelector('.lightbox__img');
  img.src = item.src;
  img.alt = item.alt;
  dialogEl.querySelector('.lightbox__caption').textContent = item.caption || '';
  dialogEl.querySelector('.lightbox__caption').hidden = !item.caption;
  dialogEl.querySelector('.lightbox__counter').textContent = `${index + 1} / ${items.length}`;

  preload(items[(index + 1) % items.length].src);
  preload(items[(index - 1 + items.length) % items.length].src);
}

/**
 * Open the lightbox on `list` (array of { src, alt, caption }) starting at
 * `startIndex`, remembering `trigger` to restore focus to on close.
 */
export function openLightbox(list, startIndex, trigger) {
  items = list;
  triggerEl = trigger;
  ensureDialog();
  show(startIndex);
  dialogEl.showModal();
}
