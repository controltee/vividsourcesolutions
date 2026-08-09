// intro-gate.js — decides, BEFORE first paint, whether the opening sequence
// runs. Deliberately not a module: a module is deferred, so the home page would
// paint first and the overlay would drop on top of a site the visitor had
// already started reading. This is render-blocking and tiny, like theme-init.js.
//
// It only stamps an attribute. css/intro.css keys the whole overlay off
// :root[data-intro="pending"] — display, the scroll lock, everything — so with
// JS off the overlay never shows and the site behaves exactly as it did before.
//
// Index page only, and it plays EVERY time the home page is loaded — on a
// reload, and on every arrival back at the site. It briefly ran once per
// browser session; that was changed 2026-08-09 on Jesse's call. The sequence is
// the front door, not a first-visit tutorial, so nothing is remembered about it
// and there is no state to clear.
(function () {
  var root = document.documentElement;

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
