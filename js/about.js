// about.js — reads about/contact copy + contact email from site_content.
// Same rows the admin's Site & Contact tab edits (see js/shell.js for the
// rail footer's use of the same data).

import { qs, el } from './util.js';
import { supabase } from './supabase.js';

const IDS = ['about_headline', 'about_body', 'contact_body', 'contact_email'];

async function load() {
  const { data, error } = await supabase.from('site_content').select('id, content').in('id', IDS);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.id, row.content]));
}

function render(values) {
  const pane = qs('#pane');
  // about_body/contact_body are the one place this site renders raw HTML: the
  // live data already stores markup (<p> tags) for this field, and it's only
  // ever written by the authenticated admin, never public input. The CSP's
  // script-src (no 'unsafe-inline') blocks inline scripts/handlers as
  // defense-in-depth even if this content were ever compromised. Every other
  // dynamic field on the site (titles, descriptions, alt text) goes through
  // el()'s text nodes, never innerHTML.
  const bodyHtml = document.createElement('div');
  bodyHtml.className = 'about__body';
  bodyHtml.innerHTML = values.about_body || '';

  const contactBodyEl = el('p', {}, values.contact_body || '');

  pane.replaceChildren(
    el(
      'div',
      { class: 'about' },
      el(
        'section',
        {},
        el('h1', { class: 'about__title' }, values.about_headline || 'About'),
        bodyHtml
      ),
      el(
        'section',
        {},
        el('h2', { class: 'about__contact-title' }, 'Get in touch'),
        contactBodyEl,
        values.contact_email
          ? el('a', { class: 'about__contact-email', href: `mailto:${values.contact_email}` }, values.contact_email)
          : null
      )
    )
  );
}

load()
  .then(render)
  .catch((err) => {
    console.error('[about] failed to load site content:', err);
    qs('#pane').replaceChildren(el('p', { class: 'pane__msg' }, 'This page couldn’t load. Please refresh.'));
  });
