/**
 * Build-time half of the bird overlay.
 *
 * Every view renders the same field-guide panel, so instead of each view
 * inventing its own markup we serialise the birds it shows into one JSON
 * blob and let src/lib/panel.ts fill the shared <BirdPanel /> from it.
 *
 * Server only — it calls astro:assets. Never import this from a <script>.
 *
 * ## Why `more` is a string and not an array
 *
 * Most spotted birds have several photographs (213 of 238; Barn Swallow has
 * 24, 1278 files in all). The panel pages through them, so every plate's URL
 * has to reach the client — but this payload is inlined into the HTML of
 * every page, so `[{"src":"…","w":1200,"h":800}, …]` 1042 extra times is ~90 KB
 * of pure punctuation and repeated hashes.
 *
 * So plate 2..n ship as one front/back-coded string, `more`. Neighbouring
 * plates of the same bird share a long prefix (`/_astro/<32-hex photo id>-`)
 * and a common tail (`.webp`), so each extra plate costs ~27 bytes instead of
 * ~85. `decodeMore()` in src/lib/panel.ts is the other half; the two must
 * always change together. Plate 1 stays a plain object (`img`) because it is
 * the documented shape other views read.
 */

import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { Bird } from './types';
import { locationNames, photosById } from './data';
import { photoAsset } from './images';
import { formatDate, splitName, typeKey, typeLabel } from './flock';
import { dayByIso, dayOf } from './days';
import { photoBytes } from './photoBytes.mjs';

/** The widest we ever show a plate in the overlay. */
const MAX_W = 1200;

/** Safety valve: no bird has this many photographs, but do not trust that. */
const MAX_PLATES = 40;

/* ================================================================
 * ⚠️  THE ONE PLACE THE R2 URL GOES
 * ================================================================
 *
 * The site ships every photograph at 1200 px (MAX_W above) and the viewer's
 * zoom stops at the pixels we built, so nothing on this site can ever show
 * more than that. The 1,278 originals — 6.62 GB, up to 62.6 MB and 7952 px
 * wide — are not in the build. They live in a Cloudflare R2 bucket, flat,
 * under the prefix `originals/`, keyed by exactly the file name that is
 * already in src/data/photos.json.
 *
 * To turn the "view the original" control on, put the bucket's public base
 * URL in a file called `.env` at the root of this repository:
 *
 *     PUBLIC_ORIGINALS_BASE=https://pub-xxxxxxxxxxxx.r2.dev
 *
 * and rebuild. That is the whole configuration. No trailing slash needed
 * (one is stripped), and `originals/` is added by the viewer — set the
 * bucket root here, not the prefix.
 *
 * Unset — which is what it is today — the feature is not merely hidden, it
 * is not built: `orig` never enters the payload, so there is no button, no
 * dead link, no extra byte and no change to any layout. The only other file
 * that reads this variable is src/lib/plateViewer.ts, which turns a file
 * name into the URL; it points back here rather than repeating any of this.
 *
 * `PUBLIC_` is the prefix Astro/Vite exposes to client code, which is what
 * lets the viewer read the same value. It is a public bucket URL; there is
 * nothing here to keep secret.
 */
const ORIGINALS_BASE = String(import.meta.env.PUBLIC_ORIGINALS_BASE ?? '').trim();

/**
 * file name -> bytes on disk. Only read when there is somewhere to send
 * people, so an unconfigured build does not stat 1,278 files for nothing.
 */
const originalBytes: Map<string, number> = ORIGINALS_BASE ? photoBytes() : new Map();

/** The original behind a plate: the R2 object's key, and what it weighs. */
export interface PlateOriginal {
  /** The object name under `originals/` — the same name as in photos.json. */
  name: string;
  /** Size on disk in KiB, so the viewer can say what it costs to open. */
  kb: number;
}

export interface PanelImage {
  src: string;
  w: number;
  h: number;
  /**
   * Present only when the original is genuinely bigger than the plate we
   * built. See `originalOf()`.
   */
  orig?: PlateOriginal;
}

