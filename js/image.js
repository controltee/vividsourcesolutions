// image.js — the one place that knows how to turn a Supabase Storage URL into
// a responsive, optimized image URL. Used by home.js and project.js.
//
// Today: Supabase's on-the-fly image transform (storage/v1/render/image),
// since the offline pipeline (scripts/optimize-images.mjs) hasn't processed
// these files yet. When it has, and assets are re-pointed at stored AVIF/WebP
// variants, this is the only file that needs to change.
//
// The transform endpoint does NOT infer height from width — passing width
// alone stretches the image to the source's full height (verified against the
// live endpoint). Height must always be computed from the known aspect ratio
// and passed explicitly, so every call here requires the source dimensions.

import { SUPABASE_URL } from './config.js';

export const WIDTHS = [640, 1280, 1920];

export function transformUrl(rawUrl, width, sourceW, sourceH, quality = 75) {
  if (!rawUrl || !rawUrl.includes('/object/public/')) return null;
  if (!sourceW || !sourceH) return null; // no known aspect ratio — never risk a distorted crop
  const path = rawUrl.split('/object/public/')[1];
  const height = Math.round((width * sourceH) / sourceW);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${path}?width=${width}&height=${height}&quality=${quality}`;
}

/** Builds a <picture> for `rawUrl` sized by `sourceW`/`sourceH`, or a plain
 * <img> (no srcset, original bytes) if dimensions are unknown. */
export function pictureFor(rawUrl, sourceW, sourceH, { alt, sizes, loading, priority } = {}) {
  const srcset = transformUrl(rawUrl, 1280, sourceW, sourceH)
    ? WIDTHS.map((w) => `${transformUrl(rawUrl, w, sourceW, sourceH)} ${w}w`).join(', ')
    : null;

  const img = document.createElement('img');
  img.src = transformUrl(rawUrl, 1280, sourceW, sourceH) || rawUrl;
  if (srcset) {
    img.srcset = srcset;
    img.sizes = sizes || '100vw';
  }
  if (sourceW) img.width = sourceW;
  if (sourceH) img.height = sourceH;
  img.alt = alt ?? '';
  img.loading = loading || 'lazy';
  img.decoding = 'async';
  if (priority) img.fetchPriority = 'high';
  if (sourceW && sourceH) img.style.aspectRatio = `${sourceW} / ${sourceH}`;

  if (!srcset) return img;

  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/webp';
  source.srcset = srcset;
  source.sizes = sizes || '100vw';
  picture.append(source, img);
  return picture;
}
