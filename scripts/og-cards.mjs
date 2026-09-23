#!/usr/bin/env node
/**
 * The picture that shows up when somebody pastes a link to this site.
 *
 *   node scripts/og-cards.mjs            only what is new or changed
 *   node scripts/og-cards.mjs --force    redraw everything
 *   node scripts/og-cards.mjs --only brown-creeper
 *   node scripts/og-cards.mjs --limit 8  a sample, for looking at
 *
 * `npm run build` runs it first (the `prebuild` script in package.json), so
 * the cards and the `og:image` tags in src/layouts/Base.astro can never drift
 * apart. It is incremental — a build that changes nothing redraws nothing —
 * and it stands aside entirely on a machine with no photographs, so a clone
 * without the 6.5 GB of originals still builds against the committed cards.
 *
 * ---------------------------------------------------------------- what
 *
 * One 1200x630 JPEG per route, written to public/og/ on the same paths the
 * site uses:
 *
 *   /                 -> public/og/home.jpg
 *   /list             -> public/og/list.jpg        (and timeline, places, groups)
 *   /birds/<slug>     -> public/og/birds/<slug>.jpg     281 of them
 *   /places/<slug>    -> public/og/places/<slug>.jpg     37
 *   /groups/<slug>    -> public/og/groups/<slug>.jpg      9
 *   /days             -> public/og/days.jpg
 *   /days/<iso>       -> public/og/days/<iso>.jpg         64
 *
 * Base.astro derives the path from `Astro.url.pathname` with exactly those
 * rules, so there is no manifest to keep in step — the check is structural:
 * this script walks the same three JSON files the routes are generated from.
 *
 * ---------------------------------------------------------------- why per bird
 *
 * Because a link to a bird is the link people actually send. A single site
 * card on 281 pages tells the reader nothing about the one they were sent,
 * and the pages have a photograph sitting right there. The cost is measured
 * in the report that comes out of this script: it is a few megabytes and a
 * one-off minute of build, and after that the cache makes it free.
 *
 * ---------------------------------------------------------------- the drawing
 *
 * A card is the site's own furniture: the pre-compensated paper ground with
 * the real grain tile from global.css over it, one photograph mounted as a
 * plate with its hairline and its lift, and a column of type beside it. The
 * 43 birds nobody has photographed get the empty specimen frame instead,
 * pressed into the board the way /list draws it.
 *
 * Type is laid out by Pango (through sharp's `text` input), so the names
 * wrap on real metrics rather than a guess. Two faces:
 *
 *   body   Palatino — the site's --serif is "Iowan Old Style", Palatino,
 *          Georgia, …; Iowan is not visible to fontconfig here, Palatino is,
 *          and it is the next name in the site's own stack.
 *   display Bodoni 72 — a Didone, which is what --display-serif is. The real
 *          file (public/fonts/bodoni-moda-display.woff2) cannot be used:
 *          librsvg/Pango read system fonts through fontconfig and fontconfig
 *          does not index WOFF2. Bodoni 72 ships with macOS and is the same
 *          register.
 *
 * Both fall back down a chain, and a machine with neither still produces a
 * correct card in whatever serif it does have.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MARK_BOX, MARK_STROKE, siteMark } from './ink.mjs';
import { canonicalType, formatDate, splitName, typeLabel, TYPE_ORDER } from '../src/lib/flock.ts';
/*
 * The place-for-a-day rule, imported — never re-implemented. DESIGN2 §0.1
 * and the header of src/lib/days.ts both say there is exactly one of it on
 * the site, and this would have been the third copy.
 *
 * It comes from timeline.ts rather than from days.ts because days.ts reaches
 * src/lib/data.ts, which loads the JSON through Vite's `import.meta.glob` —
 * meaningless to plain Node. timeline.ts is pure functions over data you hand
 * it, so this script hands it the same list days.ts does (spotted birds with
 * a parseable date) and the same place lookup, and gets the same 64 days,
 * the same 41/8/1/14 split and the same runs back.
 */
import { birdingDays, dayWhere, travelRuns } from '../src/lib/timeline.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'src/data');
const PHOTOS = resolve(ROOT, 'src/assets/photos');
const OUT = resolve(ROOT, 'public/og');
const CACHE = resolve(ROOT, 'node_modules/.cache/bird-og/manifest.json');

/* Bump when the drawing changes, so a cached card is redrawn. */
const VERSION = 7;

