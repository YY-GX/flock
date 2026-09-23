#!/usr/bin/env node
/**
 * The photographs the repository is allowed to carry.
 *
 *   npm run photos:web              only what is new or changed
 *   npm run photos:web -- --force   re-encode everything
 *   npm run photos:web -- --prune   also delete web files with no original
 *   npm run photos:web -- --check   verify the committed set, write nothing
 *
 * ---------------------------------------------------------------- why
 *
 * src/assets/photos is 1,278 files and 6.62 GB — originals up to 7952 px and
 * 62.6 MB. They live in Cloudflare R2 now (PUBLIC_ORIGINALS_BASE) and they are
 * not going into git. But a build has to have pixels to work from, so this
 * writes a second, committed set into photos-web/ that is small enough to live
 * in the repository and large enough that nothing on the site is ever upscaled.
 *
 * "Large enough" is a number, not a feeling. The widest transform the site
 * asks for is MAX_W in src/lib/panelData.ts (1200 px, webp q80) — <BirdThumb />
 * builds its plates at 2x the CSS box and the largest box on the site is
 * 240 px, i.e. 480. So anything above 1200 covers every transform, and the
 * margin above it is headroom for a future retina bump. This script reads
 * MAX_W out of panelData.ts and refuses to run if WEB_W is not clear of it —
 * a web set at or below MAX_W would also silently kill the "view the original"
 * link, which `originalOf()` only offers when `asset.width > MAX_W`.
 *
 * ---------------------------------------------------------------- the numbers
 *
 * All 1,278 encoded, whole set, real bytes (the first two extrapolated from a
 * deterministic 1-in-9 sample, because writing three gigabytes to find out
 * they are three gigabytes is not a good use of a morning):
 *
 *   png,  1400 px, level 9      ~3400 MB      out
 *   png,  1400 px, palette q90   ~930 MB      out
 *   webp, 1600 px, q88            220.7 MB    <- chosen
 *   webp, 1400 px, q88            183.4 MB
 *
 * 1600 rather than 1400 for 37 MB: it is a third clear of MAX_W instead of a
 * sixth, so the day somebody raises MAX_W to 1400 for retina plates the set
 * still covers it. Both are a quarter of what GitHub asks repositories to
 * stay under, so the 37 MB buys headroom out of slack nobody was using.
 *
 * PNG is impossible: 1,115 of the 1,278 are .png and most of those are
 * photographs, not screenshots. WebP it is, which means the web copy of
 * "<id>-0.png" is "<id>-0.webp" — see the note on names below.
 *
 * q88 rather than q80 because these files are a *source*, not a delivery
 * format: Astro re-encodes them to webp q80 at 1200. Measured against a plate
 * built straight from the original, the plate built by way of this set comes
 * out at 38.4 dB PSNR (worst of 16 sampled: 31.1 dB) — generation loss you
 * cannot see.
 *
 * ---------------------------------------------------------------- names
 *
 * The stem is preserved exactly: photos.json says "<photoId>-<n>.png" and the
 * web file is "<photoId>-<n>.webp". Three lookups in src/ already expect the
 * extension to disagree with photos.json and fall back to the stem —
 * src/lib/images.ts (photoAsset), BirdThumb's focal table, and focal.json
 * itself — so the site resolves either way. Two things match on the full name
 * and do not fall back: scripts/og-cards.mjs and src/lib/photoBytes.mjs. The
 * first is handled by scripts/og-cards-guard.mjs; the second is what
 * manifest.json below is for.
 *
 * ---------------------------------------------------------------- manifest
 *
 * photos-web/manifest.json is written beside the files and committed. It maps
 * the photos.json name to the web name, the *original's* byte size, and the
 * web file's pixel size. The byte size is the interesting one: the bird panel
 * prints "Original · 12 MB" beside the R2 link, and it gets that number by
 * stat()ing src/assets/photos. On a machine that only has the web set, that
 * number would be the web file's size — a 62 MB download advertised as 300 KB.
 * Nothing reads the manifest yet: src/lib/photoBytes.mjs is not this script's
 * to edit. Four lines there — prefer photos-web/manifest.json when it exists,
 * fall back to stat()ing the directory — and the number is honest again
 * everywhere. Until then the label is only right on a machine that has the
 * originals.
 *
 * ---------------------------------------------------------------- determinism
 *
 * Same input, same bytes out: fixed width/quality/effort, EXIF rotation baked
 * in (webp carries no orientation tag, so an unrotated source would ship
 * sideways), alpha dropped only when the image is provably opaque, metadata
 * stripped by sharp's default, and the manifest written with sorted keys.
 * Re-encoding everything from scratch produces a byte-identical tree, so a
 * lost cache costs time and never shows up as a diff.
 *
 * The cache itself is node_modules/.cache/bird-photos-web/manifest.json,
 * keyed on the original's size and mtime plus the encode settings, exactly
 * like scripts/focal-points.mjs and scripts/og-cards.mjs.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINALS = process.env.ORIGINALS_DIR
  ? resolve(ROOT, process.env.ORIGINALS_DIR)
  : resolve(ROOT, 'src/assets/photos');
const OUT = resolve(ROOT, 'photos-web');
const MANIFEST = join(OUT, 'manifest.json');
const CACHE = resolve(ROOT, 'node_modules/.cache/bird-photos-web/manifest.json');
const PHOTOS_JSON = resolve(ROOT, 'src/data/photos.json');

/* Bump when the encode changes, so every file is redrawn. */
const VERSION = 1;

