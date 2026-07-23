// util.js — tiny DOM helpers. No dependencies. Safe by construction (no innerHTML).

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Build a DOM element.
 *   el('a', { href: '/x', class: 'y' }, 'text', childNode)
 * Attribute value `true` sets an empty (boolean) attribute; `false`/`null`
 * skips it. Children may be strings (become text nodes) or nodes.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * URL-safe slug from arbitrary text. Shared by the admin (project/category
 * slugs) and the public pages (client routing). Clients have no slug column in
 * the live DB, so `client.html?c=` routes on slugify(client.name) and resolves
 * it back by matching — no migration, and the URL still reads as a name.
 */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fade + short-translate elements into view as they're scrolled to. Elements
 * should carry the `.reveal` class (styled in shell.css). Under reduced-motion,
 * everything is shown immediately with no animation — honouring the spec's
 * "fades and short translations only, respect prefers-reduced-motion" rule.
 */
export function revealOnScroll(elements) {
  const list = [...elements];
  const revealAll = () => list.forEach((node) => node.classList.add('is-visible'));

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }
  const io = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );
  // Stagger: items reveal in sequence rather than snapping in as one block,
  // which reads calmer on a grid. Capped at 6 steps so a long gallery never
  // leaves the last images visibly waiting. Set per-property via CSSOM, never
  // as a style="" string, because the CSP's style-src has no 'unsafe-inline'.
  // The delay is cleared once the reveal finishes so it cannot slow later
  // transitions on the same element.
  list.forEach((node, i) => {
    node.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
    node.addEventListener(
      'transitionend',
      () => {
        node.style.transitionDelay = '';
      },
      { once: true }
    );
    io.observe(node);
  });

  // Safety net: content must never stay invisible. If the observer never fires
  // (a stalled rendering pipeline, an unusual browser), reveal everything.
  setTimeout(revealAll, 1500);
}
