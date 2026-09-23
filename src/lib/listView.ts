/**
 * The specimen cabinet (/list) and the single-bird page (/birds/<slug>).
 *
 * Everything here is pure and build-time: it turns `birds.json` into (a) the
 * rows the cabinet renders, (b) the three facet vocabularies it filters on,
 * and (c) the small JSON index the client script filters against. No DOM.
 *
 * The one rule that matters: `bird.type` is the raw Notion string
 * ("Perching Birds", not "Perching"). Never compare it by hand — go through
 * canonicalType / typeKey / typeLabel from flock.ts, which is the reason the
 * 168-birds-rendered-grey bug cannot come back.
 */

import type { Bird } from './types';
import { birds, firstPhotoFile, locationsById, photosById } from './data';
import {
  TYPE_ORDER,
  canonicalType,
  splitName,
  typeKey,
  typeLabel,
  typeVar,
} from './flock';
import { slugify } from './groupsView';

/* ---------------- one row of the cabinet ---------------- */

export interface ListRow {
  bird: Bird;
  english: string;
  gloss: string;
  /** Has at least one image file on disk. Two spotted birds do not. */
  hasPhoto: boolean;
  /** Canonical Notion type, or '' when Notion left it blank. */
  type: string;
  /** "1".."9" | "other" */
  tkey: string;
  /** Route segment of the group this bird belongs to, or '' . */
  groupSlug: string;
  /** Position in TYPE_ORDER; 99 sorts the type-less duplicates last. */
  groupRank: number;
  tagSlugs: string[];
  colorSlugs: string[];
  /** Lower-case, diacritic-free haystack: name, gloss, scientific name. */
  q: string;
}

/**
 * Fold a search string the same way on both sides of the build.
 *
 * Apostrophes go, straight and typographic alike. Notion holds both \u2014 the two
 * Swainson's Thrush cards are spelt with U+0027 and U+2019 \u2014 so without this
 * they were two different birds to `twinOf()` and the one duplicate that most
 * needed its twin note was the only one not to get it. `slugOf` in
 * panelData.ts has always stripped `['\u2019]`; this is the same rule. It also
 * means typing either apostrophe, or none at all, finds the bird on /list.
 */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .toLowerCase()
    .trim();
}

export function hasPhotograph(bird: Bird): boolean {
  return firstPhotoFile(bird) !== null;
}

function toRow(bird: Bird): ListRow {
  const { english, gloss } = splitName(bird.name);
  const type = canonicalType(bird.type);
  const rank = (TYPE_ORDER as readonly string[]).indexOf(type);
  return {
    bird,
    english,
    gloss,
    hasPhoto: hasPhotograph(bird),
    type,
    tkey: typeKey(bird.type),
    groupSlug: type ? slugify(typeLabel(type)) : '',
    groupRank: rank === -1 ? 99 : rank,
    tagSlugs: (bird.tags ?? []).map(slugify),
    colorSlugs: (bird.colors ?? []).map(slugify),
    q: fold([english, gloss, bird.genus, type].filter(Boolean).join(' ')),
  };
}

const byName = (a: ListRow, b: ListRow) => a.english.localeCompare(b.english);

/** All 281, alphabetical — the cabinet's resting order. */
export const rows: ListRow[] = birds.map(toRow).sort(byName);

/** 238 spotted birds: the cabinet proper. Two of them have no photograph. */
export const shelved: ListRow[] = rows.filter((r) => r.bird.spotted);

/** 43 cards for birds nobody has seen yet: the hollow frames at the end. */
export const ghosts: ListRow[] = rows.filter((r) => !r.bird.spotted);

/*
 * SPOTTED IS NOT PHOTOGRAPHED, AND THE PAGE MUST NOT SAY IT IS.
 *
 * Two partitions of the same 281 cards, both true, both needed:
 *
 *   shelved / ghosts          238 / 43   was this bird seen?  — the two grids
 *   withPhoto / withoutPhoto  236 / 45   is there a picture?  — the word
 *                                        "photographed", wherever it appears
 *
 * They differ by the two spotted birds whose photo row is empty (Fish Crow,
 * and the Great Blue Heron record — TODO.md §D). Those two sit in the cabinet
 * grid and render hollow, which is why a reader who counts empty frames on
 * /list gets 45 and not 43. `scripts/og-cards.mjs` has always used the second
 * partition; the page used the first and kept the first partition's verb.
 */
