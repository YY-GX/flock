#!/usr/bin/env node
/**
 * Put photographs where the build expects them.
 *
 *   npm run photos:stage     (also runs as part of `prebuild`)
 *
 * Every component reaches its pictures through src/lib/images.ts, which globs
 * `../assets/photos/*`. That path is not negotiable and rewriting it in a
 * dozen files to point somewhere else would be the worst way to solve this.
 * So src/assets/photos stays the build input and the *contents* change:
 *
 *   a machine with the originals   6.62 GB, gitignored, nothing to do here
 *   a fresh clone or CI            empty, so photos-web/ is linked into it
 *
 * The originals win when they are present, which means the person who has
 * them keeps building from them — full resolution, honest byte sizes on the
 * "view the original" link, and og-cards drawing from real files. Nothing
 * about the local workflow changes. CI, which has only what git carries, gets
 * the committed web set and builds the same 397 pages from it.
 *
 * Hard links where the filesystem allows them, so staging 1,278 files costs
 * no disk and no time; a copy when it does not (a different mount, Windows).
 *
 * Idempotent: it tops up whatever is missing and leaves the rest alone, so an
 * interrupted run is fixed by running it again.
 */
import { copyFile, link, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = resolve(ROOT, 'src/assets/photos');
const WEB = resolve(ROOT, 'photos-web');
const PHOTOS_JSON = resolve(ROOT, 'src/data/photos.json');

const IMAGE = /\.(png|jpe?g|webp|avif|gif|tiff?)$/i;

const images = async (dir) =>
  (await readdir(dir).catch(() => [])).filter((n) => !n.startsWith('.') && IMAGE.test(n));

/**
 * Is what is sitting in src/assets/photos the originals?
 *
 * photos.json names files with their original extension, and the web set is
 * all .webp, so the test is simply whether the names on disk are the names in
 * photos.json. It comes out at ~100% for the originals and 0% for the web
 * set; anything in between is a half-populated directory and is treated as
 * not-the-originals, which is the safe way round — the worst case is that we
 * link in a few web files beside them.
 */
export async function holdsOriginals(onDisk) {
  const photos = JSON.parse(await readFile(PHOTOS_JSON, 'utf8'));
  const wanted = new Set();
  for (const p of photos) for (const f of p.files ?? []) if (f) wanted.add(f);
  if (!wanted.size) return false;
  let hit = 0;
  for (const name of onDisk) if (wanted.has(name)) hit += 1;
  return hit / wanted.size >= 0.5;
}

const present = await images(DEST);
if (await holdsOriginals(present)) {
  console.log(`photos:stage  ${present.length} originals in src/assets/photos — nothing to stage`);
  process.exit(0);
}

const web = await images(WEB);
if (!web.length) {
  console.log(
    'photos:stage  no photographs anywhere (src/assets/photos is empty and photos-web/ has ' +
      'no files) — the build will render hollow frames',
  );
  process.exit(0);
}

await mkdir(DEST, { recursive: true });
const have = new Set(present);
let linked = 0;
let copied = 0;
for (const name of web) {
  if (have.has(name)) continue;
  const from = join(WEB, name);
  const to = join(DEST, name);
  try {
    await link(from, to);
    linked += 1;
  } catch (err) {
    if (err.code === 'EEXIST') continue;
    await copyFile(from, to);
    copied += 1;
  }
}

if (!linked && !copied) console.log(`photos:stage  ${web.length} web photographs already staged`);
else
  console.log(
    `photos:stage  staged ${linked + copied} of ${web.length} web photographs into ` +
      `src/assets/photos (${linked} linked, ${copied} copied)`,
  );
