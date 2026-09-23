#!/usr/bin/env node
/**
 * Is what we are about to publish actually the site?
 *
 *   npm run verify              check dist/ against scripts/build-expect.json
 *   npm run verify -- --update  write today's numbers into that file instead
 *
 * ---------------------------------------------------------------- why
 *
 * Two things can go wrong between `astro build` and a green deploy, and
 * neither of them fails the build.
 *
 * The first is src/integrations/prune-originals.mjs. It keeps a built image
 * only if its file name appears verbatim somewhere in the built text, which is
 * the right rule and a sharp one: it has already deleted 1,042 photographs in
 * one run. A build where it over-reaches still exits 0 — you only find out by
 * opening a page and seeing a hole. So the load-bearing check here is not a
 * count at all, it is: every local URL the built site references resolves to a
 * file that is still on disk.
 *
 * The second is the photographs themselves. CI builds from the committed web
 * set, not the 6.62 GB of originals (scripts/photos-web.mjs), and it skips the
 * OG redraw (scripts/og-cards-guard.mjs). Both of those are meant to produce
 * the same site the originals do. The counts prove it: same pages, same number
 * of image transforms, same 397 cards. If swapping the input ever changes the
 * shape of the output, this is where it shows up, before it ships.
 *
 * The numbers live in scripts/build-expect.json rather than in this file, so
 * that changing them is a commit somebody reviews.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.DIST_DIR ?? 'dist');
const EXPECT = resolve(ROOT, 'scripts/build-expect.json');

const args = process.argv.slice(2);
const update = args.includes('--update');

const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg']);
const ASSET = /\.(webp|avif|png|jpe?g|gif|svg|css|js|mjs|woff2?|ico|json|xml|txt|webmanifest)$/i;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(DIST).catch(() => null);
if (!files) {
  console.error(`verify  no ${relative(ROOT, DIST)}/ — run the build first`);
  process.exit(1);
}
const onDisk = new Set(files.map((f) => `/${relative(DIST, f).split(/[\\/]/).join('/')}`));

/* ---------------------------------------------------------------- counts */

const count = (re) => files.filter((f) => re.test(f)).length;
const pages = count(/\.html$/i);
const webp = count(/\.webp$/i);
const og = files.filter((f) => /\.jpe?g$/i.test(f) && /(^|[\\/])og[\\/]/.test(f)).length;
const bytes = (await Promise.all(files.map((f) => stat(f)))).reduce((a, s) => a + s.size, 0);

/* ------------------------------------------------- where the site is served */

/*
 * The site is published under a base path (/flock/), so every built URL
 * carries it and none of them are paths inside dist/. Read the prefix off the
 * build instead of hard-coding it here — astro.config.mjs is not this
 * script's to know about, and a base that changed silently is exactly the
 * kind of thing that should make this check fail, not lie.
 */
let base = '/';
for (const f of files.filter((f) => f.endsWith('.html')).slice(0, 5)) {
  const m = (await readFile(f, 'utf8')).match(/["'(]((?:https?:\/\/[^"'()\s]+?)?\/[^"'()\s]*?)_astro\//);
  if (m) {
    base = m[1].replace(/^https?:\/\/[^/]+/, '') || '/';
    break;
  }
}

/** A referenced URL as a path inside dist/, or null when it is not ours. */
function localPath(ref, fromDir) {
  let u = ref.trim();
  if (!u || u.startsWith('#') || u.startsWith('data:') || /^[a-z]+:/i.test(u) === false) {
    /* relative */
    if (!u || u.startsWith('#') || u.startsWith('data:')) return null;
    if (!u.startsWith('/')) u = posix.join(fromDir, u);
  } else if (/^https?:\/\//i.test(u)) {
    const path = u.replace(/^https?:\/\/[^/]+/, '');
    /* Another origin's asset is not ours to check. Ours is anything under
       the base path of a URL that points back at this site. */
    if (!path.startsWith(base)) return null;
    u = path;
  } else {
    return null; /* mailto:, tel:, … */
  }
  u = u.split('#')[0].split('?')[0];
  if (!ASSET.test(u)) return null;
  if (base !== '/' && u.startsWith(base)) u = `/${u.slice(base.length)}`;
  return u.replace(/\/{2,}/g, '/');
}

/* ---------------------------------------------------------------- refs */

const broken = new Map();
let checked = 0;

