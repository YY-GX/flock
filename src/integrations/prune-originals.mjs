import fs from 'node:fs/promises';
import path from 'node:path';

const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.svg']);
const ORIGINAL = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.tif', '.tiff']);

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Astro emits an ESM-imported image into _astro/ and only deletes it again if
 * it also ran a transform on it. src/assets/photos holds ~200 multi-megabyte
 * originals, so anything the built site never links to is dead weight — drop it.
 */
export default function pruneOriginals() {
  return {
    name: 'prune-unreferenced-originals',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = path.resolve(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
        const files = await walk(root);

        let referenced = '';
        for (const f of files) {
          if (TEXT.has(path.extname(f).toLowerCase())) referenced += await fs.readFile(f, 'utf8');
        }

        let removed = 0;
        let bytes = 0;
        for (const f of files) {
          if (!ORIGINAL.has(path.extname(f).toLowerCase())) continue;
          const name = path.basename(f);
          if (referenced.includes(name)) continue;
          bytes += (await fs.stat(f)).size;
          await fs.unlink(f);
          removed += 1;
        }

        if (removed) {
          logger.info(`pruned ${removed} unreferenced image(s), ${(bytes / 1e6).toFixed(1)} MB`);
        }
      },
    },
  };
}