const args = process.argv.slice(2);
const force = args.includes('--force');
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only');
const limit = Number(flag('--limit')) || 0;

/* ------------------------------------------------------------------ tokens */

/* Straight out of src/styles/global.css, light theme. A card is a printed
   thing: it has no dark mode, so only the light column is copied. */
const T = {
  paperGround: '#fffdf8', //  --paper-ground (the grain composites this to --paper)
  paper: '#faf8f3', //        --paper
  paperSunk: '#f8f1e0', //    --paper-sunk, the mat
  ink: '#23201b', //          --ink
  inkSoft: '#5c564d', //      --ink-soft
  inkFaint: '#746c5f', //     --ink-faint
  rule: 'rgba(35,32,27,0.12)', // --rule
  ruleSoft: 'rgba(35,32,27,0.07)',
  types: {
    'Perching Birds': '#b5793c',
    'Water Birds': '#2f7c8e',
    'Wading & Shorebirds': '#6b84b5',
    Raptors: '#9b4a3f',
    'Tree-Climbers': '#6d8c4b',
    Landfowls: '#7c6b57',
    'Doves & Pigeons': '#9c8fa6',
    'Swifts & Hummingbirds': '#3e9e7b',
    Specialists: '#c9a227',
  },
  typeOther: '#8a857c',
};

/* The grain tile from global.css, verbatim, un-percent-encoded. */
const GRAIN_TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="a" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" seed="7"/><feColorMatrix values="0 0 0 0 0.16 0 0 0 0 0.13 0 0 0 0 0.08 0 0 0 0.034 0"/></filter><filter id="b" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" seed="3"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 0.99 0 0 0 0 0.95 0 0 0 0.024 0"/></filter><rect width="220" height="220" filter="url(#a)"/><rect width="220" height="220" filter="url(#b)"/></svg>`;

/* Two families, each with a fallback chain Pango walks left to right. */
const SERIF = 'Palatino,Georgia,Baskerville,serif';
const DISPLAY = 'Bodoni 72,Didot,Palatino,serif';
const SANS = 'Helvetica Neue,Helvetica,sans';

/* ------------------------------------------------------------------ card box */

const W = 1200;
const H = 630;
const M = 48; /* the margin, all four sides */
const PLATE = { x: M, y: M, w: 512, h: H - M * 2 };
const COL = { x: PLATE.x + PLATE.w + 56, w: W - (PLATE.x + PLATE.w + 56) - M };

/* ------------------------------------------------------------------ data */

const readJson = async (name) => JSON.parse(await readFile(join(DATA, name), 'utf8'));

const birds = await readJson('birds.json');
const photos = await readJson('photos.json');
const locations = await readJson('locations.json');
const focal = await readJson('focal.json').catch(() => ({}));

const photosById = new Map(photos.map((p) => [p.id, p]));
const locationsById = new Map(locations.map((l) => [l.id, l]));

/** Every photograph file this bird has, in order, that is actually on disk. */
const onDisk = new Set(await readdir(PHOTOS).catch(() => []));
/*
 * src/assets/photos is 6.5 GB and is not in the repository; the cards are.
 * On a machine that has the one and not the other, redrawing would replace
 * 332 photographic cards with 332 empty frames — so don't. This has to sit
 * before any work, because `prebuild` runs this script on every build.
 */
if (!onDisk.size) {
  console.log('og-cards: no photographs in src/assets/photos — keeping the cards already in public/og');
  process.exit(0);
}

function filesOf(bird) {
  const out = [];
  for (const pid of bird.photoIds ?? []) {
    for (const f of photosById.get(pid)?.files ?? []) if (onDisk.has(f)) out.push(f);
  }
  return out;
}

function placesOf(bird) {
  return (bird.locationIds ?? []).map((id) => locationsById.get(id)).filter(Boolean);
}

/**
 * Which bird stands for a group of birds. Deterministic and the same rule the
 * map uses for its pins: a favourite first, then the one with the most
 * photographs of it, then alphabetical so ties never move between builds.
 */
function represent(list, n = 4) {
  return list
    .filter((b) => filesOf(b).length)
    .slice()
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        filesOf(b).length - filesOf(a).length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, n);
}

