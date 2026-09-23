/**
 * The record as its owners kept it: 64 outings, not 238 rows.
 *
 * Every one of the 238 spotted birds carries exactly one `firstSpotted`
 * date, and those dates fall on only 64 distinct days. A day is therefore
 * the one unit in this data with a real chronology and a real story — a
 * trip report that was always in the JSON and has never had a page.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It is not a second place-for-a-day rule. `birdingDays()` in
 * `./timeline.ts` is the only one on the site (DESIGN2 §0.1 / §1.1), it
 * reproduces that section's measurement exactly — 41 certain / 8 unique
 * cover / 1 scope-only / 14 unplaceable — and it is imported here rather
 * than re-implemented. Same for `travelRuns()`, which is what the
 * timeline's brackets are drawn from: both views read the same array off
 * the same call, or they would quietly disagree about what a trip is.
 *
 * They do not draw the same number of brackets, and that is deliberate
 * rather than a disagreement. `travelRuns()` groups the 64 days into 18
 * runs, 10 of which carry RUN_MIN_BIRDS or more; the timeline brackets all
 * 10, and the ledger below brackets the 6 that last longer than a day (see
 * `runs`). A third surface, the pencil routes on /places, draws the 4 of
 * those 10 that name two or more places on one map — mapView.ts says so at
 * its own route block. Three counts, one rule, each one stating what it
 * counts.
 *
 * It was left in `timeline.ts` on purpose. That module is the foundation's
 * (`src/lib/README.md` §1) and `Timeline.astro` imports the whole block
 * from it; moving the code would have meant editing a foundation file to
 * gain nothing but a nicer filename. This module imports, enriches, and
 * adds only what a *page about a day* needs and a chart about time does
 * not: the birds themselves in reading order, the season, the run
 * position, the neighbours, and the pencil line in the ledger's margin.
 *
 * 14 of the 64 days cannot be placed by any honest rule. Nothing here
 * invents a place for them; the pages print the count and stop.
 */

import type { Bird } from './types';
import { timelineBirds, locationsById } from './data';
import { TYPE_ORDER, canonicalType, formatDate, splitName } from './flock';
import {
  birdingDays,
  dayWhere,
  jitterFor,
  seasonBands,
  travelRuns,
  x as xOf,
  type BirdingDay,
  type Season,
  type TravelRun,
} from './timeline';

/* ---------------- season ---------------- */

/*
 * Which season a date fell in — sampled off the timeline's own bands rather
 * than from a second copy of SEASON_OF_MONTH, so `/days` and `/timeline` can
 * never disagree about what month it is. Eight bands over the record's two
 * years, 64 lookups, once, at build time.
 */
const BANDS = seasonBands();

export function seasonOf(iso: string): Season {
  const px = xOf(iso);
  for (const b of BANDS) if (px >= b.x && px < b.x + b.width) return b.season;
  return BANDS[BANDS.length - 1]?.season ?? 'winter';
}

/* ---------------- one day ---------------- */

export interface Day extends BirdingDay {
  /** the day's birds, field-guide order — see `inDayOrder` */
  birds: Bird[];
  season: Season;
  /** the place phrase, or "" on the 14 days the data cannot place */
  where: string;
  /** the trip this day belongs to, if it belongs to one */
  run: LedgerRun | null;
  /** 1-based position inside that run */
  runIndex: number;
  prev: Day | null;
  next: Day | null;
}

export interface LedgerRun extends TravelRun {
  /** "COLORADO · 4 DAYS", for the margin */
  label: string;
  /** "a four-day trip" */
  length: string;
}

/*
 * The order birds are shown in, on the index strip and in the day's grid.
 *
 * It is TYPE_ORDER then English name — a field-guide order, deliberately.
 * There is no time of day anywhere in this data (DESIGN2 §0.4 / §1.5), so a
 * grid that looked chronological would be a lie about a morning nobody
 * recorded. Grouping by family is the honest arrangement and it is the one
 * a paper checklist uses.
 */
