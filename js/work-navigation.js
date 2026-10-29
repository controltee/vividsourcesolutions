// Preserve the current history entry rather than opening a fresh work page.
import { el } from './util.js';

const PENDING_KEY = 'ct:navigation';
const navigationType = performance.getEntriesByType('navigation')[0]?.type;
let positionSaved = false;

function comparableUrl(value) {
  const url = new URL(value);
  // Referrers omit fragments; Vercel redirects older .html links to clean URLs.
  url.hash = '';
  url.pathname = url.pathname.replace(/\.html$/, '').replace(/^\/index$/, '/');
  return url.href;
}

// Only an ordinary same-tab link records a previous page. Direct visits and
// links opened in new tabs must keep the safe homepage fallback.
try {
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY));
  sessionStorage.removeItem(PENDING_KEY);
  if (
    navigationType === 'navigate' &&
    pending &&
    comparableUrl(pending.to) === comparableUrl(location.href) &&
    comparableUrl(pending.from) === comparableUrl(document.referrer) &&
    Date.now() - pending.at < 30000
  ) {
    history.replaceState({ ...history.state, ctBack: pending.from }, '');
  }
} catch {
  // Storage can be unavailable; normal links still work.
}

function previousPage() {
  try {
    const url = new URL(history.state?.ctBack);
    return url.origin === location.origin && history.length > 1 ? url.href : null;
  } catch {
    return null;
  }
}

function savePosition() {
  try {
    history.replaceState({
      ...history.state,
      ctScroll: { x: scrollX, y: scrollY, rail: document.querySelector('.rail')?.scrollTop || 0 },
    }, '');
  } catch {
    // Keep navigation available if the browser rejects history state updates.
  }
}

// Native restoration can run against loading skeletons, before the work grid
// is tall enough. Renderers restore once their real content has arrived.
history.scrollRestoration = 'manual';

export async function restoreWorkPosition(fromCache = false) {
  const position = history.state?.ctScroll;
  if ((!fromCache && navigationType !== 'back_forward') || !position) return;
  await document.fonts.ready;
  requestAnimationFrame(() => {
    window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
    const rail = document.querySelector('.rail');
    if (rail) rail.scrollTop = position.rail;
  });
}

export function backToWorkLink(attrs = {}) {
  return el('a', { ...attrs, href: previousPage() || '/', 'data-back-to-work': true }, '← Back to work');
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const target = new URL(link.href);
  if (target.origin !== location.origin) return;
  if (target.pathname === location.pathname && target.search === location.search && target.hash) return;

  savePosition();
  positionSaved = true;
  if (link.hasAttribute('data-back-to-work') && previousPage()) {
    event.preventDefault();
    history.back();
    return;
  }
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ from: location.href, to: target.href, at: Date.now() }));
  } catch {
    // The anchor's normal destination remains available.
  }
});

// A view transition can shift the outgoing viewport before pagehide. Capture
// before its snapshot, including browser Back/Forward, rather than saving that
// shifted position and introducing drift on every return.
window.addEventListener('pageswap', () => {
  savePosition();
  positionSaved = true;
});
window.addEventListener('pagehide', () => {
  if (!positionSaved) savePosition();
});
window.addEventListener('pageshow', (event) => {
  positionSaved = false;
  // Cached documents already contain their content; rebuilt dynamic pages
  // restore from their renderer instead.
  if (event.persisted || !document.querySelector('script[src="/js/home.js"], script[src="/js/client.js"], script[src="/js/project.js"]')) {
    restoreWorkPosition(event.persisted);
  }
});
