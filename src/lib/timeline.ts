/** Geometry + palette for the timeline view. Pure functions, no DOM. */

/* Type order, the type -> CSS-variable mapping and date formatting are shared
   with the other four views; they live in flock.ts. Re-exported here so the
   timeline keeps one import. */
/* The `.ts` extension is deliberate: Vite and moduleResolution "bundler" both
   accept it, and it lets plain Node scripts — scripts/og-cards.mjs — import
   this module. Without it Node ESM refuses to resolve './flock'. Do not drop it. */
export { TYPE_ORDER, typeKey, typeVar, typeLabel, canonicalType, formatDate } from './flock.ts';
import { formatDate } from './flock.ts';
/* The site's one pen — the LCG and Catmull-Rom from `_build-map.py`, ported
   once in `./ink.ts` and shared with the map. The season bands are drawn
   with it; nothing else on this chart is. Same `.ts` extension rule as
   above: `scripts/og-cards.mjs` imports this module from bare Node. */
import { catmull, inkLine } from './ink.ts';

/* ---------- canvas ---------- */

export const DOMAIN_START = '2024-09-01';
export const DOMAIN_END = '2026-08-31';

/* Was 3.6. The 238 birds fall on only 64 days (21 on 19 Aug 2025 alone), so
   the crowding is *within* a day, and a day's dots can only get apart by
   stacking up and spilling sideways. PX_PER_DAY is the sideways budget: at 9
   a spilled dot is one calendar day out per 9 units, so the whole swarm keeps
   its dates to ~1 day on average. Raising it costs nothing but scroll length
   (the box is already a horizontal scroller); lowering it turns displacement
   into a lie. See swarm() for the measured numbers. */
export const PX_PER_DAY = 9;
export const PAD_X = 96;

/* The box is deliberately short and wide. Everything that carries data — the
   climb, the axis, the dot row — lives in the top 80% of it, so a chart that is
   clipped by a 800px-tall window still shows its data on the first screen.
   (Audit §2.2: at H=560 with DOT_Y=462 the dots, months and years were all in
   the bottom 25% of a box that was already taller than the room left for it.)

   H is load-bearing and must not move: the svg is drawn at
   `height: <available px>` and `width: height * W/H`, so the *scale* is
   `renderedHeight / H`. Every px measurement on this page — the 6.5px dot, the
   26px hit target — is that scale times a viewBox number. Growing H shrinks
   them all. Anything that needs more room has to be found inside these 520. */
export const H = 520;

export const BAND_LABEL_Y = 26;
export const CURVE_TOP = 52; /* the ceiling — "238" */
export const AXIS_Y = 230; /* the baseline — "0" */

/* The sighting band. The climb gave up 62 units of its 242 so the swarm could
   have 11 rows instead of one jittered line; 180 units is still a tall climb. */
export const DOT_Y = 362; /* centre row */
export const SWARM_ROWS = 11;
export const SWARM_STEP = 22; /* row pitch AND column pitch — a square lattice */
export const SWARM_HALF = ((SWARM_ROWS - 1) / 2) * SWARM_STEP; /* 110 */

export const GRID_BOTTOM = 480; /* month/year rules run the whole swarm now */
export const MONTH_LABEL_Y = 495;
export const YEAR_LABEL_Y = 515;

/** Visible dot, and the invisible circle you actually have to hit.
 *  HIT_R is in viewBox units; the box renders at 0.60-0.94 of viewBox scale,
 *  so 20 units is a 24-38px target. The ≤760px rule in Timeline.astro raises
 *  it to 21, because the box is drawn smaller there. 24px is the WCAG 2.5.8
 *  minimum and what audit §2.3 / §10 asked for.
 *
 *  SWARM_STEP (22) is deliberately one unit above the *largest* HIT_R (21):
 *  that is what makes "no dot centre falls inside a neighbour's hit ring"
 *  true by construction rather than by luck. Raise HIT_R and you must raise
 *  SWARM_STEP with it. */
export const DOT_R = 5;
export const HIT_R = 20;

/* ---------- dates ---------- */

const DAY = 86_400_000;

export function utc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

const START_T = utc(DOMAIN_START);
const END_T = utc(DOMAIN_END);

