// contact.js — project inquiry form, submitted to Web3Forms.
//
// Web3Forms takes a POST of FormData and emails it on; the access key is
// public by design (it identifies the destination inbox, it isn't a secret
// that grants access to anything). The endpoint is whitelisted in the CSP's
// connect-src.
//
// Differences from Web3Forms' sample snippet, on purpose:
//  - inline status messages instead of alert(), announced via aria-live
//  - explicit validation so the first invalid field gets focus
//  - a honeypot ("botcheck") that real people never see

// Static imports are limited to util.js and config.js, which import NOTHING.
// That is load-bearing, not tidiness. supabase.js pulls the client from esm.sh,
// and an ES module graph fails as a unit: while supabase was imported here at
// the top level, a blocked or slow esm.sh meant this file never executed, the
// submit listener below was never attached, and the form fell back to a native
// GET submission — silently losing the inquiry and leaving the visitor on a
// page with their answers in the query string. This form is the site's only
// conversion route, so it must work with nothing but its own two local
// dependencies. Both Supabase uses are now loaded on demand, below.
import { qs } from './util.js';
import { WEB3FORMS_ACCESS_KEY as ACCESS_KEY, WEB3FORMS_ENDPOINT as ENDPOINT } from './config.js';

const form = qs('#inquiry-form');
const statusEl = qs('#inquiry-status');
const submitBtn = form?.querySelector('button[type="submit"]');

// Two events, and the pair is a true funnel: both ends happen on this page to
// the same person, so the drop between them is a real number. 'inquiry_start'
// fires once on first contact with any field — `once: true` on a listener bound
// to the form, so it costs nothing and cannot double-count. Analytics is
// fire-and-forget by design and must never be able to break the form.
const recordEvent = (name) =>
  import('./analytics.js')
    .then((m) => m.recordEvent(name))
    .catch(() => {});

form?.addEventListener('focusin', () => recordEvent('inquiry_start'), { once: true });

function setStatus(message, state) {
  statusEl.textContent = message;
  // Clearing the state and forcing a reflow restarts the entrance animation.
  // Without this, two errors in a row would leave the message sitting there
  // unchanged, and the second attempt would look like nothing happened.
  statusEl.dataset.state = '';
  void statusEl.offsetWidth;
  statusEl.dataset.state = state || '';
}

/** Plays the drawn checkmark. Decorative only: #inquiry-status already
 * announces the result, so this never carries information on its own. The
 * animation is restarted each time by removing the node from the flow and
 * forcing a reflow, otherwise a second submission would show a static tick. */
function showCheck() {
  const check = qs('#inquiry-check');
  if (!check) return;
  check.hidden = true;
  void check.offsetWidth; // reflow, so the CSS animations run again
  check.hidden = false;
}

/** Returns the first invalid field, or null. Keeps native constraints but
 * reports them inline rather than with the browser's default bubbles.
 * `select[required]` is in the list because project type is now required and
 * the message is not — the required set is name, email and project type. */
function firstInvalid() {
  for (const field of form.querySelectorAll(
    'input[required], textarea[required], select[required]'
  )) {
    if (!field.checkValidity()) return field;
  }
  return null;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const invalid = firstInvalid();
  if (invalid) {
    setStatus(
      invalid.type === 'email' && invalid.value
        ? 'That email address doesn’t look right.'
        : invalid.name === 'service'
          ? 'Pick what you need so I can come back to you properly.'
          : 'Please fill in your name and email.',
      'error'
    );
    invalid.focus();
    return;
  }

  const formData = new FormData(form);
  formData.append('access_key', ACCESS_KEY);
  formData.append('subject', `New project inquiry from ${formData.get('name') || 'Control Tee site'}`);
  formData.append('from_name', 'Control Tee website');
  // Reply goes to the person who wrote in, not to the form service.
  formData.append('replyto', String(formData.get('email') || ''));

  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = 'Sending…';
  submitBtn.disabled = true;
  submitBtn.dataset.state = 'sending'; // drives the sweep in contact.css
  setStatus('', '');

  try {
    const response = await fetch(ENDPOINT, { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      form.reset();
      setStatus('Thank you. Your message is on its way. I’ll be in touch shortly.', 'success');
      showCheck();
      recordEvent('inquiry_submit');
    } else {
      setStatus(data.message || 'That didn’t send. Please try again in a moment.', 'error');
    }
  } catch {
    setStatus('Couldn’t reach the server. Check your connection and try again.', 'error');
  } finally {
    submitBtn.textContent = originalLabel;
    submitBtn.disabled = false;
    delete submitBtn.dataset.state;
  }
});

// Optional: replace the static intro copy with what the admin has set. Loaded
// on demand so that Supabase, and therefore esm.sh, stays out of this file's
// static import graph — see the note at the top. This is cosmetic: the static
// copy in contact.html is already correct, so failing here costs nothing.
//
// contact_email is deliberately NOT fetched here — this page has no element to
// show it in (the form is the route we want people to take), and the About page
// already surfaces it. It used to be requested and then dropped on the floor.
(async () => {
  try {
    const { supabase } = await import('./supabase.js');
    const { data } = await supabase
      .from('site_content')
      .select('id, content')
      .in('id', ['contact_body']);
    const settings = Object.fromEntries((data || []).map((r) => [r.id, r.content]));
    const intro = qs('#contact-intro');
    if (intro && settings.contact_body) intro.textContent = settings.contact_body;
  } catch {
    /* keep the static copy */
  }
})();
