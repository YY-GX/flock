/**
 * How big each original photograph is on disk, in bytes.
 *
 * One caller: src/lib/panelData.ts, which needs it to print "Original · 12 MB"
 * on the viewer's "view the original" control. A number nobody can see before
 * they click is the difference between an honest link and a 62 MB ambush.
 *
 * ## Why this file is .mjs and not .ts
 *
 * The project has no `@types/node`, so a `.ts` module here could not
 * `import 'node:fs'` without either adding a dev dependency or lying to the
 * type checker (`npx tsc --noEmit` is clean and has to stay clean). Under
 * `allowJs` a plain `.mjs` costs neither. Nothing else in src/lib needs a Node
 * builtin, and this is the only reason anything here does.
 *
 * Server only. It is read once per build, at the first `panelEntry()`.
 *
 * ## Two sources, and why the manifest has to come first
 *
 * The key is the photograph's name in `photos.json` — `<id>-0.png` — which is
 * also its key in the R2 bucket. Locally that name is also a real file in
 * `src/assets/photos`, so `stat()` answers the question directly.
 *
 * **In CI it is not.** The 6.62 GB of originals is gitignored and archived in
 * R2; what a checkout gets is the committed 220 MB web set in `photos-web/`,
 * hard-linked into `src/assets/photos` by a prebuild step and named `.webp`.
 * Every `.png` lookup would miss, this map would come back empty, and
 * `originalOf()` would silently drop the link on all 1,129 plates that should
 * carry one — no error, just a feature that is not there any more.
 *
 * So the first source is `photos-web/manifest.json`, which `npm run photos:web`
 * writes and which is committed: it maps each `photos.json` name to the
 * **original's** byte count, and is therefore right on every machine, with or
 * without the originals on disk. `stat()` is the fallback for a tree that has
 * the originals but has never run `photos:web`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * file name -> bytes of the original.
 *
 * Comes back empty rather than throwing when neither source is there. An empty
 * map means the viewer offers nothing, which is the same graceful nothing as
 * an unset base URL.
 */
export function photoBytes() {
  const out = new Map();

  /* Preferred: the committed manifest. Correct in CI, where the originals are
     not on disk at all, and correct locally, where it was written from them. */
  try {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'photos-web', 'manifest.json'), 'utf8'),
    );
    for (const [name, f] of Object.entries(manifest.files ?? {})) {
      if (typeof f?.bytes === 'number' && f.bytes > 0) out.set(name, f.bytes);
    }
    if (out.size) return out;
    /* A manifest with no usable rows is a broken manifest, not an answer —
       fall through and weigh whatever is actually on disk. */
    out.clear();
  } catch {
    /* no manifest, or unreadable — fall through to stat()ing the directory */
  }

  const dir = join(process.cwd(), 'src', 'assets', 'photos');

  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }

  for (const name of names) {
    if (name.startsWith('.')) continue;
    try {
      out.set(name, statSync(join(dir, name)).size);
    } catch {
      /* vanished between the listing and the stat; it simply has no original */
    }
  }
  return out;
}