/** One bird, flattened to strings the client can drop straight into the DOM. */
export interface PanelEntry {
  id: string;
  slug: string;
  /** Full Notion name, gloss and all: "Brown Creeper (美洲旋木雀)". */
  name: string;
  /** Just "Brown Creeper". */
  english: string;
  /** Just "美洲旋木雀", or ''. */
  gloss: string;
  genus: string;
  date: string;
  /**
   * The day this bird was first seen, `YYYY-MM-DD`, when that day has a
   * `/days/<iso>` page — which is what the overlay's date links to. Empty
   * for the 43 birds with no date, and for any dated bird whose day the
   * ledger does not hold (see DAY_PAGES below), so the link can never point
   * at a route that was never built.
   */
  iso: string;
  type: string;
  tkey: string;
  desc: string;
  size: string;
  colors: string;
  behavior: string;
  conservation: string;
  places: string;
  /** null for the 43 birds with no photograph (and for Fish Crow). */
  img: PanelImage | null;
  /**
   * Plates 2..n, encoded (see the header). Absent when the bird has one
   * photograph or none. Decode with `decodeMore(more, img.src)`.
   */
  more?: string;
  /**
   * One token per plate, in plate order, naming the original in R2 and what
   * it weighs — empty for a plate whose original we would not offer. Absent
   * entirely when PUBLIC_ORIGINALS_BASE is unset or no plate qualifies.
   * `decodeOrig()` in src/lib/panel.ts is the other half.
   */
  orig?: string;
}

/* ---------------- the day a bird belongs to ---------------- */

/*
 * Every ISO date that `/days/<iso>` was actually built for.
 *
 * `src/pages/days/[iso].astro` maps its `getStaticPaths()` straight over
 * `days` from `src/lib/days.ts`, so `dayByIso` *is* the set of built pages —
 * not a second derivation of it that could drift. Today it is 64 dates and
 * every dated bird lands on one of them, including the single unspotted bird
 * that carries a date (Northern Rough-winged Swallow, 2026-06-09, a day one
 * spotted bird — the Ring-necked Duck — holds on its own; the swallow's own
 * page says the record disagrees with itself and does not link to it). A future record where that stops being true
 * gets plain text, not a 404.
 *
 * This is why the overlay imports a view's module: `days.ts` owns the one
 * day model on the site (it wraps `birdingDays()` in `timeline.ts`), and the
 * overlay needs exactly two things from it — the set of days that have pages,
 * and who else was out on one. Copying either here is how the panel and the
 * ledger start disagreeing about what a day is.
 */

/* ---------------- plates ---------------- */

/**
 * Every photo file for a bird, in Notion order, de-duplicated and capped.
 *
 * Exported because /birds/<slug> shows the same plates as the overlay and has
 * to line its thumbnail strip up with them file for file. Drop a file whose
 * asset is missing on both sides and the two lists stay index-for-index.
 */
export function plateFiles(bird: Bird): string[] {
  return photoFiles(bird).slice(0, MAX_PLATES);
}

/** Every photo file for a bird, in Notion order, de-duplicated. */
function photoFiles(bird: Bird): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const pid of bird.photoIds ?? []) {
    for (const file of photosById.get(pid)?.files ?? []) {
      if (file && !seen.has(file)) {
        seen.add(file);
        out.push(file);
      }
    }
  }
  return out;
}

/**
 * Is there an original worth opening behind this plate, and what is it?
 *
 * Only when the original is **wider** than the plate we built. `plateOf`
 * clamps to `Math.min(MAX_W, asset.width)`, so an original of 1200 px or less
 * ships at its own full size and the plate on screen already *is* the file —
 * 149 of the 1,278 are like that, one of them 948×1266. Offering "view the
 * original" there would be a button that loads the same pixels again and
 * calls it more. This record says "43 photographs not taken" out loud; it can
 * manage to not claim a bigger file than it has.
 *
 * Two other refusals, both silent and both the same shape: no base URL
 * configured (the feature is off), and no file of that name on disk (nothing
 * to weigh, and nothing we can promise is in the bucket — the R2 key is the
 * file name, so a name we cannot see is a name we cannot vouch for).
 */
