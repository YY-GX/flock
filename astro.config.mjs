// @ts-check
import { defineConfig } from 'astro/config';
import pruneOriginals from './src/integrations/prune-originals.mjs';
import checkBase from './src/integrations/check-base.mjs';

export default defineConfig({
  output: 'static',
  /*
   * The site is published to GitHub Pages at https://yy-gx.github.io/flock/,
   * so it lives one directory down from the root of its origin.
   *
   * `base` is all Astro needs for the URLs it mints itself (the image
   * pipeline, the bundled JS and CSS, the public/ copy). It does NOT touch a
   * hand-written `href="/places"` or a template string — those go through
   * `withBase()` from src/lib/paths.ts, and `npm run build` fails via
   * src/integrations/check-base.mjs if one of them escapes into dist/ unprefixed.
   *
   * `site` makes the canonical link and the 397 og:image URLs absolute.
   *
   * Moving to a custom domain is these two lines and nothing else: set
   * `base: '/'` (or drop it) and every path in the build follows, because
   * nothing in src/ spells "/flock" out.
   */
  site: 'https://yy-gx.github.io',
  base: '/flock',
  server: { port: 8888, host: true },
  devToolbar: { enabled: false },
  integrations: [pruneOriginals(), checkBase()],
});
