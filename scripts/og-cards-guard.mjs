#!/usr/bin/env node
/**
 * Run scripts/og-cards.mjs, but only when it can draw real cards.
 *
 *   node scripts/og-cards-guard.mjs            (from `prebuild`)
 *   npm run og -- --force                      (--strict: say so and fail)
 *
 * ---------------------------------------------------------------- why
 *
 * og-cards.mjs already refuses to run when src/assets/photos is empty, so a
 * clone without the 6.5 GB keeps the 397 committed cards instead of replacing
 * them with 397 empty frames. That guard tests `onDisk.size`, which was the
 * whole question when the directory was either the originals or nothing.
 *
 * It is not the whole question any more. src/assets/photos can now also hold
 * the committed web set (scripts/photos-stage.mjs), and those files are
 * "<photoId>-<n>.webp" where photos.json says "<photoId>-<n>.png".
 * og-cards.mjs matches on the full name — `onDisk.has(f)` — with no stem
 * fallback, so a directory full of web photographs reads to it as a directory
 * full of strangers: `onDisk.size` is 1,278, `filesOf()` is empty for every
 * bird, and it would cheerfully redraw all 397 cards with no photograph on
 * them. In CI that would then be what got deployed.
 *
 * So the test that matters is not "are there files" but "are these the files
 * photos.json is talking about". That is this script, and og-cards.mjs itself
 * is untouched: on the machine that has the originals it runs exactly as
 * before, and everywhere else the committed cards are left alone.
 *
 * To redraw cards you need the originals in src/assets/photos. `npm run og`
 * passes --strict so that a redraw you asked for fails loudly rather than
 * quietly doing nothing.
 */
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = resolve(ROOT, 'src/assets/photos');
const PHOTOS_JSON = resolve(ROOT, 'src/data/photos.json');
const CARDS = join(ROOT, 'scripts/og-cards.mjs');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const forward = args.filter((a) => a !== '--strict');

const photos = JSON.parse(await readFile(PHOTOS_JSON, 'utf8'));
const wanted = new Set();
for (const p of photos) for (const f of p.files ?? []) if (f) wanted.add(f);

const onDisk = (await readdir(PHOTOS).catch(() => [])).filter((n) => !n.startsWith('.'));
let matched = 0;
for (const n of onDisk) if (wanted.has(n)) matched += 1;
const share = wanted.size ? matched / wanted.size : 0;

if (share < 0.5) {
  const why = !onDisk.length
    ? 'src/assets/photos is empty'
    : `src/assets/photos holds ${onDisk.length} file(s), but only ${matched} of the ` +
      `${wanted.size} names in photos.json are among them — this is the web set, not the originals`;
  const line = `og:  ${why} — keeping the cards already in public/og`;
  if (strict) {
    console.error(line.replace('keeping', 'refusing to redraw; keeping'));
    console.error('og:  put the originals back in src/assets/photos, then run `npm run og` again.');
    process.exit(1);
  }
  console.log(line);
  process.exit(0);
}

const child = spawn(process.execPath, [CARDS, ...forward], { stdio: 'inherit', cwd: ROOT });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
