/**
 * Four favicons, one per season — `/favicon-autumn.svg` and friends.
 *
 * The site's mark is a pen gone round a spot and overshot. The spot inside the
 * circle is the one filled shape in it, and B9 gives it to the season: arrive
 * in September and the dot in the tab strip is amber, arrive in January and it
 * is a cold blue. `Base.astro` server-renders the build month's file and its
 * inline script swaps the href to the visitor's own month.
 *
 * ## One mark, not a fifth drawing of it
 *
 * The geometry is `siteMark()` in scripts/ink.mjs — the single description of
 * the ring and the spot, shared by the tab icons and the social cards. This
 * file does not draw anything: it imports `public/favicon.svg` as text, which
 * is exactly what `npm run icons` (scripts/make-icons.mjs) wrote out of
 * `siteMark()`, and re-colours the one declaration that B9 is about. If the
 * mark is redrawn, these four follow it on the next build with no edit here,
 * and if the `.spot` rule is ever renamed the replace finds nothing and the
 * mark is served unchanged — which is the right failure.
 *
 * Nothing here collides with the five static icons in public/
 * (`favicon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png`,
 * `apple-touch-icon.png`): this route only ever emits the four paths named by
 * `getStaticPaths`, all of them `.svg`, and all four are new names.
 *
 * The eight hex values below are the only hexes outside src/styles/global.css
 * and scripts/. An SVG served as a favicon cannot see the page's custom
 * properties, so the --season-* tokens have to be copied; keep them in step
 * with §1 and §2 of global.css.
 *
 * No node: imports on purpose — the project has no @types/node and
 * `npx tsc --noEmit` is kept clean. Vite's `?raw` does the reading at build.
 */
import type { APIRoute } from 'astro';
import faviconSvg from '../../public/favicon.svg?raw';

/** --season-{spring,summer,autumn,winter}: [light, dark] from global.css. */
const SEASON_HEX: Record<string, [string, string]> = {
  spring: ['#7a9860', '#8cb46e'],
  summer: ['#cea856', '#dcba68'],
  autumn: ['#be682c', '#d48c4a'],
  winter: ['#688298', '#84a2be'],
};

export function getStaticPaths() {
  return Object.keys(SEASON_HEX).map((season) => ({ params: { season } }));
}

export const GET: APIRoute = ({ params }) => {
  const pair = SEASON_HEX[params.season ?? ''];
  const headers = { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' };
  if (!pair) return new Response(faviconSvg, { headers });

  /* The mark carries `.spot { fill: … }` twice — once for light, once inside
     its own prefers-color-scheme block. First match is light, second is dark. */
  let n = 0;
  const svg = faviconSvg.replace(
    /(\.spot\s*\{\s*fill:\s*)#[0-9a-fA-F]{3,8}/g,
    (_match: string, head: string) => head + pair[Math.min(n++, pair.length - 1)],
  );

  return new Response(svg, { headers });
};
