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
