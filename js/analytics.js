// analytics.js — first-party page counting, written to our own database.
//
// Deliberately NOT a third-party tool. Jesse reads these numbers in /admin, so
// the data has to live in Supabase; and a hosted script would mean a new
// runtime dependency, a CSP entry and someone else's cookies, all three of
// which this project rules out. See sql/010 for what is stored (a path, a
// referrer HOST, a timestamp — nothing that identifies a person) and for the
// honest limitation on how trustworthy the counts are.
//
// Every call here is fire-and-forget. Analytics must never be able to break a
// page: if the table is missing, the network is down, or the insert is
// rejected, the failure is swallowed and the site carries on.

import { supabase } from './supabase.js';

// A view is recorded once per page load per tab. Without this, a page that
// re-runs the module (a bfcache restore, a double import) counts twice and the
// numbers quietly inflate.
let viewRecorded = false;

/** The referring HOST only — never the full URL, which can carry search terms
 * and private path segments from whichever site linked here. Same-origin
 * referrers are dropped: internal navigation is not a traffic source. */
function referrerHost() {
  if (!document.referrer) return null;
  try {
    const url = new URL(document.referrer);
    return url.hostname === location.hostname ? null : url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function send(row) {
  try {
    await supabase.from('page_views').insert(row);
  } catch {
    /* analytics is never worth a broken page */
  }
}

/** One row per page load. `pathname + search` so a project's slug is visible in
 * the report — otherwise every case study collapses into one line for
 * /project.html and the "most-viewed work" figure means nothing. */
export function recordView() {
  if (viewRecorded) return;
  viewRecorded = true;
  send({
    path: `${location.pathname}${location.search}`.slice(0, 300),
    referrer: referrerHost()?.slice(0, 120) ?? null,
    event: null,
  });
}

/** A named step, for the estimator funnel: 'estimate_start' when the first
 * question is answered, 'estimate_complete' when a range is shown,
 * 'estimate_submit' when contact details are sent. Those three numbers are the
 * only ones that answer whether this refactor actually worked. */
export function recordEvent(event) {
  send({
    path: `${location.pathname}${location.search}`.slice(0, 300),
    referrer: referrerHost()?.slice(0, 120) ?? null,
    event: String(event).slice(0, 40),
  });
}
