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

import { qs } from './util.js';
import { supabase } from './supabase.js';

const ACCESS_KEY = '11d96307-207d-4c24-9378-dea299083f92';
const ENDPOINT = 'https://api.web3forms.com/submit';

const form = qs('#inquiry-form');
const statusEl = qs('#inquiry-status');
const submitBtn = form?.querySelector('button[type="submit"]');

function setStatus(message, state) {
  statusEl.textContent = message;
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
 * reports them inline rather than with the browser's default bubbles. */
function firstInvalid() {
  for (const field of form.querySelectorAll('input[required], textarea[required]')) {
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
        : 'Please fill in your name, email and a short message.',
      'error'
    );
    invalid.focus();
    return;
  }

  const formData = new FormData(form);
  formData.append('access_key', ACCESS_KEY);
  formData.append('subject', `New project inquiry from ${formData.get('name') || 'Control Tee site'}`);
  formData.append('from_name', 'Control Tee website');

  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = 'Sending…';
  submitBtn.disabled = true;
  setStatus('', '');

  try {
    const response = await fetch(ENDPOINT, { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      form.reset();
      setStatus('Thank you. Your message is on its way. We’ll be in touch shortly.', 'success');
      showCheck();
    } else {
      setStatus(data.message || 'That didn’t send. Please try again in a moment.', 'error');
    }
  } catch {
    setStatus('Couldn’t reach the server. Check your connection and try again.', 'error');
  } finally {
    submitBtn.textContent = originalLabel;
    submitBtn.disabled = false;
  }
});

// Optional: show the studio's email under the form if it's set in the admin.
(async () => {
  try {
    const { data } = await supabase
      .from('site_content')
      .select('id, content')
      .in('id', ['contact_body', 'contact_email']);
    const settings = Object.fromEntries((data || []).map((r) => [r.id, r.content]));
    const intro = qs('#contact-intro');
    if (intro && settings.contact_body) intro.textContent = settings.contact_body;
  } catch {
    /* keep the static copy */
  }
})();
