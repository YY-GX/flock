/**
 * The home page: a flock that wheels, notices the pointer, and re-forms
 * into whichever view you are thinking about — a map with the home birds in
 * an inset box off the coast, a bar chart of days out, nine ringed clumps, a
 * wreath round the words.
 *
 * Everything here is transforms. Four nested boxes per bird so no two motions
 * ever fight over one `transform` property:
 *
 *   .fb      x + morph         — set by this file, animated by a CSS transition
 *   .fb__y   y + scale         — the same transition on the other axis
 *   .fb__p   parallax          — set by this file, lerped in a rAF loop
 *   .fb__d   drift             — a CSS keyframe animation, never touched here
 *
 * There was a fifth box, .fb__z, holding a depth-of-field blur at the rim of
 * the wheel (B6). Read back as "some photographs are out of focus" rather
 * than as air, so it is gone and no bird on this page is ever filtered.
 * Distance is carried by size, by the packing gradient below, and by the
 * parallax.
 *
 * x and y are split because CSS interpolates one translate3d in a straight
 * line and a straight line from the rim to a formation goes through the
 * words; two boxes with two easings bow it into an arc (C4, see `apply`).
 *
 * Nothing in here is load-bearing: with no JavaScript the flock falls back to
 * a plain centred wrap (see the <noscript> in index.astro), and under
 * `prefers-reduced-motion` we lay the birds out once and then go quiet.
 *
 * Owned by the home view. See src/lib/README.md for the shared contract.
 */

import { navigate } from 'astro:transitions/client';
import { birdData } from './panel';
import { inkArrow, rng } from './ink';
import locationsData from '../data/locations.json';
import mapMeta from '../data/map-meta.json';

type ViewName = 'map' | 'timeline' | 'groups' | 'list';

interface Spot {
  x: number;
  y: number;
  s: number;
}

interface FlockBird {
  el: HTMLElement;
  /** the y+scale box, nested inside `el` — see index.astro's five-box note */
  yel: HTMLElement;
  par: HTMLElement;
  /** bird id, from BirdThumb's data-bird — looks the bird's places up */
  bid: string;
  /** picture edge in CSS px, as rendered by BirdThumb */
  size: number;
  /** 0-8 type index, 9 = unknown */
  type: number;
  /** first-spotted, `YYYY-MM-DD`; '' for a bird with no date */
  iso: string;
  /** the same day as UTC ms, for ordering; 0 when there is no date */
  day: number;
  /** importance: 0 is the most worth keeping when space is short */
  rank: number;
  /** spatial index, drives the swirl */
  i: number;
  /** home position, centre of the picture, in container px */
  hx: number;
  hy: number;
  /** where the stream put it, before the birds pushed each other about */
  ax: number;
  ay: number;
  /** how much clear paper this bird wants around it — grows with the radius */
  air: number;
  /** where it is right now, for the parallax hit test */
  cx: number;
  cy: number;
  /** current parallax offset and where it is heading */
  px: number;
  py: number;
  tx: number;
  ty: number;
}

/* ---------------- deterministic noise ---------------- */

