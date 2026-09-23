/**
 * The home page: a flock that wheels, notices the pointer, and re-forms
 * part-way toward whichever view you are thinking about.
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
  /** first-spotted, normalised 0..1 across the whole record */
  date: number;
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
 * Which and All keep a lean: nine clumps and a grid read long before they
 * are finished, and a full grid on the home page is just the life list. */
const MORPH_T: Record<string, number> = {
  map: 1,
  timeline: 1,
  groups: 1,
  list: 0.8,
};
const PHONE_T = 0.72; // phones do a gentler version of the same move
/** ...except for the two that must complete to mean anything. */
const FULL: Record<string, boolean> = { map: true, timeline: true };

/** Per-bird stagger, ms. Destination order × this, so a formation lays itself
 *  down the way a hand draws it: west to east, oldest to newest. 58 birds at
 *  4ms is 0–228ms, inside the 820ms the move itself takes. */
const SWEEP_STEP = 4;

/** Beeswarm: the most a bird's date may be fudged along the axis, px. About
 *  two months at 1440 — the standard beeswarm lie, and the only way the July
 *  2025 pile becomes a lens rather than a column taller than the paper. */
const SWARM_X = 130;

/* ---------------- Where: two scales, and a ring that is true ----------------
 *
 * The shipped version flew every bird at 0.7x, which packed thirty-four home
 * birds into a blob 410px across; the ink ring round it then enclosed
 * Wilmington, the NC Zoo and New York, and a mark that says "home" was
 * stating something false. DESIGN2 §5.1 is right about the cause: the
 * formation was packing home and travel at the same scale, so the thing the
 * ring measured was not the home clump.
 *
 * Home birds now fly at 0.5x and travel birds at 0.75x. That is also a true
 * sentence — the same bird photographed from a balcony is not a bigger bird
 * than one seen once in Colorado — and it buys the clump back about 40% of
 * its radius while the nineteen travel pins get *more* legible, not less.
 */
