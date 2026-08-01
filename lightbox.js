// lightbox.js — gallery mode only. Native <dialog>, arrow-key + on-screen nav,
// wraps at both ends, preloads neighbours, returns focus to the trigger.

import { el } from './util.js';

let dialogEl = null;
let items = []; // [{ src, alt, caption }]
let index = 0;
let triggerEl = null;
let closing = false;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  // Escape closes a <dialog> natively and instantly. Intercepting `cancel`
  // hands that path the same animated close as the button and the backdrop, so
  // the poster does not simply vanish on one route out of three.
  dialogEl.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeLightbox();
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

// A <dialog> disappears the instant .close() runs, so an exit animation has to
// be played BEFORE closing. The class drives it; `animationend` on the dialog
// itself ends it, with a timer as the safety net so a dropped animation event
// can never leave the lightbox stuck open.
function closeLightbox() {
  if (closing) return;
  if (prefersReducedMotion()) {
    dialogEl.close();
    restoreFocus();
    return;
  }

  closing = true;
  dialogEl.classList.add('lightbox--closing');

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    closing = false;
    clearTimeout(timer);
    dialogEl.removeEventListener('animationend', onEnd);
    dialogEl.classList.remove('lightbox--closing');
    dialogEl.close();
    restoreFocus();
  };
  // Only the dialog's OWN animation ends the close. Without the target check,
  // the figure's rise animation bubbling up would cut a close short when the
  // lightbox is dismissed before it has finished opening.
  const onEnd = (event) => {
    if (event.target === dialogEl) finish();
  };
  const timer = setTimeout(finish, 600);
  dialogEl.addEventListener('animationend', onEnd);
}

function preload(src) {
  const img = new Image();
  img.src = src;
}

function show(newIndex) {
  index = (newIndex + items.length) % items.length; // wrap both ends
  const item = items[index];
  const img = dialogEl.querySelector('.lightbox__img');

  // Fade the new frame in on `load`, not on assignment: the browser keeps
  // showing the previous image until the next one decodes, so animating from
  // here would fade the OLD picture and then cut to the new one.
  img.classList.remove('is-swapping');
  if (!prefersReducedMotion()) {
    img.addEventListener(
      'load',
      () => {
        img.classList.remove('is-swapping');
        void img.offsetWidth; // reflow, so the animation restarts on re-entry
        img.classList.add('is-swapping');
      },
      { once: true }
    );
  }
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
  // Reopening while the close animation is still running: the dialog is
  // technically still open, and showModal() on an open dialog throws. Drop the
  // closing state and reuse it.
  closing = false;
  dialogEl.classList.remove('lightbox--closing');
  show(startIndex);
  if (!dialogEl.open) dialogEl.showModal();
}
