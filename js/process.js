// process.js — the landing page at /.
//
// Deliberately thin. Every visual effect on this page is CSS; all this file
// does is flip the class that starts the entrances, and record the one event
// that says whether the page did its job.
//
// It does NOT animate anything itself. There is no rAF loop and no scroll
// listener: entrances are CSS transitions triggered by `.is-visible`, and
// where the browser supports `animation-timeline: view()` the thread is tied
// to scroll position by the stylesheet alone (see css/process.css). A scroll
// handler here would be a second, worse implementation of that.

// js/util.js is imported statically because it has NO imports of its own.
// analytics.js is imported dynamically, and that is not a style choice: it
// reaches js/supabase.js, which pulls the Supabase client from esm.sh. A static
// import would put that CDN in this module's dependency graph, and a module
// graph fails as a unit — one slow or blocked request from esm.sh and the code
// below never executes, leaving every stage at opacity 0 permanently. The
// landing page carries the site's only call to action and must render with no
// network in its path.
import { qs, qsa, revealOnScroll } from './util.js';

// The stages carry their own stagger in CSS, keyed off `.is-visible` on the
// <li>. revealOnScroll adds exactly that class, and also handles the two things
// worth not rewriting: it bails to "show everything immediately" under
// prefers-reduced-motion, and it has a 1500ms safety net so a stalled observer
// can never leave the page blank.
const stages = qsa('.process__stage');
if (stages.length) revealOnScroll(stages);

// The thread is observed separately from the stages. It spans the whole track,
// so if it were in the same list its reveal would fire against the top of the
// section while the stages fire against themselves, and the stagger delay
// revealOnScroll assigns would land on the wrong element.
const thread = qs('.process__thread');
if (thread) revealOnScroll([thread]);

// The ring section is the observed element, not its parts: the line, the sweep
// and the four nodes all key off `.is-visible` on the section, so they run as
// one composed movement rather than four independently triggered ones.
const ring = qs('.process-ring');
if (ring) revealOnScroll([ring]);

// Did the process page actually send people to the work? That is the only
// question this page has to answer, and a page view cannot answer it.
// Fire-and-forget: the import, the module and the insert can all fail without
// the click being affected, because the navigation is the browser's to make.
qs('#process-cta')?.addEventListener('click', () => {
  import('./analytics.js')
    .then((m) => m.recordEvent('process_cta'))
    .catch(() => {});
});
