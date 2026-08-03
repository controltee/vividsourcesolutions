// theme-init.js — runs render-blocking in <head> (deliberately NOT a module,
// so it executes before first paint) to stamp the saved theme on <html> and
// avoid a flash of the wrong theme. Everything else theme-related is in
// shell.js. Kept tiny on purpose.
(function () {
  // Marks that scripting is available, before first paint. Every rule that
  // HIDES something in order to animate it in later must be gated on this
  // class, because the class that reveals it is added by JavaScript: without
  // the gate, a visitor with JS off (or a module that failed to load) gets a
  // permanently blank page rather than a page without animation. This is the
  // whole content of the landing page and every scroll-revealed grid on the
  // site, so it is not a small failure mode.
  document.documentElement.classList.add('js');

  try {
    var saved = localStorage.getItem('ct:theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch (e) {
    /* storage blocked — fall back to the OS preference via CSS */
  }
})();