/* ------------------------------------------------------------------ text */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * One block of type, laid out by Pango and handed back as pixels plus the box
 * it actually needed. `markup` is Pango markup, which is close enough to HTML
 * to read: <span font="…" foreground="…" letter_spacing="…">.
 *
 * dpi: 72 so that a point in the font description is a pixel on the card.
 */
async function type(markup, { width = COL.w, align = 'left', spacing = 0 } = {}) {
  const { data, info } = await sharp({
    text: { text: markup, dpi: 72, rgba: true, width, align, spacing, wrap: 'word' },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** An eyebrow: small, uppercase, and tracked right out like the site's. */
const eyebrow = (s, colour = T.inkFaint) =>
  `<span font="${SANS} 13" letter_spacing="3000" foreground="${colour}">${esc(s.toUpperCase())}</span>`;

/* ------------------------------------------------------------------ ground */

/**
 * The paper, once, reused by every card. --paper-ground with the real grain
 * tiled over it, exactly as html does it in global.css — which is why the
 * base colour here is #fffdf8 and not --paper: the grain has a mean of its
 * own and the composite is what lands on --paper.
 */
let groundPromise;
function ground() {
  groundPromise ??= (async () => {
    const tile = await sharp(Buffer.from(GRAIN_TILE), { density: 72 }).png().toBuffer();
    return sharp({ create: { width: W, height: H, channels: 4, background: T.paperGround } })
      .composite([{ input: tile, tile: true, blend: 'over' }])
      .png()
      .toBuffer();
  })();
  return groundPromise;
}

/* ------------------------------------------------------------------ the mark */

/** The favicon, at card scale: the site signing its own postcard. Same two
    paths the tab icon is drawn from — see `siteMark()` in scripts/ink.mjs. */
const { ring: MARK_RING, spot: MARK_SPOT } = siteMark();
function markSvg(px) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${MARK_BOX} ${MARK_BOX}">` +
      `<path d="${MARK_SPOT}" fill="${T.types['Perching Birds']}"/>` +
      `<path d="${MARK_RING}" fill="none" stroke="${T.ink}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`,
  );
}

/* ------------------------------------------------------------------ plates */

/**
 * A photograph, cropped to fill `box` with the bird still in it.
 *
 * src/data/focal.json already holds one focal point per file — the same one
 * <BirdThumb /> turns into `object-position` — so the card crops where the
 * cabinet crops. A file with no entry falls back to centre, biased slightly
 * high, which is where a bird usually is.
 */
async function plate(file, box) {
  const src = sharp(join(PHOTOS, file), { failOn: 'none', limitInputPixels: false }).rotate();
  const meta = await src.metadata();
  const swap = meta.orientation != null && meta.orientation >= 5;
  const sw = swap ? meta.height : meta.width;
  const sh = swap ? meta.width : meta.height;
  if (!sw || !sh) throw new Error(`no dimensions: ${file}`);

  const f = focal[file] ?? { x: 50, y: 42 };

  /* cover: scale so both axes are at least the box, then slide the window to
     put the focal point in the middle of it, clamped to the image */
  const scale = Math.max(box.w / sw, box.h / sh);
  const cw = Math.min(sw, Math.round(box.w / scale));
  const ch = Math.min(sh, Math.round(box.h / scale));
  const left = Math.max(0, Math.min(sw - cw, Math.round((f.x / 100) * sw - cw / 2)));
  const top = Math.max(0, Math.min(sh - ch, Math.round((f.y / 100) * sh - ch / 2)));

  return src
    .extract({ left, top, width: cw, height: ch })
    .resize(box.w, box.h, { fit: 'fill', kernel: 'lanczos3' })
    .toBuffer();
}

/**
 * What a mounted print looks like on this site: --plate-edge (a hairline all
 * the way round) and --plate-lift (the faintest shadow under it). The shadow
 * has to be drawn before the photograph and the hairline after, so this
 * returns both halves.
 */
function mounted(box) {
  const pad = 40;
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w + pad * 2}" height="${box.h + pad * 2}">
      <defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="9"/></filter></defs>
      <rect x="${pad}" y="${pad + 6}" width="${box.w}" height="${box.h}"
            fill="rgba(35,32,27,0.30)" filter="url(#s)"/>
    </svg>`,
  );
  const edge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}">
      <rect x="0.5" y="0.5" width="${box.w - 1}" height="${box.h - 1}"
            fill="none" stroke="${T.rule}" stroke-width="1"/>
    </svg>`,
  );
  return [
    { input: shadow, left: box.x - pad, top: box.y - pad },
    { input: edge, left: box.x, top: box.y, after: true },
  ];
}

