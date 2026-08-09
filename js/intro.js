// intro.js — drives the opening sequence on the home page.
//
// js/intro-gate.js has already decided (before first paint) whether the panel
// is up; this module only has three jobs: resolve the centrepiece logo, start
// the staged reveal, and get out of the way when the visitor asks it to.
//
// Deliberately NOT imported by home.js: the sequence must be able to run and be
// dismissed whether or not the grid behind it has finished loading.

// Note what is NOT imported here: js/supabase.js, and through it the Supabase
// client from esm.sh. A static import would put a third-party CDN on this
// module's dependency graph, and a module whose graph fails to resolve never
// evaluates AT ALL — no try/catch inside it can help. The visitor would be left
// staring at the panel until the gate's failsafe fired. The client is pulled in
// with a dynamic import below instead, so the sequence always runs and only the
// logo depends on the network.
import { qs, el } from './util.js';

const SITE_KEY = 'ct:site'; // shared with shell.js — same rows, same session cache

// How long the sequence waits for the uploaded logo before starting without it.
// Past this the wordmark already in the markup is the centrepiece, and it is a
// perfectly good one: better a composed reveal of the studio name than a dark
// panel held open on a slow fetch. Deliberately short — this is the very first
// thing anyone sees.
const LOGO_BUDGET_MS = 600;

const root = document.documentElement;

// The gate's failsafe would yank the panel mid-read. Cancel it first, before
// anything below can throw.
clearTimeout(window.__ctIntroFallback);

// --- Logo -------------------------------------------------------------------
// Same site_content row and same session cache shell.js uses, so on any load
// where shell.js got there first this costs nothing.
async function logoUrl() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SITE_KEY));
    if (cached?.settings?.logo_url) return cached.settings.logo_url;
  } catch {
    /* corrupt cache — fetch instead */
  }
  const { supabase } = await import('./supabase.js');
  const { data, error } = await supabase
    .from('site_content')
    .select('id, content')
    .eq('id', 'logo_url')
    .maybeSingle();
  if (error) throw error;
  return data?.content || null;
}

// Resolves to a decoded <img>, or null if there is no logo to show. Decoding
// before the reveal starts is the point: an image swapped in mid-animation is
// exactly the pop the staged start exists to avoid.
async function resolveLogo() {
  const url = await logoUrl();
  if (!url) return null;

  const img = el('img', { src: url, alt: 'Control Tee' });
  if (img.decode) {
    await img.decode();
  } else {
    await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', reject, { once: true });
    });
  }
  return img;
}

// --- Exit -------------------------------------------------------------------
function dismiss(panel) {
  if (panel.dataset.leaving) return; // click + Escape landing together
  panel.dataset.leaving = '1';

  const finish = () => {
    root.removeAttribute('data-intro');
    for (const node of document.querySelectorAll('[data-intro-inert]')) {
      node.removeAttribute('inert');
      node.removeAttribute('data-intro-inert');
    }
    // Hand the visitor the content they asked for, at its start.
    const pane = qs('#pane');
    if (pane) pane.focus({ preventScroll: true });
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    finish();
    return;
  }
  panel.addEventListener('transitionend', finish, { once: true });
  panel.classList.add('is-leaving');
  // The panel is removed from the layout by the attribute drop, so a dropped
  // transitionend (a backgrounded tab, mostly) would strand it. Belt and braces.
  setTimeout(finish, 600);
}

// --- Boot -------------------------------------------------------------------
async function initIntro() {
  const panel = qs('#intro');
  if (!panel || root.dataset.intro !== 'pending') return;

  // Nothing behind the panel should be reachable by keyboard while it is up.
  // The panel is opaque, so this is about tab order, not pointers.
  for (const node of document.querySelectorAll('.skip-link, .topbar, .scrim, .shell')) {
    node.setAttribute('inert', '');
    node.setAttribute('data-intro-inert', '');
  }

  const cta = qs('#intro-enter', panel);
  cta?.addEventListener('click', () => dismiss(panel));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismiss(panel);
  });

  // Race the logo against its budget. Either way the sequence starts once —
  // whichever settles first decides what the centrepiece is for this play.
  const slot = qs('#intro-logo', panel);
  const logo = await Promise.race([
    resolveLogo().catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), LOGO_BUDGET_MS)),
  ]);
  if (logo && slot) slot.replaceChildren(logo);

  panel.classList.add('is-playing');
  // Focus the PANEL, not the button. Everything else on the page is inert, so
  // this puts the button one Tab away for a keyboard visitor without painting a
  // focus ring on the hero control for everyone else — Chromium treats a
  // programmatic focus() on a button as focus-visible when no pointer has been
  // used yet, which is every first load.
  panel.focus({ preventScroll: true });
}

initIntro().catch((err) => {
  console.error('[intro] opening sequence failed:', err);
  // Never let a failure here cost someone the site.
  root.removeAttribute('data-intro');
});