function originalOf(asset: ImageMetadata, file: string | undefined): PlateOriginal | null {
  if (!ORIGINALS_BASE || !file) return null;
  if (!(asset.width > MAX_W)) return null;
  const bytes = originalBytes.get(file);
  if (!bytes) return null;
  return { name: file, kb: Math.max(1, Math.round(bytes / 1024)) };
}

/**
 * One plate, at the size the viewer shows it. Exported so /birds/<slug> asks
 * for the *same* transform — same width, format and quality — and therefore
 * the same file, rather than making the build produce a second set.
 *
 * `file` is the photograph's name in photos.json, which is also its key in
 * the originals bucket. Leave it out and the plate simply has no original.
 */
export async function plateOf(asset: ImageMetadata, file?: string): Promise<PanelImage> {
  // Never upscale: a small original stays small and the mat takes the slack.
  const w = Math.min(MAX_W, asset.width || MAX_W);
  const h = Math.round(w * ((asset.height || w) / (asset.width || w)));
  const out = await getImage({ src: asset, width: w, format: 'webp', quality: 80 });

  const plate: PanelImage = { src: out.src, w, h };
  const orig = originalOf(asset, file);
  if (orig) plate.orig = orig;
  return plate;
}

async function plate(file: string): Promise<PanelImage | null> {
  const asset = photoAsset(file);
  return asset ? plateOf(asset, file) : null;
}

/* ---------------- the `more` codec ---------------- */

/** Two base-36 digits, so a fold can be up to 1295 characters. */
const b36 = (n: number) => n.toString(36).padStart(2, '0');

const CAP = 1295;

/**
 * `more` is `;`-separated. One plate is
 *
 *     <2-digit prefix fold><the rest of the src>,<h>[,<w>]
 *
 * The fold is the number of leading characters shared with the *previous*
 * plate's src (the first plate folds against `img.src`, which the client
 * already has), and `w` is omitted when it is MAX_W — which it is for all but
 * a handful of small originals.
 *
 * ## The fold stops at the last `/`, and must keep stopping there
 *
 * `src/integrations/prune-originals.mjs` deletes any image in the build output
 * whose **file name does not appear verbatim** somewhere in the built text.
 * That is a plain substring scan, so an encoding clever enough to fold
 * `/_astro/<32-hex id>-` — which is most of two neighbouring plates' URLs —
 * takes the file name apart, and the pruner then deletes 1042 perfectly good
 * photographs at the end of a green build. (It did. The HTML was right and
 * every plate after the first 404'd.)
 *
 * So: fold the directory, never the file name. That still pays for itself —
 * ~63 bytes a plate against ~98 for the equivalent JSON object — it just does
 * not pay as much as it could, and the difference is the price of the panel
 * not having to know how the pruner works beyond this comment.
 */
function encodeMore(list: PanelImage[], firstSrc: string): string {
  let prev = firstSrc;
  const parts: string[] = [];

  for (const im of list) {
    const s = im.src;
    let p = 0;
    const max = Math.min(s.lastIndexOf('/') + 1, prev.length, CAP);
    while (p < max && s[p] === prev[p]) p++;

    parts.push(`${b36(p)}${s.slice(p)},${im.h}${im.w === MAX_W ? '' : `,${im.w}`}`);
    prev = s;
  }

  return parts.join(';');
}

/* ---------------- the `orig` codec ---------------- */

/**
 * The file-name part of a built src — what an original's name is folded
 * against. `decodeOrig()` in src/lib/panel.ts applies the identical rule to
 * the identical string, so the two cannot disagree about where to cut.
 */
const tail = (src: string): string => src.slice(src.lastIndexOf('/') + 1);