const typeRank = (type: string | null | undefined): number => {
  const i = (TYPE_ORDER as readonly string[]).indexOf(canonicalType(type));
  return i === -1 ? TYPE_ORDER.length : i;
};

export function inDayOrder(list: Bird[]): Bird[] {
  return [...list].sort(
    (a, b) =>
      typeRank(a.type) - typeRank(b.type) ||
      splitName(a.name).english.localeCompare(splitName(b.name).english),
  );
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const spell = (n: number) => WORDS[n] ?? String(n);

/* ---------------- the 64 ---------------- */

const placeOf = (id: string) => locationsById.get(id) ?? null;
const birdById = new Map(timelineBirds.map((b) => [b.id, b]));

const base = birdingDays(timelineBirds, placeOf);

/*
 * The trips, from the same rule and the same threshold the timeline's
 * brackets use (RUN_MIN_BIRDS). Single-day runs are dropped here and only
 * here: a bracket over one row brackets nothing, and "Delmarva, day 1 of 1"
 * is a worse eyebrow than "a day out". Ten runs come back and six survive
 * the filter — the four dropped are NC Zoo (8 Feb 2025), Wilmington
 * (21 Jun 2025), Boston (14 Feb 2026) and Delmarva (1 May 2026), each one
 * day. The timeline still brackets all ten, which is why one of its
 * brackets can point at a day this ledger leaves unbracketed.
 */
export const runs: LedgerRun[] = travelRuns(base, placeOf)
  .filter((r) => r.dayCount > 1)
  .map((r) => ({
    ...r,
    label: `${r.region} · ${r.dayCount} days`.toUpperCase(),
    length: `a ${spell(r.dayCount)}-day trip`,
  }));

const runByIso = new Map<string, { run: LedgerRun; index: number }>();
for (const run of runs) run.isos.forEach((iso, i) => runByIso.set(iso, { run, index: i + 1 }));

export const days: Day[] = base.map((d) => {
  const seat = runByIso.get(d.iso);
  return {
    ...d,
    birds: inDayOrder(d.birdIds.map((id) => birdById.get(id)).filter((b): b is Bird => Boolean(b))),
    season: seasonOf(d.iso),
    where: dayWhere(d),
    run: seat?.run ?? null,
    runIndex: seat?.index ?? 0,
    prev: null,
    next: null,
  };
});

for (let i = 0; i < days.length; i++) {
  days[i].prev = days[i - 1] ?? null;
  days[i].next = days[i + 1] ?? null;
}

export const dayByIso = new Map(days.map((d) => [d.iso, d]));
export const dayOf = (iso: string): Day | null => dayByIso.get(iso) ?? null;

/* ---------------- what the index says about itself ---------------- */

export const firstDay = days[0];
export const lastDay = days[days.length - 1];

/*
 * THREE BUCKETS, NOT TWO, AND THEY HAVE TO ADD UP TO 64.
 *
 * The evidence ladder in `birdingDays()` has four rungs and the ledger prints
 * three different things:
 *
 *   certain 41 + cover 8 = 49   a place with a name        -> namedDays
 *   scope             1         only a kind of place       -> scopedDays
 *                               (2025-07-09, which prints "on the road")
 *   none             14         nothing at all             -> unplacedDays
 *
 * The index lede used to name the first and the last and quietly lose the
 * middle one, so it said 49 + 14 and claimed to be exhaustive over 64. All
 * three are exported now, and `namedDays + scopedDays + unplacedDays` is an
 * invariant worth keeping: it must equal `days.length`.
 */

/** days the rule can print a place for by name: 'certain' + 'cover' */
export const namedDays = days.filter((d) => d.placeIds.length > 0).length;
/** days it can only print a kind of place for: 'scope' — one, "on the road" */
export const scopedDays = days.filter((d) => d.certainty === 'scope').length;
/** days it cannot place at all: 'none' prints nothing */
export const unplacedDays = days.filter((d) => d.certainty === 'none').length;
/** the rows that print any place phrase at all — namedDays + scopedDays */
export const placedDays = namedDays + scopedDays;

/**
 * Whole days from one ISO date to another — how far the visitor's today is
 * past the record's last line. UTC on calendar dates, so no DST hour can
 * round a day away. Negative when `to` is earlier.
 */
export function daysSince(from: string, to: string): number {
  const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** "19 Aug 2025" -> the ledger's day numeral, "19" */
export const dayNumeral = (iso: string): string => String(Number(iso.slice(8, 10)));

/** "AUGUST 2025", once per month in the ledger */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const monthKey = (iso: string): string => iso.slice(0, 7);
export const monthLabel = (iso: string): string =>
  `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export interface Month {
  key: string;
  label: string;
  days: Day[];
}

export const months: Month[] = (() => {
  const out: Month[] = [];
  for (const d of days) {
    const key = monthKey(d.iso);
    const last = out[out.length - 1];
    if (last && last.key === key) last.days.push(d);
    else out.push({ key, label: monthLabel(d.iso), days: [d] });
  }
  return out;
})();

/** "21 new birds" / "1 new bird". Never "birds seen" — a revisit with no new
 *  species left no trace in this data and must not be implied (DESIGN2 §1.5). */
export const newBirds = (n: number): string => (n === 1 ? '1 new bird' : `${n} new birds`);

/** The one-line summary a day page's `<title>` and meta description want. */
export function daySummary(day: Day): string {
  return day.where
    ? `${formatDate(day.iso)} · ${day.where} · ${newBirds(day.count)}`
    : `${formatDate(day.iso)} · ${newBirds(day.count)}`;
}

/* ---------------- the pencil in the margin ---------------- */

/*
 * A run of days gets a bracket drawn down the ledger's left margin, one
 * segment per row, so the line survives a month heading landing in the
 * middle of a trip (Seattle 2026 does exactly that) without any of the rows
 * having to know about each other.
 *
 * Every segment is drawn in a 12 x 100 box that the row stretches vertically
 * (`preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke`), and
 * every segment enters at the same x as it leaves, so the joins between rows
 * are invisible and the whole thing reads as one line put down in one go.
 *
 * The wobble is `jitterFor` — the timeline's own deterministic hash, the one
 * that decides which bird sits in the middle of a day's column — so the same
 * trip gets the same line on every build. The smoothing below is the idea of
 * `catmull()` in mapView.ts at a twelfth of its scale; that function is
 * module-private and speaks in map coordinates. If a third caller ever wants
 * a pencil line, export catmull instead of copying this again.
 */
const SPINE = 8.5; /* where the line runs, in the 12-unit box */
const WOBBLE = 1.15;
const TICK = 4.2; /* how far the end caps reach in toward the page */

function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i];
    const mx = (cx + pts[i + 1][0]) / 2;
    const my = (cy + pts[i + 1][1]) / 2;
    d += ` Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const end = pts[pts.length - 1];
  d += ` T ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  return d;
}

export type Cap = 'start' | 'mid' | 'end' | 'solo';

/** Path data for one row's worth of bracket, in a `0 0 12 100` viewBox. */
export function pencilSegment(seed: string, cap: Cap): string {
  const pts: [number, number][] = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    /* the two ends stay on the spine so consecutive rows meet exactly */
    const wob = i === 0 || i === N ? 0 : jitterFor(`${seed}:${i}`) * WOBBLE;
    pts.push([SPINE + wob, (i / N) * 100]);
  }

  /* the spine, then the two serifs that make it a bracket and not a rule */
  let d = smooth(pts);
  if (cap === 'start' || cap === 'solo') {
    const y = (1.6 + jitterFor(`${seed}:top`) * 0.9).toFixed(2);
    d = `M ${(SPINE - TICK).toFixed(2)} ${y} L ${d.slice(2)}`;
  }
  if (cap === 'end' || cap === 'solo') {
    const y = (98.4 + jitterFor(`${seed}:bot`) * 0.9).toFixed(2);
    d += ` L ${(SPINE - TICK).toFixed(2)} ${y}`;
  }
  return d;
}
