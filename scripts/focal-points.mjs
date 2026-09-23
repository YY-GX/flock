#!/usr/bin/env node
/**
 * Where is the bird? One focal point per photograph, for `object-position`.
 *
 *   npm run focal              only files that are new or changed since last run
 *   npm run focal -- --force   recompute everything (hand-set entries survive)
 *   npm run focal -- --only 367187338e8280dea9abced7b5ecf190-0.png
 *
 * Writes src/data/focal.json:
 *
 *   {
 *     "367187338e8280dea9abced7b5ecf190-0.png": {
 *       "x": 41, "y": 48,            // focal point, % of the displayed image
 *       "w": 1647, "h": 923,         // pixel size after EXIF rotation
 *       "by": "auto",                // "auto" = this script; "hand" = a person
 *       "mtime": 1758245600          // file mtime (s) the auto value was made for
 *     }
 *   }
 *
 * The estimate comes from sharp's `attention` crop strategy — the region of
 * highest edge density and saturation — which for a bird photograph is usually
 * the bird, but it is a heuristic, not a bird detector. To correct one by hand
 * edit x/y in the JSON and set "by": "hand"; the script never touches those.
 * A file missing from the JSON simply falls back to a centred crop in
 * <BirdThumb />.
 *
 * Cache: an "auto" entry is kept while the file's mtime matches, so a re-run
 * over 1,278 files that have not changed takes well under a second.
 */
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = resolve(ROOT, 'src/assets/photos');
const OUT = resolve(ROOT, 'src/data/focal.json');

/* Work on a copy no wider than this; saliency does not need 48 megapixels. */
const WORK = 640;
/* Centre prior for the saliency pass — see focalPoint(). */
const VIGNETTE_R = '72%';
const VIGNETTE_A = 0.85;
/* Threads: PNG decode is the slow part and it is single-threaded per file. */
const CONCURRENCY = Math.max(2, Math.min(8, (await import('node:os')).default.cpus().length - 1));

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

/**
 * Two attention passes on the downscaled copy:
 *   1. the largest square that fits → the focal coordinate along the long axis
 *      (sharp reports the crop's centre of attention at source resolution)
 *   2. inside that square, a half-height (or half-width) strip → the other axis
 * Each pass only ever moves along one axis, so together they give a point.
 */
async function focalPoint(file) {
  const src = sharp(file, { failOn: 'none', limitInputPixels: false }).rotate();
  const meta = await src.metadata();
  const swap = meta.orientation != null && meta.orientation >= 5;
  const W = swap ? meta.height : meta.width;
  const H = swap ? meta.width : meta.height;
  if (!W || !H) throw new Error('no dimensions');

  const scale = Math.min(1, WORK / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const plain = await src.resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  /* Centre prior. Raw attention latches onto twigs and foliage at the frame
     edge in about a third of these photographs, while the photographer has
     put the bird somewhere near the middle. Darkening the edges before the
     saliency pass (fewer edges, less saturation out there) is a cheap way to
     say "prefer the middle unless the edge is really where the action is". */
  const vignette = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><radialGradient id="g" cx="50%" cy="46%" r="${VIGNETTE_R}">` +
      `<stop offset="0.38" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="${VIGNETTE_A}"/>` +
      `</radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const small = await sharp(plain).composite([{ input: vignette }]).png().toBuffer();

  const side = Math.min(w, h);
  const pass1 = await sharp(small)
    .resize(side, side, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true });
  const left = Math.max(0, Math.min(w - side, -(pass1.info.cropOffsetLeft ?? 0)));
  const top = Math.max(0, Math.min(h - side, -(pass1.info.cropOffsetTop ?? 0)));

  let x, y;
  if (w >= h) {
    x = pass1.info.attentionX ?? left + side / 2;
    // pass 2: within the chosen square, find the row band
    const band = Math.max(1, Math.round(side / 2));
    const pass2 = await sharp(small)
      .extract({ left, top: 0, width: side, height: side })
      .resize(side, band, { fit: 'cover', position: sharp.strategy.attention })
      .toBuffer({ resolveWithObject: true });
    y = pass2.info.attentionY ?? side / 2;
  } else {
    y = pass1.info.attentionY ?? top + side / 2;
    const band = Math.max(1, Math.round(side / 2));
    const pass2 = await sharp(small)
      .extract({ left: 0, top, width: side, height: side })
      .resize(band, side, { fit: 'cover', position: sharp.strategy.attention })
      .toBuffer({ resolveWithObject: true });
    x = (pass2.info.attentionX ?? side / 2) + 0; // relative to the square, which starts at x=0
  }

  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  return { x: clamp((x / w) * 100), y: clamp((y / h) * 100), w: W, h: H };
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const t0 = Date.now();
  const existing = await loadExisting();
  const names = (await readdir(PHOTOS))
    .filter((n) => /\.(jpe?g|png|webp|avif)$/i.test(n))
    .filter((n) => !only || n === only)
    .sort();

  const out = {};
  const todo = [];
  for (const name of names) {
    const st = await stat(resolve(PHOTOS, name));
    const mtime = Math.round(st.mtimeMs / 1000);
    const prev = existing[name];
    if (prev && prev.by === 'hand') {
      out[name] = { ...prev, mtime };
      continue;
    }
    if (prev && prev.by === 'auto' && prev.mtime === mtime && !force) {
      out[name] = prev;
      continue;
    }
    todo.push({ name, mtime });
  }
  // keep hand entries whose file has gone (someone may restore it), drop stale autos
  for (const [name, entry] of Object.entries(existing)) {
    if (!out[name] && entry.by === 'hand' && !only) out[name] = entry;
  }

  let done = 0;
  let failed = 0;
  const queue = todo.slice();
  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      try {
        const fp = await focalPoint(resolve(PHOTOS, job.name));
        out[job.name] = { ...fp, by: 'auto', mtime: job.mtime };
      } catch (err) {
        failed++;
        process.stderr.write(`\n  ! ${job.name}: ${err.message}\n`);
      }
      done++;
      if (done % 25 === 0 || done === todo.length) {
        process.stderr.write(`\r  ${done}/${todo.length} computed`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (todo.length) process.stderr.write('\n');

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(sorted, null, 1) + '\n');

  const hand = Object.values(sorted).filter((e) => e.by === 'hand').length;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `focal: ${Object.keys(sorted).length} entries (${todo.length} computed, ${names.length - todo.length} cached, ${hand} by hand${failed ? `, ${failed} failed` : ''}) in ${secs}s → src/data/focal.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