/** Longest edge-width the committed set is allowed to carry. */
const WEB_W = 1600;
const QUALITY = 88;
const EFFORT = 6;

const SOURCE_EXT = /\.(png|jpe?g|webp|avif|gif|tiff?)$/i;
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length - 1));

const args = process.argv.slice(2);
const force = args.includes('--force');
const prune = args.includes('--prune');
const checkOnly = args.includes('--check');

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

/**
 * The widest transform the site asks for, read from the one place that
 * decides it. A hard-coded copy here would drift the first time somebody
 * raised it, and the failure would be silent: plates would start upscaling
 * and the original link would vanish.
 */
async function maxTransformWidth() {
  const src = await readFile(resolve(ROOT, 'src/lib/panelData.ts'), 'utf8');
  const m = src.match(/^const\s+MAX_W\s*=\s*(\d+)\s*;/m);
  if (!m) throw new Error('could not find MAX_W in src/lib/panelData.ts');
  return Number(m[1]);
}

async function listImages(dir) {
  const names = await readdir(dir).catch(() => []);
  return names.filter((n) => !n.startsWith('.') && SOURCE_EXT.test(n)).sort();
}

const webName = (name) => `${name.replace(/\.[^.]+$/, '')}.webp`;

/**
 * One photograph, downscaled. Returns the web file's pixel size.
 *
 * The raw round-trip in the middle is not ceremony: 1,112 of the 1,278 carry
 * an alpha channel they do not use (PNG screenshots and exports are RGBA even
 * when every pixel is opaque), and dropping a channel that says nothing is
 * free size. Asking sharp for `stats()` on the *source* would mean decoding
 * 62 MB twice; asking it on the already-resized raw buffer is a few
 * megabytes and no decode at all. An image with real transparency keeps it.
 */
async function encode(src, dest) {
  const pipe = sharp(src, { failOn: 'none', limitInputPixels: false }).rotate();
  const meta = await pipe.metadata();

  const resized =
    (meta.width ?? 0) > WEB_W ? pipe.resize({ width: WEB_W, withoutEnlargement: true }) : pipe;
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

  let img = sharp(data, raw);
  if (info.channels === 4 && (await sharp(data, raw).stats()).isOpaque) img = img.removeAlpha();

  /* Write beside the target and rename, so an interrupted run never leaves a
     half-written photograph that the next run would happily cache as good. */
  const tmp = `${dest}.tmp-${process.pid}`;
  await img.webp({ quality: QUALITY, effort: EFFORT }).toFile(tmp);
  await rename(tmp, dest);
  return { w: info.width, h: info.height };
}

/* ---------------------------------------------------------------- check */

/**
 * Does the committed set actually cover photos.json? Needs no originals, so
 * CI can run it on a checkout and fail before spending four minutes on sharp.
 */
