// theme-init.js — runs render-blocking in <head> (deliberately NOT a module,
// so it executes before first paint) to stamp the theme on <html> and avoid a
// flash of the wrong theme. Everything else theme-related is in shell.js.
// Kept tiny on purpose.
//
// DARK IS THE DEFAULT (2026-08-09). The site used to follow the OS preference
// when the visitor had never chosen, which meant a light-OS visitor met the
// studio on a pale ground. The dark ground is the studio's ground, so it is
// what a first visit gets regardless of the OS; the toggle in the rail still
// wins, and once used its choice is what persists. Stamping 'dark' explicitly
// (rather than leaving the attribute off) is what makes the OS preference stop
// applying, since every light rule in tokens.css is guarded on it.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('ct:theme');
  } catch (e) {
    /* storage blocked — fall through to the default */
  }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
})();