/**
 * The empty specimen slot, for the 43 birds nobody has photographed — the
 * same object /list draws, rebuilt out of --ghost-fill and --ghost-press: a
 * whisper of tone down the face, a shadow under the top edge, a lip of light
 * along the bottom, and the hairline that is the cut itself.
 */
function ghostFrame({ w, h }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(35,32,27,0.06)"/>
          <stop offset="5%" stop-color="rgba(35,32,27,0)"/>
          <stop offset="68%" stop-color="rgba(255,255,255,0)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0.26)"/>
        </linearGradient>
        <linearGradient id="press" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(35,32,27,0.26)"/>
          <stop offset="100%" stop-color="rgba(35,32,27,0)"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#fill)"/>
      <rect width="${w}" height="14" fill="url(#press)"/>
      <rect y="${h - 1}" width="${w}" height="1" fill="rgba(255,255,255,0.62)"/>
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none"
            stroke="rgba(35,32,27,0.30)" stroke-width="1"/>
    </svg>`,
  );
}

/* ------------------------------------------------------------------ layouts */

/** A 1px hairline, drawn `w` wide. */
const hairline = (w, colour = T.rule) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="1"><rect width="${w}" height="1" fill="${colour}"/></svg>`,
  );

/** A type dot, the same mark the timeline puts on the axis. */
const dot = (r, colour) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r * 2}" height="${r * 2}"><circle cx="${r}" cy="${r}" r="${r}" fill="${colour}"/></svg>`,
  );

/**
 * Pick a size for a name so it fills the column without turning into four
 * lines. Measured, not guessed: Pango is asked for the real height at each
 * size and the first one that fits in `maxLines` wins.
 */
async function fitted(text, { font, sizes, colour, maxLines, width = COL.w, letter = 0 }) {
  let last = null;
  for (const size of sizes) {
    const spacing = letter ? ` letter_spacing="${Math.round(letter * size * 1024)}"` : '';
    const block = await type(
      `<span font="${font} ${size}" foreground="${colour}"${spacing}>${esc(text)}</span>`,
      { width },
    );
    last = block;
    /* Pango's line height for these faces runs ~1.22x the point size. */
    if (block.h <= size * 1.3 * maxLines) return block;
  }
  return last;
}

/** The column of type beside the plate. Returns composite ops. */
async function birdColumn(bird) {
  const { english, gloss } = splitName(bird.name);
  const ctype = canonicalType(bird.type);
  const colour = T.types[ctype] ?? T.typeOther;
  const places = placesOf(bird);

  const ops = [];
  let y = 0;
  const rows = [];

  /* mark + eyebrow, on one line */
  const markPx = 30;
  const eb = await type(eyebrow('Birding checklist'));
  rows.push({ h: markPx, items: [
    { input: markSvg(markPx), dx: 0, dy: 0 },
    { input: eb.data, dx: markPx + 14, dy: Math.round((markPx - eb.h) / 2) },
  ] });
  y += 30;

  const name = await fitted(english, {
    font: SERIF,
    sizes: [54, 47, 41, 36],
    colour: T.ink,
    maxLines: 2,
  });
  rows.push({ h: name.h, items: [{ input: name.data, dx: 0, dy: 0 }], gap: 20 });

  if (bird.genus) {
    const g = await type(
      `<span font="${SERIF} 25" style="italic" foreground="${T.inkSoft}">${esc(bird.genus)}</span>`,
    );
    rows.push({ h: g.h, items: [{ input: g.data, dx: 0, dy: 0 }], gap: 12 });
  }
  if (gloss) {
    const g = await type(`<span font="${SANS} 17" foreground="${T.inkFaint}">${esc(gloss)}</span>`);
    rows.push({ h: g.h, items: [{ input: g.data, dx: 0, dy: 0 }], gap: 8 });
  }

  rows.push({ h: 1, items: [{ input: hairline(84), dx: 0, dy: 0 }], gap: 30 });

  /* the two facts a printed specimen card carries: when, and where */
  const facts = [];
  if (bird.firstSpotted) facts.push(['First seen', formatDate(bird.firstSpotted)]);
  if (places.length) {
    const extra = places.length > 1 ? `  +${places.length - 1}` : '';
    facts.push(['Seen at', places[0].name + extra]);
  }
  for (const [label, value] of facts) {
    const line = await type(
      `<span font="${SANS} 12" letter_spacing="2600" foreground="${T.inkFaint}">${esc(label.toUpperCase())}   </span>` +
        `<span font="${SERIF} 21" foreground="${T.inkSoft}">${esc(value)}</span>`,
    );
    rows.push({ h: line.h, items: [{ input: line.data, dx: 0, dy: 0 }], gap: 14 });
  }

  if (ctype) {
    const g = await type(
      `<span font="${SANS} 12" letter_spacing="2600" foreground="${T.inkFaint}">${esc(typeLabel(ctype).toUpperCase())}</span>`,
    );
    rows.push({
      h: Math.max(g.h, 10),
      gap: 20,
      items: [
        { input: dot(5, colour), dx: 0, dy: Math.round((g.h - 10) / 2) },
        { input: g.data, dx: 20, dy: 0 },
      ],
    });
  }

  /* centre the stack against the plate */
  const total = rows.reduce((n, r, i) => n + r.h + (i ? (r.gap ?? 16) : 0), 0);
  y = Math.max(M + 8, PLATE.y + Math.round((PLATE.h - total) / 2));
  rows.forEach((r, i) => {
    if (i) y += r.gap ?? 16;
    for (const it of r.items) ops.push({ input: it.input, left: COL.x + it.dx, top: y + it.dy });
    y += r.h;
  });
  return ops;
}

