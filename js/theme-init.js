// theme-init.js — runs render-blocking in <head> (deliberately NOT a module,
// so it executes before first paint) to stamp the saved theme on <html> and
// avoid a flash of the wrong theme. Everything else theme-related is in
// shell.js. Kept tiny on purpose.
(function () {
  try {
    var saved = localStorage.getItem('ct:theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch (e) {
    /* storage blocked — fall back to the OS preference via CSS */
  }
})();
