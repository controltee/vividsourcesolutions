// ingest-posters.mjs — bulk-loads finished artwork into the site as DRAFTS.
//
//   npm run ingest -- --dry-run     say what would happen, touch nothing
//   npm run ingest                  actually upload and insert
//
// Reads ingest-manifest.json. For each project it compresses every image to
// WebP (long edge capped at 1920, the same treatment the admin panel applies),
// uploads to the portfolio_assets bucket, then inserts the project row and its
// project_media rows.
//
// SAFETY, by design:
//   * Every project is created with is_published = false. Nothing reaches the
//     live site until it is switched to Live in /admin.
//   * The slug is the idempotency key. A project whose slug already exists is
//     skipped whole, so re-running after a partial failure cannot duplicate
//     work. This is what stops a second run creating "tsukuru-2".
//   * Alt text is required per image and validated up front, because the whole
//     point of writing it by hand is that it is not left empty like the 121
//     rows the admin's bulk uploader created.
//
// No new dependency: plain fetch against PostgREST plus the sharp already here
// for the image pipeline.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET = 'portfolio_assets';
const MAX_DIMENSION = 1920;
const WARN_BYTES = 500 * 1024;
// Lower than the admin panel's 0.82. These posters are heavy grain and halftone,
// which is the worst case for WebP: at 0.82 every one landed near 900KB. 0.72
// takes roughly 25% off with no visible loss in the texture, which is the only
// place it would show. Page weight is unaffected either way, since image.js
// serves through Supabase's transform endpoint at its own quality and never
// hands the stored original to the grid.
const QUALITY = 72;

const manifest = JSON.parse(new TextDecoder().decode(await readFile(new URL('./ingest-manifest.json', import.meta.url))));

// --- Validate the manifest before touching the network ----------------------
const problems = [];
for (const p of manifest.projects) {
  if (!p.title || !p.slug || !p.categoryId) problems.push(`${p.slug || p.title}: missing title, slug or categoryId`);
  if (!p.images?.length) problems.push(`${p.slug}: no images`);
  for (const img of p.images || []) {
    if (!img.alt?.trim()) problems.push(`${p.slug}: image ${img.file} has no alt text`);
  }
}
if (problems.length) {
  console.error('\nManifest problems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

// --- Auth -------------------------------------------------------------------
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.CT_ADMIN_EMAIL, password: process.env.CT_ADMIN_PASSWORD }),
});
if (!auth.ok) {
  console.error('Sign in failed. Run `npm run check-auth` first.');
  process.exit(1);
}
const { access_token } = await auth.json();
const authHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` };

const rest = async (path, init = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...authHeaders, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  // PostgREST returns 201 with an EMPTY body unless Prefer: return=representation
  // is set, so parsing unconditionally blows up on every plain insert. Read the
  // text first and only parse when there is something to parse.
  const text = await r.text();
  return text ? JSON.parse(text) : null;
};

// --- Work -------------------------------------------------------------------
const existing = await rest('projects?select=slug');
const taken = new Set(existing.map((p) => p.slug));

console.log(DRY_RUN ? '\nDRY RUN. Nothing will be written.\n' : '\nIngesting. Everything lands as a DRAFT.\n');

let created = 0;
let skipped = 0;

for (const project of manifest.projects) {
  if (taken.has(project.slug)) {
    console.log(`SKIP  ${project.slug}  (a project with this slug already exists)`);
    skipped += 1;
    continue;
  }

  console.log(`\n${DRY_RUN ? 'WOULD CREATE' : 'CREATE'}  ${project.title}  (${project.slug})`);
  console.log(`   ${project.images.length} image(s), layout=${project.layout}, date=${project.dateMade}`);

  // Compress everything first so a bad file fails before any row is inserted.
  const prepared = [];
  for (const img of project.images) {
    const abs = join(manifest.root, img.file);
    const buf = await sharp(abs)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });
    prepared.push({ ...img, data: buf.data, width: buf.info.width, height: buf.info.height });
    const kb = Math.round(buf.data.length / 1024);
    console.log(`     ${img.file}  ->  ${buf.info.width}x${buf.info.height}  ${kb}KB${buf.data.length > WARN_BYTES ? '  (over the 500KB target)' : ''}`);
  }

  if (DRY_RUN) {
    created += 1;
    continue;
  }

  const upload = async (data, name) => {
    const path = `${project.slug}/${name}-${Date.now()}.webp`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'image/webp' },
      body: data,
    });
    if (!r.ok) throw new Error(`upload ${path} -> ${r.status} ${await r.text()}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  };

  // The first image doubles as the card banner, matching how the admin sets a
  // cover. Uploaded twice under different names so replacing the cover later
  // cannot orphan a gallery image.
  const cover = prepared[0];
  const coverUrl = await upload(cover.data, 'cover');

  const [row] = await rest('projects', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      title: project.title,
      slug: project.slug,
      category_id: project.categoryId,
      client_id: project.clientId,
      summary: project.summary || null,
      description: project.description || null,
      date_made: project.dateMade || null,
      services: project.services || [],
      layout: project.layout || 'gallery',
      is_published: false,
      cover_url: coverUrl,
      banner_w: cover.width,
      banner_h: cover.height,
      sort_order: 0,
    }),
  });
  console.log(`     project row created, id=${row.id}, is_published=false`);

  for (const [i, img] of prepared.entries()) {
    const url = await upload(img.data, `gallery-${i}`);
    await rest('project_media', {
      method: 'POST',
      body: JSON.stringify({
        project_id: row.id,
        media_url: url,
        width: img.width,
        height: img.height,
        kind: 'image',
        alt: img.alt,
        sort_order: i,
      }),
    });
    console.log(`     media ${i} uploaded with alt text`);
  }
  created += 1;
}

console.log(
  `\n${DRY_RUN ? 'Would create' : 'Created'} ${created} project(s), skipped ${skipped}.` +
    (DRY_RUN ? '\nRun without --dry-run to apply.' : '\nAll drafts. Publish them in /admin when you are happy.')
);
