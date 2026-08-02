// video.js — the one place that knows how a video row is addressed. Shared by
// the project page and the admin panel, so a link that parses in one parses in
// the other.
//
// The site NEVER embeds a YouTube player. An <iframe> from youtube.com loads
// their script and their cookies, needs youtube.com added to the CSP's
// frame-src, and puts their chrome on top of the work. So a YouTube-backed
// video renders as a poster WE host plus a link out: nothing third-party loads
// until the visitor chooses to leave the site.

const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

// YouTube ids are 11 chars today, but the length has changed before and short
// links get pasted with tracking params attached. Match the shape, not a count.
const ID_SHAPE = /^[\w-]{6,20}$/;

/** The video id from any YouTube URL shape, or null if it isn't one. */
export function youtubeId(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname)) return null;

  if (u.hostname.endsWith('youtu.be')) {
    const id = u.pathname.slice(1);
    return ID_SHAPE.test(id) ? id : null;
  }
  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v') || '';
    return ID_SHAPE.test(id) ? id : null;
  }
  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,20})/);
  return m ? m[1] : null;
}

/** Canonical watch URL. Stored in media_url so the DB never holds a bare id. */
export const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** The two kinds that render as "poster + one button", not as an image. */
export const isVideoKind = (kind) => kind === 'video' || kind === 'youtube';