/*
 * The bird panel does not spell out the URL of every plate. Plates 2..n are
 * front-coded into one string (`encodeMore` in src/lib/panelData.ts): the
 * directory is folded away and only the file name survives, so those plates
 * never appear as an `src=` or a `/_astro/…` path anywhere in the build.
 *
 * That folding stops at the last slash precisely so the pruner can still see
 * the file name — and this is the other half of that bargain. A hashed
 * name in the text with no file behind it is a plate that 404s, which is what
 * 1,042 photographs looked like the day it went wrong.
 *
 * A folded token is two base-36 digits and then the name, and the digits are
 * word characters like any other, so a match may carry them on the front.
 * Try the name as found and then without them — the second form is the one
 * that hits for all 1,042 of the folded plates.
 */
const HASHED = /[\w.-]+\.[A-Za-z0-9_-]{6,}_[A-Za-z0-9_-]{4,}\.(?:webp|avif|png|jpe?g)/g;
const distNames = new Set(files.map((f) => f.slice(f.lastIndexOf('/') + 1)));
const isBuilt = (name) => distNames.has(name) || distNames.has(name.slice(2));
const orphaned = new Map();

for (const f of files) {
  const ext = f.slice(f.lastIndexOf('.')).toLowerCase();
  if (!TEXT.has(ext)) continue;
  const text = await readFile(f, 'utf8');
  const fromDir = posix.dirname(`/${relative(DIST, f).split(/[\\/]/).join('/')}`);
  const refs = new Set();

  for (const m of text.matchAll(/(?:src|href|content|data-src)\s*=\s*["']([^"']+)["']/gi))
    refs.add(m[1]);
  for (const m of text.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi))
    for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);
  for (const m of text.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)) refs.add(m[2]);
  /* Anything the bundler emitted, wherever it ended up — this is the one that
     catches a pruned photograph referenced only from a JSON payload. */
  for (const m of text.matchAll(/["'`]([^"'`\s]*_astro\/[\w.\-]+)["'`]/g)) refs.add(m[1]);

  for (const ref of refs) {
    const p = localPath(ref, fromDir);
    if (!p) continue;
    checked += 1;
    if (!onDisk.has(p)) {
      const where = relative(ROOT, f);
      if (!broken.has(p)) broken.set(p, where);
    }
  }

  if (ext === '.html' || ext === '.js' || ext === '.mjs') {
    for (const m of text.matchAll(HASHED)) {
      checked += 1;
      if (!isBuilt(m[0]) && !orphaned.has(m[0])) orphaned.set(m[0], relative(ROOT, f));
    }
  }
}

/* ---------------------------------------------------------------- report */

const nojekyll = onDisk.has('/.nojekyll');
const actual = { pages, webp, og };

if (update) {
  await writeFile(
    EXPECT,
    `${JSON.stringify({ ...actual, note: 'npm run verify -- --update', updated: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
  );
  console.log(`verify  wrote ${relative(ROOT, EXPECT)}: ${pages} pages, ${webp} webp, ${og} og cards`);
  process.exit(0);
}

const expect = JSON.parse(await readFile(EXPECT, 'utf8').catch(() => 'null'));
const problems = [];
if (!expect) problems.push(`${relative(ROOT, EXPECT)} is missing — run \`npm run verify -- --update\``);
else
  for (const k of ['pages', 'webp', 'og'])
    if (actual[k] !== expect[k]) problems.push(`${k}: built ${actual[k]}, expected ${expect[k]}`);

if (!nojekyll)
  problems.push('.nojekyll is not in dist/ — GitHub Pages will drop every path under _astro/');
if (broken.size) problems.push(`${broken.size} broken local reference(s)`);
if (orphaned.size)
  problems.push(
    `${orphaned.size} built image name(s) with no file — prune-originals.mjs has eaten something`,
  );

console.log(
  `verify  base ${base} · ${pages} pages · ${webp} webp · ${og} og cards · ` +
    `${checked} local references checked · ${(bytes / 1e6).toFixed(1)} MB`,
);

if (problems.length) {
  for (const p of problems) console.error(`verify  ${p}`);
  for (const [p, where] of [...broken, ...orphaned].slice(0, 15))
    console.error(`verify    missing ${p}  <- ${where}`);
  if (broken.size + orphaned.size > 15)
    console.error(`verify    …and ${broken.size + orphaned.size - 15} more`);
  process.exit(1);
}
console.log('verify  ok');