export const withPhoto: ListRow[] = rows.filter((r) => r.hasPhoto);
export const withoutPhoto: ListRow[] = rows.filter((r) => !r.hasPhoto);

export const rowBySlug = new Map(rows.map((r) => [r.bird.slug, r]));

/* ---------------- facets ---------------- */

export interface Facet {
  value: string;
  slug: string;
  label: string;
  count: number;
  /** Only the Type facet carries one. */
  colour?: string;
}

/**
 * Options come from every bird on the list; the count beside each one is
 * measured over the photographed ones. Three tags only ever appear on birds
 * nobody has photographed — they are still worth offering, at zero, because
 * the filter also reaches the hollow frames at the foot of the page.
 */
function tally(pick: (r: ListRow) => string[]): Facet[] {
  const options = new Set<string>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const v of pick(row)) {
      options.add(v);
      if (row.bird.spotted) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...options]
    .map((value) => ({
      value,
      slug: slugify(value),
      label: value,
      count: counts.get(value) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The 9 types, in TYPE_ORDER, counted over the spotted birds only. */
export const typeFacets: Facet[] = TYPE_ORDER.map((type) => ({
  value: type,
  slug: slugify(typeLabel(type)),
  label: typeLabel(type),
  count: shelved.filter((r) => r.type === type).length,
  colour: typeVar(type),
})).filter((f) => f.count > 0);

export const tagFacets: Facet[] = tally((r) => r.bird.tags ?? []);

export const colorFacets: Facet[] = tally((r) => r.bird.colors ?? []);

/* ---------------- the client index ---------------- */

/**
 * What the filter script sees. Deliberately terse: all 281 of these ship
 * inline (238 shelved, then 43 ghosts), so single-letter keys are worth
 * roughly 6 KB of HTML.
 *
 *   q  haystack   t  type slug   g  tag slugs   c  colour slugs
 *   d  first-spotted date ("" when unknown)     r  group rank
 */
export interface IndexEntry {
  q: string;
  t: string;
  g: string[];
  c: string[];
  d: string;
  r: number;
}

export function indexOf(list: ListRow[]): IndexEntry[] {
  return list.map((r) => ({
    q: r.q,
    t: r.groupSlug,
    g: r.tagSlugs,
    c: r.colorSlugs,
    d: r.bird.firstSpotted ?? '',
    r: r.groupRank,
  }));
}

/* ---------------- the single-bird page ---------------- */

export interface BirdPlace {
  slug: string;
  name: string;
  scope: string;
}

/** Every image file for a bird, in page order. Empty for 45 of the 281 —
 *  the 43 nobody has seen, plus the two spotted birds whose photo row is. */
export function photoFiles(bird: Bird): string[] {
  const out: string[] = [];
  for (const pid of bird.photoIds ?? []) {
    const photo = photosById.get(pid);
    for (const file of photo?.files ?? []) out.push(file);
  }
  return out;
}

/* ---------------- cameras, and the colophon they add up to ----------------
 *
 * Notion's `camera` field is typed by hand and reads like it: six spellings
 * for three bodies — "Fujifilm XT-5 + XF 500", "iphone 15 Pro Max",
 * "Sony A7c2 + FE 70-200mm F4". Printed raw, a bird page called the camera
 * something its maker does not ("XT-5", lower-case "iphone").
 *
 * This is the whole vocabulary as of the last sync. `full` is what one
 * photograph says on a bird page — the lens stays, a specimen record is the
 * one place it is worth something. `body` is what the colophon counts, so the
 * three iPhones tally as one pocket. An unrecognised string passes through as
 * itself rather than being dropped: a new camera then shows up as its own
 * line, misspelt but present, which is the failure worth having.
 */
const CAMERAS: Record<string, { full: string; body: string }> = {
  'Fujifilm XT-5 + XF 70-300': { full: 'Fujifilm X-T5 + XF 70-300', body: 'Fujifilm X-T5' },
  'Fujifilm XT-5 + XF 500': { full: 'Fujifilm X-T5 + XF 500', body: 'Fujifilm X-T5' },
  'Sony A7c2 + FE 70-200mm F4': { full: 'Sony A7C II + FE 70-200mm F4', body: 'Sony A7C II' },
  'iphone 15 Pro Max': { full: 'iPhone 15 Pro Max', body: 'iPhone' },
  'iPhone 13': { full: 'iPhone 13', body: 'iPhone' },
  'iPhone 17 Pro': { full: 'iPhone 17 Pro', body: 'iPhone' },
};

function readCamera(raw: string): { full: string; body: string } {
  const s = raw.trim();
  return CAMERAS[s] ?? { full: s, body: s };
}

/** The camera that made a bird's first photograph, spelt properly. */
export function cameraFor(bird: Bird): string {
  for (const pid of bird.photoIds ?? []) {
    const cam = photosById.get(pid)?.camera;
    if (cam) return readCamera(cam).full;
  }
  return '';
}

export interface CameraTally {
  /** The body, without its lens: "Fujifilm X-T5". */
  body: string;
  /** How many image files it made. */
  frames: number;
}

/**
 * How the cabinet was made, counted rather than written down — the next Notion
 * sync moves all of it. Today: 1,278 frames, 1,054 of them on the X-T5.
 *
 * `frames` counts every file the cabinet's birds hold; `bodies` only the ones
 * whose row names a camera, biggest first. All 236 photo rows that hold a
 * file name one today (photos.json has 237 rows; one is empty), so the two
 * agree; if a row ever arrives without, the total stays honest and the
 * breakdown quietly sums to less.
 */
export const colophon: { frames: number; bodies: CameraTally[] } = (() => {
  const tally = new Map<string, number>();
  let frames = 0;

  for (const row of rows) {
    for (const pid of row.bird.photoIds ?? []) {
      const photo = photosById.get(pid);
      if (!photo) continue;
      const n = (photo.files ?? []).length;
      if (!n) continue;
      frames += n;
      if (!photo.camera) continue;
      const { body } = readCamera(photo.camera);
      tally.set(body, (tally.get(body) ?? 0) + n);
    }
  }

  const bodies = [...tally]
    .map(([body, n]) => ({ body, frames: n }))
    .sort((a, b) => b.frames - a.frames || a.body.localeCompare(b.body));

  return { frames, bodies };
})();

export function placesFor(bird: Bird): BirdPlace[] {
  return (bird.locationIds ?? [])
    .map((id) => locationsById.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .map((l) => ({ slug: l.slug, name: l.name, scope: l.scope }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Four birds exist as two Notion cards each (one spotted, one not), so their
 * slugs carry a `-2`. Surface the sibling instead of letting it read as a bug.
 */
const byEnglish = new Map<string, ListRow[]>();
for (const row of rows) {
  const key = fold(row.english);
  const list = byEnglish.get(key);
  if (list) list.push(row);
  else byEnglish.set(key, [row]);
}

export function twinOf(bird: Bird): ListRow | null {
  const list = byEnglish.get(fold(splitName(bird.name).english)) ?? [];
  return list.find((r) => r.bird.id !== bird.id) ?? null;
}

/**
 * How many of the hollow frames at the foot of /list are a second Notion card
 * for a bird that IS in the cabinet above — four today (Brown Creeper,
 * Greater Yellowlegs, Pied-billed Grebe, Swainson's Thrush). Counted rather
 * than written down: the owner is resolving them in Notion, and the ghost
 * wall's lede has to stay true on the sync that does it. Declared here
 * because `twinOf` needs `byEnglish` above it to have been filled.
 */
export const ghostTwins: number = ghosts.filter((r) => twinOf(r.bird)?.hasPhoto).length;

/* ---------------- field-mark formatting ---------------- */

/** 5.1 -> "5.1 in · 13 cm". Null when Notion has no measurement. */
export function formatSize(inches: number | null | undefined): string {
  if (typeof inches !== 'number' || !Number.isFinite(inches) || inches <= 0) return '';
  const cm = Math.round(inches * 2.54);
  const shown = Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
  return `${shown} in · ${cm} cm`;
}

/** 9200000 -> "9.2 million". Plain words read better than seven digits. */
export function formatPopulation(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 100 ? Math.round(m) : Number(m.toFixed(1))} million`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)},000`;
  return n.toLocaleString('en-US');
}

/** Conservation is only worth a line when it is not the default. */
export function concernWorthShowing(status: string | null | undefined): string {
  const s = (status ?? '').trim();
  return !s || s.toLowerCase() === 'low concern' ? '' : s;
}

/** Alphabetical neighbours, for the quiet prev/next at the foot of a bird. */
export function neighbours(bird: Bird): { prev: ListRow | null; next: ListRow | null } {
  const i = rows.findIndex((r) => r.bird.id === bird.id);
  return {
    prev: i > 0 ? rows[i - 1] : null,
    next: i >= 0 && i < rows.length - 1 ? rows[i + 1] : null,
  };
}