async function check() {
  const photos = JSON.parse(await readFile(PHOTOS_JSON, 'utf8'));
  const wanted = new Set();
  for (const p of photos) for (const f of p.files ?? []) if (f) wanted.add(f);

  const onDisk = new Set(await listImages(OUT));
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => 'null'));

  const problems = [];
  if (!manifest) problems.push(`${MANIFEST} is missing or unreadable`);
  for (const name of [...wanted].sort()) {
    if (!onDisk.has(webName(name))) problems.push(`no web file for ${name}`);
    else if (manifest && !manifest.files[name]) problems.push(`not in the manifest: ${name}`);
  }
  if (manifest && manifest.width <= (await maxTransformWidth())) {
    problems.push(`manifest width ${manifest.width} is not above MAX_W`);
  }

  const bytes = (await Promise.all([...onDisk].map((n) => stat(join(OUT, n))))).reduce(
    (a, s) => a + s.size,
    0,
  );

  if (problems.length) {
    for (const p of problems.slice(0, 20)) console.error(`photos:web  ${p}`);
    if (problems.length > 20) console.error(`photos:web  …and ${problems.length - 20} more`);
    console.error(`photos:web  FAILED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(
    `photos:web  ok — ${onDisk.size} files, ${mb(bytes)}, covering all ${wanted.size} names in photos.json`,
  );
}

/* ---------------------------------------------------------------- build */

async function build() {
  const maxW = await maxTransformWidth();
  if (WEB_W <= maxW) {
    console.error(
      `photos:web  refusing to run: WEB_W (${WEB_W}) must stay above MAX_W (${maxW}), or ` +
        'every plate is built from a source no bigger than itself and the ' +
        '"view the original" link disappears. Raise WEB_W and re-run with --force.',
    );
    process.exit(1);
  }

  const sources = await listImages(ORIGINALS);
  if (!sources.length) {
    console.error(
      `photos:web  no photographs in ${ORIGINALS}. The originals are not in the ` +
        'repository; fetch them (or set ORIGINALS_DIR) before rebuilding the web set.',
    );
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  await mkdir(dirname(CACHE), { recursive: true });
  const cache = JSON.parse(await readFile(CACHE, 'utf8').catch(() => '{}'));
  const settings = `${VERSION}/${WEB_W}/${QUALITY}/${EFFORT}`;

  const files = {};
  let built = 0;
  let skipped = 0;
  let failed = 0;
  const queue = sources.slice();
  let done = 0;

  async function worker() {
    for (let name; (name = queue.shift()); ) {
      const src = join(ORIGINALS, name);
      const out = webName(name);
      const dest = join(OUT, out);
      const s = await stat(src);
      const key = `${settings}/${s.size}/${Math.round(s.mtimeMs)}`;
      const hit = cache[name];

      let size = hit?.wh;
      if (force || !hit || hit.key !== key || !size || !existsSync(dest)) {
        try {
          size = await encode(src, dest);
          built += 1;
        } catch (err) {
          console.error(`photos:web  ${name}: ${err.message}`);
          failed += 1;
          continue;
        }
      } else {
        skipped += 1;
      }

      cache[name] = { key, wh: size };
      files[name] = { web: out, bytes: s.size, w: size.w, h: size.h };
      if (++done % 100 === 0) process.stderr.write(`photos:web  ${done}/${sources.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  /* Sorted keys: the manifest is committed, and a JSON file whose key order
     follows readdir() would show up as a diff on every machine. */
  const ordered = {};
  for (const k of Object.keys(files).sort()) ordered[k] = files[k];
  await writeFile(
    MANIFEST,
    `${JSON.stringify({ width: WEB_W, quality: QUALITY, version: VERSION, files: ordered }, null, 1)}\n`,
  );
  await writeFile(CACHE, JSON.stringify(cache));

  /* Anything in photos-web/ with no original behind it. Deleting photographs
     is how this project has been hurt before, so say it and stop unless the
     person asked for it in so many words. */
  const keep = new Set(Object.values(ordered).map((f) => f.web));
  const extras = (await listImages(OUT)).filter((n) => !keep.has(n));
  if (extras.length && prune) {
    for (const n of extras) await rm(join(OUT, n));
    console.log(`photos:web  pruned ${extras.length} web file(s) with no original`);
  } else if (extras.length) {
    console.log(
      `photos:web  ${extras.length} web file(s) have no original (${extras.slice(0, 3).join(', ')}${
        extras.length > 3 ? ', …' : ''
      }). Re-run with --prune to delete them.`,
    );
  }

  const total = (await Promise.all([...keep].map((n) => stat(join(OUT, n))))).reduce(
    (a, s) => a + s.size,
    0,
  );
  const originalTotal = Object.values(ordered).reduce((a, f) => a + f.bytes, 0);
  console.log(
    `photos:web  ${keep.size} files at <=${WEB_W}px q${QUALITY} — ${mb(total)} ` +
      `(${mb(originalTotal)} of originals, ${(total / originalTotal * 100).toFixed(1)}%)`,
  );
  console.log(`photos:web  ${built} encoded, ${skipped} unchanged${failed ? `, ${failed} failed` : ''}`);
  if (failed) process.exit(1);
}

await (checkOnly ? check() : build());
