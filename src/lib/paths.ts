/**
 * One place that knows the site might not be sitting at the root of its origin.
 *
 * It is published to GitHub Pages at https://yy-gx.github.io/flock/, so every
 * internal URL the site writes has to carry `/flock` in front of it. Astro's
 * `base` only rewrites the URLs Astro itself mints — the image pipeline, the
 * bundled scripts and styles, the `public/` copy — and nothing at all about a
 * hand-written `href="/places"` or a template string like
 * `` `/birds/${bird.slug}` ``, which is most of the links on this site.
 *
 * So: **every root-absolute internal path goes through `withBase()`**, in
 * `.astro` frontmatter and in client TypeScript alike, and
 * `src/integrations/check-base.mjs` fails the build if one escapes into `dist/`.
 *
 * The base is read from `import.meta.env.BASE_URL` and never written down
 * anywhere else, so moving the site to a custom domain is the one line in
 * `astro.config.mjs` and nothing here.
 *
 * ## Why the try/catch
 *
 * `src/lib/flock.ts` and `src/lib/timeline.ts` are imported from bare Node by
 * `scripts/og-cards.mjs` (type stripping, no bundler), and `flock.ts` imports
 * this file for `stripBase`. Vite replaces the literal text
 * `import.meta.env.BASE_URL` with a string at build time; plain Node leaves it
 * alone, where `import.meta.env` is `undefined` and the property read throws.
 * The expression has to stay spelled exactly that way for the replacement to
 * happen, so the guard is a `try`, not an `?.`. og-cards writes files, not
 * URLs, so the `/` it falls back to is never used for anything.
 */

function readBase(): string {
  try {
    return import.meta.env.BASE_URL || '/';
  } catch {
    return '/'; // bare Node (scripts/og-cards.mjs); no URLs are minted there
  }
}

/**
 * The base with no trailing slash: `"/flock"`, or `""` when the site is served
 * from the root. Astro normalises `base` to `"/flock/"` (and to `"/"` when
 * unset), so trimming the tail is all that is needed to make concatenation
 * safe — `BASE + "/places"` never doubles a slash, and `BASE + "/"` is the
 * home page.
 */
export const BASE: string = readBase().replace(/\/+$/, '');

/**
 * Prefix a root-absolute internal path with the base.
 *
 *   withBase('/')                  // "/flock/"
 *   withBase('/places')            // "/flock/places"
 *   withBase('/birds/blue-jay')    // "/flock/birds/blue-jay"
 *   withBase('/places#triangle')   // "/flock/places#triangle"
 *
 * Anything that is not a root-absolute path is handed straight back, so it is
 * safe to wrap a value that might be external or relative:
 *
 *   withBase('https://…/originals/x.png')  // unchanged (the R2 originals)
 *   withBase('//cdn.example/x.js')         // unchanged (protocol-relative)
 *   withBase('#triangle')                  // unchanged
 *   withBase('')                           // unchanged
 *
 * It is idempotent — a path that already carries the base comes back as it
 * went in — so a value that passes through two layers (a `href` prop defaulted
 * in one component and overridden by its caller) cannot pick up `/flock/flock`.
 */
export function withBase(path: string): string;
export function withBase(path: null | undefined): null;
export function withBase(path: string | null | undefined): string | null;
export function withBase(path: string | null | undefined): string | null {
  if (path === null || path === undefined) return null;
  if (!BASE) return path;
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (path === BASE || path.startsWith(`${BASE}/`) || path.startsWith(`${BASE}#`) ||
      path.startsWith(`${BASE}?`)) {
    return path;
  }
  return BASE + path;
}

/**
 * The inverse: turn a real pathname back into the site-root route it stands
 * for, so route matching can go on being written against `/places` and
 * `/days/<iso>` however the site is mounted.
 *
 *   stripBase('/flock/places')  // "/places"
 *   stripBase('/flock/')        // "/"
 *   stripBase('/flock')         // "/"
 *
 * This is the trap in the whole refactor: `Astro.url.pathname` and
 * `location.pathname` both carry the prefix, so `viewOf()` in `flock.ts`
 * would quietly match nothing without it and the compass would mark no view
 * on any page — and `Base.astro` would look for every social card under
 * `public/og/flock/`, find none, and serve 397 copies of the home card.
 *
 * The other way round works too and is often simpler: build the URL with
 * `withBase()` and compare it against `location.pathname` directly, which is
 * what `panel.ts` does for "am I already on this day?".
 *
 * A pathname that is not under the base is returned unchanged rather than
 * mangled; there is nothing sensible to say about it.
 */
export function stripBase(pathname: string): string {
  if (!pathname) return '/';
  if (!BASE) return pathname;
  if (pathname === BASE) return '/';
  if (pathname.startsWith(`${BASE}/`)) return pathname.slice(BASE.length) || '/';
  return pathname;
}
