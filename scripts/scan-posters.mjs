// scan-posters.mjs — surveys a folder tree and reports every raster image with
// its pixel dimensions, grouped by size.
//
// Run:  node scan-posters.mjs "<folder>" ["<folder>" ...]
//
// This is the reconnaissance step before ingest-posters.mjs. It writes nothing
// and uploads nothing; it just tells you what is out there and at what size, so
// the poster set can be identified before anything touches the database.
//
// Uses the sharp already installed here for the image pipeline. No new
// dependency, and it must live in /scripts so Node resolves sharp from
// scripts/node_modules.

import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const ROOTS = process.argv.slice(2);
if (!ROOTS.length) {
  console.error('Usage: node scan-posters.mjs "<folder>" ["<folder>" ...]');
  process.exit(1);
}

const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);
// Working directories and raw material, never finished work.
const SKIP = /node_modules|Auto-Save|Previews|Captured|Installers|[Tt]extures|Mockups|\.git|Brushes/;
const MAX_DEPTH = 5;

const rows = [];
async function walk(dir, depth = 0) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory, skip rather than abort the whole scan
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) {
      await walk(p, depth + 1);
    } else if (EXT.has(extname(e.name).toLowerCase())) {
      try {
        const [meta, s] = await Promise.all([sharp(p).metadata(), stat(p)]);
        rows.push({ path: p, w: meta.width, h: meta.height, kb: Math.round(s.size / 1024) });
      } catch {
        /* not a readable image */
      }
    }
  }
}

for (const root of ROOTS) await walk(root);

const bySize = new Map();
for (const r of rows) {
  const key = `${r.w}x${r.h}`;
  bySize.set(key, (bySize.get(key) || 0) + 1);
}

console.log(`\nScanned ${ROOTS.length} root(s). ${rows.length} images found.\n`);
console.log('Most common sizes:');
[...bySize.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([size, n]) => console.log(`  ${size.padEnd(12)} ${n}`));

// 4:5 is the poster/social ratio in play here. Reported separately because the
// exact 2160x2700 target may be a subset of a family of 4:5 exports.
const fourFive = rows.filter((r) => r.w && r.h && Math.abs(r.w / r.h - 0.8) < 0.01);
console.log(`\n4:5 ratio images: ${fourFive.length}`);
console.log(`exactly 2160x2700: ${rows.filter((r) => r.w === 2160 && r.h === 2700).length}`);

const out = new URL('./scan-result.json', import.meta.url);
await writeFile(out, JSON.stringify(rows, null, 2));
console.log(`\nFull list written to scripts/scan-result.json (${rows.length} rows).`);