const S_HOME = 0.5;
const S_TRAVEL = 0.75;
/** Clear paper between two birds in the home clump, px. */
const HOME_AIR = 7;
/** Clear paper the ring leaves outside the outermost home bird, px. */
const RING_AIR = 12;
/** ...and the floor, from DESIGN.md §1.3: 3.1% of the map's width. */
const RING_MIN = 0.031;
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
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.fb'));
  if (!nodes.length) return;

  const birds: FlockBird[] = nodes.map((el, i) => ({
    el,
    yel: (el.querySelector('.fb__y') ?? el) as HTMLElement,
    par: el.querySelector('.fb__p') as HTMLElement,
    bid: el.querySelector<HTMLElement>('[data-bird]')?.dataset.bird ?? '',
    size: Number(el.dataset.size) || 56,
    type: Number(el.dataset.type ?? 9),
    date: Number(el.dataset.date) || 0,
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
  /** the When axis: its y, and the swarm's scale */
  let axisY = 0;
  let swarmS = 0.5;
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
    let hw = (hubHW = (hr ? hr.width / 2 : 160) + (phone ? 18 : 40));
    let hh = (hubHH = (hr ? hr.height / 2 : 120) + (phone ? 14 : 28));
    hubL = hr ? hr.left - rr.left : W / 2 - 160;
    const wr = ways_ ? ways_.getBoundingClientRect() : null;
    waysBottom = wr ? wr.bottom - rr.top : cy + hh;

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
      hw = hubHW = (x1 - x0) / 2 + (phone ? 12 : 24);
      hh = hubHH = (y1 - y0) / 2 + (phone ? 10 : 18);
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
      const bandH = Math.max(90, band.h);
      gw = Math.min(W - 2 * pad, bandH * US_ASPECT);
      gh = gw / US_ASPECT;
      gx = (W - gw) / 2;
      gy = band.y + (bandH - gh) / 2;
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

    /* When: one line, low enough that the swarm hangs under the words and
       above the compass's reach. The swarm shrinks on short windows rather
       than climbing into the type. */
    axisY = Math.min(0.81 * H, H - COMPASS_Y - 24);
    /* Sized off the *tighter* of the two halves of the band the swarm has —
       above the axis it is fenced in by the caption, below it only by the
       paper's edge. Shrinking rather than climbing into the type is the
       whole point: on a short window the birds get small, but the shape of
       "that summer" survives, and the shape is what is being said. */
    const room = Math.min(axisY - (hintBottom.timeline ?? waysBottom) - 10, H - 12 - axisY);
    swarmS = Math.max(0.32, Math.min(0.5, 0.5 * Math.sqrt(Math.max(0, room / 150))));

    const s = root!.style;
    s.setProperty('--gx', `${gx.toFixed(1)}px`);
    s.setProperty('--gy', `${gy.toFixed(1)}px`);
    s.setProperty('--gw', `${gw.toFixed(1)}px`);
    s.setProperty('--gh', `${gh.toFixed(1)}px`);
    s.setProperty('--tx', `${pad}px`);
    s.setProperty('--ty', `${(axisY - 50).toFixed(1)}px`);
    s.setProperty('--tw', `${(W - 2 * pad).toFixed(1)}px`);
    s.setProperty('--th', '100px');
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

  /**
   * Shove overlapping pictures apart and ease each one back toward the pin it
   * belongs to. Used twice by the map formation: once on the home clump
   * alone, so the ink ring can be measured off a settled clump, and once on
   * everybody. Each bird asks for room at *its own* scale — the old constant
   * 0.8 is why thirty-four half-size home birds still demanded full-size air
   * and the clump never shrank.
   */
  function relaxPins(
    pins: Array<{ x: number; y: number; ax: number; ay: number; half: number; home: boolean; b: FlockBird }>,
    passes: number,
  ): void {
    for (let pass = 0; pass < passes; pass++) {
      let moved = false;
      for (let a = 0; a < pins.length; a++) {
        for (let c = a + 1; c < pins.length; c++) {
          const p = pins[a];
          const q = pins[c];
          const want = p.half + q.half + (p.home && q.home ? HOME_AIR : 10);
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d = Math.hypot(dx, dy);
          if (d >= want) continue;
          if (d < 0.01) {
            dx = hash(p.b.i, 17) - 0.5;
            dy = hash(q.b.i, 18) - 0.5;
            d = Math.hypot(dx, dy) || 1;
          }
          const push = ((want - d) / d) * 0.5;
          p.x -= dx * push;
          p.y -= dy * push;
          q.x += dx * push;
          q.y += dy * push;
          moved = true;
        }
      }
      for (const p of pins) {
        p.x += (p.ax - p.x) * 0.06;
        p.y += (p.ay - p.y) * 0.06;
      }
      if (!moved) break;
    }
  }

  function formation(view: ViewName): Spot[] {
    const cached = forms[view];
    if (cached) return cached;
    const out: Spot[] = new Array(birds.length);
    const m = live.length || 1;
    const pad = phone ? 22 : 56;

    if (view === 'timeline') {
      /* Real dates on one axis — and the truth about these dates is that they
         are a spike, not a line: 41 of these 58 birds were first seen in July
         or August 2025. A strict scatter is a column you cannot read, so the
         swarm is a beeswarm: overlaps resolve *upwards and downwards* first,
         because y is cheap here and x is not, and a bird's date may be fudged
         at most SWARM_X px sideways. The July pile becomes a lens sitting on
         the line over "that summer", which is exactly the story /timeline's
         climb tells. The cumulative curve is deliberately NOT drawn — there
         is no vertical room above the lens, so do not add it later. */
      const s = swarmS;
      const y0 = axisY;
      const top = Math.max(waysBottom + 16, (hintBottom.timeline ?? 0) + 10);
      const bot = H - 12;
      const sw = live.map((b) => {
        const half = (b.size * scale * s) / 2;
        return {
          b,
          half,
          x0: pad + b.date * (W - 2 * pad),
          x: pad + b.date * (W - 2 * pad),
          y: y0 + (hash(b.i, 11) - 0.5) * 8,
        };
      });
      for (let pass = 0; pass < 60; pass++) {
        let moved = false;
        for (let a = 0; a < sw.length; a++) {
          for (let c = a + 1; c < sw.length; c++) {
            const p = sw[a];
            const q = sw[c];
            const want = p.half + q.half + 5;
            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let d = Math.hypot(dx, dy);
            if (d >= want) continue;
            if (d < 0.01) {
              dx = hash(p.b.i, 21) - 0.5;
              dy = hash(q.b.i, 22) - 0.5;
              d = Math.hypot(dx, dy) || 1;
            }
            const push = ((want - d) / d) * 0.5;
            p.x -= dx * push;
            p.y -= dy * push;
            q.x += dx * push;
            q.y += dy * push;
            moved = true;
          }
        }
        for (const p of sw) {
          // x is pulled back hard (it is the data); y is barely pulled at all
          // (it is only there to make room). That asymmetry is the lens.
          p.x += (p.x0 - p.x) * 0.14;
          p.y += (y0 - p.y) * 0.02;
          p.x = Math.max(p.x0 - SWARM_X, Math.min(p.x0 + SWARM_X, p.x));
          p.x = Math.max(p.half + 6, Math.min(W - p.half - 6, p.x));
          p.y = Math.max(top + p.half, Math.min(bot - p.half, p.y));
        }
        if (!moved) break;
      }
      for (const p of sw) out[p.b.i] = { x: p.x, y: p.y, s };
      orders[view] = rankBy(live, (b) => b.date);
    } else if (view === 'map') {
      /* The real thing: every bird flies to its first location, taken from
         locations.json and reprojected into a stage box. That box is exactly
         the one the ghost coastline is drawn in — scaffolds() computes it
         once and both read it — so the flock lands *on* America rather than
         near it. */
      const bw = gw;
      const bh = gh;
      const bx = gx;
      const by = gy;

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
      }
      const pins: Pin[] = [];

      /** Golden-angle blob round one pin — the trick "Which" uses too, so a
       *  pin reads as one place with a weight rather than as a pile. Sized
       *  off the discs it has to hold rather than off a constant, so halving
       *  the home scale really does halve the home clump: n discs spaced
       *  `2·half + air` apart fill a disc of radius ≈ spacing·√(0.28n). */
      function blobOf(group: FlockBird[], ps: number, air: number): number {
        const n = group.length;
        if (n < 2) return 0;
        let sumHalf = 0;
        for (const b of group) sumHalf += (b.size * scale * ps) / 2;
        return ((2 * sumHalf) / n + air) * Math.sqrt(0.28 * n);
      }
      function lay(group: FlockBird[], ax: number, ay: number, ps: number, blob: number): void {
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
            home: ps === S_HOME,
          });
        });
      }

      /* ---- 1. the home clump, because the ring is measured off it ---- */
      const homeBirds: FlockBird[] = [];
      for (const [key, group] of byPlace) if (HOME_PLACES.has(key)) homeBirds.push(...group);
      const homeBlob = blobOf(homeBirds, S_HOME, HOME_AIR);
      lay(homeBirds, homeX, homeY, S_HOME, homeBlob);
      relaxPins(pins, 14);
      let ringR = RING_MIN * bw;
      for (const p of pins) {
        ringR = Math.max(ringR, Math.hypot(p.x - homeX, p.y - homeY) + p.half + RING_AIR);
      }

      /* ---- 2. the travel pins, dodged clear of the ring ----
         Geography will not let the ring keep its promise on its own: the NC
         Zoo's pin is 19px from the Triangle's at this scale and Wilmington's
         is 47px, so they land *inside* the home clump and no radius both
         holds the thirty-four home birds and leaves those two out. The near
         pins are therefore displaced outward along their own bearing until
         they clear — the cartographer's dodge, and exactly what
         `_build-map.py` already does to the pins on /places round the
         Triangle marker. The whole pin moves, not the birds one by one, so a
         place stays one clump and keeps its true direction from home. */
      for (const [key, group] of byPlace) {
        if (HOME_PLACES.has(key)) continue;
        const uv = PLACE_UV.get(key)!;
        let ax = bx + uv.u * bw;
        let ay = by + uv.v * bh;
        const blob = blobOf(group, S_TRAVEL, phone ? 6 : 10);
        let maxHalf = 0;
        for (const b of group) maxHalf = Math.max(maxHalf, (b.size * scale * S_TRAVEL) / 2);
        /* The drift keyframes wander up to 16px off the formation for ever,
           so a pin parked exactly on the ring would dip inside it twice a
           minute. Clear the drift as well as the discs. (Parallax reaches
           26px but only within 210px of the pointer, and while "Where" is
           held the pointer is on the word, four hundred px west of here.) */
        const need = ringR + blob + maxHalf + 6 + DRIFT_MAX;
        const d = Math.hypot(ax - homeX, ay - homeY);
        if (d < need) {
          const a0 = d > 0.5 ? Math.atan2(ay - homeY, ax - homeX) : hash(group[0].i, 19) * 6.283;
          /* The Triangle sits east of the words, so "push it out along its
             own bearing" points the NC Zoo straight at the type, and
             `clear()` would then slide it back east, inside the ring — which
             is how the false mark would come back. Swing round the words
             instead, the smaller way, staying as near the true bearing as
             the type allows. */
          for (let k = 0; k <= 22; k++) {
            const a = a0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.12;
            const nx = homeX + Math.cos(a) * need;
            const ny = homeY + Math.sin(a) * need;
            const [qx, qy] = clear(nx, ny, blob + maxHalf, 6, keepOut.map);
            // ...and on the paper, or put() would clamp it back inside
            const edge = blob + maxHalf + 6;
            const onPaper = nx >= edge && nx <= W - edge && ny >= edge && ny <= H - edge;
            if ((qx === nx && qy === ny && onPaper) || k === 22) {
              ax = nx;
              ay = ny;
              break;
            }
          }
        }
        lay(group, ax, ay, S_TRAVEL, blob);
      }

      /* ---- 3. everybody at once ----
         Neighbouring places can be a few pixels apart at this scale, so
         photographs pile up on each other and the formation stops reading.
         Push them apart and pull each one back toward its own pin, which is
         what _build-map.py does to the pins themselves. Deterministic, and
         ~1.7k pairs a pass on a cached formation, so it costs nothing. The
         last sweep then re-states the ring: a travel bird that the shoving
         pushed inside it goes back out along its own pin's bearing. */
      relaxPins(pins, 12);
      for (const p of pins) {
        if (p.home) continue;
        const need = ringR + p.half + 6 + DRIFT_MAX;
        const d = Math.hypot(p.x - homeX, p.y - homeY);
        if (d >= need) continue;
        const a = d > 0.5 ? Math.atan2(p.y - homeY, p.x - homeX) : Math.atan2(p.ay - homeY, p.ax - homeX);
        p.x = homeX + Math.cos(a) * need;
        p.y = homeY + Math.sin(a) * need;
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

      /* Circle the home clump in pen, the way /places circles the Triangle:
         same inkRing, same seed, so it is recognisably the same gesture. The
         radius is the clump's, floored at DESIGN.md's 3.1% of the map — and
         because every bird on a travel pin has been dodged clear of it, the
         ring encloses exactly the birds this formation put on the Triangle
         pin, and nothing else.

         What that is NOT is "first seen in the Triangle". These birds are
         the ones whose record LISTS a Triangle place first (see
         placeOnRecord): 34 of the 58. Another 14 were also seen at a
         Triangle place and fly to a travel pin instead, purely on which id
         Notion put first. Only 7 of the 58 were seen nowhere but the
         Triangle, which is the one local claim this data can actually prove
         — and a ring round seven birds is not the picture. So the ring says
         "these were at home", the caption on index.astro says "one of the
         places it was seen", and neither says "first".

         index.astro draws the path at r = 100 in a viewBox 232 across, so
         the box is 2.32 r. */
      // no home bird in the air (a narrow phone can drop them all) — no ring
      const rd = pins.some((p) => p.home) ? ringR * 2.32 : 0;
      const st = root!.style;
      st.setProperty('--rx', `${(homeX - rd / 2).toFixed(1)}px`);
      st.setProperty('--ry', `${(homeY - rd / 2).toFixed(1)}px`);
      st.setProperty('--rd', `${rd.toFixed(1)}px`);

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
         line: Seattle first, Boston last. */
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
      // a tidy grid, everything one size, wrapped around the words
      const cols = Math.max(3, Math.round(Math.sqrt((m * W) / Math.max(1, H))));
      const cap = phone ? 66 : 104;
      let cell = cap;
      let cells: Array<{ x: number; y: number; used: boolean }> = [];
      for (let rows = Math.ceil(m / cols); rows < 40; rows++) {
        cell = Math.min((W - 2 * pad) / cols, (H - 2 * pad) / rows, cap);
        const x0 = (W - cols * cell) / 2 + cell / 2;
        const y0 = (H - rows * cell) / 2 + cell / 2;
        cells = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = x0 + c * cell;
            const y = y0 + r * cell;
            // the grid leaves a clean rectangular hole for the title
            if (
              Math.abs(x - hubCx) < hubHW + cell * 0.45 &&
              Math.abs(y - hubCy) < hubHH + cell * 0.45
            )
              continue;
            cells.push({ x, y, used: false });
          }
        }
        if (cells.length >= m) break;
      }

      /* Every bird takes the nearest free slot, so the flock settles into the
         grid rather than shuffling across it — much easier to read part-way. */
      const edgePx = cell * 0.66; // every bird ends up this wide
      for (const b of live.slice().sort((p, q) => p.rank - q.rank)) {
        let best = -1;
        let bestD = Infinity;
        for (let k = 0; k < cells.length; k++) {
          if (cells[k].used) continue;
          const d = (cells[k].x - b.hx) ** 2 + (cells[k].y - b.hy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        const c = best === -1 ? { x: W / 2, y: H / 2 } : cells[best];
        if (best !== -1) cells[best].used = true;
        out[b.i] = {
          x: c.x,
          y: c.y,
          s: Math.max(0.3, Math.min(1.6, edgePx / (b.size * scale))),
        };
      }
      // row-major: the grid fills the way you read it
      orders[view] = rankBy(live, (b) => Math.round((out[b.i]?.y ?? 0) / 24) * 1e5 + (out[b.i]?.x ?? 0));
    }

    forms[view] = out;
    return out;
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

  /* ---------------- the four ways in ---------------- */

  function hold(view: ViewName): void {
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
  const ways = Array.from(root.querySelectorAll<HTMLAnchorElement>('.way'));

  if (!still) {
    for (const a of ways) {
      const view = a.dataset.form as ViewName | undefined;
      if (!view) continue;
      a.addEventListener('pointerenter', () => hold(view));
      a.addEventListener('pointerleave', release);
      a.addEventListener('focus', () => hold(view));
      a.addEventListener('blur', release);
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        // clicking finishes the journey the hover started
        apply(view, 1, 520);
        root!.classList.add('is-leaving');
        window.setTimeout(() => navigate(a.href), 360);
      });
    }

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    document.addEventListener('bird:open', release);
  } else {
    /* Reduced motion: no morph, no ghost, no swarm — but the *explanation*
       must not depend on motion, so `data-form` is still set and the one
       matching caption appears. Global 0.01ms transitions make it instant.
       index.astro keeps the scaffolds off `.flock--still`. */
    for (const a of ways) {
      const view = a.dataset.form;
      if (!view) continue;
      const on = () => {
        root.dataset.form = view;
      };
      const off = () => {
        // the pointer can enter the next word before it leaves this one
        if (root.dataset.form === view) delete root.dataset.form;
      };
      a.addEventListener('pointerenter', on);
      a.addEventListener('pointerleave', off);
      a.addEventListener('focus', on);
      a.addEventListener('blur', off);
    }
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