/**
 * `orig` is `;`-separated, one token per plate **in plate order**, so token
 * `i` belongs to plate `i`. A plate we would not offer an original for gets
 * an empty token, and trailing empties are dropped. One token is
 *
 *     <2-digit prefix fold><the rest of the file name>,<size in KiB, base 36>
 *
 * ## Why the fold, and why it is safe here
 *
 * Astro builds a plate to `_astro/<original stem>.<hash>_<hash>.webp`, so the
 * plate's own src already contains almost all of the original's name:
 * `228187338e82801c9174f209e4320509-11.gZEcKk3L_1O64vH.webp` against
 * `228187338e82801c9174f209e4320509-11.png` shares 36 characters, and the
 * token is `10png,1e8m` — ten bytes rather than forty-five. Across 1,129
 * qualifying plates that is the difference between ~13 KB and ~50 KB on the
 * pages that carry every bird.
 *
 * `encodeMore()` above must *not* fold a file name, because
 * src/integrations/prune-originals.mjs keeps a built image only if its name
 * appears verbatim in the built text, and folding once deleted 1,042 good
 * photographs. This codec is the mirror image of that case and the rule
 * points the other way: these names belong to files in R2 that are **not**
 * in the build at all. `dist/` does hold Astro's own copy of some originals,
 * under a content-hashed name (`…-11.gZEcKk3L.png`), and the pruner is meant
 * to delete every one of them. Writing `…-11.png` verbatim would not match
 * that hashed name today — but it is one Vite release away from doing so,
 * and an accidental match means 825 MB back in `dist/`. Folding keeps the
 * bare name out of the output entirely, so the pruner cannot be confused by
 * it in either direction. The bytes are the reason; this is the reassurance.
 *
 * In `astro dev` the src is `/_image?href=…` instead, the fold comes out 0,
 * and every token simply carries the whole name. Same decoder, same result.
 */
function encodeOrig(plates: PanelImage[]): string {
  const parts = plates.map((p) => {
    if (!p.orig) return '';

    const name = p.orig.name;
    const against = tail(p.src);
    let f = 0;
    const max = Math.min(name.length, against.length, CAP);
    while (f < max && name[f] === against[f]) f++;

    return `${b36(f)}${name.slice(f)},${p.orig.kb.toString(36)}`;
  });

  while (parts.length && !parts[parts.length - 1]) parts.pop();
  return parts.join(';');
}

/* ---------------- entries ---------------- */

/**
 * 300+ pages ask for the same birds, and a plate costs a sharp transform, so
 * build each bird once per process. Entries are pure data — sharing them is
 * safe, and it is what keeps the build from growing 5x with the extra plates.
 */
const memo = new Map<string, Promise<PanelEntry>>();

export function panelEntry(bird: Bird): Promise<PanelEntry> {
  let hit = memo.get(bird.id);
  if (!hit) {
    hit = buildEntry(bird);
    memo.set(bird.id, hit);
  }
  return hit;
}

/**
 * The bird's day, but only if that day has a page. '' otherwise.
 *
 * Exported because /birds/<slug> prints the same date and links it to the
 * same place, and a second copy of the gate is how one of them ends up
 * emitting /days/undefined. One set, one predicate, two callers.
 */
export function dayPage(firstSpotted: string | null | undefined): string {
  const iso = (firstSpotted ?? '').slice(0, 10);
  return dayByIso.has(iso) ? iso : '';
}

/* ---------------- who else was out that day ---------------- */

