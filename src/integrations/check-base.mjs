import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The site is served from `https://yy-gx.github.io/flock/`, so every internal
 * URL it writes has to start with `/flock`. Astro's `base` only rewrites the
 * URLs Astro mints itself — the image pipeline, the bundled JS and CSS, the
 * `public/` copy. A hand-written `href="/places"`, or a template string like
 * `` `/birds/${bird.slug}` ``, is invisible to it and ships as a dead link.
 *
 * There are ~645 internal URLs across three sample pages and ~70 call sites in
 * `src/`, so "we got them all" is not something anyone can hold in their head.
 * This reads the built site back and proves it: every URL-shaped thing in the
 * HTML, CSS and JS that starts with `/` must start with the base.
 *
 * It is a build failure, not a warning. A missed call site is silent
 * otherwise — the page still builds, the link still looks like a link, and it
 * 404s only for the visitor.
 *
 * ## What counts as a URL
 *
 * HTML: the value of `href`, `src`, `action`, `formaction`, `poster`, `ping`,
 * `data`, and every candidate in a `srcset`; `content` on the `og:*` /
 * `twitter:*` meta tags that carry one; `url()` inside a `style` attribute or
 * a `<style>` block; `@import`.
 *
 * CSS: `url()` and `@import`.
 *
 * JS: the same attribute scan (the panel builds its companion row as a string
 * of HTML), plus any quoted or backquoted literal that begins with one of the
 * site's own route roots — `/places`, `/days`, `/_astro`, … A blanket "any
 * string starting with /" would drown in regexes and `split('/')` arguments,
 * so this is the narrower, route-shaped test, which is the shape of the bug.
 *
 * Skipped everywhere: absolute URLs, protocol-relative `//`, `data:`,
 * `mailto:`, `#fragments`, `?queries`, and anything not starting with `/`.
 *
 * ## The one exemption, and why it is not a hole
 *
 * A route root has to survive into the bundle in exactly one shape: as the
 * argument of `withBase()`. `withBase('/days/…')` is the fix, not the bug,
 * and no amount of minification will turn its argument into a prefixed
 * string. So a route literal is accepted when — and only when — it is a
 * call's sole argument: `(` immediately before the opening quote and `)`
 * immediately after the closing one.
 *
 * Every other shape still fails, which is every shape the bug takes:
 * `href="/days/…"`, `x.href = '/places'`, `{ m: '/places' }`,
 * `setAttribute('href', '/list')`, `'/birds/' + slug`.
 *
 * The exempted ones are not taken on trust either — they are printed at the
 * end of every build, so a new one is visible the day it appears rather than
 * the day somebody goes looking. At the time of writing there are three, all
 * in `panel.ts`, the only client module that mints a URL out of data.
 *
 * ## The allow-list
 *
 * Empty, and meant to stay that way. Nothing on this site has to be
 * root-absolute: the one thing that legitimately ignores the base is the R2
 * host behind `PUBLIC_ORIGINALS_BASE` ("view the original"), and that is an
 * absolute `https://` URL, which never looks like `/…` in the first place.
 * If something ever does belong here, add it with the reason written down.
 */
const ALLOW = [
  // { test: (url, file) => boolean, why: 'because …' },
];

const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.xml', '.txt']);

/** Route roots this site owns, for the JS literal scan. */
const ROUTE_ROOTS = [
  'places', 'timeline', 'groups', 'list', 'days', 'birds',
  'og', 'fonts', 'favicon', 'apple-touch-icon', '_astro',
];

const HTML_URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'ping', 'data'];

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Only `/…` paths are our business; everything else resolves on its own. */
function isInternalRootPath(value) {
  const v = value.trim();
  if (!v.startsWith('/')) return false;
  if (v.startsWith('//')) return false; // protocol-relative
  return true;
}