/** Same bird, same jitter, every resize — so the flock does not reshuffle. */
function hash(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ---------------- the real map, for the "Where" formation ---------------- */

/*
 * The "Where" lean uses the same geometry /places does. locations.json already
 * carries every place projected into one of two viewBoxes — x/y are
 * percentages 0-100 of the space named by `mapSpace` — so we reuse those
 * numbers rather than re-projecting lat/lng here. Whatever the generator
 * (src/assets/map/_build-map.py) decides, the flock leans into.
 *
 * One honest wrinkle. Eighteen of the thirty-seven places are in the Research
 * Triangle, a box about forty miles across; at country scale they are one
 * pixel (map-meta.json: spaces.triangle.anchorOnUs).
 *
 * We used to spread them into a 30%-wide inset so the clump would not be one
 * dot. That was a lie the coastline could not support: with a ghost United
 * States drawn under the flock (DESIGN.md §1.3) an inset of that size covers
 * a third of the country and the picture stops being a map. So the Triangle
 * is now exactly what it is — one pin. Thirty-four of the flock's fifty-eight
 * birds land on it, and the existing golden-angle blob plus the pin
 * relaxation turn that into a clump over North Carolina with the coastline
 * beneath it. That clump *is* the record: 48 of these 58 birds were seen at a
 * Triangle place at some point, which is what makes the clump the true shape
 * of the picture even though the pin itself only holds 34 of them (see the
 * ring comment in the 'map' formation for why those two numbers differ).
 */

const US_VB = mapMeta.spaces.us.viewBox;
/** where the whole Triangle sits on the US map, percent of the US viewBox */
const TRI_ANCHOR = mapMeta.spaces.triangle.anchorOnUs;
const US_ASPECT = US_VB.width / US_VB.height; // 1.408

interface LocLite {
  name: string;
  scope?: string;
  x?: number | null;
  y?: number | null;
  mapSpace?: string;
}

/**
 * Place name -> position in the US stage box, 0..1 each way, y downwards.
 * Names are unique across locations.json, and the panel payload on the page
 * gives us a bird's places by name, so a name is the key we can actually join
 * on from a <script> without shipping birds.json to the home page.
 */
const PLACE_UV = new Map<string, { u: number; v: number }>();
/** The eighteen `scope: "local"` places — everything the ink ring means. */
const HOME_PLACES = new Set<string>();
for (const loc of locationsData as LocLite[]) {
  if (typeof loc.x !== 'number' || typeof loc.y !== 'number') continue;
  const space = loc.mapSpace ?? (loc.scope === 'local' ? 'triangle' : 'us');
  if (space === 'triangle') {
    // all eighteen local places are one pin at country scale — see above
    HOME_PLACES.add(loc.name);
    PLACE_UV.set(loc.name, { u: TRI_ANCHOR.x / 100, v: TRI_ANCHOR.y / 100 });
  } else {
    // includes the Hawaii and Puerto Rico pins, which locations.json already
    // places inside their inset boxes — exactly where /places draws them
    PLACE_UV.set(loc.name, { u: loc.x / 100, v: loc.y / 100 });
  }
}

/**
 * ONE of the places on a bird's record — the one Notion happens to list
 * first — read off the panel payload already inlined in the page. Null when
 * the payload is missing or the bird has no place.
 *
 * It is not "the first place it was seen" and the home page's caption must
 * not say so. `locationIds` is a Notion relation: an unordered set, with no
 * dates on it and no chronology in it (DESIGN2 §0). For 82 of the 281 birds
 * the raw order is not even alphabetical. So position 0 is a stable,
 * arbitrary pick — stable is what the formation needs, arbitrary is what the
 * words have to admit.
 */
function placeOnRecord(id: string): string | null {
  if (!id) return null;
  const places = birdData()[id]?.places;
  if (!places) return null;
  return places.split(' · ')[0]?.trim() || null;
}

/* ---------------- one page's worth of state ---------------- */

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PHONE = 560;
const PARALLAX_R = 210; // px — how close you have to get before a bird moves
const PARALLAX_MAX = 26; // px — how far it goes

/* The home formation. Three streams, each turning SWEEP radians as it unwinds
   from the words out to the edge of the paper. SWEEP is deliberately smaller
   than the 2π/arms between the streams: the difference is the clear sky that
   makes a stream read as a stream. CROSS is a stream's half-width in px of
   arc, and AIR_IN/AIR_OUT are the clear paper a bird wants around it at the
   inside and the outside of the wheel — that gradient is what stops the flock
   reading as evenly-spaced wallpaper. */
const SWEEP = 1.35; // rad — 77°, against 120° between streams
const SWEEP_PHONE = 2.1; // two streams 180° apart, so they can open wider
/** Where stream 0 points. Down, which puts the other two upper-left and
 *  upper-right and leaves the gaps above the title and over the compass. */
const STREAM_0 = Math.PI / 2;
const CROSS = 92;
/** ...but never wider than this in angle, or the streams merge near the words,
 *  where a stream's width is a big slice of the circle. */
const CROSS_MAX = 0.16;
const CROSS_PHONE = 42;
const AIR_IN = 9;
const AIR_OUT = 32;
const AIR_IN_PHONE = 7;
const AIR_OUT_PHONE = 18;
/** The compass sits bottom-left. Its reach from those two edges, halo included. */
const COMPASS_X = 150;
const COMPASS_Y = 134;
/* How far a hover carries the flock toward each formation.
 *
 * Where and When go all the way (DESIGN.md §1.2). A half-finished map is not
 * a map, and the reason the morph was "baffling" is that it never arrived:
 * sixty per cent of the way to America is a scatter. The "leaning" idea
 * survives as *scale and faintness* instead — the birds land smaller than
 * they fly (0.7 / s_when) over a ghost of the destination's own scaffold, so
 * it still reads as "the flock is about to become this", except now you can
 * tell what "this" is.
 *
 * Which went to 1 too: its rings only make sense round finished clumps. All
 * was the last to keep a lean, and the lean is what made it fail to read as
 * a grid — at 0.8 every bird stops a fifth of its own flight short of its
 * cell, so the lattice is 80% of a lattice, tight where the swirl was dense
 * and loose where it was not. A frame round the words has to be a frame. */
const MORPH_T: Record<string, number> = {
  map: 1,
  timeline: 1,
  groups: 1,
  list: 1,
};
const PHONE_T = 0.72; // phones do a gentler version of the same move
/** ...except for the three that must complete to mean anything: a map, a
 *  chart, and a lattice — 72% of a lattice is a scatter. */
const FULL: Record<string, boolean> = { map: true, timeline: true, list: true };

/** Per-bird stagger, ms. Destination order × this, so a formation lays itself
 *  down the way a hand draws it: west to east, oldest to newest. 58 birds at
 *  4ms is 0–228ms, inside the 820ms the move itself takes. */
const SWEEP_STEP = 4;

/* ---------------- When: one column per day out ----------------
 *
 * The record's dates are a spike, not a line: the flock's 58 birds fall on
 * 31 days and 19 of those days are July–August 2025. On a linear axis that is
 * a pile two-thirds of the way along, and it read as a mistake rather than as
 * "one summer did most of the work". So the axis is no longer linear in time.
 * Every day the flock was first seen on gets one equal slot, in order, and a
 * day's birds stack into a column on that slot — a bar chart of outings, in
 * chronological order, with every bird still standing on its own day. The
 * scaffold says the axis is stretched: month ticks bunch where months went by
 * with no new bird and spread where the summer was, and each month that owns
 * a slot is named under it.
 */
/** Clear paper between two discs in a column, px. */
const COL_GAP = 4;
/** A disc on the When axis is never bigger than this, px; never smaller than the floor. */
const COL_D_MAX = 44;
const COL_D_MIN = 10;

/* ---------------- Where: the Triangle as /places draws it ----------------
 *
 * Thirty-four of the flock's fifty-eight birds have a Triangle place first
 * on their record. Packed as photographs on North Carolina — a state 65
 * viewBox units from the coast — they were a clump wider than the state at
 * every window size, half of it in the Atlantic, and the pen ring round it
 * read as a mark that had missed. The pins were in register to the pixel;
 * the *sizes* were not: a bird is CSS px and the map is not.
 *
 * /places already has the honest idiom for this. The Triangle there is a
 * small ring at its true spot and a dashed inset box out in the empty
 * Atlantic with the local places drawn large inside it, joined by a pen
 * leader: the same "enlarged here" box the artwork uses for Hawaiʻi and
 * Puerto Rico. The home page now does exactly that with the birds. The ring
 * is 3.1% of the map's width, the same mark as /places; the box holds the
 * home birds; nothing sits on the sea.
 */
/** Home birds never fly bigger than this; the box may shrink them further. */
const S_HOME_MAX = 0.5;
/** Travel birds, at a 1110px map; scaled a little with the map so a pin stays
 *  a pin against the coastline rather than swallowing a state. */
const S_TRAVEL = 0.6;
/** Clear paper between two birds inside the home box, px. */
const HOME_AIR = 5;
/** How much of the box's area the discs (with their air) may claim: what a
 *  short relaxation can be trusted to pack without leaving overlaps. */
const BOX_FILL = 0.58;
/** Paper wanted east of the coast for the home box, px. The map slides west,
 *  then shrinks, to make it. */
const BOX_ROOM = 290;
const BOX_ROOM_PHONE = 112;
/** Sea between the coast and the box's left edge, px. */
const BOX_GAP = 14;
/** The ring: 3.1% of the map's width, exactly the /places mark. */
const RING_R = 0.031;
/** The coast east of the Triangle, viewBox units: measured off the artwork at
 *  layout time, this is only the fallback when the ghost is not in the DOM. */
const COAST_U = 888;
/** The widest excursion of the four drift keyframes in index.astro, px. */
const DRIFT_MAX = 16;

let teardown: Array<() => void> = [];

function setup(): void {
  const root = document.getElementById('flock') as HTMLElement | null;
  if (!root || root.dataset.wired === '1') return;
  root.dataset.wired = '1';

  const hub = root.querySelector('.hub') as HTMLElement | null;
  const ways_ = root.querySelector('.ways') as HTMLElement | null;
  const groupTags = Array.from(root.querySelectorAll<HTMLElement>('.scaf__tag'));
  const groupRings = Array.from(root.querySelectorAll<HTMLElement>('.scaf__ring'));
  /* The ghost coastline's own land, so the formation can ask the artwork
     "is this the sea?" instead of guessing. `:scope > g > path.land` is the
     two mainland shapes only; the islands inside the inset boxes are
     `.inset > g > path` and their birds are clamped to the boxes instead. */
  const ghostSvg = root.querySelector<SVGSVGElement>('.scaf--map svg');
  const landPaths = ghostSvg
    ? Array.from(ghostSvg.querySelectorAll<SVGGeometryElement>(':scope > g > path.land'))
    : [];
  const homeBox = root.querySelector<SVGRectElement>('.scaf--box rect');
  const homeBoxSvg = root.querySelector<SVGSVGElement>('.scaf--box');
  const homeLabel = root.querySelector<HTMLElement>('.scaf__boxlbl');
  const leadSvg = root.querySelector<SVGSVGElement>('.scaf--lead');
  const leadShaft = root.querySelector<SVGPathElement>('.scaf--lead .scaf__shaft');
  const leadHead = root.querySelector<SVGPathElement>('.scaf--lead .scaf__head');
  const tlStrip = root.querySelector<HTMLElement>('.scaf--tl');
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.fb'));
  if (!nodes.length) return;

  const birds: FlockBird[] = nodes.map((el, i) => ({
    el,
    yel: (el.querySelector('.fb__y') ?? el) as HTMLElement,
    par: el.querySelector('.fb__p') as HTMLElement,
    bid: el.querySelector<HTMLElement>('[data-bird]')?.dataset.bird ?? '',
    size: Number(el.dataset.size) || 56,
    type: Number(el.dataset.type ?? 9),
    iso: el.dataset.iso ?? '',
    day: el.dataset.iso ? Date.UTC(+el.dataset.iso.slice(0, 4), +el.dataset.iso.slice(5, 7) - 1, +el.dataset.iso.slice(8, 10)) : 0,
    rank: Number(el.dataset.rank) || 0,
    i,
    hx: 0,
    hy: 0,
    ax: 0,
    ay: 0,
    air: 12,
    cx: 0,
    cy: 0,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
  }));

  let W = 0;
  let H = 0;
  let phone = false;
  let scale = 1;
  let live: FlockBird[] = [];
  // the hole in the middle where the words live — birds go round it, always
  let hubCx = 0;
  let hubCy = 0;
  let hubHW = 0;
  let hubHH = 0;
  /** the hub's real left edge and the bottom of the row of four words, both
   *  root-relative px — the two numbers the two scaffolds are hung off */
  let hubL = 0;
  let waysBottom = 0;
  /** bottom of the caption belonging to each view — the swarm hangs off it */
  const hintBottom: Partial<Record<ViewName, number>> = {};
  /** What a formation must not land on: the words plus that view's own
   *  caption. Two sizes — `tight` for the two views that go all the way,
   *  where the box is placed to miss the type already and a generous hole
   *  would only deform the picture; `wide` for the two that lean, which get
   *  the rest-state air so the composition keeps breathing. */
  interface Box { cx: number; cy: number; hw: number; hh: number; grow: number }
  const keepOut: Partial<Record<ViewName, Box>> = {};
  const keepWide: Partial<Record<ViewName, Box>> = {};
  /** the ghost map's box, px; also written to #flock as --gx…--gh */
  let gx = 0;
  let gy = 0;
  let gw = 0;
  let gh = 0;
  /** the When axis: the line the columns stand on, and the x-range it spans */
  let axisY = 0;
  let axisX0 = 0;
  let axisX1 = 0;
  const forms: Partial<Record<ViewName, Spot[]>> = {};
  /** bird.i -> its rank in the order the formation lays itself down */
  const orders: Partial<Record<ViewName, number[]>> = {};
  let held: ViewName | null = null;

  /* ---------------- home: three streams wheeling round the words ----------------
   *
   * The flock has to read as a flock, which means structure you can see
   * without being told about it. Three streams, 120° apart, each sweeping 77°
   * as it unwinds outward: less than the spacing, so there is always clear
   * paper between one stream and the next.
   *
   * Depth comes from density, not from the sizes alone — birds crowd in close
   * to the words and thin out toward the rim, because the clear paper each one
   * asks for (`air`) grows with its radius. The outer bound is a rounded box
   * rather than the raw rectangle, so a stream heading into a corner is not
   * stretched half again as far as its neighbours.
   */

  function layout(): void {
    W = root!.clientWidth;
    H = root!.clientHeight;
    if (!W || !H) return;
    phone = W < PHONE;
    // index.astro sizes the birds for a 1440px page; smaller paper flies them
    // smaller, a touch more so now the biggest bird is 100px rather than 86.
    scale = phone ? 0.58 : W < 900 ? 0.78 : 1;

    // On a phone we fly far fewer birds — the best-photographed ones.
    const keep = phone ? 24 : W < 900 ? 40 : birds.length;
    live = [];
    for (const b of birds) {
      const off = b.rank >= keep;
      b.el.classList.toggle('fb--off', off);
      if (!off) live.push(b);
    }

    // The centre block is a hole in the flock: nothing may land on the words.
    const rr = root!.getBoundingClientRect();
    const hr = hub ? hub.getBoundingClientRect() : null;
    const cx = (hubCx = hr ? hr.left - rr.left + hr.width / 2 : W / 2);
    const cy = (hubCy = hr ? hr.top - rr.top + hr.height / 2 : H / 2);
    /* 16 on a phone, not 14: a favourite there is 58px, clear() grows the
       hole by half its radius (14.5), and at 14 the four of them sat on the
       hub's edge by half a pixel */
    let hw = (hubHW = (hr ? hr.width / 2 : 160) + (phone ? 18 : 40));
    let hh = (hubHH = (hr ? hr.height / 2 : 120) + (phone ? 16 : 28));
    hubL = hr ? hr.left - rr.left : W / 2 - 160;
    /* Off the words themselves, not the row: the row now carries a hit area
       that hangs below it (see the hover handling), and the scaffolds hang
       off where the type ends. */
    waysBottom = cy + hh;
    if (ways_) {
      let wb = 0;
      for (const a of ways_.querySelectorAll<HTMLElement>('.way')) wb = Math.max(wb, a.getBoundingClientRect().bottom - rr.top);
      if (wb) waysBottom = wb;
    }

    /* Each caption is a real box even at opacity 0, and it is the thing the
       formations actually have to miss — the words alone would let the
       swarm sit on the one line that explains it. Measured per view, so the
       North Carolina clump is only held off by the caption "Where" shows. */
    for (const el of root!.querySelectorAll<HTMLElement>('.hub__hint')) {
      const v = el.dataset.for as ViewName | undefined;
      if (!v) continue;
      const q = el.getBoundingClientRect();
      const l = q.left - rr.left;
      const t = q.top - rr.top;
      hintBottom[v] = t + q.height;
      if (!hr) continue;
      const x0 = Math.min(hr.left - rr.left, l);
      const x1 = Math.max(hr.right - rr.left, l + q.width);
      const y0 = Math.min(hr.top - rr.top, t);
      const y1 = Math.max(hr.bottom - rr.top, t + q.height);
      const mid = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
      keepOut[v] = { ...mid, hw: (x1 - x0) / 2 + 4, hh: (y1 - y0) / 2 + 4, grow: 1 };
      keepWide[v] = {
        ...mid,
        hw: (x1 - x0) / 2 + (phone ? 18 : 40),
        hh: (y1 - y0) / 2 + (phone ? 14 : 28),
        grow: 0.5,
      };
    }

    /* Reduced motion never morphs, so the caption is the *only* thing that
       explains the four words — and a bird at rest can land right on it.
       Widen the hole in the flock to take all four captions in. Motion
       users keep the composition exactly as it was: there the caption only
       appears while a formation is holding, and the formation's own
       keep-out box has already been told about it. */
    if (still && hr) {
      let x0 = hr.left - rr.left;
      let x1 = hr.right - rr.left;
      let y1 = hr.bottom - rr.top;
      for (const el of root!.querySelectorAll<HTMLElement>('.hub__hint')) {
        const q = el.getBoundingClientRect();
        x0 = Math.min(x0, q.left - rr.left);
        x1 = Math.max(x1, q.right - rr.left);
        y1 = Math.max(y1, q.bottom - rr.top);
      }
      const y0 = hr.top - rr.top;
      hubCx = (x0 + x1) / 2;
      hubCy = (y0 + y1) / 2;
      hw = hubHW = (x1 - x0) / 2 + (phone ? 16 : 30);
      hh = hubHH = (y1 - y0) / 2 + (phone ? 16 : 30);
    }

    scaffolds();

    const arms = phone ? 2 : 3;
    const per = Math.ceil(live.length / arms);
    const margin = phone ? 18 : 24;
    const sweep = phone ? SWEEP_PHONE : SWEEP;
    const cross = phone ? CROSS_PHONE : CROSS;
    const airIn = phone ? AIR_IN_PHONE : AIR_IN;
    const airOut = phone ? AIR_OUT_PHONE : AIR_OUT;

    live.forEach((b, j) => {
      const half = (b.size * scale) / 2;
      const arm = j % arms;
      const step = Math.floor(j / arms);
      /* How far along its stream this bird sits, 0 at the words, 1 at the rim.
         The jitter is less than one step, so the order along the stream holds
         and no two birds are born on the same spot. */
      const t = Math.min(1, (step + 0.5 + (hash(b.i, 1) - 0.5) * 0.62) / per);
      /* Radius rises faster than t, so the inside of the wheel gets more birds
         per square inch than the rim. That gradient is the depth cue. */
      const rho = Math.pow(t, 0.78);
      // the stream turns as it goes out, centred on its own axis
      const a0 = STREAM_0 + (arm * 2 * Math.PI) / arms + sweep * (t - 0.5);

      const rIn = edge(a0, hw, hh);
      const rOut = rounded(a0, W / 2 - half - margin, H / 2 - half - margin);
      const span = Math.max(24, rOut - rIn);
      let r = rIn + span * (0.03 + 0.97 * rho);
      r += (hash(b.i, 3) - 0.5) * span * 0.16;
      r = Math.max(rIn + 4, Math.min(rOut, r));

      /* Spread across the stream, not along it. The band fans as it goes, the
         way a real one does: tight at the head, looser at the tail, where
         there is paper to spare. */
      const wide = cross * (0.55 + 0.95 * rho);
      const a = a0 + (hash(b.i, 2) - 0.5) * 2 * Math.min(wide / Math.max(60, r), CROSS_MAX);
      b.air = airIn + (airOut - airIn) * rho;

      let x = cx + Math.cos(a) * r;
      let y = cy + Math.sin(a) * r;

      [x, y] = offCompass(x, y, half);

      b.hx = b.ax = Math.max(half + margin, Math.min(W - half - margin, x));
      b.hy = b.ay = Math.max(half + margin, Math.min(H - half - margin, y));
    });

    /* Streams overlap themselves here and there, and a bird wants more room at
       the rim than it does by the words. A few relaxation passes settle that,
       each one easing every bird back toward the place in its stream it was
       born at, so the structure survives the shoving — the same trick the map
       formation uses on its pins. 58 birds, so the O(n²) is a rounding error,
       and it only runs on resize. Birds are never pushed into the words, onto
       the compass, or off the paper. */
    const relax = (passes: number, pull: number, airMul: number): void => {
      for (let pass = 0; pass < passes; pass++) {
        let moved = false;
        for (let a = 0; a < live.length; a++) {
          for (let b2 = a + 1; b2 < live.length; b2++) {
            const p = live[a];
            const q = live[b2];
            const want = ((p.size + q.size) * scale) / 2 + ((p.air + q.air) / 2) * airMul;
            let dx = q.hx - p.hx;
            let dy = q.hy - p.hy;
            let d = Math.hypot(dx, dy);
            if (d >= want) continue;
            if (d < 0.01) {
              dx = hash(p.i, 7) - 0.5;
              dy = hash(q.i, 8) - 0.5;
              d = Math.hypot(dx, dy) || 1;
            }
            const push = ((want - d) / d) * 0.5;
            p.hx -= dx * push;
            p.hy -= dy * push;
            q.hx += dx * push;
            q.hy += dy * push;
            moved = true;
          }
        }
        for (const b2 of live) {
          const half = (b2.size * scale) / 2;
          // back toward its own place in the stream
          b2.hx += (b2.ax - b2.hx) * pull;
          b2.hy += (b2.ay - b2.hy) * pull;
          b2.hx = Math.max(half + margin, Math.min(W - half - margin, b2.hx));
          b2.hy = Math.max(half + margin, Math.min(H - half - margin, b2.hy));
          // keep the hole in the middle open
          [b2.hx, b2.hy] = clear(b2.hx, b2.hy, half, margin);
          [b2.hx, b2.hy] = offCompass(b2.hx, b2.hy, half);
          b2.hx = Math.max(half + margin, Math.min(W - half - margin, b2.hx));
          b2.hy = Math.max(half + margin, Math.min(H - half - margin, b2.hy));
        }
        if (!moved) break;
      }
    };

    relax(20, 0.05, 1);
    // The pull-back can leave two pictures a hair apart. A last few passes
    // with no pull and a hard no-touch floor tidy that up without undoing the
    // density gradient the full-air passes just built.
    relax(6, 0, 0.3);

    for (const k of Object.keys(forms) as ViewName[]) delete forms[k];
    for (const k of Object.keys(orders) as ViewName[]) delete orders[k];
    apply(held, held ? morphT(held) : 0, 0);
    root!.classList.add('is-ready');
  }

  const morphT = (v: ViewName) => MORPH_T[v] * (phone && !FULL[v] ? PHONE_T : 1);

  /* ---------------- where the two scaffolds hang ----------------
   *
   * Birds cannot draw the United States; paper can. index.astro ships a ghost
   * of each destination's own scaffold — the real `us.svg` coastline, and a
   * hairline time axis — and this is the one place that decides where they
   * go. The boxes are published as custom properties on #flock so the CSS can
   * place the ghosts without a second measuring pass, and the formations read
   * the same numbers, so ghost and flock are in register by construction.
   */
  function scaffolds(): void {
    const pad = phone ? 22 : 56;

    /* the band the map may use, vertically */
    let bandY = pad;
    let bandH = H - 2 * pad;
    if (phone) {
      /* The words are nearly the paper's width here, so there is no country
         to hang off and the map has to take a band above or below them. It
         takes whichever is taller — at 390x740 that is the empty sky over
         the title, and the difference is 346x246 against 171x122, which is
         the difference between a coastline and a smudge. The lower band
         stops at the compass; the upper one at the paper. */
      const lo = { y: waysBottom + 20, h: H - COMPASS_Y - (waysBottom + 20) };
      const hi = { y: 12, h: hubCy - hubHH - 16 };
      const band = hi.h > lo.h ? hi : lo;
      bandY = band.y;
      bandH = Math.max(90, band.h);
      gw = Math.min(W - 2 * pad, bandH * US_ASPECT);
      gh = gw / US_ASPECT;
      gx = (W - gw) / 2;
      gy = bandY + (bandH - gh) / 2;
    } else {
      /* Fitted *uniformly* — the old 1.45x stretch would have made the ghost
         coastline a fat America. Then slid sideways so the map's 38% line
         sits on the hub's left edge, which drops the words on Kansas: the
         middle of the country is empty of pins, and the Denver cluster stops
         at x 606 against an eyebrow that starts at 633. If a data sync ever
         moves a pin into the text, nudge 0.38 — not the data. */
      gw = Math.min(W - 2 * pad, (H - 2 * pad) * US_ASPECT);
      gh = gw / US_ASPECT;
      gx = Math.max(pad, Math.min(W - pad - gw, hubL - 0.38 * gw));
      gy = (H - gh) / 2;
    }

    /* The home box needs empty Atlantic east of the Carolinas. First slide
       the map west (the words move east onto Missouri, still no pins), then,
       if the paper is too narrow for that, shrink the map. Between Denver
       (35%) and the NC Zoo (81%) there is nothing to collide with. */
    const room0 = phone ? BOX_ROOM_PHONE : BOX_ROOM;
    const coastK = COAST_U / US_VB.width;
    let room = W - pad - (gx + coastK * gw);
    if (room < room0) {
      gx = Math.max(pad, gx - (room0 - room));
      room = W - pad - (gx + coastK * gw);
    }
    if (room < room0) {
      gw = Math.max(120, (W - 2 * pad - room0) / coastK);
      gh = gw / US_ASPECT;
      gx = pad;
      gy = bandY + (bandH - gh) / 2;
    }

    /* When: the line the columns stand on. On a desktop it is low, and it
       starts east of the compass rather than lifting the whole chart over it
       for the sake of the one September 2024 bird in the first slot. On a
       phone the compass and the hub leave no band below, so the columns take
       the sky over the title, where the map goes too. */
    if (phone) {
      axisX0 = pad;
      axisX1 = W - pad;
      axisY = Math.max(90, hubCy - hubHH - 24);
    } else {
      axisX0 = Math.max(pad, COMPASS_X + 16);
      axisX1 = W - pad;
      axisY = H - 56;
    }

    landCache.clear();
    const s = root!.style;
    s.setProperty('--gx', `${gx.toFixed(1)}px`);
    s.setProperty('--gy', `${gy.toFixed(1)}px`);
    s.setProperty('--gw', `${gw.toFixed(1)}px`);
    s.setProperty('--gh', `${gh.toFixed(1)}px`);
    /* the artwork's own label size, 12.5 viewBox units, in px */
    s.setProperty('--gs', (gw / US_VB.width).toFixed(4));
    s.setProperty('--tx', `${axisX0.toFixed(1)}px`);
    s.setProperty('--ty', `${(axisY - 50).toFixed(1)}px`);
    s.setProperty('--tw', `${(axisX1 - axisX0).toFixed(1)}px`);
    s.setProperty('--th', '100px');
    if (leadSvg) leadSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  /**
   * Is this point (root px) on the drawn mainland? Asked of the ghost
   * artwork itself, in its own viewBox units, so the answer is the coastline
   * the viewer sees and not a second copy of it. True when the ghost is not
   * in the DOM, so nothing depends on it.
   */
  const landCache = new Map<number, boolean>();
  function onLand(x: number, y: number): boolean {
    if (!landPaths.length || !gw || !gh) return true;
    /* quantised to 2px and cached: a hover's worth of relaxation asks the
       same few thousand questions many times over */
    const kx = Math.round(x / 2);
    const ky = Math.round(y / 2);
    const key = kx * 65536 + ky;
    const hit = landCache.get(key);
    if (hit !== undefined) return hit;
    const u = ((kx * 2 - gx) / gw) * US_VB.width;
    const v = ((ky * 2 - gy) / gh) * US_VB.height;
    const pt = new DOMPoint(u, v);
    let on = false;
    for (const path of landPaths) {
      if (path.isPointInFill(pt)) {
        on = true;
        break;
      }
    }
    landCache.set(key, on);
    return on;
  }

  /** On land with room for the drift: the keyframes wander a bird up to
   *  DRIFT_MAX px in any direction for ever, so a bird parked a pixel inside
   *  the shoreline would be in the sea half the time. */
  function onLandSafe(x: number, y: number): boolean {
    /* the drift is 16px whatever the map's size; on a 250px phone map that
       is wider than Florida, so there the margin shrinks with the map and a
       bird may drift over the shoreline for part of its cycle */
    const m = Math.min(DRIFT_MAX, 0.0145 * gw);
    return onLand(x, y) && onLand(x + m, y) && onLand(x - m, y) && onLand(x, y + m) && onLand(x, y - m);
  }

  /** The nearest drift-safe land to (x, y), searched in rings of 6px out to
   *  `maxR`; the point itself when it already qualifies, null when the search
   *  finds nothing (a pin in mid-ocean, which the data does not have). */
  function nearestLand(x: number, y: number, maxR: number): [number, number] | null {
    if (onLandSafe(x, y)) return [x, y];
    for (let r = 6; r <= maxR; r += 6) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 10));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
        const qx = x + Math.cos(a) * r;
        const qy = y + Math.sin(a) * r;
        if (onLandSafe(qx, qy)) return [qx, qy];
      }
    }
    return null;
  }

  /** Distance from a centre out to a rectangle's edge, along angle `a`. */
  function edge(a: number, halfW: number, halfH: number): number {
    const c = Math.max(1e-3, Math.abs(Math.cos(a)));
    const s = Math.max(1e-3, Math.abs(Math.sin(a)));
    return Math.min(halfW / c, halfH / s);
  }

  /**
   * The same, but out to a *rounded* box — an ellipse at n=2, the raw
   * rectangle as n grows. At n=3 the corners are still used, but a stream
   * heading into one is no longer flung a quarter again as far out as its
   * neighbours, so radius stays comparable from one angle to the next.
   */
  function rounded(a: number, halfW: number, halfH: number): number {
    const c = Math.abs(Math.cos(a)) / Math.max(1, halfW);
    const s = Math.abs(Math.sin(a)) / Math.max(1, halfH);
    return Math.pow(c * c * c + s * s * s, -1 / 3);
  }

  /**
   * The compass sits bottom-left at 40% ink and must stay legible. Slide a
   * bird out of its corner the short way — and count the hover caption, which
   * hangs below the picture and is what actually lands on the compass.
   */
  function offCompass(x: number, y: number, half: number): [number, number] {
    const cap = phone ? 16 : 22;
    if (x - half >= COMPASS_X || y + half + cap <= H - COMPASS_Y) return [x, y];
    const outX = COMPASS_X + half;
    const outY = H - COMPASS_Y - half - cap;
    if (outX - x < y - outY) return [outX, y];
    return [x, outY];
  }

  /**
   * Slide a bird off the words by the shortest way out of their box. Sideways
   * if there is room — on a phone the words are nearly as wide as the paper,
   * so it goes up or down instead and the flock splits above and below.
   */
  function clear(x: number, y: number, half: number, margin: number, box?: Box): [number, number] {
    /* `box` is for the two formations that go all the way. The generous
       rest-state hole — the words plus 40px of air — would shove the North
       Carolina clump halfway into the Atlantic for nothing; the map's box is
       already placed to miss the type (§1.3 checks every pin against the
       measured text). So those two get the real edge of the words and their
       own caption instead, and clear the *picture*, not just its centre.
       Which is what keeps 1280x800 and 390px honest, where the clump is
       bigger relative to the paper than the design's 1440 check. */
    const cx0 = box ? box.cx : hubCx;
    const cy0 = box ? box.cy : hubCy;
    const grow = half * (box ? box.grow : 0.5);
    const dx = x - cx0;
    const dy = y - cy0;
    const ox = (box ? box.hw : hubHW) + grow - Math.abs(dx);
    const oy = (box ? box.hh : hubHH) + grow - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return [x, y];
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    const nx = x + sx * ox;
    const room = nx >= half + margin && nx <= W - half - margin;
    if (ox < oy && room) return [nx, y];
    return [x, y + sy * oy];
  }

  /* ---------------- the four formations ---------------- */

  function formation(view: ViewName): Spot[] {
    const cached = forms[view];
    if (cached) return cached;
    const out: Spot[] = new Array(birds.length);
    const m = live.length || 1;
    const pad = phone ? 22 : 56;

    if (view === 'timeline') {
      /* One equal slot per day the flock was first seen on, in order; a
         day's birds stack into a column on it, biggest name at the bottom.
         The axis is therefore a sequence of outings, not a ruler — the
         scaffold built below says so with ticks that bunch — and every bird
         still stands on its own day, which is what the caption promises. The
         cumulative curve /timeline draws is deliberately NOT here: the
         columns are the count. */
      const dated = live.filter((b) => b.day > 0);
      const days = Array.from(new Set(dated.map((b) => b.iso))).sort();
      const K = Math.max(1, days.length);
      const slotW = (axisX1 - axisX0) / K;
      const slotX = (k: number) => axisX0 + (k + 0.5) * slotW;
      const cols = new Map<string, FlockBird[]>();
      for (const b of dated) {
        const g = cols.get(b.iso);
        if (g) g.push(b);
        else cols.set(b.iso, [b]);
      }
      for (const g of cols.values()) g.sort((p, q) => p.rank - q.rank);

      /* One disc size for everybody — a column is a count, and a count needs
         equal units. It is bounded three ways: by the slot, so neighbouring
         columns never touch; by the paper above the axis; and, for the slots
         that stand under the words, by the caption, which the tallest summer
         column must clear. On a phone the slots are 20px and the discs are
         dots, which is what 360ms of a touch deserves. */
      const keep = keepOut.timeline;
      let d = Math.min(COL_D_MAX, slotW - 6);
      days.forEach((iso, k) => {
        const n = cols.get(iso)?.length ?? 0;
        if (!n) return;
        const x = slotX(k);
        const underWords = !phone && !!keep && Math.abs(x - keep.cx) < keep.hw + slotW / 2;
        const ceiling = underWords ? (hintBottom.timeline ?? waysBottom) + 10 : pad;
        const roomH = axisY - 2 - ceiling;
        d = Math.min(d, roomH / n - COL_GAP);
      });
      d = Math.max(COL_D_MIN, d);

      days.forEach((iso, k) => {
        const g = cols.get(iso) ?? [];
        const x = slotX(k);
        g.forEach((b, j) => {
          out[b.i] = {
            x,
            y: axisY - 2 - d / 2 - j * (d + COL_GAP),
            s: d / (b.size * scale),
          };
        });
      });
      /* a bird with no date: on the line, off the end, and honest about it */
      live.filter((b) => !b.day).forEach((b, j) => {
        out[b.i] = { x: axisX1 + 20 + j * (d + COL_GAP), y: axisY - 2 - d / 2, s: d / (b.size * scale) };
      });

      markDays(days, slotX, slotW);
      // oldest day first, and up each column
      orders[view] = rankBy(live, (b) => (b.day || 9e15) * 10 + (cols.get(b.iso)?.indexOf(b) ?? 0));
    } else if (view === 'map') {
      /* The real thing: every bird flies to a place on its record, taken from
         locations.json and reprojected into a stage box. That box is exactly
         the one the ghost coastline is drawn in — scaffolds() computes it
         once and both read it — so the flock lands *on* America rather than
         near it. Measured at 0.0–0.1px between pin and artwork; what follows
         is about the birds' *sizes*, which are px and do not scale with the
         map. */
      const bw = gw;
      const bh = gh;
      const bx = gx;
      const by = gy;
      const kpx = bw / US_VB.width; // px per viewBox unit

      /* Birds sharing a place share a pin — ten of them came from the
         apartment alone. Clump them round it with a golden-angle spiral,
         the same trick the "Which" formation uses, so a pin reads as one
         place with a weight rather than as a pile. */
      const byPlace = new Map<string, FlockBird[]>();
      const unplaced: FlockBird[] = [];
      for (const b of live) {
        const key = placeOnRecord(b.bid);
        const uv = key ? PLACE_UV.get(key) : undefined;
        if (!uv || !key) {
          unplaced.push(b);
          continue;
        }
        const g = byPlace.get(key);
        if (g) g.push(b);
        else byPlace.set(key, [b]);
      }

      const homeX = bx + (TRI_ANCHOR.x / 100) * bw;
      const homeY = by + (TRI_ANCHOR.y / 100) * bh;
      /* the /places ring, to the unit */
      const ringR = RING_R * bw;
      /* travel birds scale a little with the map, so a pin stays a pin */
      const sTravel = S_TRAVEL * Math.max(0.85, Math.min(1.2, bw / 1110));

      /* the two inset boxes, px — a Hawaiʻi bird never leaves Hawaiʻi's box */
      const insets = mapMeta.spaces.us.insets.map((ins) => ({
        id: ins.id,
        x0: bx + (ins.rect.x / US_VB.width) * bw,
        y0: by + (ins.rect.y / US_VB.height) * bh,
        x1: bx + ((ins.rect.x + ins.rect.width) / US_VB.width) * bw,
        y1: by + ((ins.rect.y + ins.rect.height) / US_VB.height) * bh,
      }));
      const insetOf = (u: number, v: number) =>
        insets.find((r) => {
          const x = bx + u * bw;
          const y = by + v * bh;
          return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
        }) ?? null;

      /* ---- 1. the coast, asked of the artwork ----
         Walk east from the Triangle until the drawn land ends. 65 viewBox
         units on today's artwork; measured rather than written down so a
         redrawn coastline moves the box with it. */
      let coastX = homeX + COAST_U * kpx - (TRI_ANCHOR.x / 100) * bw;
      if (landPaths.length) {
        for (let dx = 0; dx <= 0.14 * bw; dx += 2) {
          if (!onLand(homeX + dx, homeY)) {
            coastX = homeX + dx;
            break;
          }
        }
      }

      /* ---- 2. the home box ----
         Off the coast, level with the Triangle and a little below it, the
         way /places hangs its box; as wide as the paper allows, as tall as
         the birds need. The birds inside are scaled to fit it, never above
         S_HOME_MAX, so at a narrow window the box stays a box and the
         pictures get smaller — which is the truth at country scale anyway. */
      const homeBirds: FlockBird[] = [];
      for (const [key, group] of byPlace) if (HOME_PLACES.has(key)) homeBirds.push(...group);
      const lblH = Math.max(16, 12.5 * kpx + 8);
      const boxX0 = Math.max(coastX + BOX_GAP, homeX + 0.028 * bw);
      const boxX1 = W - pad;
      const boxW = Math.max(60, boxX1 - boxX0);
      /* a little lower than /places hangs its box (5.8%), to leave the
         coast south-east of the ring for Wilmington's pin */
      const boxY0 = homeY + 0.1 * bh;
      /* on a phone the map sits over the title, so the box stops above it */
      const boxYMax = phone ? Math.min(H - 12, hubCy - hubHH - 6) : H - 24;
      const boxMaxH = Math.max(40, boxYMax - boxY0);
      /* discs-with-air area for a given scale */
      const claim = (s: number) => {
        let a = 0;
        for (const b of homeBirds) a += (b.size * scale * s + HOME_AIR) ** 2;
        return a;
      };
      let sHome = S_HOME_MAX;
      const innerMax = (boxW - 8) * (boxMaxH - lblH - 8);
      for (let it = 0; it < 30 && claim(sHome) > BOX_FILL * innerMax; it++) sHome *= 0.94;
      const innerH = Math.min(boxMaxH - lblH - 8, Math.max(0.6 * boxW, claim(sHome) / BOX_FILL / (boxW - 8)));
      const boxH = homeBirds.length ? innerH + lblH + 8 : 0;
      const box = { x0: boxX0, y0: boxY0, x1: boxX0 + boxW, y1: boxY0 + boxH };

      /** a bird, where it wants to be, the pin it belongs to, and its scale */
      interface Pin {
        b: FlockBird;
        x: number;
        y: number;
        /** the pin this bird belongs to, after the dodge below */
        ax: number;
        ay: number;
        s: number;
        half: number;
        home: boolean;
        /** the inset box this bird is confined to, if any */
        inset: { x0: number; y0: number; x1: number; y1: number } | null;
      }
      const pins: Pin[] = [];

      /** Golden-angle blob round one pin — the trick "Which" uses too, so a
       *  pin reads as one place with a weight rather than as a pile. Sized
       *  off the discs it has to hold rather than off a constant: n discs
       *  spaced `2·half + air` apart fill a disc of radius ≈ spacing·√(0.28n). */
      function blobOf(group: FlockBird[], ps: number, air: number): number {
        const n = group.length;
        if (n < 2) return 0;
        let sumHalf = 0;
        for (const b of group) sumHalf += (b.size * scale * ps) / 2;
        return ((2 * sumHalf) / n + air) * Math.sqrt(0.28 * n);
      }
      function lay(
        group: FlockBird[],
        ax: number,
        ay: number,
        ps: number,
        blob: number,
        home: boolean,
        inset: Pin['inset'] = null,
      ): void {
        const n = group.length;
        group.forEach((b, k) => {
          const a = k * 2.39996 + hash(b.i, 12);
          const r = blob * Math.sqrt(k / n); // k = 0 sits exactly on the pin
          pins.push({
            b,
            x: ax + Math.cos(a) * r,
            y: ay + Math.sin(a) * r,
            ax,
            ay,
            s: ps,
            half: (b.size * scale * ps) / 2,
            home,
            inset,
          });
        });
      }

      /* inside the box: spiral out from its centre, then let the walls and
         the pairwise pushes settle it — the islands in a printed inset */
      const homeInner = { x0: box.x0 + 4, y0: box.y0 + 4, x1: box.x1 - 4, y1: box.y1 - lblH - 4 };
      lay(
        homeBirds,
        (homeInner.x0 + homeInner.x1) / 2,
        (homeInner.y0 + homeInner.y1) / 2,
        sHome,
        Math.min(homeInner.x1 - homeInner.x0, homeInner.y1 - homeInner.y0) * 0.42,
        true,
        homeInner,
      );

      /* ---- 3. the travel pins ----
         A pin may not sit on the ring, on the box, or in the sea. The NC
         Zoo's pin is 16 units from the Triangle's and Wilmington's 27, so
         both would land on the ring; they are displaced outward along their
         own bearing until they clear, swinging round the words and the water
         — the cartographer's dodge, and what `_build-map.py` does to the
         pins on /places round the same marker. The whole pin moves, so a
         place stays one clump and keeps its true direction from home as far
         as the land allows. */
      const inBox = (x: number, y: number, r: number) =>
        box.y1 > box.y0 && x + r > box.x0 && x - r < box.x1 && y + r > box.y0 && y - r < box.y1;
      for (const [key, group] of byPlace) {
        if (HOME_PLACES.has(key)) continue;
        const uv = PLACE_UV.get(key)!;
        let ax = bx + uv.u * bw;
        let ay = by + uv.v * bh;
        const inset = insetOf(uv.u, uv.v);
        const blob = blobOf(group, sTravel, phone ? 6 : 10);
        let maxHalf = 0;
        for (const b of group) maxHalf = Math.max(maxHalf, (b.size * scale * sTravel) / 2);
        if (inset) {
          lay(group, ax, ay, sTravel, blob, false, inset);
          continue;
        }
        /* Where may this pin stand? Off the ring by the width of its own
           blob (plus the drift), off the box, off the words, on the paper,
           and on drift-safe land. If its true spot fails, search outward
           from the true spot in rings and take the first that passes, so a
           displaced pin lands as near to where it really is as the rules
           allow — Wilmington stays south of the Triangle rather than being
           swung round to Virginia. The coast east of the Carolinas is
           tight: ring, box, words and sea leave a five-bird blob nowhere to
           stand at full size, so a pin that finds nothing tries again
           smaller, and as a last resort takes the nearest dry spot off the
           box and the words, whatever the ring says. */
        let ps = sTravel;
        let placedAt: [number, number] | null = null;
        for (const f of [1, 0.8, 0.65, 0.5]) {
          ps = sTravel * f;
          const pb = blobOf(group, ps, phone ? 6 : 10);
          let ph = 0;
          for (const b of group) ph = Math.max(ph, (b.size * scale * ps) / 2);
          const need = ringR + pb + ph + 6 + DRIFT_MAX;
          const edge = pb + ph + 6;
          const fits = (x: number, y: number, strict: boolean): boolean => {
            if (strict && Math.hypot(x - homeX, y - homeY) < need) return false;
            if (inBox(x, y, pb + ph)) return false;
            if (x < edge || x > W - edge || y < edge || y > H - edge) return false;
            const [qx, qy] = clear(x, y, pb + ph, 6, keepOut.map);
            if (qx !== x || qy !== y) return false;
            if (!onLandSafe(x, y)) return false;
            if (strict) for (const p of pins) if (Math.hypot(x - p.x, y - p.y) < pb + ph + p.half + 8) return false;
            return true;
          };
          if (fits(ax, ay, true)) {
            placedAt = [ax, ay];
            break;
          }
          /* never further than a tenth of the map from the truth under the
             strict rules — beyond that a pin has left its state, and a
             smaller blob nearer home is the better lie */
          for (let r = 12; r <= 0.1 * bw && !placedAt; r += 12) {
            const n = Math.max(12, Math.round((2 * Math.PI * r) / 14));
            for (let k = 0; k < n; k++) {
              const a = (k / n) * 2 * Math.PI;
              const x = ax + Math.cos(a) * r;
              const y = ay + Math.sin(a) * r;
              if (fits(x, y, true)) {
                placedAt = [x, y];
                break;
              }
            }
          }
          if (placedAt) break;
          if (f === 0.5) {
            // last resort: the nearest dry spot off the box and the words,
            // whatever the ring says; the per-bird ring check in the
            // relaxation still keeps the discs themselves off the mark
            for (let r = 0; r <= 0.45 * bw && !placedAt; r += 12) {
              const n = r ? Math.max(12, Math.round((2 * Math.PI * r) / 14)) : 1;
              for (let k = 0; k < n; k++) {
                const a = (k / n) * 2 * Math.PI;
                const x = ax + Math.cos(a) * r;
                const y = ay + Math.sin(a) * r;
                if (fits(x, y, false)) {
                  placedAt = [x, y];
                  break;
                }
              }
            }
          }
        }
        if (placedAt) [ax, ay] = placedAt;
        lay(group, ax, ay, ps, blobOf(group, ps, phone ? 6 : 10), false);
      }

      /* ---- 4. everybody at once ----
         Neighbouring places can be a few pixels apart at this scale, so
         photographs pile up on each other and the formation stops reading.
         Push them apart and pull each one back toward its own pin. The one
         rule the shoving may not break is the coastline: a travel bird the
         push has put in the sea is drawn back toward its pin — which is on
         land — harder than the others, and any that is still wet at the end
         walks the rest of the way. Inset birds keep to their box, home
         birds to theirs. */
      const walls = (p: Pin): void => {
        const r = p.inset;
        if (!r) return;
        const m = p.half + 3;
        p.x = Math.max(r.x0 + m, Math.min(r.x1 - m, p.x));
        p.y = Math.max(r.y0 + m, Math.min(r.y1 - m, p.y));
      };
      for (let pass = 0; pass < 36; pass++) {
        let moved = false;
        for (let a = 0; a < pins.length; a++) {
          for (let c = a + 1; c < pins.length; c++) {
            const p = pins[a];
            const q = pins[c];
            const want = p.half + q.half + (p.home && q.home ? HOME_AIR : 8);
            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let dd = Math.hypot(dx, dy);
            if (dd >= want) continue;
            if (dd < 0.01) {
              dx = hash(p.b.i, 17) - 0.5;
              dy = hash(q.b.i, 18) - 0.5;
              dd = Math.hypot(dx, dy) || 1;
            }
            const push = ((want - dd) / dd) * 0.5;
            p.x -= dx * push;
            p.y -= dy * push;
            q.x += dx * push;
            q.y += dy * push;
            moved = true;
          }
        }
        for (const p of pins) {
          if (p.inset) {
            // the box holds it; a weak pull to the centre stops a wall-hugging crust
            p.x += (p.ax - p.x) * 0.02;
            p.y += (p.ay - p.y) * 0.02;
            walls(p);
            continue;
          }
          p.x += (p.ax - p.x) * 0.06;
          p.y += (p.ay - p.y) * 0.06;
          /* in the sea: to the nearest dry spot from where it is, not back
             to the pin — pulling everybody to the pin is how a shoreline
             pin's birds collapse onto one another */
          if (pass % 3 === 2 && !onLandSafe(p.x, p.y)) {
            const q = nearestLand(p.x, p.y, 0.08 * bw);
            if (q) [p.x, p.y] = q;
          }
          // off the ring and out of the box, along the bearing from home
          const need = ringR + p.half + 6 + DRIFT_MAX;
          const dh = Math.hypot(p.x - homeX, p.y - homeY);
          if (dh < need) {
            const a = dh > 0.5 ? Math.atan2(p.y - homeY, p.x - homeX) : Math.atan2(p.ay - homeY, p.ax - homeX);
            p.x = homeX + Math.cos(a) * need;
            p.y = homeY + Math.sin(a) * need;
          }
          if (inBox(p.x, p.y, p.half + 4)) {
            // leave by the nearest wall
            const out = [p.x - box.x0, box.x1 - p.x, p.y - box.y0, box.y1 - p.y];
            const m = Math.min(...out);
            if (m === out[0]) p.x = box.x0 - p.half - 6;
            else if (m === out[1]) p.x = box.x1 + p.half + 6;
            else if (m === out[2]) p.y = box.y0 - p.half - 6;
            else p.y = box.y1 + p.half + 6;
          }
        }
        if (!moved && pass > 6) break;
      }
      /* the last word is the coastline's: anything still in the sea goes to
         the nearest drift-safe land, then a few hard passes with no pull
         separate whatever that bunched */
      for (let round = 0; round < 3; round++) {
        for (const p of pins) {
          if (p.inset || onLandSafe(p.x, p.y)) continue;
          const q = nearestLand(p.x, p.y, 0.3 * bw);
          if (q) [p.x, p.y] = q;
        }
        for (let pass = 0; pass < 8; pass++) {
          for (let a = 0; a < pins.length; a++) {
            for (let c = a + 1; c < pins.length; c++) {
              const p = pins[a];
              const q = pins[c];
              const want = p.half + q.half + (p.home && q.home ? HOME_AIR : 6);
              const dx = q.x - p.x;
              const dy = q.y - p.y;
              const dd = Math.hypot(dx, dy) || 0.01;
              if (dd >= want) continue;
              const push = ((want - dd) / dd) * 0.5;
              p.x -= dx * push;
              p.y -= dy * push;
              q.x += dx * push;
              q.y += dy * push;
            }
          }
          for (const p of pins) walls(p);
        }
      }

      const put = (b: FlockBird, x: number, y: number, s: number) => {
        const half = (b.size * scale * s) / 2 + 6;
        out[b.i] = {
          x: Math.max(half, Math.min(W - half, x)),
          y: Math.max(half, Math.min(H - half, y)),
          s,
        };
      };
      for (const p of pins) put(p.b, p.x, p.y, p.s);

      /* ---- 5. the marks: ring, box, label, leader ----
         Same inkRing, same seed 23, same 3.1% of the map as /places — the
         home page and the map circle the Triangle with one gesture. The box
         is the artwork's own dashed inset, drawn here with the birds inside
         it instead of the eighteen dots; the leader runs from the ring's rim
         to the box's left edge a little below its top, the way DESIGN2 §5.2
         asked /places to draw it. index.astro draws the ring path at r = 100
         in a viewBox 232 across, so its box is 2.32 r. */
      const st = root!.style;
      const rd = ringR * 2.32;
      st.setProperty('--rx', `${(homeX - rd / 2).toFixed(1)}px`);
      st.setProperty('--ry', `${(homeY - rd / 2).toFixed(1)}px`);
      st.setProperty('--rd', `${rd.toFixed(1)}px`);
      st.setProperty('--bx', `${box.x0.toFixed(1)}px`);
      st.setProperty('--by', `${box.y0.toFixed(1)}px`);
      st.setProperty('--bw', `${boxW.toFixed(1)}px`);
      st.setProperty('--bh', `${boxH.toFixed(1)}px`);
      if (homeBoxSvg && homeBox) {
        homeBoxSvg.setAttribute('viewBox', `0 0 ${boxW.toFixed(1)} ${boxH.toFixed(1)}`);
        homeBox.setAttribute('x', '1');
        homeBox.setAttribute('y', '1');
        homeBox.setAttribute('width', Math.max(0, boxW - 2).toFixed(1));
        homeBox.setAttribute('height', Math.max(0, boxH - 2).toFixed(1));
        homeBox.setAttribute('rx', (10 * kpx).toFixed(1));
      }
      if (homeLabel) {
        homeLabel.style.left = `${(box.x0 + 10 * kpx).toFixed(1)}px`;
        homeLabel.style.top = `${(box.y1 - lblH + 2).toFixed(1)}px`;
        homeLabel.style.display = boxH ? '' : 'none';
      }
      if (leadShaft && leadHead) {
        if (boxH) {
          const x2 = box.x0;
          const y2 = box.y0 + Math.min(14 * kpx, boxH * 0.3);
          const a = Math.atan2(y2 - homeY, x2 - homeX);
          const x1 = homeX + Math.cos(a) * ringR * 1.15;
          const y1 = homeY + Math.sin(a) * ringR * 1.15;
          const arrow = inkArrow(x1, y1, x2, y2);
          leadShaft.setAttribute('d', arrow.shaft);
          leadHead.setAttribute('d', arrow.head);
        } else {
          leadShaft.setAttribute('d', '');
          leadHead.setAttribute('d', '');
        }
      }

      /* No place on record, or a place with no coordinate. Every bird in
         today's flock has one, so this is a net rather than a feature: they
         line up in a deterministic row under the map instead of collecting
         at the origin or coming out NaN. */
      unplaced.forEach((b, k) => {
        const t = (k + 0.5) / unplaced.length;
        put(
          b,
          bx + bw * (0.16 + 0.68 * t),
          by + bh * (0.98 + (hash(b.i, 16) - 0.5) * 0.08),
          0.66,
        );
      });

      /* West to east, so the map lays itself down like a hand drawing a
         line: Seattle first, the home box last. */
      orders[view] = rankBy(live, (b) => out[b.i]?.x ?? 0);
    } else if (view === 'groups') {
      // nine clumps on a ring, one per type, sized by how many are in it
      const counts = new Array(10).fill(0);
      live.forEach((b) => counts[b.type]++);
      const seen: number[] = new Array(10).fill(0);
      const ringX = W * (phone ? 0.34 : 0.36);
      const ringY = H * 0.34;
      live.forEach((b) => {
        const k = Math.min(b.type, 8);
        const a = (k / 9) * Math.PI * 2 - Math.PI / 2;
        const bx = W / 2 + Math.cos(a) * ringX;
        const by = H / 2 + Math.sin(a) * ringY;
        const n = Math.max(1, counts[b.type]);
        const blob = Math.min(W, H) * 0.04 + Math.sqrt(n) * (phone ? 7 : 12);
        const idx = seen[b.type]++;
        const aa = idx * 2.39996 + hash(b.i, 14);
        const rr = blob * Math.sqrt((idx + 0.6) / n);
        out[b.i] = { x: bx + Math.cos(aa) * rr, y: by + Math.sin(aa) * rr, s: 0.6 };
      });

      // clump by clump round the ring, rather than bird by bird
      orders[view] = rankBy(live, (b) => Math.min(b.type, 8) * 1000 + b.i);
    } else {
      /* A wreath round the words — the owner's ask, and the right one. Two
         things were wrong with the grid this replaces. Its birds were
         assigned greedily to the nearest free cell, so they bunched where the
         resting swirl was dense and left a lone bird in a gap where it was
         not; and a lattice is machine output on a page where every other line
         is hand-drawn. So: two rings of one-size pictures on an ellipse round
         the title and its caption, spaced evenly by arc length (a brick
         offset between the rings), then jittered a little in angle and
         radius with ink.ts's seeded rng — deterministic, so the same build
         draws the same wreath and the view-transition continuity with /list
         holds — and settled with a short relaxation so nothing overlaps.

         The ellipse is as round as the paper allows. Roundness is tried
         first (q = 1.15) and the disc size second: at 1440×900 that is
         d = 64 at q = 1.15; at 1280×800 the same q with d = 44, because two
         rings of 58 birds round a 340×260 hole are 660px tall at d = 64 and
         the paper is 800. Evenness is measured per 30° sector in the report.

         Birds are matched to places by bearing from the centre, at the
         cyclic offset that flies least, so the wreath fills completely and
         nobody crosses the words; the flights are longer than greedy's, and
         still inside the same 820ms. */
      if (!phone) {
        const keep = keepOut.list ?? { cx: hubCx, cy: hubCy, hw: hubHW, hh: hubHH, grow: 1 };
        const cx0 = keep.cx;
        const cy0 = keep.cy;
        const hw = keep.hw + 6;
        const hh = keep.hh + 6;
        const RINGS = 2;
        const GAP_R = 6;
        const perim = (A: number, B: number) => Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)));
        interface Wreath { d: number; sr: number; rings: Array<{ A: number; B: number; P: number; n: number }> }
        let wreath: Wreath | null = null;
        outer: for (let q = 1.15; q <= 2.06; q += 0.05) {
          for (let d = 64; d >= 30; d -= 2) {
            const Bin = Math.sqrt(hh * hh + (hw / q) ** 2) + d / 2 + 8;
            const Ain = q * Bin;
            const sr = d + GAP_R;
            const reachB = Bin + (RINGS - 0.5) * sr + d / 2;
            const reachA = Ain + (RINGS - 0.5) * sr + d / 2;
            if (cy0 - reachB < 24 || cy0 + reachB > H - 24) continue;
            if (cx0 - reachA < 40 || cx0 + reachA > W - 40) continue;
            const rings: Wreath['rings'] = [];
            let P = 0;
            for (let i = 0; i < RINGS; i++) {
              const A = Ain + (i + 0.5) * sr;
              const B = Bin + (i + 0.5) * sr;
              const Pi = perim(A, B);
              rings.push({ A, B, P: Pi, n: 0 });
              P += Pi;
            }
            if (P / m < d + 6) continue; // too crowded along the ring
            wreath = { d, sr, rings };
            break outer;
          }
        }
        if (!wreath) {
          // paper too small for any wreath: a single tight ring, whatever fits
          const d = 30;
          const Bin = hh + d / 2 + 8;
          const Ain = hw + d / 2 + 8;
          wreath = { d, sr: d + GAP_R, rings: [{ A: Ain + d / 2, B: Bin + d / 2, P: perim(Ain, Bin), n: 0 }] };
        }
        const { d, sr, rings } = wreath;
        const Ptot = rings.reduce((a, r) => a + r.P, 0);
        let placed = 0;
        rings.forEach((r) => {
          r.n = Math.floor((m * r.P) / Ptot);
          placed += r.n;
        });
        for (let k = 0; placed < m; k++, placed++) rings[k % rings.length].n++;

        /* walk each ellipse by arc length, so spacing is even along the ring */
        const rnd = rng(31);
        const spots: Array<{ x: number; y: number; ax: number; ay: number }> = [];
        rings.forEach((r, i) => {
          if (!r.n) return;
          const N = 720;
          const arc: number[] = [0];
          for (let k = 1; k <= N; k++) {
            const a0 = ((k - 1) / N) * 2 * Math.PI;
            const a1 = (k / N) * 2 * Math.PI;
            arc.push(arc[k - 1] + Math.hypot(r.A * (Math.cos(a1) - Math.cos(a0)), r.B * (Math.sin(a1) - Math.sin(a0))));
          }
          const L = arc[N];
          const thetaAt = (s: number): number => {
            let t = ((s % L) + L) % L;
            let lo = 0;
            let hi = N;
            while (hi - lo > 1) {
              const mid = (lo + hi) >> 1;
              if (arc[mid] <= t) lo = mid;
              else hi = mid;
            }
            const f = (t - arc[lo]) / Math.max(1e-6, arc[hi] - arc[lo]);
            return ((lo + f) / N) * 2 * Math.PI;
          };
          const pitch = L / r.n;
          const phase = (i % 2 ? 0.5 : 0) + 0.13; // brick offset between the rings
          for (let k = 0; k < r.n; k++) {
            /* a little noise, on purpose: ±22% of the pitch along the ring and
               ±14% of the ring spacing across it — placed, not computed */
            const s = (k + phase + (rnd() - 0.5) * 0.44) * pitch;
            const th = thetaAt(s);
            const dr = (rnd() - 0.5) * 0.28 * sr;
            const x = cx0 + (r.A + dr) * Math.cos(th);
            const y = cy0 + (r.B + dr) * Math.sin(th);
            spots.push({ x, y, ax: x, ay: y });
          }
        });

        /* settle: no two discs touch, nothing on the words or the compass */
        const half = d / 2;
        for (let pass = 0; pass < 12; pass++) {
          let moved = false;
          for (let a = 0; a < spots.length; a++) {
            for (let c = a + 1; c < spots.length; c++) {
              const p = spots[a];
              const q = spots[c];
              const want = d + 4;
              let dx = q.x - p.x;
              let dy = q.y - p.y;
              let dd = Math.hypot(dx, dy);
              if (dd >= want) continue;
              if (dd < 0.01) {
                dx = 0.5;
                dy = 0.5;
                dd = 0.707;
              }
              const push = ((want - dd) / dd) * 0.5;
              p.x -= dx * push;
              p.y -= dy * push;
              q.x += dx * push;
              q.y += dy * push;
              moved = true;
            }
          }
          for (const p of spots) {
            p.x += (p.ax - p.x) * 0.08;
            p.y += (p.ay - p.y) * 0.08;
            [p.x, p.y] = clear(p.x, p.y, half, 6, keep);
            [p.x, p.y] = offCompass(p.x, p.y, half);
            p.x = Math.max(half + 8, Math.min(W - half - 8, p.x));
            p.y = Math.max(half + 8, Math.min(H - half - 8, p.y));
          }
          if (!moved && pass > 3) break;
        }

        /* pair by bearing from the centre, at the offset that flies least */
        const ang = (x: number, y: number) => Math.atan2(y - cy0, x - cx0);
        const spotsByAng = spots.slice().sort((p, q) => ang(p.x, p.y) - ang(q.x, q.y));
        const birdsByAng = live.slice().sort((p, q) => ang(p.hx, p.hy) - ang(q.hx, q.hy));
        const K = spotsByAng.length;
        let bestOff = 0;
        let bestCost = Infinity;
        for (let off = 0; off < K; off++) {
          let cost = 0;
          for (let k = 0; k < birdsByAng.length && cost < bestCost; k++) {
            const c = spotsByAng[(k + off) % K];
            cost += Math.hypot(c.x - birdsByAng[k].hx, c.y - birdsByAng[k].hy);
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestOff = off;
          }
        }
        birdsByAng.forEach((b, k) => {
          const c = spotsByAng[(k + bestOff) % K];
          out[b.i] = { x: c.x, y: c.y, s: Math.max(0.3, Math.min(1.6, d / (b.size * scale))) };
        });
        // round the wreath from the top, clockwise, the way a hand lays it
        orders[view] = rankBy(live, (b) => {
          const a = Math.atan2((out[b.i]?.y ?? 0) - cy0, (out[b.i]?.x ?? 0) - cx0) + Math.PI / 2;
          return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        });
      } else {
        /* Phone: the words are nearly the paper's width, so there is no
           room for a ring round them. Two bands instead — the sky over the
           title and the strip between the caption and the compass — filled
           row by row at one size, spares taken out of the lower band's
           centre. Even, exact, and brief: on a phone this shows for the
           360ms between the tap and the navigation. */
        const keep = keepWide.list ?? { cx: hubCx, cy: hubCy, hw: hubHW, hh: hubHH, grow: 0.5 };
        const bands = [
          { y0: pad, y1: keep.cy - keep.hh - 6 },
          { y0: keep.cy + keep.hh + 6, y1: H - COMPASS_Y },
        ].filter((b) => b.y1 - b.y0 > 30);
        const bw2 = W - 2 * pad;
        let best: { cols: number; cell: number; rows: number[] } | null = null;
        for (let cols = 3; cols <= 9; cols++) {
          const cellW = bw2 / cols;
          const rows = bands.map((b) => Math.floor((b.y1 - b.y0) / cellW));
          const cap = rows.reduce((a, r) => a + r, 0) * cols;
          if (cap < m) continue;
          const cell = Math.min(cellW, 66);
          if (!best || cell > best.cell) best = { cols, cell, rows };
        }
        const cells: Array<{ x: number; y: number }> = [];
        if (best) {
          const { cols, cell, rows } = best;
          // the fewest rows that hold everybody, top band first
          let needRows = Math.ceil(m / cols);
          const use = rows.map((r) => {
            const u = Math.min(r, needRows);
            needRows -= u;
            return u;
          });
          bands.forEach((b, i) => {
            const rs = use[i];
            if (!rs) return;
            const y0 = b.y0 + ((b.y1 - b.y0) - rs * cell) / 2 + cell / 2;
            const x0 = (W - cols * cell) / 2 + cell / 2;
            for (let r = 0; r < rs; r++) for (let c = 0; c < cols; c++) cells.push({ x: x0 + c * cell, y: y0 + r * cell });
          });
          // spares out of the last row, centre outward
          let extra = cells.length - m;
          const lastY = cells[cells.length - 1]?.y;
          const lastRow = cells.filter((c) => c.y === lastY).sort((p, q) => Math.abs(p.x - W / 2) - Math.abs(q.x - W / 2));
          for (const c of lastRow) {
            if (extra <= 0) break;
            cells.splice(cells.indexOf(c), 1);
            extra--;
          }
        }
        while (cells.length < m) cells.push({ x: W / 2, y: pad + 20 });
        const cell = best ? best.cell : 40;
        const ang = (x: number, y: number) => Math.atan2(y - keep.cy, x - keep.cx);
        const cellsByAng = cells.slice().sort((p, q) => ang(p.x, p.y) - ang(q.x, q.y));
        const birdsByAng = live.slice().sort((p, q) => ang(p.hx, p.hy) - ang(q.hx, q.hy));
        const K = cellsByAng.length;
        let bestOff = 0;
        let bestCost = Infinity;
        for (let off = 0; off < K; off++) {
          let cost = 0;
          for (let k = 0; k < birdsByAng.length && cost < bestCost; k++) {
            const c = cellsByAng[(k + off) % K];
            cost += Math.hypot(c.x - birdsByAng[k].hx, c.y - birdsByAng[k].hy);
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestOff = off;
          }
        }
        const edgePx = cell * 0.7;
        birdsByAng.forEach((b, k) => {
          const c = cellsByAng[(k + bestOff) % K];
          out[b.i] = { x: c.x, y: c.y, s: Math.max(0.3, Math.min(1.6, edgePx / (b.size * scale))) };
        });
        // row-major: the bands fill the way you read them
        orders[view] = rankBy(live, (b) => Math.round((out[b.i]?.y ?? 0) / 24) * 1e5 + (out[b.i]?.x ?? 0));
      }
    }

    forms[view] = out;
    return out;
  }

  /**
   * The When scaffold, built for the days the flock actually has. The axis
   * is one slot per day out, so time is stretched, and the strip has to say
   * so: a short tick under every column; a month tick at every month
   * boundary, spread evenly across the gap between the two slots it falls
   * in, so five empty months between September and February bunch into one
   * gap while July spreads its one boundary over thirteen slots; a taller
   * January tick with the year under it; and the name of every month that
   * owns a slot, centred under its slots, dropped where two would touch.
   * index.astro keeps only the axis line; everything else is made here,
   * once per layout, into the same `.scaf--tl` strip the CSS already fades.
   */
  function markDays(days: string[], slotX: (k: number) => number, slotW: number): void {
    if (!tlStrip) return;
    for (const el of Array.from(tlStrip.children)) if (!el.classList.contains('scaf__axis')) el.remove();
    if (!days.length) return;
    const frag = document.createDocumentFragment();
    const x0 = axisX0;
    const mk = (cls: string, left: number, text?: string): HTMLElement => {
      const el = document.createElement(text === undefined ? 'i' : 'span');
      el.className = cls;
      el.style.left = `${(left - x0).toFixed(1)}px`;
      if (text !== undefined) el.textContent = text;
      frag.appendChild(el);
      return el;
    };
    const ym = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // a tick under every column
    days.forEach((_, k) => mk('scaf__day', slotX(k)));

    // month boundaries, spread across the gap they fall in
    for (let k = 1; k < days.length; k++) {
      const a = ym(days[k - 1]);
      const b = ym(days[k]);
      const n = b - a;
      if (n <= 0) continue;
      for (let j = 1; j <= n; j++) {
        const m = a + j; // the month that begins at this boundary
        const x = slotX(k - 1) + (slotW * j) / (n + 1);
        mk(m % 12 === 0 ? 'scaf__tick is-jan' : 'scaf__tick', x);
      }
    }
    // each year under its own slots — 2024 owns one slot here, 2025 most
    // of the axis — so the numerals never collide across a single gap
    for (let k = 0; k < days.length; ) {
      const y = days[k].slice(0, 4);
      let e = k;
      while (e + 1 < days.length && days[e + 1].slice(0, 4) === y) e++;
      mk('scaf__year meta', (slotX(k) + slotX(e)) / 2, y);
      k = e + 1;
    }

    // the name of every month that owns a slot, under its slots
    let lastRight = -Infinity;
    let k = 0;
    while (k < days.length) {
      const m = ym(days[k]);
      let e = k;
      while (e + 1 < days.length && ym(days[e + 1]) === m) e++;
      const cx = (slotX(k) + slotX(e)) / 2;
      const w = MONTHS[m % 12].length * 7 + 6; // rough width of the label, px
      if (cx - w / 2 > lastRight + 6) {
        mk('scaf__mon', cx, MONTHS[m % 12]);
        lastRight = cx + w / 2;
      }
      k = e + 1;
    }
    tlStrip.appendChild(frag);
  }

  /** bird.i -> its position in `key` order, so the formation can lay itself
   *  down in a direction you can see rather than all at once. */
  function rankBy(list: FlockBird[], key: (b: FlockBird) => number): number[] {
    const ranks: number[] = new Array(birds.length).fill(0);
    list
      .slice()
      .sort((p, q) => key(p) - key(q) || p.i - q.i)
      .forEach((b, k) => {
        ranks[b.i] = k;
      });
    return ranks;
  }

  /* ---------------- moving them ---------------- */

  /* C4: bending the flight path.
   *
   * `clear()` guarantees a bird misses the words at both ends, and then CSS
   * interpolates one translate3d in a straight line and it crosses them in
   * the middle anyway. The fix is geometric, not temporal — slowing the
   * morph would undo timings DESIGN.md §1.2 chose deliberately.
   *
   * x lives on `.fb` and y on `.fb__y`, two nested boxes, so the two axes can
   * carry different easings. If x runs on f and y on g, the bird is at
   * (x0 + dx·f(p), y0 + dy·g(p)); the straight chord through the same f is
   * (x0 + dx·f, y0 + dy·f), so the path is displaced by dy·(g − f) — it bows
   * toward the corner of the leading axis. Both boxes keep the same duration
   * and the same delay, so the arrival is unchanged; only the middle moves.
   *
   * Which corner to bow toward is decided per bird: of the two right-angle
   * corners (end-x, start-y) and (start-x, end-y), take the one that clears
   * the words, and lead with that axis. Birds whose straight line already
   * misses the type keep both axes on `--ease` and fly straight, because an
   * arc for its own sake is just wobble.
   */
  /* The leading axis keeps `--ease` exactly — today's curve, so no axis ever
   * moves faster than it does now and the interruptible-switch budget is
   * untouched. Only the lagging one is new, and it is gentler still (peak
   * speed 2.12 against `--ease`'s 3.41). The pair separates by at most 0.41
   * at p = 0.23, which is very nearly the bulge of a circular quarter arc
   * (0.41 at the midpoint): a bird banking round the words, not an L. */
  const LEAD = 'cubic-bezier(.22,.75,.3,1)';
  const LAG = 'cubic-bezier(.34,.08,.32,1)';

  /* The two curves sampled at every tenth of the flight. Which axis should
   * lead is not obvious from the geometry — a bird crossing the words almost
   * horizontally cannot be bowed off them at all, because the displacement
   * is dy·(g−f) — so rather than guess, walk both candidate arcs and count
   * how many samples land on the type, and keep the straight line when
   * neither arc beats it. Three paths x nineteen points x 58 birds is three
   * thousand rectangle tests, on hover only, never per frame. */
  const LEAD_F = [0.169, 0.329, 0.471, 0.589, 0.684, 0.757, 0.813, 0.857, 0.891, 0.918, 0.939, 0.956, 0.968, 0.978, 0.986, 0.992, 0.996, 0.998, 1];
  const LAG_F = [0.019, 0.054, 0.108, 0.183, 0.276, 0.38, 0.485, 0.582, 0.668, 0.74, 0.801, 0.851, 0.891, 0.924, 0.95, 0.969, 0.983, 0.993, 0.998];

  /** How many of the nineteen sample points of this path land on the words. */
  function pathHits(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fx: number[],
    fy: number[],
    pad: number,
    k?: Box,
  ): number {
    const cx0 = k ? k.cx : hubCx;
    const cy0 = k ? k.cy : hubCy;
    const hw = (k ? k.hw : hubHW) + pad;
    const hh = (k ? k.hh : hubHH) + pad;
    let n = 0;
    for (let i = 0; i < LEAD_F.length; i++) {
      const x = x0 + (x1 - x0) * fx[i];
      const y = y0 + (y1 - y0) * fy[i];
      if (Math.abs(x - cx0) < hw && Math.abs(y - cy0) < hh) n++;
    }
    return n;
  }

  /**
   * `stagger` lays the formation down in its own order — west to east, oldest
   * to newest — by giving each bird a transition-delay of its rank x 4ms. It
   * is only asked for when the flock is starting from rest: changing a delay
   * half way through a flight would park a bird in mid-air for a fifth of a
   * second, and switching target mid-flight has to *curve*, not stall.
   */
  function apply(view: ViewName | null, t: number, dur: number, stagger = false): void {
    const spots = view ? formation(view) : null;
    const ord = stagger && view ? orders[view] : null;
    const box = view ? (FULL[view] && t > 0.98 ? keepOut[view] : keepWide[view]) : undefined;
    root!.style.setProperty('--mdur', `${dur}ms`);
    for (const b of live) {
      const spot = spots ? spots[b.i] : null;
      let x = spot ? b.hx + (spot.x - b.hx) * t : b.hx;
      let y = spot ? b.hy + (spot.y - b.hy) * t : b.hy;
      const s = (spot ? 1 + (spot.s - 1) * t : 1) * scale;
      /* A partial morph drags birds straight across the title. Slide them
         round the hole instead — the words stay readable all the way. */
      if (spot) [x, y] = clear(x, y, (b.size * s) / 2, 6, box);

      /* C4 — bow the flight round the words. The straight line is tested
         with the bird's own half-width, so a 100px favourite does not shave
         the type with its edge; if it is clear, the bird flies straight,
         because an arc for its own sake is just wobble. Otherwise take
         whichever of the two arcs spends least time on the words. */
      const half = (b.size * s) / 2 + 8; // + the drift's own wander
      let lead: '' | 'x' | 'y' = '';
      const h0 = pathHits(b.cx, b.cy, x, y, LEAD_F, LEAD_F, half, box);
      if (h0 > 0) {
        const hx = pathHits(b.cx, b.cy, x, y, LEAD_F, LAG_F, half, box);
        const hy = pathHits(b.cx, b.cy, x, y, LAG_F, LEAD_F, half, box);
        // a chord that crosses the words almost horizontally cannot be bowed
        // off them at all — the displacement is dy·(g−f) — so when neither
        // arc is an improvement the bird flies straight rather than wobbling
        if (Math.min(hx, hy) < h0) lead = hx <= hy ? 'x' : 'y';
      }
      b.el.style.transitionTimingFunction = lead === 'x' ? LEAD : lead === 'y' ? LAG : '';
      b.yel.style.transitionTimingFunction = lead === 'y' ? LEAD : lead === 'x' ? LAG : '';

      /* Three delays, and the middle one matters. Arriving from rest, the
         formation lays itself down in its own order. Switching target
         mid-flight, everyone leaves at once — any delay here freezes a bird
         in mid-air and then flings it, which is the one thing the morph must
         never do. Going home, the rank ripple in the stylesheet comes back.
         Both boxes get the same delay, or the two axes would desynchronise
         into a hook rather than an arc. */
      const delay = ord ? `${ord[b.i] * SWEEP_STEP}ms` : view ? '0ms' : '';
      b.el.style.transitionDelay = delay;
      b.yel.style.transitionDelay = delay;
      b.cx = x;
      b.cy = y;
      /* x on the outer box, y *and* the scale on the inner one. The scale has
         to ride inside, or it would multiply the x the outer box carries;
         within one transform `translate3d(...) scale(...)` the translation is
         still measured in the parent's units, so the y stays honest. */
      b.el.style.transform = `translate3d(${x - b.size / 2}px, 0, 0)`;
      b.yel.style.transform = `translate3d(0, ${y - b.size / 2}px, 0) scale(${s})`;
    }
    if (view === 'groups') markGroups();
  }

  /**
   * The nine names and their hairline rings — the bubbles of /groups,
   * rehearsed under the flock. Measured off where the birds have just been
   * *told to go*, not off the untruncated formation: "Which" only leans
   * two-thirds of the way, so a ring drawn at the formation's own centre
   * would sit next to its clump instead of round it. index.astro has the
   * spans and rings ready in TYPE_ORDER; this only has to place them.
   */
  function markGroups(): void {
    const sx = new Array(9).fill(0);
    const sy = new Array(9).fill(0);
    const n = new Array(9).fill(0);
    for (const b of live) {
      const k = Math.min(b.type, 8);
      sx[k] += b.cx;
      sy[k] += b.cy;
      n[k]++;
    }
    const rad = new Array(9).fill(0);
    for (const b of live) {
      const k = Math.min(b.type, 8);
      if (!n[k]) continue;
      const d = Math.hypot(b.cx - sx[k] / n[k], b.cy - sy[k] / n[k]) + (b.size * scale * 0.6) / 2;
      if (d > rad[k]) rad[k] = d;
    }
    for (let k = 0; k < 9; k++) {
      const tag = groupTags[k];
      const ring = groupRings[k];
      const on = n[k] > 0;
      const cx2 = on ? sx[k] / n[k] : 0;
      const cy2 = on ? sy[k] / n[k] : 0;
      const r = rad[k] + 10;
      if (tag) {
        tag.style.display = on ? '' : 'none';
        tag.style.left = `${cx2.toFixed(1)}px`;
        tag.style.top = `${(cy2 + r + 8).toFixed(1)}px`;
      }
      if (ring) {
        ring.style.display = on ? '' : 'none';
        ring.style.left = `${(cx2 - r).toFixed(1)}px`;
        ring.style.top = `${(cy2 - r).toFixed(1)}px`;
        ring.style.width = ring.style.height = `${(r * 2).toFixed(1)}px`;
      }
    }
  }

  /* ---------------- the pointer ---------------- */

  let raf = 0;
  let mx = -9999;
  let my = -9999;

  function frame(): void {
    raf = 0;
    let moving = false;
    for (const b of live) {
      const dx = b.cx - mx;
      const dy = b.cy - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < PARALLAX_R * PARALLAX_R) {
        const d = Math.max(12, Math.sqrt(d2));
        const f = 1 - d / PARALLAX_R;
        const push = (f * f * PARALLAX_MAX) / d;
        b.tx = dx * push;
        b.ty = dy * push;
      } else {
        b.tx = 0;
        b.ty = 0;
      }
      const ndx = b.tx - b.px;
      const ndy = b.ty - b.py;
      if (Math.abs(ndx) < 0.15 && Math.abs(ndy) < 0.15) {
        if (b.px !== b.tx || b.py !== b.ty) {
          b.px = b.tx;
          b.py = b.ty;
          b.par.style.transform = `translate3d(${b.px}px, ${b.py}px, 0)`;
        }
        continue;
      }
      b.px += ndx * 0.11;
      b.py += ndy * 0.11;
      b.par.style.transform = `translate3d(${b.px}px, ${b.py}px, 0)`;
      moving = true;
    }
    if (moving) raf = requestAnimationFrame(frame);
  }

  function nudge(): void {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const rr = root!.getBoundingClientRect();
    mx = e.clientX - rr.left;
    my = e.clientY - rr.top;
    nudge();
  }

  function onLeave(): void {
    mx = -9999;
    my = -9999;
    nudge();
  }

  /* ---------------- the four ways in ----------------
   *
   * The row of words is one hover region, not four. Reading along the row
   * used to cross a gap between every pair of words, and in that gap the
   * flock was released — it set off home, got half way, and turned round
   * for the next formation: a stutter on the one gesture the page invites.
   * Now the pointer anywhere in the row (or in the caption's band under it,
   * which the row's ::after reaches) holds the nearest word, the boundary
   * between two words is the midpoint of the gap, and release happens only
   * on leaving the row. A sideways sweep therefore goes Where → When →
   * Which → All with no home target at any frame; a vertical exit ends it.
   *
   * Switching mid-flight is the case `apply` already solved: `fromRest` is
   * false, so the delays are an explicit 0ms and the flock curves rather
   * than stalling. Only a true release brings the rank ripple back, and a
   * release is now rarer, not commoner.
   */

  const ways = Array.from(root.querySelectorAll<HTMLAnchorElement>('.way'));
  const viewOfWay = (a: HTMLAnchorElement) => a.dataset.form as ViewName | undefined;

  /** The word the pointer is nearest, horizontally: each word owns the
   *  paper out to the midpoint of the gap on either side of it. */
  function nearestWay(clientX: number): ViewName | null {
    let bestV: ViewName | null = null;
    let bestD = Infinity;
    for (const a of ways) {
      const v = viewOfWay(a);
      if (!v) continue;
      const r = a.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < bestD) {
        bestD = d;
        bestV = v;
      }
    }
    return bestV;
  }

  function hold(view: ViewName): void {
    if (held === view) return;
    const fromRest = held === null;
    held = view;
    root!.dataset.form = view;
    apply(view, morphT(view), 820, fromRest);
  }

  function release(): void {
    if (!held) return;
    held = null;
    delete root!.dataset.form;
    apply(null, 0, 1150);
  }

  const still = REDUCED();

  /* the reduced-motion page has no morph, so the same row logic only drives
     the caption — which must not depend on motion — through data-form */
  const set = (view: ViewName | null): void => {
    if (!still) {
      if (view) hold(view);
      else release();
      return;
    }
    if (view) root.dataset.form = view;
    else delete root.dataset.form;
  };

  const onRowMove = (e: PointerEvent): void => set(nearestWay(e.clientX));
  const onRowLeave = (): void => set(null);
  const onFocus = (e: FocusEvent): void => {
    const v = viewOfWay(e.currentTarget as HTMLAnchorElement);
    if (v) set(v);
  };
  /* blur fires before the next word's focus; if that is where focus went,
     hold on — the flock must not bounce through the resting spiral */
  const onBlur = (e: FocusEvent): void => {
    const to = e.relatedTarget;
    if (to instanceof Element && ways_ && ways_.contains(to)) return;
    set(null);
  };

  if (ways_) {
    // pointerover covers the first touch too: on a phone the formation shows
    // for the 360ms between the tap and the navigation
    ways_.addEventListener('pointerover', onRowMove);
    ways_.addEventListener('pointermove', onRowMove, { passive: true });
    ways_.addEventListener('pointerleave', onRowLeave);
  }
  for (const a of ways) {
    a.addEventListener('focus', onFocus);
    a.addEventListener('blur', onBlur);
    if (still) continue;
    a.addEventListener('click', (e) => {
      const view = viewOfWay(a);
      if (!view) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      // clicking finishes the journey the hover started
      apply(view, 1, 520);
      root!.classList.add('is-leaving');
      window.setTimeout(() => navigate(a.href), 360);
    });
  }

  if (!still) {
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    document.addEventListener('bird:open', release);
  }

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 140);
  };
  window.addEventListener('resize', onResize);

  if (still) root.classList.add('flock--still');
  layout();
  // fonts land late and the hub grows; re-measure the hole once they do
  if (document.fonts?.ready) document.fonts.ready.then(() => layout()).catch(() => {});

  teardown.push(() => {
    window.removeEventListener('resize', onResize);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('bird:open', release);
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
  });
}

function unwire(): void {
  for (const fn of teardown) fn();
  teardown = [];
}

setup();
document.addEventListener('astro:page-load', setup);
document.addEventListener('astro:before-swap', unwire);
