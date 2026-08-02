// protect.js — friction on casually lifting the artwork.
//
// READ THIS BEFORE TRUSTING IT. This is a deterrent, not a protection. Anything
// the browser can display, the visitor already has: it is sitting in their
// cache. The Supabase Storage URL of every image is in the page source, devtools
// shows the whole network waterfall, and turning off JavaScript disables every
// line below. Ten seconds of intent defeats all of it, and no technique exists
// that wouldn't — that is how the web works, not a gap in this file.
//
// What it DOES buy: someone who reflexively right-clicks and picks "Save image"
// doesn't get the file on the first try. That is the whole claim.
//
// What it deliberately does NOT do:
//   - block the context menu on the whole page. Visitors legitimately right-
//     click to open a project in a new tab, copy an email address, or use a
//     translator. Taking that away costs real people something to inconvenience
//     nobody, and it breaks assistive tech that routes through the same menu.
//   - block devtools, F12, Ctrl+U or "view source". Those checks are trivially
//     bypassed, they fire on innocent shortcuts, and they read as hostile.
//
// If a specific image genuinely must not circulate, the only measure that
// survives contact with a determined visitor is not shipping it at full
// resolution — or watermarking it.

const MEDIA = 'img, picture, video, .reel__frame, .gallery__item, .deck__item';

export function installMediaProtection() {
  // Scoped to media, and only when the target really is a piece of artwork —
  // right-clicking the text of a case study still gets the normal menu.
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.(MEDIA)) event.preventDefault();
  });

  // Dragging an image straight out of the page to the desktop is the other
  // one-gesture route, and it isn't covered by the context menu.
  document.addEventListener('dragstart', (event) => {
    if (event.target.closest?.('img, picture, video')) event.preventDefault();
  });
}
