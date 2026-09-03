import { qs } from './util.js';
import { supabase } from './supabase.js';

(async () => {
  try {
    const { data } = await supabase
      .from('site_content')
      .select('id, content')
      .in('id', ['contact_body', 'contact_email']);
    const settings = Object.fromEntries((data || []).map((r) => [r.id, r.content]));
    const intro = qs('#contact-intro');
    if (intro && settings.contact_body) intro.textContent = settings.contact_body;
    const email = qs('#contact-email');
    if (email && settings.contact_email) {
      email.href = `mailto:${settings.contact_email}`;
      email.textContent = settings.contact_email;
      email.hidden = false;
    }
  } catch {
    /* keep the static copy */
  }
})();