export const TOTAL_DAYS = Math.round((END_T - START_T) / DAY);
export const W = Math.round(TOTAL_DAYS * PX_PER_DAY + PAD_X * 2);

/** x position in viewBox units for an ISO date. */
export function x(iso: string): number {
  return PAD_X + ((utc(iso) - START_T) / DAY) * PX_PER_DAY;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- seasons ---------- */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

const SEASON_OF_MONTH: Season[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
];

export interface Band {
  season: Season;
  x: number;
  width: number;
  /** the band as a drawn shape: see `seasonBands()` */
  d: string;
}
export interface MonthTick { x: number; mid: number; label: string; year: number; isJanuary: boolean }

function eachMonth(): { year: number; month: number; start: number; end: number }[] {
  const out: { year: number; month: number; start: number; end: number }[] = [];
  const first = new Date(START_T);
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  while (Date.UTC(y, m, 1) <= END_T) {
    out.push({ year: y, month: m, start: Date.UTC(y, m, 1), end: Date.UTC(y, m + 1, 1) });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

const toX = (t: number) => PAD_X + ((t - START_T) / DAY) * PX_PER_DAY;
const clampX = (v: number) => Math.min(Math.max(v, 0), W);

/*
 * TODO B5 — the one place off the map where a drawn line says something a
 * ruled one cannot.
 *
 * The seasons used to be eight `<rect>`s, and the edge between two of them
 * was a machine-cut vertical: spring arrived at 00:00 on 1 March, to the
 * pixel, across the whole height of the chart. That is not what the data
 * says and it is not what the reader knows. Meteorological seasons are a
 * convention — the birds do not check the calendar, and the whole point of
 * the band is that it is a wash of colour behind the marks, not a category
 * anything is measured against.
 *
 * So each band is now a shape whose two vertical edges are drawn freehand
 * with the map's own pen (`./ink.ts` — the LCG from `_build-map.py` and its
 * Catmull-Rom). Two rules keep it honest:
 *
 *   - Nothing that carries data moves. The axis, the ceiling, the month
 *     grid, the climb and all 238 dots are exactly where they were; only
 *     the wash behind them breathes. A chart where the axis wobbles is a
 *     chart that is lying, and the month rules deliberately stay ruled —
 *     the tint not quite registering with them is what a hand-coloured
 *     plate looks like.
 *   - Two bands that meet share one curve, generated once and walked in
 *     both directions, so there is no seam, no overlap and no sliver of
 *     paper between spring and summer at any zoom.
 *
 * Deterministic: seeded off the boundary's index, so the same build draws
 * the same eight shapes.
 */
const BAND_EDGE_WOBBLE = 10; /* viewBox units, on a 520-unit-tall chart: about
   9 px of wander at the width this chart is usually drawn, which is what a
   hand does over 430 px of paper. At 6 it was honest and invisible. */
const BAND_EDGE_STEPS = 7; /* one slow swing every ~74 units, not a tremor */

function bandEdge(x: number, i: number): [number, number][] {
  /* pinEnds false: a wash does not pinch back to true at the top and
     bottom of the sheet, and both ends are off the chart's own edge */
  return inkLine([x, 0], [x, H], 211 + i * 13, {
    wobble: BAND_EDGE_WOBBLE,
    steps: BAND_EDGE_STEPS,
    tension: 0.9,
    pinEnds: false,
  }).pts;
}

/** Down the left edge, across the bottom, up the right edge, close. */
function bandPath(left: [number, number][], right: [number, number][]): string {
  const down = catmull(left, false, 0.9).d;
  const back = [...right].reverse();
  /* catmull always opens with M; here it is a continuation, not a new
     subpath, so the same point becomes a lineto and the shape stays one
     closed region that a fill can cross */
  const up = catmull(back, false, 0.9).d.replace(/^M/, 'L');
  return `${down} ${up} Z`;
}

/** Contiguous runs of one season, merged so we emit 8 shapes instead of 24. */
export function seasonBands(): Band[] {
  const spans: { season: Season; x: number; width: number }[] = [];
  for (const mo of eachMonth()) {
    const season = SEASON_OF_MONTH[mo.month];
    const x0 = clampX(toX(mo.start));
    const x1 = clampX(toX(mo.end));
    const last = spans[spans.length - 1];
    if (last && last.season === season && Math.abs(last.x + last.width - x0) < 0.01) {
      last.width = x1 - last.x;
    } else {
      spans.push({ season, x: x0, width: x1 - x0 });
    }
  }
  if (!spans.length) return [];
  spans[0].width += spans[0].x;
  spans[0].x = 0;
  const tail = spans[spans.length - 1];
  tail.width = W - tail.x;

  /* the two outer edges are the sheet's own, and stay straight */
  const edges: [number, number][][] = spans.map((s, i) =>
    i === 0 ? [[0, 0], [0, H]] : bandEdge(s.x, i),
  );
  edges.push([[W, 0], [W, H]]);

  return spans.map((s, i) => ({ ...s, d: bandPath(edges[i], edges[i + 1]) }));
}

export function monthTicks(): MonthTick[] {
  return eachMonth().map((mo) => ({
    x: toX(mo.start),
    mid: (toX(mo.start) + toX(mo.end)) / 2,
    label: MONTHS[mo.month],
    year: mo.year,
    isJanuary: mo.month === 0,
  }));
}

/* ---------- deterministic shuffle ---------- */

/** Stable hash -> [-1, 1]; same bird always gets the same number.
 *  It used to be the dot row's vertical jitter. The swarm below replaced the
 *  jitter with real dodging, but the hash stayed: it is what decides *which*
 *  of a day's birds takes the middle of the column, so the arrangement is
 *  still shuffled rather than alphabetical, and still identical on every
 *  build. Determinism is the property that matters; randomness never was. */
export function jitterFor(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 2001) / 1000) - 1;
}

/* ---------- cumulative curve ---------- */

export interface Pt { x: number; y: number }

/**
 * Monotone cubic (Fritsch-Carlson). Keeps the climb from ever dipping back
 * down between samples, which a plain smoothing spline would do at clusters.
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;

  const dx: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = pts[i + 1].x - pts[i].x || 1e-6;
    dx.push(d);
    delta.push((pts[i + 1].y - pts[i].y) / d);
  }

  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    const c1x = pts[i].x + t;
    const c1y = pts[i].y + m[i] * t;
    const c2x = pts[i + 1].x - t;
    const c2y = pts[i + 1].y - m[i + 1] * t;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/** One sample per distinct date: how many species had been seen by then. */
export function cumulativePoints(dates: string[]): Pt[] {
  const total = dates.length;
  if (!total) return [];
  const yFor = (c: number) => AXIS_Y - (c / total) * (AXIS_Y - CURVE_TOP);

  const pts: Pt[] = [{ x: 0, y: AXIS_Y }];
  let count = 0;
  for (let i = 0; i < total; i++) {
    count += 1;
    if (i + 1 < total && dates[i + 1] === dates[i]) continue;
    pts.push({ x: x(dates[i]), y: yFor(count) });
  }
  pts.push({ x: W, y: yFor(total) });
  return pts;
}

/* ---------- the swarm (TODO C2) ----------
 *
 * The problem, measured on the old build at 1440×800: median distance from a
 * dot's centre to its nearest neighbour was 2.5px against a 6.5px dot, and 221
 * of 238 centres sat inside some neighbour's 26px hit ring. A dot in July or
 * August was not reliably clickable, and no amount of enlarging the hit ring
 * could change that — the ring was already bigger than the spacing.
 *
 * The cause is in the data, not the drawing: 238 birds on 64 days, so up to 21
 * dots want the *same x*. A jitter of ±30 units around one line cannot separate
 * 21 dots that are 10 units wide. So the dots dodge for real.
 *
 * Rule: dots live on a square lattice of pitch SWARM_STEP (22 units) — 11 rows
 * centred on DOT_Y, columns anchored on each day's own x. A bird takes the free
 * site with the lowest cost `|Δx| + 0.34·|Δy|`, i.e. fill the day's column from
 * the middle outwards first, and only spill sideways when the column is full.
 * Because every site is ≥ 22 units from every other and the biggest hit ring is
 * 21, "no centre inside a neighbour's hit ring" is true by construction, at
 * every viewport, forever.
 *
 * Days are laid out biggest-first so the piles keep their true date and the
 * thin days do the moving; within a day the order is the deterministic hash, so
 * the same bird lands in the same seat on every build.
 *
 * What it costs, measured over the real 238 (PX_PER_DAY = 9):
 *   172 of 238 dots sit on their exact date; mean |Δx| 8.4 units = 0.93 days;
 *   p90 22 units = 2.4 days; worst 66 units = 7.3 days, all of them in the
 *   19–22 Aug 2025 pile (49 birds in four days — it cannot be drawn honestly
 *   *and* clickably, and clickable wins). The hovered day's true date is drawn
 *   as a stem down from the axis so the displacement is never hidden.
 */

const SWARM_YW = 0.34; /* how many units of sideways lie one row of height is worth */

export interface SwarmDot { id: string; iso: string; x: number; y: number; dx: number }
export interface SwarmDay { iso: string; x: number; count: number; left: number; right: number }
export interface Swarm { dots: SwarmDot[]; days: SwarmDay[]; maxDx: number; meanDx: number; exact: number }

export interface SwarmInput { id: string; slug?: string; firstSpotted?: string | null }

/** Row centres, ordered middle-first: the seat a lone bird takes is the axis row. */
function rowYs(): number[] {
  const out: number[] = [];
  const mid = (SWARM_ROWS - 1) / 2;
  for (let s = 0; s < SWARM_ROWS; s++) {
    const r = mid + (s % 2 ? -Math.ceil(s / 2) : Math.ceil(s / 2));
    out.push(DOT_Y + (r - mid) * SWARM_STEP);
  }
  return out;
}

export function swarm(list: SwarmInput[]): Swarm {
  const rows = rowYs();
  const byDay = new Map<string, SwarmInput[]>();
  for (const b of list) {
    const iso = (b.firstSpotted ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const bucket = byDay.get(iso);
    if (bucket) bucket.push(b);
    else byDay.set(iso, [b]);
  }

  const days = [...byDay.entries()]
    .map(([iso, bs]) => ({
      iso,
      x0: x(iso),
      bs: [...bs].sort(
        (a, b) =>
          jitterFor(a.id + (a.slug ?? '')) - jitterFor(b.id + (b.slug ?? '')) ||
          a.id.localeCompare(b.id),
      ),
    }))
    /* biggest days first: they earn the right to sit on their own date */
    .sort((a, b) => b.bs.length - a.bs.length || (a.iso < b.iso ? -1 : 1));

  /* occupancy, bucketed by x so the free() test stays O(1)-ish */
  const BW = SWARM_STEP * 2;
  const buckets = new Map<number, { x: number; y: number }[]>();
  const free = (px: number, py: number) => {
    const b0 = Math.floor((px - SWARM_STEP) / BW);
    const b1 = Math.floor((px + SWARM_STEP) / BW);
    for (let b = b0; b <= b1; b++) {
      const cell = buckets.get(b);
      if (!cell) continue;
      for (const q of cell) {
        const dx = q.x - px;
        const dy = q.y - py;
        if (dx * dx + dy * dy < SWARM_STEP * SWARM_STEP - 1e-6) return false;
      }
    }
    return true;
  };

  const dots: SwarmDot[] = [];
  const dayRows: SwarmDay[] = [];
  let sumDx = 0;
  let maxDx = 0;
  let exact = 0;

  for (const day of days) {
    let left = Infinity;
    let right = -Infinity;
    for (const bird of day.bs) {
      let best: { x: number; y: number; dx: number; cost: number } | null = null;
      for (const y of rows) {
        let found: { x: number; dx: number } | null = null;
        for (let k = 0; k <= 64 && !found; k++) {
          for (const sign of k === 0 ? [0] : [k, -k]) {
            const px = day.x0 + sign * SWARM_STEP;
            if (free(px, y)) { found = { x: px, dx: Math.abs(px - day.x0) }; break; }
          }
        }
        if (!found) continue;
        const cost = found.dx + SWARM_YW * Math.abs(y - DOT_Y);
        if (!best || cost < best.cost - 1e-9) best = { x: found.x, y, dx: found.dx, cost };
      }
      /* unreachable with 11 rows × 129 columns of room, but never drop a bird */
      const seat = best ?? { x: day.x0, y: DOT_Y, dx: 0, cost: 0 };
      const key = Math.floor(seat.x / BW);
      const cell = buckets.get(key);
      if (cell) cell.push({ x: seat.x, y: seat.y });
      else buckets.set(key, [{ x: seat.x, y: seat.y }]);
      dots.push({ id: bird.id, iso: day.iso, x: seat.x, y: seat.y, dx: seat.dx });
      sumDx += seat.dx;
      if (seat.dx > maxDx) maxDx = seat.dx;
      if (seat.dx < 1e-9) exact += 1;
      if (seat.x < left) left = seat.x;
      if (seat.x > right) right = seat.x;
    }
    dayRows.push({ iso: day.iso, x: day.x0, count: day.bs.length, left, right });
  }

  dayRows.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  return {
    dots,
    days: dayRows,
    maxDx,
    meanDx: dots.length ? sumDx / dots.length : 0,
    exact,
  };
}

/* ---------- birding days (TODO C6, and the data half of DESIGN §4 I1) ----------
 *
 * 238 first sightings fall on 64 days. That is the unit the record is actually
 * kept in — a trip is a run of days, and a "dense cluster on the axis" is one
 * day of one trip. This groups the birds by day and decides, honestly, where
 * the day can be said to have happened.
 *
 * The rule is DESIGN2 §0.1 / §1.1, and it is the only place on this page that
 * is allowed to invent a place. `locationIds` is an unordered, global set of
 * every place a bird was ever seen (DESIGN.md §0 fact 4), so a *vote* over
 * that set is not evidence: a bird seen at three places on three trips puts
 * all three on today's ballot. Only two things are evidence:
 *
 *   certain      a bird of the day seen at exactly ONE place ever — it can
 *                only have been there                      → name them all
 *   unique cover no certain place, but exactly one place is in every bird of
 *                the day                                   → name it
 *   scope only   no cover, but every candidate is travel (or every candidate
 *                is local)                                 → "on the road" /
 *                                                            "around home"
 *   none         mixed candidates                          → say nothing
 *
 * Over the real 238 that yields 41 / 8 / 1 / 14, exactly the counts DESIGN2
 * §0.1 measured. The 14 are days the data cannot place — most of them are
 * one-bird days where that bird turns up somewhere else later — and nothing
 * here prints a place, a guess or the word "probably" for them.
 *
 * (The previous rule here named the most-voted place whenever its share was
 * ≥ 0.6. It named 62 of 64 days, including 15 it had no evidence for — e.g.
 * "Sandy Creek Park" for eight separate one-bird days, and "New York City,
 * NY" for 9 Jul 2025, which DESIGN2 §0.1 names as the one day with travel
 * candidates but no unique one. It also withheld Denver + Rocky Mountain NP
 * from 22 Aug 2025, which is certain. It was wrong in both directions.)
 *
 * Seam for I1: everything a `/days/<iso>` page would need is already here —
 * lift this block into `src/lib/days.ts` unchanged, add the route, and make
 * the captions below links. Nothing on this page depends on where it lives.
 */

export type DayCertainty = 'certain' | 'cover' | 'scope' | 'none';

export interface BirdingDay {
  iso: string;
  /** "19 Aug 2025" */
  label: string;
  count: number;
  certainty: DayCertainty;
  /** ids of the places the rule will name; empty for 'scope' and 'none' */
  placeIds: string[];
  /** their names, best-attested first */
  places: string[];
  /** "on the road" / "around home" for a 'scope' day, "" otherwise */
  scope: string;
  /** true when the day has named places and every one of them is travel */
  travel: boolean;
  birdIds: string[];
}

export interface PlaceRec { name: string; scope?: string; lat?: number; lng?: number }
export type PlaceLookup = (id: string) => PlaceRec | null | undefined;
export interface DayInput { id: string; firstSpotted?: string | null; locationIds?: string[] | null }

function byDate<T extends { firstSpotted?: string | null }>(list: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const b of list) {
    const iso = (b.firstSpotted ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const bucket = out.get(iso);
    if (bucket) bucket.push(b);
    else out.set(iso, [b]);
  }
  return out;
}

/** "A", "A and B", "A, B and C" */
function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function birdingDays(list: DayInput[], place: PlaceLookup): BirdingDay[] {
  const out: BirdingDay[] = [];
  const nameOf = (id: string) => place(id)?.name ?? id;

  for (const [iso, bs] of byDate(list)) {
    /* 1. certain — a bird seen at exactly one place ever proves that place */
    const attest = new Map<string, number>();
    for (const b of bs) {
      const ids = [...new Set<string>(b.locationIds ?? [])];
      if (ids.length === 1) attest.set(ids[0], (attest.get(ids[0]) ?? 0) + 1);
    }

    let certainty: DayCertainty = 'none';
    let placeIds: string[] = [];

    if (attest.size) {
      certainty = 'certain';
      /* most-attested first, ties on name: the same order on every build */
      placeIds = [...attest.keys()].sort(
        (a, b) => (attest.get(b) as number) - (attest.get(a) as number) ||
          (nameOf(a) < nameOf(b) ? -1 : 1),
      );
    } else {
      /* 2. unique cover — one place that every bird of the day shares */
      let inter: Set<string> | null = null;
      for (const b of bs) {
        const s = new Set<string>(b.locationIds ?? []);
        if (inter === null) { inter = s; continue; }
        const next = new Set<string>();
        for (const v of inter) if (s.has(v)) next.add(v);
        inter = next;
      }
      const cover = [...(inter ?? [])];
      if (cover.length === 1) { certainty = 'cover'; placeIds = cover; }
    }

    /* 3. scope only — nothing nameable, but the candidates agree on the kind
          of place it was. 4. none — they do not, so the day gets no place. */
    let scope = '';
    if (!placeIds.length) {
      const cand = new Set<string>();
      for (const b of bs) for (const id of b.locationIds ?? []) cand.add(id);
      const scopes = new Set([...cand].map((id) => place(id)?.scope ?? '?'));
      if (cand.size && scopes.size === 1) {
        certainty = 'scope';
        scope = scopes.has('travel') ? 'on the road' : 'around home';
      }
    }

    const places = placeIds.map(nameOf);
    out.push({
      iso,
      label: formatDate(iso),
      count: bs.length,
      certainty,
      placeIds,
      places,
      scope,
      travel: placeIds.length > 0 && placeIds.every((id) => place(id)?.scope === 'travel'),
      birdIds: bs.map((b) => b.id),
    });
  }

  out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  return out;
}

/** The place phrase for a day, or "" when the data cannot support one. */
export function dayWhere(day: BirdingDay): string {
  return day.placeIds.length ? andList(day.places) : day.scope;
}

/** "19 Aug 2025 · Denver, CO and Colorado Springs, CO · 21 new birds".
 *  A day with no supportable place simply loses the middle clause. */
export function dayCaption(day: BirdingDay): string {
  const what = day.count === 1 ? '1 new bird' : `${day.count} new birds`;
  const where = dayWhere(day);
  return where ? `${day.label} · ${where} · ${what}` : `${day.label} · ${what}`;
}

/* ---------- trips (TODO C6) ----------
 *
 * A dot is a bird and a cluster is a day, but what the owners actually did is
 * a *trip*: a run of days away from home. DESIGN2 §0.3 is the rule, and it is
 * deliberately conservative — a run only grows through days with a CERTAIN
 * travel place (above), consecutive days no more than RUN_MAX_GAP_DAYS apart,
 * and a hop between one day's places and the next of no more than
 * RUN_MAX_HOP_MILES. That distance bar is what stops Seattle→Maui (2,646 mi)
 * and Puerto Rico→Miami (1,012 mi) from being drawn as one journey.
 *
 * Over the real data this gives 18 runs, of which 10 carry RUN_MIN_BIRDS or
 * more and are the ones worth a bracket — measured after the cover-day
 * relaxation below, which is what joined Silver Springs to Tampa:
 *
 *   NC Zoo 6 (1 day) · Wilmington 5 (1) · Colorado 49 (4) · Florida 19 (3)
 *   Boston 5 (1) · New England 7 (3) · Delmarva 13 (1) · Hawaiʻi 25 (5)
 *   Seattle 14 (5) · Oregon coast 7 (2)
 *
 * The eight that fall short are single days of one to four birds — two in
 * Puerto Rico, one in Florida, New York, Boston, New England and two more
 * around Seattle.
 */

export const RUN_MIN_BIRDS = 5;
export const RUN_MAX_GAP_DAYS = 7;
export const RUN_MAX_HOP_MILES = 250;

/* The data has no region field, so the grouping is hand-written — DESIGN2
   §1.2 says so too. A place that is not here keeps its own name. */
const REGION: Record<string, string> = {
  'Colorado Springs, CO': 'Colorado',
  'Denver, CO': 'Colorado',
  'Rocky Mountain NP, CO': 'Colorado',
  'Silver Springs, FL': 'Florida',
  'Tampa, FL': 'Florida',
  'Miami Beach, FL': 'Florida',
  'Boston, MA': 'Boston',
  'Portland, ME': 'New England',
  'Parker River, MA': 'New England',
  'Horn Pond, MA': 'New England',
  'Chincoteague, VA': 'Delmarva',
  'Cape May, NJ': 'Delmarva',
  'Islands of Hawaii': 'Hawaiʻi',
  'Seattle, WA': 'Seattle',
  'US-101, OR': 'Oregon coast',
  'New York City, NY': 'New York',
};

export interface TravelRun {
  /** the first day's iso, which is also the /days/<iso> a future link wants */
  key: string;
  region: string;
  from: string;
  to: string;
  isos: string[];
  dayCount: number;
  count: number;
  places: string[];
}

function miles(a: PlaceRec, b: PlaceRec): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 3958.8;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function travelRuns(days: BirdingDay[], place: PlaceLookup, minBirds = RUN_MIN_BIRDS): TravelRun[] {
  const groups: BirdingDay[][] = [];
  let cur: BirdingDay[] | null = null;

  for (const day of days) {
    /* A run grows through any day the evidence ladder can place — 'certain' or
       'cover'. Accepting only 'certain' contradicted the rest of the site: a
       cover day already prints its place on /days/<iso> and on its OG card, so
       breaking a trip there made the map and the ledger disagree about the same
       day (Silver Springs, 4 Dec 2025, was the case that exposed it). 'scope'
       and 'none' still break a run — they cannot name a place at all. */
    if ((day.certainty !== 'certain' && day.certainty !== 'cover') || !day.travel) { cur = null; continue; }
    if (cur) {
      const prev = cur[cur.length - 1];
      const gap = (utc(day.iso) - utc(prev.iso)) / DAY;
      let hop = Infinity;
      for (const a of prev.placeIds) {
        for (const b of day.placeIds) {
          const d = miles(place(a) ?? { name: '' }, place(b) ?? { name: '' });
          if (d < hop) hop = d;
        }
      }
      if (gap <= RUN_MAX_GAP_DAYS && hop <= RUN_MAX_HOP_MILES) { cur.push(day); continue; }
    }
    cur = [day];
    groups.push(cur);
  }

  const runs: TravelRun[] = [];
  for (const g of groups) {
    const count = g.reduce((n, d) => n + d.count, 0);
    if (count < minBirds) continue;
    const places: string[] = [];
    for (const d of g) for (const p of d.places) if (!places.includes(p)) places.push(p);
    /* the region most of the run's places agree on; a single-city trip keeps
       the city's own name, so "Boston" and "New England" stay two trips */
    const tally = new Map<string, number>();
    for (const p of places) {
      const r = REGION[p] ?? p;
      tally.set(r, (tally.get(r) ?? 0) + 1);
    }
    let region = '';
    let best = 0;
    for (const [r, n] of tally) if (n > best) { region = r; best = n; }
    runs.push({
      key: g[0].iso,
      region,
      from: g[0].iso,
      to: g[g.length - 1].iso,
      isos: g.map((d) => d.iso),
      dayCount: g.length,
      count,
      places,
    });
  }
  return runs;
}

/* ---------- where a trip bracket is drawn ----------
 *
 * DESIGN2 §1.4 asked for the bracket in "the 44-unit band above the dot row".
 * That band was measured before the swarm landed: the dots now start at
 * DOT_Y - SWARM_HALF = 252 and the axis is at 230, so the real band is 22
 * units — room for a hairline and its ticks and nothing else. The label
 * therefore sits just *above* the axis instead, where the climb's area fill
 * has faded to alpha 0.005 (the gradient is --curve-fill-bottom: transparent
 * at AXIS_Y), i.e. on bare paper, so --ink-faint keeps its 4.88:1.
 *
 * Two labels can still collide: the climb itself passes through the label
 * shelf early on (Feb 2025, when only 9 birds had been seen), and two runs
 * 90 units apart are narrower than their own labels. So the label lifts above
 * the curve where the curve is in its way, and every label that would touch
 * its left-hand neighbour lifts by one row.
 */

export const RUN_BRACKET_Y = 235;
export const RUN_TICK = 5.5;
export const RUN_LABEL_Y = 222;
export const RUN_LABEL_ROW = 18;
/* the bracket's pointer target, in viewBox units — see RunBracket.hy */
export const RUN_HIT_H = 42;
/* 12px uppercase sans at 0.12em tracking, measured in Chrome: 8.3 units/char
   is within a few units of the real advance for these ten labels. */
const RUN_CHAR_W = 8.3;

export interface RunBracket extends TravelRun {
  x0: number;
  x1: number;
  mid: number;
  bracketY: number;
  labelY: number;
  /** the pointer target: wide enough for the label, and never under 24px —
   *  at the smallest rendering (360px wide, scale 0.617) 42 units is 25.9px */
  hx0: number;
  hx1: number;
  hy: number;
  hh: number;
  /** "COLORADO · 49" */
  label: string;
  /** what the hover card and the aria-label say */
  dates: string;
  detail: string;
}

/** Linear sampler over the cumulative curve, for keeping labels off it. */
export function curveSampler(pts: Pt[]): (px: number) => number {
  return (px: number) => {
    if (!pts.length) return AXIS_Y;
    if (px <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (px <= pts[i].x) {
        const t = (px - pts[i - 1].x) / (pts[i].x - pts[i - 1].x || 1);
        return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y);
      }
    }
    return pts[pts.length - 1].y;
  };
}

export function layoutRuns(
  runs: TravelRun[],
  swarmDays: SwarmDay[],
  curveY: (px: number) => number,
): RunBracket[] {
  const seat = new Map(swarmDays.map((d) => [d.iso, d]));
  const out: RunBracket[] = [];
  let prevRight = -Infinity;
  let prevRow = 0;

  for (const run of runs) {
    /* the bracket spans the dots as drawn, not the bare dates: the swarm
       pushed the big piles sideways and the bracket has to cover them */
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const iso of run.isos) {
      const d = seat.get(iso);
      const l = d ? d.left : x(iso);
      const r = d ? d.right : x(iso);
      if (l < x0) x0 = l;
      if (r > x1) x1 = r;
    }
    x0 -= 6;
    x1 += 6;
    const mid = (x0 + x1) / 2;

    const label = `${run.region} · ${run.count}`.toUpperCase();
    const half = Math.max((label.length * RUN_CHAR_W) / 2, (x1 - x0) / 2);

    let labelY = RUN_LABEL_Y;
    /* the climb crosses the shelf only while it is still near the axis */
    const yL = curveY(mid - half);
    const yR = curveY(mid + half);
    if (yR < RUN_LABEL_Y + 2 && yL > RUN_LABEL_Y - 9) labelY = yR - 8;
    /* one row up if the label would touch the one before it */
    let row = 0;
    if (mid - half < prevRight + 8 && prevRow === 0) { row = 1; labelY -= RUN_LABEL_ROW; }
    prevRight = mid + half;
    prevRow = row;

    const dates = run.from === run.to ? formatDate(run.from) : `${formatDate(run.from)} – ${formatDate(run.to)}`;
    const what = run.count === 1 ? '1 new bird' : `${run.count} new birds`;
    const where = andList(run.places);
    const howLong = run.dayCount === 1 ? 'one day' : `${run.dayCount} days`;
    const foot = RUN_BRACKET_Y + RUN_TICK + 2;
    const hy = Math.min(labelY - 12, foot - RUN_HIT_H);
    out.push({
      ...run,
      x0,
      x1,
      mid,
      bracketY: RUN_BRACKET_Y,
      labelY,
      hx0: Math.min(x0, mid - half),
      hx1: Math.max(x1, mid + half),
      hy,
      hh: foot - hy,
      label,
      dates,
      detail: `${howLong} · ${what} · ${where}`,
    });
  }
  return out;
}