/** A bird card: one plate, one column. */
async function birdCard(bird) {
  const files = filesOf(bird);
  const ops = [];

  if (files.length) {
    const [shadow, edge] = mounted(PLATE);
    ops.push(shadow);
    ops.push({ input: await plate(files[0], PLATE), left: PLATE.x, top: PLATE.y });
    ops.push({ input: edge.input, left: edge.left, top: edge.top });
  } else {
    ops.push({ input: ghostFrame(PLATE), left: PLATE.x, top: PLATE.y });
    const note = await type(
      `<span font="${SANS} 13" letter_spacing="3000" foreground="${T.inkFaint}">${esc(
        (bird.spotted ? 'photograph missing' : 'not yet seen').toUpperCase(),
      )}</span>`,
      { width: PLATE.w - 40, align: 'centre' },
    );
    ops.push({
      input: note.data,
      /* sharp returns a bitmap the width of the ink, not the width it was
         asked to lay out in, so `align: centre` has nothing to centre
         inside — the label has to be placed centred instead. */
      left: PLATE.x + Math.round((PLATE.w - note.w) / 2),
      top: PLATE.y + Math.round((PLATE.h - note.h) / 2),
    });
  }

  ops.push(...(await birdColumn(bird)));
  return ops;
}

/**
 * A view card: the one big word in the display face, a line under it, and
 * four plates in a square block where a bird card puts one.
 */
async function viewCard({ word, kicker, lede, birds: picks }) {
  const ops = [];

  const grid = { x: 632, y: M, w: W - 632 - M, h: H - M * 2 };
  const cell = Math.floor((grid.w - 14) / 2);
  const cellH = Math.floor((grid.h - 14) / 2);
  for (let i = 0; i < 4; i++) {
    const bird = picks[i];
    const box = {
      x: grid.x + (i % 2) * (cell + 14),
      y: grid.y + Math.floor(i / 2) * (cellH + 14),
      w: cell,
      h: cellH,
    };
    if (bird) {
      const files = filesOf(bird);
      if (files.length) {
        const [shadow, edge] = mounted(box);
        ops.push(shadow);
        ops.push({ input: await plate(files[0], box), left: box.x, top: box.y });
        ops.push({ input: edge.input, left: edge.left, top: edge.top });
        continue;
      }
    }
    ops.push({ input: ghostFrame(box), left: box.x, top: box.y });
  }

  /* the words, in the left column */
  const colW = grid.x - M - 56;
  const rows = [];
  const markPx = 30;
  const eb = await type(eyebrow(kicker), { width: colW });
  rows.push({
    h: markPx,
    items: [
      { input: markSvg(markPx), dx: 0, dy: 0 },
      { input: eb.data, dx: markPx + 14, dy: Math.round((markPx - eb.h) / 2) },
    ],
  });

  const big = await fitted(word, {
    font: DISPLAY,
    sizes: [104, 84, 66, 52, 42],
    colour: T.ink,
    maxLines: 2,
    width: colW,
    letter: -0.01,
  });
  rows.push({ h: big.h, items: [{ input: big.data, dx: 0, dy: 0 }], gap: 28 });

  rows.push({ h: 1, items: [{ input: hairline(84), dx: 0, dy: 0 }], gap: 30 });

  const l = await type(
    `<span font="${SERIF} 23" foreground="${T.inkSoft}">${esc(lede)}</span>`,
    { width: colW },
  );
  rows.push({ h: l.h, items: [{ input: l.data, dx: 0, dy: 0 }], gap: 26 });

  const total = rows.reduce((n, r, i) => n + r.h + (i ? (r.gap ?? 16) : 0), 0);
  let y = Math.max(M + 8, M + Math.round((H - M * 2 - total) / 2));
  rows.forEach((r, i) => {
    if (i) y += r.gap ?? 16;
    for (const it of r.items) ops.push({ input: it.input, left: M + it.dx, top: y + it.dy });
    y += r.h;
  });
  return ops;
}