function* htmlUrls(text) {
  const attr = new RegExp(
    `\\b(${HTML_URL_ATTRS.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'gi',
  );
  for (const m of text.matchAll(attr)) yield [m[1], m[2] ?? m[3] ?? ''];

  for (const m of text.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const part of (m[1] ?? m[2] ?? '').split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) yield ['srcset', url];
    }
  }

  /* og:image / twitter:image and friends put a URL in `content`. Only those —
     `content` is also viewport strings and prose descriptions. */
  const meta = /<meta\b[^>]*>/gi;
  for (const tag of text.match(meta) ?? []) {
    if (!/\b(property|name)\s*=\s*["'](og:(image|url|image:secure_url)|twitter:(image|url))["']/i.test(tag)) continue;
    const c = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (c) yield ['meta content', c[1] ?? c[2] ?? ''];
  }
}

function* cssUrls(text) {
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/gi)) {
    yield ['css url()', m[1] ?? m[2] ?? m[3] ?? ''];
  }
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)')/gi)) {
    yield ['@import', m[1] ?? m[2] ?? ''];
  }
}

/**
 * Route-shaped literals in a bundle, tagged with whether they are a call's
 * sole argument — which is the `withBase('/days/…')` shape, and the only one
 * that is not a bug. Everything else is reported as `js literal`.
 */
function* jsRouteLiterals(text) {
  const re = new RegExp(`["'\`](/(?:${ROUTE_ROOTS.join('|')})(?:[/"'\`?#][^"'\`]*)?)["'\`]`, 'g');
  for (const m of text.matchAll(re)) {
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    yield [before === '(' && after === ')' ? 'withBase arg' : 'js literal', m[1]];
  }
}

export default function checkBase() {
  let base = '/';
  return {
    name: 'check-base',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base || '/';
      },
      'astro:build:done': async ({ dir, logger }) => {
        const prefix = base.replace(/\/+$/, ''); // "/flock", or "" at the root
        const root = path.resolve(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
        const files = (await walk(root)).filter((f) => TEXT.has(path.extname(f).toLowerCase()));

        const bad = [];
        const exempt = new Set();
        let checked = 0;

        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          const text = await fs.readFile(file, 'utf8');
          const rel = path.relative(root, file);

          const found = [];
          if (ext === '.html' || ext === '.svg' || ext === '.xml') {
            found.push(...htmlUrls(text), ...cssUrls(text));
          } else if (ext === '.css') {
            found.push(...cssUrls(text));
          } else if (ext === '.js' || ext === '.mjs') {
            /* htmlUrls too: `panel.ts` builds the companion row as a string of
               markup, so an unprefixed href can hide inside a bundle. */
            found.push(...jsRouteLiterals(text), ...htmlUrls(text), ...cssUrls(text));
          } else {
            continue; // .json / .txt carry no URLs of ours
          }

          for (const [where, value] of found) {
            if (!isInternalRootPath(value)) continue;
            checked += 1;
            if (!prefix) continue; // served from the root: every /… is correct
            if (value === prefix || value.startsWith(`${prefix}/`)) continue;
            if (where === 'withBase arg') {
              exempt.add(`${rel}  withBase("${value}")`);
              continue;
            }
            if (ALLOW.some((a) => a.test(value, rel))) continue;
            bad.push(`${rel}  ${where}="${value}"`);
          }
        }

        if (bad.length) {
          const shown = bad.slice(0, 40);
          const more = bad.length - shown.length;
          logger.error(
            `${bad.length} internal URL(s) are missing the base "${prefix}".\n` +
              `Wrap the path in withBase() from src/lib/paths.ts.\n\n` +
              shown.map((b) => `  ${b}`).join('\n') +
              (more > 0 ? `\n  …and ${more} more` : ''),
          );
          throw new Error(`check-base: ${bad.length} unprefixed internal URL(s) in dist/`);
        }

        if (prefix && checked === 0) {
          /* Nothing root-absolute anywhere is not a clean bill of health, it
             is a scanner that stopped matching. */
          throw new Error('check-base: found no internal URLs at all — the scan is broken');
        }

        logger.info(
          prefix
            ? `${checked} internal URL(s) all carry the base "${prefix}"`
            : `${checked} internal URL(s), site served from the root`,
        );

        /* The route roots that survive into a bundle as a withBase() argument.
           Not failures — but printed every build, so a new one is noticed. */
        if (exempt.size) {
          logger.info(
            `${exempt.size} route root(s) reach a bundle as a withBase() argument:\n` +
              [...exempt].sort().map((e) => `  ${e}`).join('\n'),
          );
        }
      },
    },
  };
}
