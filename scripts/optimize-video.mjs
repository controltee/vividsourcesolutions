#!/usr/bin/env node
// optimize-video.mjs — offline video pipeline, the twin of optimize-images.mjs.
// Dev-only; never runs on the server. Usage:
//
//   npm run vid -- ./raw/showreel.mp4          one file
//   npm run vid -- ./raw/motion                every video in a folder
//
// For each source it writes, into ./out/video/:
//   <name>.mp4      H.264 + AAC, faststart — plays everywhere, including
//                   older iOS Safari, which is why this is the one we upload
//   <name>.webm     VP9 + Opus — usually 25-40% smaller where it's supported
//   <name>.jpg      a poster frame grabbed at 1s, ready for the admin's
//                   "Poster still" control
// and prints the size of each so you know before uploading whether it belongs
// in Supabase Storage at all.
//
// WHY NOT IN THE BROWSER
// Real transcoding means ffmpeg. In a page that is either a ~30MB wasm build
// (a new runtime dependency, which this project does not allow) or a server we
// do not have. So it happens here, once, on your machine — same shape as the
// image pipeline.
//
// REQUIRES ffmpeg on PATH. It is free and open source, and it is NOT an npm
// package — nothing is added to package.json by installing it:
//   macOS    brew install ffmpeg
//   Windows  winget install Gyan.FFmpeg
//   Linux    sudo apt install ffmpeg

import { spawn } from 'node:child_process';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const OUT_DIR = join('out', 'video');
const SOURCE_EXTS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.mpg', '.mpeg']);

// 1080p is the ceiling: this is a portfolio still, not a cinema. -2 keeps the
// height even (H.264 requires it) and preserves the aspect ratio.
const MAX_HEIGHT = 1080;
const SCALE = `scale=-2:'min(${MAX_HEIGHT},ih)'`;

// CRF is quality, not bitrate: the encoder spends whatever bits the picture
// needs. 23/32 are the "visually fine, meaningfully smaller" settings for
// H.264 and VP9 respectively. Raise them if a clip is still too heavy.
const H264_CRF = 23;
const VP9_CRF = 32;

// Anything past this really should be on YouTube — see the note printed at the
// end of a run. Matches WARN_VIDEO_BYTES in admin/admin.js.
const WARN_BYTES = 6 * 1024 * 1024;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) =>
      reject(
        err.code === 'ENOENT'
          ? new Error(`${cmd} is not installed or not on PATH. See the header of this file.`)
          : err
      )
    );
    // ffmpeg writes all its progress to stderr, so only surface it on failure —
    // the last few lines are where the actual reason lives.
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}:\n${stderr.trim().split('\n').slice(-6).join('\n')}`))
    );
  });
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

async function sizeOf(path) {
  return (await stat(path)).size;
}

async function convert(sourcePath) {
  const name = basename(sourcePath, extname(sourcePath)).replace(/[^\w-]+/g, '-').toLowerCase();
  const mp4 = join(OUT_DIR, `${name}.mp4`);
  const webm = join(OUT_DIR, `${name}.webm`);
  const poster = join(OUT_DIR, `${name}.jpg`);

  process.stdout.write(`\n${basename(sourcePath)} (${mb(await sizeOf(sourcePath))})\n`);

  // -movflags +faststart puts the index at the front of the file, so the video
  // starts playing on the first chunk instead of after the whole download.
  process.stdout.write('  mp4  … ');
  await run('ffmpeg', [
    '-y', '-i', sourcePath,
    '-vf', SCALE,
    '-c:v', 'libx264', '-crf', String(H264_CRF), '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    mp4,
  ]);
  const mp4Bytes = await sizeOf(mp4);
  process.stdout.write(`${mb(mp4Bytes)}\n`);

  process.stdout.write('  webm … ');
  await run('ffmpeg', [
    '-y', '-i', sourcePath,
    '-vf', SCALE,
    '-c:v', 'libvpx-vp9', '-crf', String(VP9_CRF), '-b:v', '0', '-row-mt', '1',
    '-c:a', 'libopus', '-b:a', '96k',
    webm,
  ]);
  process.stdout.write(`${mb(await sizeOf(webm))}\n`);

  // 1s in, not 0s: the first frame of a lot of motion work is a black fade-in.
  process.stdout.write('  jpg  … ');
  await run('ffmpeg', ['-y', '-ss', '1', '-i', sourcePath, '-frames:v', '1', '-vf', SCALE, '-q:v', '3', poster]);
  process.stdout.write(`${mb(await sizeOf(poster))}\n`);

  return { name, mp4Bytes };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run vid -- <video-file-or-folder>');
    process.exit(1);
  }

  const info = await stat(input).catch(() => null);
  if (!info) {
    console.error(`No such file or folder: ${input}`);
    process.exit(1);
  }

  let sources;
  if (info.isDirectory()) {
    const entries = await readdir(input, { withFileTypes: true });
    sources = entries
      .filter((e) => e.isFile() && SOURCE_EXTS.has(extname(e.name).toLowerCase()))
      .map((e) => join(input, e.name))
      .sort();
  } else {
    sources = [input];
  }

  if (!sources.length) {
    console.error(`No videos found in ${input} (looked for ${[...SOURCE_EXTS].join(', ')})`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const heavy = [];
  for (const source of sources) {
    const { name, mp4Bytes } = await convert(source);
    if (mp4Bytes > WARN_BYTES) heavy.push(`${name}.mp4 (${mb(mp4Bytes)})`);
  }

  console.log(`\nDone. ${sources.length} video(s) → ./${OUT_DIR}/`);
  console.log('Upload the .mp4 in the admin panel, then set its poster to the matching .jpg.');
  if (heavy.length) {
    console.log(
      `\nStill heavy after compression: ${heavy.join(', ')}.\n` +
        'Put these on YouTube and paste the link into the admin panel instead — a file this\n' +
        "size in Supabase Storage spends the free tier's monthly egress in a few hundred plays."
    );
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