/* ------------------------------------------------------------------ render */

async function render(outPath, ops) {
  const buf = await sharp(await ground())
    .composite(ops)
    .jpeg({ quality: 78, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return buf.length;
}

/* ------------------------------------------------------------------ the list */

const spotted = birds.filter((b) => b.spotted);
const photographed = spotted.filter((b) => filesOf(b).length);
const firstYear = spotted
  .map((b) => b.firstSpotted)
  .filter(Boolean)
  .sort()[0]
  ?.slice(0, 4);

/** Which birds a group/place/view card shows, and what makes it change. */
function jobs() {
  const out = [];

  /* `uses` is the photograph files a card is drawn from; their mtimes go into
     the cache key, so a re-downloaded photograph redraws the cards it is on. */
  const push = (file, kind, key, uses, draw) => out.push({ file, kind, key, uses, draw });

  /* ---- the five views ---- */
  const favourites = represent(birds.filter((b) => b.favorite), 4);
  const byGroup = TYPE_ORDER.map((t) =>
    represent(spotted.filter((b) => canonicalType(b.type) === t), 1)[0],
  ).filter(Boolean);
  const byDate = spotted
    .filter((b) => b.firstSpotted && filesOf(b).length)
    .sort((a, b) => a.firstSpotted.localeCompare(b.firstSpotted));
  const spread = [byDate[0], byDate[Math.floor(byDate.length / 3)], byDate[Math.floor((byDate.length * 2) / 3)], byDate.at(-1)].filter(Boolean);
  const byPlace = locations
    .slice()
    .sort((a, b) => (b.birdCount ?? 0) - (a.birdCount ?? 0))
    .map((l) => represent(spotted.filter((b) => (b.locationIds ?? []).includes(l.id)), 1)[0])
    .filter(Boolean)
    .filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i)
    .slice(0, 4);

  const views = [
    {
      file: 'home.jpg',
      word: 'Birding Checklist',
      kicker: 'A life list, kept as a gallery',
      lede: `${photographed.length} birds photographed since ${firstYear ?? '2024'}, across ${locations.length} places.`,
      birds: favourites,
    },
    {
      file: 'list.jpg',
      word: 'All',
      kicker: 'Birding checklist',
      lede: `${photographed.length} birds photographed, ${birds.length - photographed.length} still to find.`,
      birds: favourites,
    },
    {
      file: 'timeline.jpg',
      word: 'When',
      kicker: 'Birding checklist',
      lede: 'Every bird placed on the day it was first seen, with the count climbing from zero.',
      birds: spread,
    },
    {
      file: 'places.jpg',
      word: 'Where',
      kicker: 'Birding checklist',
      lede: `${locations.length} places, from a Durham balcony to the Pacific coast.`,
      birds: byPlace,
    },
    {
      file: 'groups.jpg',
      word: 'Groups',
      kicker: 'Birding checklist',
      lede: `${TYPE_ORDER.length} groups, ${spotted.length} birds — from perching birds down to specialists.`,
      birds: byGroup,
    },
  ];
  for (const v of views) {
    push(
      v.file,
      'view',
      [v.word, v.kicker, v.lede, ...v.birds.map((b) => b.slug)].join('|'),
      v.birds.map((b) => filesOf(b)[0]).filter(Boolean),
      () => viewCard(v),
    );
  }

  /* ---- 281 birds ---- */
  for (const bird of birds) {
    const files = filesOf(bird);
    push(
      `birds/${bird.slug}.jpg`,
      'bird',
      [bird.name, bird.genus, bird.type, bird.firstSpotted, bird.spotted, files[0] ?? '', placesOf(bird).map((p) => p.name).join(',')].join('|'),
      files.slice(0, 1),
      () => birdCard(bird),
    );
  }

  /* ---- 37 places ---- */
  for (const place of locations) {
    const here = spotted.filter((b) => (b.locationIds ?? []).includes(place.id));
    const picks = represent(here, 4);
    const v = {
      word: place.name,
      kicker: place.scope === 'local' ? 'In the Triangle' : 'On the road',
      lede: `${here.length} ${here.length === 1 ? 'bird' : 'birds'} recorded at ${place.name}.`,
      birds: picks,
    };
    push(
      `places/${place.slug}.jpg`,
      'place',
      [v.word, v.lede, ...picks.map((b) => b.slug)].join('|'),
      picks.map((b) => filesOf(b)[0]).filter(Boolean),
      () => viewCard(v),
    );
  }

  /* ---- the ledger and its 64 days ---- */
  /*
   * `birdingDays` wants exactly what src/lib/days.ts gives it: spotted birds
   * with a parseable date (that is `timelineBirds`), and a place lookup. The
   * eyebrow and the lede are then the day page's own two lines, verbatim —
   * see the `eyebrowWhere` / `.lede` block in src/pages/days/[iso].astro.
   * The 14 unplaceable days print no place, exactly as those pages do.
   */
  const dated = spotted.filter(
    (b) => typeof b.firstSpotted === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.firstSpotted),
  );
  const placeOf = (id) => locationsById.get(id) ?? null;
  const birdDays = birdingDays(dated, placeOf);

  /* Runs of one day are dropped here for the same reason days.ts drops them:
     "Delmarva, day 1 of 1" is a worse eyebrow than "a day out". */
  const runSeat = new Map();
  for (const run of travelRuns(birdDays, placeOf).filter((r) => r.dayCount > 1)) {
    run.isos.forEach((iso, i) => runSeat.set(iso, { run, index: i + 1 }));
  }

  const byId = new Map(birds.map((b) => [b.id, b]));
  const newBirds = (n) => (n === 1 ? '1 new bird' : `${n} new birds`);

  for (const day of birdDays) {
    const seat = runSeat.get(day.iso);
    const where = dayWhere(day);
    /* the day page's eyebrow: the trip if there is one, else the coarsest
       true thing the rule supports — and "a day out" when it supports none */
    const kicker = seat
      ? `${seat.run.region}, day ${seat.index} of ${seat.run.dayCount}`
      : day.placeIds.length && !day.travel
        ? 'around home'
        : day.scope || 'a day out';
    const picks = represent(day.birdIds.map((id) => byId.get(id)).filter(Boolean), 4);
    const v = {
      word: formatDate(day.iso),
      kicker,
      lede: `${newBirds(day.count)}${where ? ` · ${where}` : ''}`,
      birds: picks,
    };
    push(
      `days/${day.iso}.jpg`,
      'day',
      [v.word, v.kicker, v.lede, ...picks.map((b) => b.slug)].join('|'),
      picks.map((b) => filesOf(b)[0]).filter(Boolean),
      () => viewCard(v),
    );
  }

  /*
   * /days itself. It had been falling through to home.jpg, which is the one
   * fallback that tells a reader nothing they did not already know — the
   * ledger is a different object from the flock and deserves to say so. Its
   * four plates are the four biggest days, which is the honest picture of a
   * page whose whole subject is that some days were enormous.
   */
  if (birdDays.length) {
    /* Three buckets, summing to birdDays.length — the same partition
       src/lib/days.ts exports as namedDays / scopedDays / unplacedDays, and
       the same sentence /days prints. Naming only the first and the last
       loses the one 'scope' day (9 Jul 2025) and makes 49 + 14 claim to be
       64. Imported rules, but the arithmetic is written out twice, so if you
       change one of them change the other. */
    const named = birdDays.filter((d) => d.placeIds.length > 0).length;
    const scoped = birdDays.filter((d) => d.certainty === 'scope').length;
    const unplaced = birdDays.filter((d) => d.certainty === 'none').length;
    const middle =
      scoped === 1
        ? ', one only as on the road'
        : scoped > 1
          ? `, ${scoped} only by the kind of place they were`
          : '';
    const biggest = birdDays
      .slice()
      .sort((a, b) => b.count - a.count || (a.iso < b.iso ? -1 : 1))
      .slice(0, 4)
      .map((d) => represent(d.birdIds.map((id) => byId.get(id)).filter(Boolean), 1)[0])
      .filter(Boolean);
    const v = {
      word: 'Days',
      kicker: 'Birding checklist',
      lede:
        `${birdDays.length} days out between ${formatDate(birdDays[0].iso)} and ` +
        `${formatDate(birdDays[birdDays.length - 1].iso)} — ${named} of them somewhere ` +
        `the record can name${middle}, and ${unplaced} not at all.`,
      birds: biggest,
    };
    push(
      'days.jpg',
      'view',
      [v.word, v.kicker, v.lede, ...biggest.map((b) => b.slug)].join('|'),
      biggest.map((b) => filesOf(b)[0]).filter(Boolean),
      () => viewCard(v),
    );
  }

  /* ---- 9 groups ---- */
  for (const t of TYPE_ORDER) {
    const here = spotted.filter((b) => canonicalType(b.type) === t);
    if (!here.length) continue;
    const label = typeLabel(t);
    const slug = label.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const picks = represent(here, 4);
    const v = {
      word: label,
      kicker: 'One group',
      lede: `${here.length} ${here.length === 1 ? 'bird' : 'birds'} in ${label}.`,
      birds: picks,
    };
    push(
      `groups/${slug}.jpg`,
      'group',
      [v.word, v.lede, ...picks.map((b) => b.slug)].join('|'),
      picks.map((b) => filesOf(b)[0]).filter(Boolean),
      () => viewCard(v),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ run */

const all = jobs();
const wanted = only ? all.filter((j) => j.file.includes(only)) : all;
const todo = limit ? wanted.slice(0, limit) : wanted;

/*
 * Always read the manifest, even under --force.
 *
 * `--force` only means "do not trust a hit" — the worker below already tests
 * `!force` before it takes one. Blanking the object here instead meant that
 * `--force --limit 8` wrote `{...{}, ...next}` = eight entries over a 332-entry
 * manifest, and the next ordinary build silently redrew everything it had just
 * lost. Keeping the file and letting `next` overwrite the keys this run touched
 * is the same thing for a full run and the right thing for a partial one.
 */
const cache = await readFile(CACHE, 'utf8').then(JSON.parse).catch(() => ({}));
const next = {};

/* Photo mtimes go into the cache key; see `push` above. */
const mtimes = new Map();
async function mtimeOf(file) {
  if (!mtimes.has(file)) {
    mtimes.set(file, await stat(join(PHOTOS, file)).then((s) => Math.round(s.mtimeMs)).catch(() => 0));
  }
  return mtimes.get(file);
}

let drawn = 0;
let kept = 0;
let bytes = 0;
const started = Date.now();

const CONCURRENCY = Math.max(2, Math.min(6, os.cpus().length - 1));
sharp.concurrency(1); /* one libvips thread each; the pool below is the parallelism */

const queue = todo.slice();
async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    const outPath = join(OUT, job.file);
    const key = createHash('sha1')
      .update(`${VERSION}|${job.key}|${(await Promise.all(job.uses.map(mtimeOf))).join(',')}`)
      .digest('hex')
      .slice(0, 16);
    if (!force && cache[job.file] === key && existsSync(outPath)) {
      next[job.file] = key;
      kept += 1;
      /* Read the size first, then add. `bytes += await …` reads `bytes`
         *before* it suspends, so with six workers in flight every worker
         adds to the same stale total and all but the last write is lost —
         which is why this line used to report 2.8 MB for 17.1 MB of cards. */
      const size = (await stat(outPath)).size;
      bytes += size;
      continue;
    }
    const size = await render(outPath, await job.draw());
    bytes += size;
    next[job.file] = key;
    drawn += 1;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

/* Keep cache entries for files this run did not look at (--only, --limit). */
await mkdir(dirname(CACHE), { recursive: true });
await writeFile(CACHE, JSON.stringify({ ...cache, ...next }, null, 1));

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `og-cards: ${drawn} drawn, ${kept} cached, ${todo.length} total · ` +
    `${(bytes / 1e6).toFixed(1)} MB in public/og · ${secs}s`,
);
