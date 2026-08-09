// intro-gate.js — decides, BEFORE first paint, whether the opening sequence
// runs. Deliberately not a module: a module is deferred, so the home page would
// paint first and the overlay would drop on top of a site the visitor had
// already started reading. This is render-blocking and tiny, like theme-init.js.
//
// It only stamps an attribute. css/intro.css keys the whole overlay off
// :root[data-intro="pending"] — display, the scroll lock, everything — so with
// JS off the overlay never shows and the site behaves exactly as it did before.
//
// Index page only. The sequence is an ARRIVAL, so it plays once per browser
// session: returning home from a project page mid-visit must not replay it.
(function () {
  var root = document.documentElement;

  try {
    if (sessionStorage.getItem('ct:intro') === 'seen') return;
  } catch (e) {
    /* storage blocked — play it, which is the right default for a first visit */
  }

  root.dataset.intro = 'pending';

  // Failsafe. js/intro.js is what dismisses the overlay; if it never boots
  // (module blocked, esm.sh unreachable, a throw before it wires the button)
  // the visitor would be stranded behind a panel with a dead button. This
  // clears the panel on its own after a beat. intro.js cancels it as its first
  // act, so it never fires on the working path.
  window.__ctIntroFallback = setTimeout(function () {
    root.removeAttribute('data-intro');
  }, 6000);
})();
