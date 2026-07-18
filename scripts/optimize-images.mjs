#!/usr/bin/env node
// optimize-images.mjs — offline image pipeline. Dev-only; never runs on the
// server (see CLAUDE.md / build spec §10). Usage:
//
//   npm run img -- ./raw/kingvale
//
// For every image in the given folder, emits AVIF (q55) and WebP (q80) at
// widths 640/1280/1920 (never upscaling past the source), strips EXIF except
// the color profile, and writes ./out/<folder-name>/ plus a manifest.json the
// admin panel reads to fill in assets.width / assets.height.

import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, basename, extname, parse } from 'node:path';
import sharp from 'sharp';

const WIDTHS = [640, 1280, 1920];
const AVIF_QUALITY = 55;
const WEBP_QUALITY = 80;
const WARN_BYTES = 400 * 1024; // 400KB
const SOURCE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: npm run img -- <folder-of-source-images>');
    process.exit(1);
  }

  const inputDir = inputArg;
  const folderName = basename(inputDir.replace(/[\\/]+$/, ''));
  const outputDir = join('out', folderName);
  await mkdir(outputDir, { recursive: true });

  const entries = await readdir(inputDir, { withFileTypes: true });
  const sourceFiles = entries
    .filter((e) => e.isFile() && SOURCE_EXTS.has(extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();

  if (!sourceFiles.length) {
    console.error(`No source images found in ${inputDir} (looked for ${[...SOURCE_EXTS].join(', ')})`);
    process.exit(1);
  }

  const manifest = [];
  let totalBefore = 0;
  let totalAfter = 0; // sum of every generated file — a raw disk-usage figure, not a page-weight one
  let totalServed = 0; // sum of the largest-width WebP per image — what a real page actually downloads
  let anyOversize = false;

  for (const file of sourceFiles) {
    const srcPath = join(inputDir, file);
    const { name } = parse(file);
    const srcStat = await stat(srcPath);
    totalBefore += srcStat.size;

    const srcImage = sharp(srcPath).rotate(); // .rotate() with no args = auto-orient from EXIF, then strip it
    const meta = await srcImage.metadata();
    const sourceW = meta.width;
    const sourceH = meta.height;

    const variants = [];
    const widthsToEmit = WIDTHS.filter((w) => w <= sourceW);
    if (!widthsToEmit.length) widthsToEmit.push(sourceW); // source narrower than the smallest step

    for (const width of widthsToEmit) {
      for (const format of ['avif', 'webp']) {
        const outName = `${name}-${width}.${format}`;
        const outPath = join(outputDir, outName);

        const pipeline = sharp(srcPath)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .withMetadata({ orientation: undefined }); // keep ICC color profile, drop the rest of EXIF

        if (format === 'avif') pipeline.avif({ quality: AVIF_QUALITY });
        else pipeline.webp({ quality: WEBP_QUALITY });

        const info = await pipeline.toFile(outPath);
        totalAfter += info.size;

        if (info.size > WARN_BYTES) {
          anyOversize = true;
          console.warn(
            `  ⚠ ${outName} is ${(info.size / 1024).toFixed(0)}KB — over the 400KB target`
          );
        }

        variants.push({ width: info.width, format, path: `${folderName}/${outName}`, bytes: info.size });
      }
    }

    manifest.push({ name, width: sourceW, height: sourceH, variants });

    // The representative "served size" is the largest-width WebP variant —
    // the realistic file a full-viewport visitor downloads, and the fair
    // comparison against the single raw source file. (Summing every
    // generated width×format variant would compare 1 source file against 4
    // output files and produce a meaningless, unflatteringly-small number.)
    const largestWebp = variants.filter((v) => v.format === 'webp').at(-1);
    totalServed += largestWebp.bytes;

    console.log(
      `  ${file}  (${sourceW}x${sourceH}, ${(srcStat.size / 1024).toFixed(0)}KB)  →  ${widthsToEmit.length * 2} variants, served ~${(largestWebp.bytes / 1024).toFixed(0)}KB`
    );
  }

  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const servedSavedPct = totalBefore ? (100 * (1 - totalServed / totalBefore)).toFixed(0) : 0;
  console.log('');
  console.log(`${sourceFiles.length} image(s) processed → ${outputDir}/`);
  console.log(
    `Source: ${(totalBefore / 1024).toFixed(0)}KB   Served (largest WebP): ${(totalServed / 1024).toFixed(0)}KB   Saved: ${servedSavedPct}%`
  );
  console.log(
    `(All ${WIDTHS.length} widths × 2 formats on disk: ${(totalAfter / 1024).toFixed(0)}KB total — that's disk usage, not page weight, since a real page only downloads one variant per image.)`
  );
  if (anyOversize) {
    console.warn('Some outputs exceed 400KB — see warnings above.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
