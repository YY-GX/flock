#!/usr/bin/env node
/**
 * The site's mark, drawn by the same hand as the maps.
 *
 *   node scripts/make-icons.mjs
 *
 * Writes, all into public/:
 *
 *   favicon.svg          the real one — vector, and it changes with the
 *                        browser's colour scheme
 *   favicon-32.png       fallback for browsers that will not take an SVG
 *   favicon-16.png       the same, at the size a tab actually draws
 *   favicon.ico          a 32px PNG in an ICO wrapper, for the bare
 *                        /favicon.ico that some clients ask for regardless
 *   apple-touch-icon.png 180px, opaque, for the iOS home screen
 *
 * The mark: a pen gone round a spot and overshot its own start, the spot
 * sitting up and to the right of centre in ochre. That is not a new idea —
 * it is the gesture the map already makes when it rings the Triangle
 * (`inkRing()` in src/lib/mapView.ts) and the colour the first bird type is
 * drawn in (--t-1, the ochre the old placeholder favicon was a flat circle
 * of). A bird, circled. The pen and the mark itself are in scripts/ink.mjs,
 * which the social cards read too, so the tab and the postcard can never
 * disagree.
 *
 * Run it by hand; the output is committed. Nothing in the build depends on
 * this script, so a machine without sharp can still build the site.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MARK_BOX, MARK_STROKE, siteMark } from './ink.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');

/* The tokens this mark is allowed to use, copied from src/styles/global.css.
   Four values; if any of them moves there, move it here and re-run. */
const INK_LIGHT = '#23201b'; /* --ink */
const INK_DARK = '#ece6da'; /* --ink, dark */
const OCHRE_LIGHT = '#b5793c'; /* --t-1, Perching */
const OCHRE_DARK = '#d69b5e'; /* --t-1, dark */
const PAPER = '#faf8f3'; /* --paper */

/*
 * Geometry. `siteMark()` in scripts/ink.mjs is the single description of the
 * mark — the same two paths the social cards sign themselves with. Nothing
 * about it is tuned here; if the drawing is wrong, it is wrong there.
 */
const BOX = MARK_BOX;
const { ring: RING, spot: BLOB } = siteMark();
const STROKE = MARK_STROKE;

/**
 * The SVG favicon. It carries its own dark-mode rule: Safari and Chrome both
 * honour a media query inside an SVG icon, so the ink lifts off a dark tab
 * strip instead of disappearing into it. Everything else on the site does the
 * same thing in global.css; this file is just the one that has to carry it
 * itself.
 */
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" role="img" aria-label="A bird, circled">
  <style>
    .ink { stroke: ${INK_LIGHT}; }
    .spot { fill: ${OCHRE_LIGHT}; }
    @media (prefers-color-scheme: dark) {
      .ink { stroke: ${INK_DARK}; }
      .spot { fill: ${OCHRE_DARK}; }
    }
  </style>
  <path class="spot" d="${BLOB}"/>
  <path class="ink" d="${RING}" fill="none" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

/**
 * The raster version has to be opaque: a PNG favicon is the fallback for clients
 * that will not read the SVG, and those are exactly the clients that will not
 * flip it for dark mode either. Ink on paper is legible on any chrome; ink on
 * transparent is not.
 *
 * `pad` is the margin inside the square, in 32-unit terms. The tab icons are
 * drawn edge to edge (16 pixels has none to spare); the touch icon is inset,
 * because iOS crops it into a rounded square.
 */
function rasterSvg(px, { pad = 0, ink = INK_LIGHT, ochre = OCHRE_LIGHT, ground = PAPER } = {}) {
  const inner = BOX - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${BOX} ${BOX}">
  <rect width="${BOX}" height="${BOX}" fill="${ground}"/>
  <g transform="translate(${pad} ${pad}) scale(${(inner / BOX).toFixed(4)})">
    <path d="${BLOB}" fill="${ochre}"/>
    <path d="${RING}" fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function png(px, opts) {
  /* density: render the vector at the output size rather than at 96dpi and
     scale a small bitmap up. 16px icons live or die on this. */
  return sharp(Buffer.from(rasterSvg(px, opts)), { density: 72 * (px / BOX) })
    .resize(px, px)
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

/**
 * An ICO is a 6-byte header, one 16-byte directory entry per image, and the
 * images themselves — and since Vista an entry is allowed to be a whole PNG
 * rather than a BMP. One 32px entry is all anything still asking for
 * /favicon.ico needs.
 */
function ico(pngBuf, px) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); /* reserved */
  head.writeUInt16LE(1, 2); /* 1 = icon */
  head.writeUInt16LE(1, 4); /* one image */
  const dir = Buffer.alloc(16);
  dir.writeUInt8(px === 256 ? 0 : px, 0); /* width, 0 means 256 */
  dir.writeUInt8(px === 256 ? 0 : px, 1); /* height */
  dir.writeUInt8(0, 2); /* palette size: 0 = truecolour */
  dir.writeUInt8(0, 3); /* reserved */
  dir.writeUInt16LE(1, 4); /* colour planes */
  dir.writeUInt16LE(32, 6); /* bits per pixel */
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(head.length + dir.length, 12); /* offset of the payload */
  return Buffer.concat([head, dir, pngBuf]);
}

await mkdir(PUBLIC, { recursive: true });

await writeFile(resolve(PUBLIC, 'favicon.svg'), faviconSvg);

const p32 = await png(32);
const p16 = await png(16);
await writeFile(resolve(PUBLIC, 'favicon-32.png'), p32);
await writeFile(resolve(PUBLIC, 'favicon-16.png'), p16);
await writeFile(resolve(PUBLIC, 'favicon.ico'), ico(p32, 32));
await writeFile(resolve(PUBLIC, 'apple-touch-icon.png'), await png(180, { pad: 3 }));

console.log(
  [
    'favicon.svg',
    `favicon-32.png  ${p32.length} B`,
    `favicon-16.png  ${p16.length} B`,
    'favicon.ico',
    'apple-touch-icon.png',
  ]
    .map((l) => `  public/${l}`)
    .join('\n'),
);