/**
 * The company a bird was found in, as one small table keyed by ISO date.
 *
 * A life list records species; a day records company. 219 of the 238 spotted
 * birds share their first day with at least one other bird — 19 do not, the
 * Brown Creeper among them — and the overlay says so in one line at the foot
 * of the field marks. ("Day", not "morning": there is no time of day in this
 * data, and days.ts:92 is the rule.)
 *
 * ## Why a day table and not a `with` field on every bird
 *
 * Companions are a property of the *day*, not of the bird: every bird of 19
 * Aug 2025 has the same twenty-one-bird list minus itself. Hanging three
 * names off all 238 entries would pay for that list once per bird (~14 KB on
 * a page that shows everything); one row per day pays for it once per day.
 * Measured on the full 238-bird payload: **3,785 bytes**, against ~206 KB of
 * `PanelEntry`, so companions cost 1.8% of the page's overlay and nothing at
 * all in images. The entry itself grows by zero bytes — it already carries
 * `iso`, which is the key.
 *
 * ## The wire format
 *
 *     "<how many birds that day>:<name>;<name>;…"     up to DAY_NAMES names
 *
 * A name is the bird's English name alone when `slugOf()` rebuilds its slug
 * from it — true for all 238 today — and `<name>|<slug>` when it does not, so
 * the client can always reach `/birds/<slug>` without the table carrying a
 * slug it can derive. `companionsOf()` in src/lib/panel.ts is the other half;
 * the two must always change together.
 *
 * Nothing is inlined but text: no thumbnails, no new image requests, and so
 * nothing for `scripts/prune-originals.mjs` to mistake for a dead file.
 */

/*
 * How many of a day's birds travel. The line shows three, and the bird you
 * are looking at may itself be one of them, so four is the smallest number
 * that always leaves three others to name.
 */
const DAY_NAMES = 4;

/**
 * The slug the build gave this bird, rebuilt from its English name.
 *
 * Verified against all 238 spotted birds: it agrees every time. The table
 * still writes an explicit slug for any bird where it would not, so a future
 * name with a character this rule eats can never become a 404.
 */
const slugOf = (english: string): string =>
  english
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** iso -> `"<count>:<name>;…"`, for the days the given birds were found on. */
export function companionTable(list: Bird[]): Record<string, string> {
  const out: Record<string, string> = {};

  for (const bird of list) {
    const iso = dayPage(bird.firstSpotted);
    if (!iso || out[iso]) continue;

    const day = dayOf(iso);
    if (!day) continue;

    /* day.birds is `inDayOrder` — field-guide order, the same order the
       day's own page lays its grid out in, so the three names the overlay
       shows are the first three tiles you meet when you follow the link. */
    const names = day.birds.slice(0, DAY_NAMES).map((b) => {
      const { english } = splitName(b.name);
      return slugOf(english) === b.slug ? english : `${english}|${b.slug}`;
    });

    out[iso] = `${day.count}:${names.join(';')}`;
  }

  return out;
}

async function buildEntry(bird: Bird): Promise<PanelEntry> {
  const files = plateFiles(bird);
  const plates = (await Promise.all(files.map(plate))).filter((p): p is PanelImage => p !== null);

  const { english, gloss } = splitName(bird.name);

  const entry: PanelEntry = {
    id: bird.id,
    slug: bird.slug,
    name: bird.name,
    english,
    gloss,
    genus: bird.genus ?? '',
    date: formatDate(bird.firstSpotted),
    iso: dayPage(bird.firstSpotted),
    type: typeLabel(bird.type) || (bird.type ?? ''),
    tkey: typeKey(bird.type),
    desc: bird.description ?? '',
    size: typeof bird.sizeInches === 'number' ? `${bird.sizeInches} in` : '',
    colors: (bird.colors ?? []).join(', '),
    behavior: (bird.behavior ?? []).join(', '),
    conservation: bird.conservation ?? '',
    places: locationNames(bird).join(' · '),
    img: plates[0] ?? null,
  };

  if (plates.length > 1) entry.more = encodeMore(plates.slice(1), plates[0].src);

  const orig = encodeOrig(plates);
  if (orig) entry.orig = orig;

  return entry;
}

/** id -> entry, in one pass. Duplicated ids collapse, which is what we want. */
export async function panelPayload(list: Bird[]): Promise<Record<string, PanelEntry>> {
  const entries = await Promise.all(list.map(panelEntry));
  const out: Record<string, PanelEntry> = {};
  for (const e of entries) out[e.id] = e;
  return out;
}

/** JSON safe to drop inside <script type="application/json">. */
export function serialise(payload: Record<string, unknown>): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
