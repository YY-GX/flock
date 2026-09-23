/**
 * Geometry and bookkeeping for the Where view (/places, /places/<slug>).
 *
 * Pure data: no DOM, safe at build time. Everything visual lives in
 * Map*.astro; everything the two routes must agree on lives here.
 *
 *   - which bird's face a pin wears (deterministic, see pickPinBird)
 *   - how big that pin is (species count -> diameter)
 *   - where the "home patch" marker sits on the US map (fitted projection)
 *   - which places a bird links together (the cross-pin glow)
 */

import type { Bird, LocationRec } from './types';
import { birds, locations } from './data';
import { firstPhotoFile } from './data';
import { photosById, locationsById } from './data';
import { formatDate } from './flock';
/*
 * Trips are not drawn here at all any more — see the note where they were.
 * (DESIGN2 §0.1 / §2.1) and `days` is the one place-for-a-day rule already
 * applied to all 64 days; /days and the timeline's brackets read the same
 * objects. See "pencil trip routes" at the foot of this file.
 */
/* the pen: the LCG, Catmull-Rom and every stroke built on them (./ink.ts) */
import { rng, catmull, inkTri, inkArrow, inkPoly, inkLine, type InkStroke } from './ink.ts';
import { days as birdingDayList, dayByIso } from './days';
import meta from '../data/map-meta.json';

export type SpaceId = 'us' | 'triangle';

/** The owners' own apartment — a house icon, never a bird. */
export const HOME_SLUG = 'location';

/* ---------------- spaces ---------------- */

export interface SpaceDef {
  id: SpaceId;
  label: string;
  width: number;
  height: number;
  insets: { id: string; label: string; rect: { x: number; y: number; width: number; height: number } }[];
}

const rawSpaces = (meta as any).spaces as Record<string, any>;

export const SPACES: Record<SpaceId, SpaceDef> = {
  us: {
    id: 'us',
    label: rawSpaces.us.label,
    width: rawSpaces.us.viewBox.width,
    height: rawSpaces.us.viewBox.height,
    insets: rawSpaces.us.insets ?? [],
  },
  triangle: {
    id: 'triangle',
    label: rawSpaces.triangle.label,
    width: rawSpaces.triangle.viewBox.width,
    height: rawSpaces.triangle.viewBox.height,
    insets: rawSpaces.triangle.insets ?? [],
  },
};

/* ---------------- birds per place ---------------- */

/*
 * Only the 238 spotted birds. Every other view on the site counts a place's
 * birds this way, and for one record in the data the difference is visible:
 * the Northern Rough-winged Swallow is marked unspotted and still carries a
 * date, a type and Seattle (TODO.md §D — the owner fixes it in Notion). Read
 * unfiltered, that one row made Seattle "50 birds" on the pin, the index row,
 * the place lede and its meta description, while /list, /timeline, /days and
 * this page's own OG card all said 49. The filter is not about that bird; it
 * is so the next inconsistent record cannot reach the map either.
 */
const birdsByLocation = new Map<string, Bird[]>();
for (const bird of birds) {
  if (!bird.spotted) continue;
  for (const id of bird.locationIds ?? []) {
    const list = birdsByLocation.get(id);
    if (list) list.push(bird);
    else birdsByLocation.set(id, [bird]);
  }
}

function photoCount(bird: Bird): number {
  let n = 0;
  for (const pid of bird.photoIds ?? []) n += photosById.get(pid)?.files?.length ?? 0;
  return n;
}

export function hasPhoto(bird: Bird): boolean {
  return Boolean(firstPhotoFile(bird));
}

/** Birds recorded at exactly one place: 128 of the 238, 127 with a photograph. */
function seenOnlyHere(bird: Bird): boolean {
  return (bird.locationIds ?? []).length === 1;
}

/**
 * How well a bird speaks for a place. The old rule — favourite, then most
 * photographs, then A-Z — was deterministic and that was never the problem:
 * it handed Northern Cardinal nine of the 37 pins and Bald Eagle six, so
 * three birds covered half the map. The fix is not randomness, it is a
 * global assignment (see assignFaces) plus a score that prefers a bird you
 * cannot meet anywhere else.
 *
 *   3  a favourite
 *   2  seen only at this place
 *   1  five photographs or more
 *   +  photoCount/100, purely as a tie-break
 */
function faceScore(bird: Bird): number {
  const shots = photoCount(bird);
  return (
    (bird.favorite ? 3 : 0) + (seenOnlyHere(bird) ? 2 : 0) + (shots >= 5 ? 1 : 0) + shots / 100
  );
}

/** Candidates for a pin: every bird recorded here that has a photograph. */
function faceCandidates(list: Bird[]): Bird[] {
  return list.filter(hasPhoto);
}

/**
 * The order a pin flips through its birds on hover: favourites first, then
 * the birds seen only here, then by how many photographs there are.
 */
function deckOrder(a: Bird, b: Bird): number {
  if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
  if (seenOnlyHere(a) !== seenOnlyHere(b)) return seenOnlyHere(a) ? -1 : 1;
  const pa = photoCount(a);
  const pb = photoCount(b);
  if (pa !== pb) return pb - pa;
  return a.name.localeCompare(b.name);
}

/** How many more birds a pin carries behind its face. */
const DECK_MAX = 5;

/** 1 species -> 30px, 50 species -> 68px. sqrt so small places stay legible. */
export function pinDiameter(count: number): number {
  const c = Math.max(1, count);
  const t = Math.sqrt(Math.min(c, 50) - 1) / Math.sqrt(49);
  return Math.round(30 + 38 * t);
}

/*
 * The width the pin diameters above were drawn for: the US map as it renders
 * at 1440. A pin is laid out as a percentage of the map's own width rather
 * than in those pixels, because a fixed pixel size swells against the
 * coastline as the map shrinks (the biggest pin measured 8.4% of the map's
 * width at 1440 and 13.4% at 360), and no single set of coordinates can be
 * collision-free at both. In percent, one relaxation holds at every width.
 */
const REF_MAP_W = 811;

/** A pin's diameter as a percentage of the map's width. */
export function pinSpan(diameter: number): number {
  return (diameter / REF_MAP_W) * 100;
}

export interface PlaceView {
  loc: LocationRec;
  slug: string;
  name: string;
  space: SpaceId;
  /** percentages of the space viewBox — where the pin is drawn */
  x: number;
  y: number;
  /** the honest coordinate; equal to x/y unless the pin had to be dodged */
  trueX: number;
  trueY: number;
  /** how far the pin was pushed, in % of the map's width (0 = not moved) */
  dodge: number;
  /** pin diameter as a % of the map's width */
  span: number;
  /**
   * How far this pin's *hit area* may grow before it would touch a
   * neighbour's — half the measured gap to the nearest other disc or to the
   * furniture, in the same unit as `span`. See `clearances()`.
   */
  clear: number;
  inset: string | null;
  /** every bird recorded here, oldest first spotting first */
  birds: Bird[];
  count: number;
  /** the bird whose photograph the pin wears; null only if nothing is shot */
  pinBird: Bird | null;
  /** up to five more birds the pin flips through on hover, face excluded */
  deck: Bird[];
  diameter: number;
  isHome: boolean;
  firstDate: string | null;
  lastDate: string | null;
}

function byDate(a: Bird, b: Bird): number {
  const da = a.firstSpotted ?? '9999';
  const db = b.firstSpotted ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function build(loc: LocationRec): PlaceView {
  const list = [...(birdsByLocation.get(loc.id) ?? [])].sort(byDate);
  const dated = list.filter((b) => b.firstSpotted);
  return {
    loc,
    slug: loc.slug,
    name: loc.name,
    space: (loc.mapSpace ?? (loc.scope === 'local' ? 'triangle' : 'us')) as SpaceId,
    x: loc.x ?? 50,
    y: loc.y ?? 50,
    trueX: loc.x ?? 50,
    trueY: loc.y ?? 50,
    dodge: 0,
    span: pinSpan(pinDiameter(list.length || loc.birdCount || 1)),
    /* filled in by clearances(), once the dodge for this space has settled */
    clear: 0,
    inset: loc.inset ?? null,
    birds: list,
    count: list.length || (loc.birdCount ?? 0),
    /* filled in by assignFaces() below, once every place is known */
    pinBird: null,
    deck: [],
    diameter: pinDiameter(list.length || loc.birdCount || 1),
    isHome: loc.slug === HOME_SLUG,
    firstDate: dated[0]?.firstSpotted ?? null,
    lastDate: dated.length ? dated[dated.length - 1].firstSpotted! : null,
  };
}

export const places: PlaceView[] = locations.map(build);

/**
 * One face per bird, site-wide.
 *
 * Places choose in ascending order of how many candidates they have, so the
 * places with no choice choose first (Miami Beach has one bird; Seattle has
 * forty-nine and picks last from what is left). Each takes its highest
 * scoring bird that no other place has already taken. With 37 pins and 127
 * single-place birds that carry a photograph — a candidate has to have one —
 * this never runs dry, but if it ever did the place
 * simply keeps its best bird and the repetition comes back for that one pin.
 *
 * Deterministic end to end — no clock, no randomness, no build order — so
 * /places and /places/<slug> always agree and the view transition between
 * them carries the same photograph.
 */
function assignFaces(all: PlaceView[]): void {
  const taken = new Set<string>();
  const order = all
    .filter((p) => !p.isHome)
    .map((p) => ({ p, cands: faceCandidates(p.birds) }))
    .sort((a, b) => a.cands.length - b.cands.length || a.p.slug.localeCompare(b.p.slug));

  for (const { p, cands } of order) {
    if (!cands.length) continue;
    const ranked = [...cands].sort(
      (a, b) => faceScore(b) - faceScore(a) || a.name.localeCompare(b.name),
    );
    const face = ranked.find((b) => !taken.has(b.id)) ?? ranked[0];
    taken.add(face.id);
    p.pinBird = face;
    p.deck = cands
      .filter((b) => b.id !== face.id)
      .sort(deckOrder)
      .slice(0, DECK_MAX);
  }
}

assignFaces(places);

export const placeBySlug = new Map(places.map((p) => [p.slug, p]));
export const placeById = new Map(places.map((p) => [p.loc.id, p]));

/* ---------------- the dodge ---------------- */

/*
 * The coordinates in locations.json are geographically honest and the pins
 * are not: a pin is a photograph 3.7-8.4% of the map wide, so places an hour
 * apart draw as one blob (Tampa sat 82% inside Silver Springs; Mason Farm
 * swallowed the Botanical Garden whole). Rather than lie in the data, the
 * pins are relaxed apart here at layout time and each displaced pin keeps a
 * hairline leader back to its true spot, which MapStage draws.
 *
 * One pass of circle relaxation in a square space (v is scaled by the map's
 * aspect so a percent is a percent in both axes), with a spring back to the
 * truth and a hard cap on how far a pin may lie about itself. Deterministic:
 * no randomness, fixed iteration count, same data -> same pins.
 */
const DODGE_GAP = 0.6; /* clear air between two rims, in % of the map width */
/*
 * A pin stands on its spot the way a speech bubble does: the tail tip is the
 * coordinate, the disc floats above it. The circle that overlaps anything is
 * the disc, so the relaxation works on the disc centre and puts the tail back
 * underneath afterwards. r * 1.6 is the disc radius plus the tail.
 */
const DISC_LIFT = 1.6;
const DODGE_MAX = 9; /* a pin never moves further than this, same units */
const DODGE_ITER = 700;

/* ---------------- the hand-drawn ring round the home patch ---------------- */

/*
 * The Triangle is not a place on the US map, it is a doorway to the second
 * map, so it must not look like one more photograph on a pin. It is drawn
 * the way you would ring a spot on a paper map with a pen — and drawn by the
 * same hand as the coastline: _build-map.py's LCG, its Catmull-Rom smoothing
 * and, in MapStage, its feTurbulence wobble filter.
 *
 * That pen now lives in `./ink.ts` — the timeline draws its season
 * boundaries with it too, and `mapView` imports `timeline`, so the shared
 * half had to come out of this file rather than be copied into that one.
 * Everything the map used to export from here it still exports, so no
 * caller had to change.
 */
export {
  inkLoop,
  inkRing,
  inkTri,
  inkTriPath,
  inkArrow,
  inkPoly,
  inkLine,
  type InkStroke,
} from './ink.ts';

/** Radius the Triangle's mark is drawn to, as a % of the map's width. */
export const HOME_RING_R = 3.1;

/**
 * The inset box that holds the Triangle's 18 spots, in percentages of the
 * US viewBox — the dashed-rounded-rectangle idiom the artwork already uses
 * for Hawaiʻi and Puerto Rico, out in the empty Atlantic. Its height is not
 * a round number on purpose: at 10 units of padding the interior is
 * 110 x 96, and the triangle map's own 1000 x 870 viewBox scales into that
 * at exactly 0.11 (110 x 95.7), so the dots keep their true shape.
 */
export const HOME_INSET = { x: 85.2, y: 55.6, w: 13.0, h: 16.3 };

/** Padding inside the box, in US viewBox units. */
export const HOME_INSET_PAD = 10;

/*
 * Furniture a pin may not sit on. Everything is in the dodge's own (u, v)
 * space: u is a percentage of the map's width and v is the y coordinate in
 * the same unit, i.e. y% scaled by the map's aspect, so a percent is a
 * percent in both axes.
 */
type Obstacle = { u: number; v: number; r: number } | { rect: [number, number, number, number] };

/** The point of a rectangle a pin at (u, v) is closest to escaping through. */
function nearestOnRect(
  rect: [number, number, number, number],
  u: number,
  v: number,
): [number, number] {
  const [u0, v0, u1, v1] = rect;
  if (u > u0 && u < u1 && v > v0 && v < v1) {
    /* inside: leave by the nearest wall rather than drifting to a corner */
    const out = [u - u0, u1 - u, v - v0, v1 - v];
    const m = Math.min(...out);
    if (m === out[0]) return [u0, v];
    if (m === out[1]) return [u1, v];
    if (m === out[2]) return [u, v0];
    return [u, v1];
  }
  return [Math.min(u1, Math.max(u0, u)), Math.min(v1, Math.max(v0, v))];
}

function dodgeObstacles(space: SpaceId): Obstacle[] {
  if (space !== 'us') return [];
  const ratio = SPACES.us.height / SPACES.us.width;
  const k = 100 / SPACES.us.width; /* viewBox units -> % of the map's width */
  const arrow = HOME_ARROW;
  return [
    /*
     * The ring. Its hit circle reaches r * 1.3 and sits above every pin, so
     * the obstacle has to be at least that wide or the marker would swallow
     * a neighbour's clicks.
     */
    { u: homeMarker.x, v: homeMarker.y * ratio, r: HOME_RING_R * 1.3 + 0.4 },
    /*
     * The inset box and the count line underneath it, as one rectangle:
     * both take the pointer, so both have to be clear of the pins. The box
     * is 13% x 16.3% and the count adds roughly 3% of the map's height.
     */
    {
      rect: [
        HOME_INSET.x,
        HOME_INSET.y * ratio,
        HOME_INSET.x + HOME_INSET.w,
        (HOME_INSET.y + HOME_INSET.h + 3.1) * ratio,
      ],
    },
    /* a thin corridor for the arrow, so nothing parks across it */
    ...[0.15, 0.5, 0.85].map((t) => ({
      u: (arrow.x1 + (arrow.x2 - arrow.x1) * t) * k,
      v: (arrow.y1 + (arrow.y2 - arrow.y1) * t) * k,
      r: 1.2,
    })),
  ];
}

function dodgeSpace(space: SpaceId): void {
  const def = SPACES[space];
  const ratio = def.height / def.width;
  const list = places.filter((p) => p.space === space);
  const obs = dodgeObstacles(space);

  const nodes = list.map((p, i) => ({
    p,
    r: p.span / 2,
    u: p.x,
    v: p.y * ratio - (p.span / 2) * DISC_LIFT,
    u0: p.x,
    v0: p.y * ratio - (p.span / 2) * DISC_LIFT,
    /* an inset pin is alone in its own little box; it stays where it is */
    fixed: Boolean(p.inset),
    i,
  }));

  const separate = (a: (typeof nodes)[number], bu: number, bv: number, br: number, bw: number) => {
    const need = a.r + br + DODGE_GAP;
    let dx = bu - a.u;
    let dy = bv - a.v;
    let dist = Math.hypot(dx, dy);
    if (dist >= need) return null;
    if (dist < 1e-6) {
      /* exactly coincident: nudge along a fixed direction, not a random one */
      dx = Math.cos(a.i);
      dy = Math.sin(a.i);
      dist = 1;
    }
    const push = ((need - dist) / dist) * 0.5;
    const wa = a.fixed ? 0 : 1 / a.r;
    const tot = wa + bw || 1;
    return { dx, dy, ka: (2 * wa) / tot, kb: (2 * bw) / tot, push };
  };

  for (let it = 0; it < DODGE_ITER; it++) {
    const cool = 1 - it / DODGE_ITER;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const s = separate(a, b.u, b.v, b.r, b.fixed ? 0 : 1 / b.r);
        if (!s) continue;
        a.u -= s.dx * s.push * s.ka;
        a.v -= s.dy * s.push * s.ka;
        b.u += s.dx * s.push * s.kb;
        b.v += s.dy * s.push * s.kb;
      }
    }
    /* the furniture is not negotiable: push out of it after the pins have
       finished arguing with each other, or a pin can be squeezed back in */
    for (const a of nodes) {
      for (const o of obs) {
        const [ou, ov, or_] = 'rect' in o ? [...nearestOnRect(o.rect, a.u, a.v), 0] : [o.u, o.v, o.r];
        const s = separate(a, ou, ov, or_, 0);
        if (!s) continue;
        a.u -= s.dx * s.push * s.ka;
        a.v -= s.dy * s.push * s.ka;
      }
    }
    for (const a of nodes) {
      if (a.fixed) continue;
      /* the spring home: honesty wins wherever there is room for it */
      a.u += (a.u0 - a.u) * 0.03 * cool;
      a.v += (a.v0 - a.v) * 0.03 * cool;
      const dx = a.u - a.u0;
      const dy = a.v - a.v0;
      const dd = Math.hypot(dx, dy);
      if (dd > DODGE_MAX) {
        a.u = a.u0 + (dx / dd) * DODGE_MAX;
        a.v = a.v0 + (dy / dd) * DODGE_MAX;
      }
      /* the whole pin — disc, rim and tail — stays on the paper */
      a.u = Math.min(100 - a.r - 0.4, Math.max(a.r + 0.4, a.u));
      a.v = Math.min(100 * ratio - a.r * DISC_LIFT - 0.4, Math.max(a.r + 0.6, a.v));
    }
  }

  for (const a of nodes) {
    a.p.x = Math.round(a.u * 1000) / 1000;
    a.p.y = Math.round(((a.v + a.r * DISC_LIFT) / ratio) * 1000) / 1000;
    a.p.dodge = Math.round(Math.hypot(a.u - a.u0, a.v - a.v0) * 1000) / 1000;
  }
}

/* ---------------- the room a pin has round it (TODO C3) ---------------- */

/*
 * WCAG 2.5.8 asks for a 24 CSS px target. A pin is a percentage of the map,
 * so on a 360 px phone — where the US sheet draws at 338 px and the Triangle
 * at 276 — the smallest disc measures 10.2 px and thirty of the thirty-seven
 * are under 24. The discs cannot simply be grown: 19 photographs on a 338 px
 * sheet is already the tightest packing the relaxation above can find
 * without lying about where the places are.
 *
 * What can grow is the part of a pin nobody can see. `clear` is the budget
 * for that: **half** the gap from this disc's rim to the nearest other
 * disc's rim (and to the furniture the dodge already treats as solid), in
 * the same unit as `span`, so `MapPin` can hand CSS the pure ratio
 * `clear / span` and the pad scales with the map like everything else.
 *
 * Half, not all, is the whole safety argument: two pads may meet and can
 * never overlap, so no pin's pad can ever reach another pin's centre and no
 * pin can be made unreachable by a neighbour growing. It is also why this is
 * measured per pin rather than assumed: Miami Beach has an ocean round it
 * and can take its 12.5 px disc all the way to a 24 px target on a phone,
 * while Boston has seven neighbours and can barely move.
 *
 * This is only half the answer at phone widths — the north-east still cannot
 * reach 24 px, which is what the place index under the map on `/places` is
 * for. It is the whole answer between about 820 and 960 px, where every disc
 * is within a pixel or two of 24 already.
 */

/** Nothing on either sheet needs more than this, in % of the map's width. */
const HIT_CLEAR_MAX = 8;

/*
 * How high a disc floats above the tail tip that stands on the coordinate,
 * in % of the map's width — and the one place on this map where the drawing
 * is NOT scale-invariant.
 *
 * `.map-pin__tail` is `width: max(7px, 26%)`: below a 27 px pin the tail
 * stops shrinking, because a hairline triangle is not a tail. So a 10 px pin
 * on a 338 px phone map wears a proportionally much longer tail than the
 * same pin at 1440, and its disc sits about 3 px higher relative to its
 * neighbours than the dodge's flat `DISC_LIFT` model says. The dodge can
 * live with that — its 0.6-unit air is wider than the drift and the pins
 * measure 0 overlaps at every width — but a hit pad sized from the flat
 * model would have been wrong by exactly that 3 px, and it was: three pins
 * at 360 handed a sliver of their own rim to a neighbour before this.
 */
function liftPct(span: number, mapW: number): number {
  const w = (span / 100) * mapW; /* the pin's own width in CSS px */
  const tail = Math.max(7, 0.26 * w); /* .map-pin__tail */
  return ((w / 2 + (tail * 14) / 12 - 2) / mapW) * 100;
}

/*
 * The widths this map is actually drawn at, in CSS px, every 10: 250 is the
 * Triangle sheet on a 300 px phone, 820 is past the US sheet's reference
 * width, and above that the pad is zero anyway because every disc has
 * passed 24 px. The budget is the worst case over the whole range, so one
 * number holds at every width the way the dodge's own percentages do — and
 * the range has to be swept rather than sampled at a few points, because
 * the tail's 7 px floor makes the gap between two pins a curve in the map's
 * width rather than a constant.
 */
const HIT_SAMPLE_W = Array.from({ length: 58 }, (_, i) => 250 + i * 10);
/*
 * And then nine tenths of it. Two pins on the Triangle sheet (金玉公寓 and
 * Sandy Creek Park) come out exactly tangent at 360 px — the dodge left them
 * 0.6 units of air in its own flat-lift model and the tail floor ate all of
 * it — so at that one pair the budget is a hair either way and sub-pixel
 * layout decides. A tenth back is cheaper than an argument.
 */
const HIT_CLEAR_SAFE = 0.9;

function clearances(space: SpaceId): void {
  const def = SPACES[space];
  const ratio = def.height / def.width;
  const list = places.filter((p) => p.space === space);
  const obs = dodgeObstacles(space);

  for (const p of list) p.clear = HIT_CLEAR_MAX;

  for (const mapW of HIT_SAMPLE_W) {
    /* the dodge's own (u, v): a percent is a percent in both axes */
    const disc = (p: PlaceView) => ({
      u: p.x,
      v: p.y * ratio - liftPct(p.span, mapW),
      r: p.span / 2,
    });
    for (const p of list) {
      const a = disc(p);
      let gap = HIT_CLEAR_MAX * 2;
      for (const q of list) {
        if (q === p) continue;
        const b = disc(q);
        gap = Math.min(gap, Math.hypot(b.u - a.u, b.v - a.v) - a.r - b.r);
      }
      for (const o of obs) {
        const [ou, ov, or_] =
          'rect' in o ? [...nearestOnRect(o.rect, a.u, a.v), 0] : [o.u, o.v, o.r];
        gap = Math.min(gap, Math.hypot(ou - a.u, ov - a.v) - a.r - or_);
      }
      p.clear = Math.min(p.clear, gap / 2);
    }
  }

  for (const p of list) {
    p.clear = Math.max(0, Math.round(p.clear * HIT_CLEAR_SAFE * 1000) / 1000);
  }
}

const dodged = new Set<SpaceId>();

/**
 * Pins of one map, biggest drawn first so small ones stay clickable on top.
 * The first call for a space relaxes it; everything after reads the result.
 */
export function placesIn(space: SpaceId): PlaceView[] {
  if (!dodged.has(space)) {
    dodged.add(space);
    dodgeSpace(space);
    clearances(space);
  }
  return places.filter((p) => p.space === space).sort((a, b) => b.diameter - a.diameter);
}

/**
 * The same places as a reading order rather than a drawing order: most birds
 * first, ties by name.
 *
 * `/places` prints this under the map at phone widths, where the discs are
 * 10-14 px and no arrangement of 37 photographs on a 338 px sheet can be
 * thumb-sized. Biggest-first rather than A-Z on purpose — a pin's size *is*
 * its species count, so the list read top to bottom is the map read
 * loudest-first, and the two orders agree instead of being two indexes of
 * the same thing.
 */
export function placeIndex(space: SpaceId): PlaceView[] {
  return [...placesIn(space)].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Slugs of every place a bird was recorded at. The cross-pin glow reads this. */
export function placeSlugsOf(bird: Bird): string[] {
  return (bird.locationIds ?? [])
    .map((id) => placeById.get(id)?.slug)
    .filter((s): s is string => Boolean(s));
}

/* ---------------- the home-patch marker on the US map ---------------- */

/*
 * The Triangle has no pin of its own on the US map — it is a whole second
 * map. To put its marker in the right spot we re-run the projection
 * map-meta documents (Albers equal-area conic, 29.5/45.5, origin 37.5/-96)
 * and fit it to the 17 non-inset US pins with least squares. The pins were
 * nudged apart for legibility, so the fit absorbs that: mean residual ~7px
 * in a 1000-wide viewBox. Deterministic — same data, same number.
 */
const RAD = Math.PI / 180;

function albers(lat: number, lng: number): [number, number] {
  const p = rawSpaces.us.projection;
  const [par1, par2] = p.parallels as [number, number];
  const p1 = par1 * RAD;
  const p2 = par2 * RAD;
  const lat0 = p.origin.lat * RAD;
  const lng0 = p.origin.lng;
  const n = (Math.sin(p1) + Math.sin(p2)) / 2;
  const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1);
  const rho = Math.sqrt(C - 2 * n * Math.sin(lat * RAD)) / n;
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(lat0)) / n;
  const theta = n * ((lng - lng0) * RAD);
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

function solve3(rows: number[][], rhs: number[]): [number, number, number] {
  const A = rows.map((r, i) => [...r, rhs[i]]);
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    [A[i], A[piv]] = [A[piv], A[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j];
    }
  }
  const out = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = A[i][3];
    for (let j = i + 1; j < 3; j++) s -= A[i][j] * out[j];
    out[i] = s / A[i][i];
  }
  return out as [number, number, number];
}

function fitUs() {
  const sample = locations.filter(
    (l) => (l.mapSpace ?? 'us') === 'us' && !l.inset && typeof l.lat === 'number' && l.x != null,
  );
  const rows = sample.map((l) => {
    const [X, Y] = albers(l.lat!, l.lng!);
    return { X, Y, px: (l.x! / 100) * SPACES.us.width, py: (l.y! / 100) * SPACES.us.height };
  });
  const normal = (target: (r: (typeof rows)[number]) => number) => {
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const b = [0, 0, 0];
    for (const r of rows) {
      const v = [r.X, r.Y, 1];
      const t = target(r);
      for (let i = 0; i < 3; i++) {
        b[i] += v[i] * t;
        for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j];
      }
    }
    return solve3(A, b);
  };
  return { cx: normal((r) => r.px), cy: normal((r) => r.py) };
}

const usFit = rows_guard();

function rows_guard() {
  try {
    return fitUs();
  } catch {
    /* Not enough data (fixture mode): fall back to a sane spot over NC. */
    return null;
  }
}

/** lat/lng -> percentage coordinates on the US map. */
export function projectUs(lat: number, lng: number): { x: number; y: number } {
  if (!usFit) return { x: 82.2, y: 49.5 };
  const [X, Y] = albers(lat, lng);
  const px = usFit.cx[0] * X + usFit.cx[1] * Y + usFit.cx[2];
  const py = usFit.cy[0] * X + usFit.cy[1] * Y + usFit.cy[2];
  return { x: (px / SPACES.us.width) * 100, y: (py / SPACES.us.height) * 100 };
}

const localPlaces = places.filter((p) => p.space === 'triangle');

/** Centre of the local patch, in real degrees, from the local places. */
const homeLatLng = (() => {
  const withCoords = localPlaces.filter((p) => typeof p.loc.lat === 'number');
  if (!withCoords.length) return { lat: 35.88, lng: -78.9 };
  const lat = withCoords.reduce((s, p) => s + p.loc.lat!, 0) / withCoords.length;
  const lng = withCoords.reduce((s, p) => s + p.loc.lng!, 0) / withCoords.length;
  return { lat, lng };
})();

export const homeMarker = {
  /** true position of the Triangle on the US map, in % */
  ...projectUs(homeLatLng.lat, homeLatLng.lng),
  count: localPlaces.length,
  species: new Set(localPlaces.flatMap((p) => p.birds.map((b) => b.id))).size,
};

/*
 * The arrow from the ring to the inset box, in US viewBox units.
 *
 * DESIGN.md asked for "length ~= 75" and then gave coordinates that worked
 * out to 24 (measured at 33 as built): the ring's rim and the box's nearest
 * corner are only ~19 units apart, so any arrow that stops at that corner is
 * a tick, not a mark. DESIGN2 5.2 caught it. The fix is the one thing the
 * geometry allows — let the head land *inside* the box, in the 30-unit strip
 * of empty interior to the left of the dot field (the dots start at x 882),
 * 50 units below the top edge so the shaft clears the rx=10 corner too.
 *
 * That gives a 71-unit shaft: ~58 px at 1440 and ~25 px on a 350 px phone
 * map, which is the "26 px" 2.5 asked for. It reads as an arrow pointing
 * into the box rather than a nick between two neighbours.
 */
export const HOME_ARROW = (() => {
  const w = SPACES.us.width;
  const h = SPACES.us.height;
  const cx = (homeMarker.x / 100) * w;
  const cy = (homeMarker.y / 100) * h;
  const r = (HOME_RING_R / 100) * w;
  const x2 = (HOME_INSET.x / 100) * w + 20;
  const y2 = (HOME_INSET.y / 100) * h + 50;
  const a = Math.atan2(y2 - cy, x2 - cx); /* ~61 degrees below horizontal */
  return { x1: cx + r * 1.15 * Math.cos(a), y1: cy + r * 1.15 * Math.sin(a), x2, y2 };
})();

/**
 * The 18 Triangle spots as dots inside the inset box, in US viewBox units.
 *
 * The spots fill only the middle third of their own map (x 18-65%,
 * y 19-76%), so scaling the whole triangle viewBox into the box would leave
 * the constellation huddled in one corner of it. What is scaled instead is
 * the spots' own bounding box, at one scale for both axes, centred in the
 * interior — the shape is the Triangle's real shape, just filling the room
 * it has been given. The bottom 21 units of the box are the label's.
 */
const HOME_INSET_LABEL_H = 21;

export const homeInsetDots = (() => {
  const w = SPACES.us.width;
  const h = SPACES.us.height;
  const tw = SPACES.triangle.width;
  const th = SPACES.triangle.height;
  const pts = localPlaces.map((p) => ({
    p,
    x: ((p.loc.x ?? 50) / 100) * tw,
    y: ((p.loc.y ?? 50) / 100) * th,
  }));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  const ix = (HOME_INSET.x / 100) * w + HOME_INSET_PAD;
  const iy = (HOME_INSET.y / 100) * h + HOME_INSET_PAD;
  const iw = (HOME_INSET.w / 100) * w - HOME_INSET_PAD * 2;
  const ih = (HOME_INSET.h / 100) * h - HOME_INSET_PAD * 2 - HOME_INSET_LABEL_H;
  const k = Math.min(iw / (x1 - x0 || 1), ih / (y1 - y0 || 1));
  const ox = ix + (iw - (x1 - x0) * k) / 2;
  const oy = iy + (ih - (y1 - y0) * k) / 2;

  const round = (v: number) => Math.round(v * 100) / 100;
  return pts.map(({ p, x, y }) => ({
    slug: p.slug,
    name: p.name,
    house: p.isHome,
    x: round(ox + (x - x0) * k),
    y: round(oy + (y - y0) * k),
  }));
})();

/* ---------------- trips are not drawn on this map ----------------
 *
 * There were pencil lines here: one leg per hop of a trip, dashed between
 * days and dotted within one, with an open chevron on the later end, plus a
 * label naming the run. Four of them, all the data supported. The owner
 * asked for the whole apparatus to go -- first the arrowheads, then the
 * lines: "这些不明所以的箭头都删了" ... "我说的箭头不只是箭头 还有线".
 *
 * He is right that they explained nothing where they were. A line between
 * two photographs on a map of photographs looks like a claim about
 * geography, and the claim it was actually making -- these places belong to
 * one run of days -- is a claim about TIME, which this sheet has no axis
 * for. Worse, the marks needed a legend to be read at all, and two of the
 * five legend keys existed only to explain them.
 *
 * The run rule itself is untouched and lives in `travelRuns()` in
 * timeline.ts. The two surfaces that DO have a time axis still use it: the
 * ten brackets on /timeline, and /days. That is where a trip is stated now.
 * If a drawn route is ever wanted again, this is the wrong file to start in
 * -- start from what the reader is being told, not from the pen.
 */

/* ---------------- map furniture: the north point and the scale ---------- */

/*
 * TODO B7. A drawn map carries three things this one did not: which way is
 * north, how far a finger's width is, and what the marks mean. The legend is
 * a footnote under the map (see `src/pages/places.astro` and the note on
 * `LEGEND_KEYS` below — it does not fit on the sheet). The other two do fit,
 * and they belong on the sheet, because both are claims *about the drawing*
 * and neither means anything away from it.
 *
 * Both maps get both. They are two different projections at two scales an
 * order of magnitude apart, and the whole point of the dive is that the
 * second is the first magnified — a magnification with no scale bar on
 * either end is exactly the thing a reader cannot check.
 *
 * Everything here is in the map's own viewBox units and is a pure function
 * of the data, so the same build draws the same furniture.
 */

/** Statute miles per degree of latitude. Good to 0.3% over the US. */
const MI_PER_DEG = 69.172;

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.7613;
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * The inverse of `projectUs`. The fit is affine and the conic is closed-form,
 * so this is exact rather than a search — which matters, because the scale
 * bar's length and the needle's tilt are both read off it.
 */
function unprojectUs(px: number, py: number): { lat: number; lng: number } | null {
  if (!usFit) return null;
  const p = rawSpaces.us.projection;
  const [par1, par2] = p.parallels as [number, number];
  const p1 = par1 * RAD;
  const p2 = par2 * RAD;
  const n = (Math.sin(p1) + Math.sin(p2)) / 2;
  const C = Math.cos(p1) ** 2 + 2 * n * Math.sin(p1);
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(p.origin.lat * RAD)) / n;

  /* undo the least-squares affine: px = a X + b Y + c, py = d X + e Y + f */
  const [a, b, c] = usFit.cx;
  const [d, e, f] = usFit.cy;
  const det = a * e - b * d;
  if (!det) return null;
  const u = px - c;
  const v = py - f;
  const X = (u * e - v * b) / det;
  const Y = (a * v - d * u) / det;

  /* undo Albers */
  const rho = Math.hypot(X, rho0 - Y);
  const theta = Math.atan2(X, rho0 - Y);
  const sinLat = (C - rho * rho * n * n) / (2 * n);
  if (Math.abs(sinLat) > 1) return null;
  return { lat: Math.asin(sinLat) / RAD, lng: p.origin.lng + theta / n / RAD };
}

/** Degrees clockwise from straight up that true north runs, at this spot. */
function northTiltUs(px: number, py: number): number {
  const here = unprojectUs(px, py);
  if (!here) return 0;
  const up = projectUs(here.lat + 0.5, here.lng);
  const ux = (up.x / 100) * SPACES.us.width - px;
  const uy = (up.y / 100) * SPACES.us.height - py;
  return Math.atan2(ux, -uy) / RAD;
}

/** The Triangle map is a plain lat/lng rect: north is up and scale is flat. */
const triangleMiPerUnit = (() => {
  const b = (rawSpaces.triangle.projection as any).bounds;
  const latMid = (b.latMin + b.latMax) / 2;
  const wideMi = (b.lngMax - b.lngMin) * MI_PER_DEG * Math.cos(latMid * RAD);
  return wideMi / SPACES.triangle.width;
})();

export interface CompassRose {
  /** the filled half of the needle — the one that points north */
  north: string;
  /** the open half, so the needle reads as a needle and not as a triangle */
  south: string;
  /** the needle's point; the N hangs above it, by a CSS gap not a map one */
  label: { x: number; y: number };
  /** degrees clockwise from vertical, and 0 is a result, not an assumption */
  tilt: number;
}

export interface ScaleBar {
  /** the bar's outline, and the filled first half inside it */
  frame: string;
  half: string;
  /** the three uprights: 0, the midpoint, the end */
  ticks: string;
  /** the two numbers, at the bar's own bottom edge; CSS adds the gap */
  labels: { x: number; y: number; text: string; anchor: 'start' | 'end' }[];
  /** how long the bar came out, in viewBox units, and what it measures */
  miles: number;
  length: number;
}

/*
 * Where the furniture goes, chosen by rasterising the artwork and looking
 * for rectangles with no ink in them (there are not many — the coastline
 * fills 70% of the sheet). The US map's is in the Gulf of Mexico, which is
 * where a paper atlas would put it too, and the Triangle's is the empty
 * farmland south-east of Raleigh.
 *
 * The compass's x on the US map is not arbitrary. Albers is a conic: its
 * meridians converge, so true north only points straight up on the central
 * meridian. 512 units is -96.1 degrees, which is the projection's own
 * origin, so the needle can be both honest and vertical. `northTiltUs`
 * computes the tilt anyway — move the rose and it stays true, it just stops
 * being upright.
 */
const FURNITURE = {
  us: {
    rose: { x: 512, y: 638, len: 40, tail: 28, half: 11 },
    bar: { x: 268, y: 648, h: 9, miles: 500, label: 'mi' },
  },
  triangle: {
    rose: { x: 908, y: 772, len: 40, tail: 28, half: 11 },
    bar: { x: 690, y: 772, h: 9, miles: 5, label: 'mi' },
  },
} as const;

/** How many viewBox units one mile is, measured east-west where the bar is. */
function milesToUnits(space: SpaceId, atX: number, atY: number, miles: number): number {
  if (space === 'triangle') return miles / triangleMiPerUnit;
  const here = unprojectUs(atX, atY);
  /* fixture mode, or a point off the projectable sheet: the nominal scale */
  if (!here) return miles * 0.334;
  /*
   * Equal-area conics are not conformal, so "how long is 500 miles" has a
   * different answer at 24 degrees north than at 45. The honest bar is the
   * one measured at its own latitude, which is what this does; the spread
   * across the whole sheet is 2.3%, i.e. under a pixel on this bar.
   */
  let lo = here.lng;
  let hi = here.lng + 30;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (haversineMi(here.lat, here.lng, here.lat, mid) < miles) lo = mid;
    else hi = mid;
  }
  const far = projectUs(here.lat, lo);
  return Math.abs((far.x / 100) * SPACES.us.width - atX);
}

/**
 * A north point, not a compass rose with thirty-two winds and not the
 * navigation compass in the corner of the window.
 *
 * Those two must never be mistaken for each other, so they are built out of
 * different parts: the site's navigation is four *icons* on a cross with no
 * needle and no letter, drawn in HTML, fixed to the viewport bottom-left.
 * This is one needle and one letter N, drawn in ink on the paper, inside
 * the map and scaling with it. There is no ring round it either — on this
 * map a pen ring already means "the Triangle is here", and a second one 200
 * units away would be a different word in the same handwriting.
 */
export function compassRose(space: SpaceId): CompassRose {
  const f = FURNITURE[space].rose;
  const tilt = space === 'us' ? northTiltUs(f.x, f.y) : 0;
  const a = tilt * RAD;
  /* local -> map, turned about the pivot so the needle points at true north */
  const at = (dx: number, dy: number): [number, number] => [
    f.x + dx * Math.cos(a) - dy * Math.sin(a),
    f.y + dx * Math.sin(a) + dy * Math.cos(a),
  ];

  const tip = at(0, -f.len);
  const tail = at(0, f.tail);
  const west = at(-f.half, 0);
  const east = at(f.half, 0);

  /*
   * A solid triangle pointing north over an open V pointing south: the
   * surveyor's north arrow, where the inked end *is* the answer. A needle
   * split left and right down its length is the one on a magnetic compass
   * and says nothing on its own about which end is which.
   *
   * The V is an open path, not a second triangle, for two reasons: two
   * closed shapes sharing a waist draw that waist twice and the two wobbles
   * do not agree, which at 4x is a sloppy white sliver rather than a hand;
   * and the arrow this is copied from does not have a line across its
   * middle. The V's two ends are `west` and `east` exactly, which are the
   * solid triangle's own base corners, so the join is seamless whatever the
   * wobble does in between.
   *
   * One seed per part — a hand does not draw the same line twice.
   */
  const north = inkPoly([tip, east, west], 61, { wobble: 0.5, per: 3, tension: 0.2 });
  const south = inkPoly([west, tail, east], 67, { wobble: 0.5, per: 3, tension: 0.2, closed: false });

  const label = at(0, -f.len);
  return {
    north: north.d,
    south: south.d,
    label: { x: label[0], y: label[1] },
    tilt: Math.round(tilt * 100) / 100,
  };
}

/**
 * The scale bar, drawn the way a drawn map draws one: a box with its first
 * half inked in, uprights at the two ends and the middle, and three numbers
 * under them.
 *
 * 500 miles on the US sheet is not a round-looking 167 units by accident —
 * it is 500 miles. The Triangle's is 5, which is about the distance from the
 * apartment to the botanical garden, and the two bars side by side in the
 * dive are the honest statement of what the zoom did.
 */
export function scaleBar(space: SpaceId): ScaleBar {
  const f = FURNITURE[space].bar;
  const len = milesToUnits(space, f.x, f.y, f.miles);
  const x0 = f.x;
  const x1 = f.x + len;
  const xm = f.x + len / 2;
  const y0 = f.y;
  const y1 = f.y + f.h;

  const frame = inkPoly(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    73,
    { wobble: 0.55, per: 4, tension: 0.3 },
  );
  /* the inked half is drawn as its own box rather than a clip: a pen fills
     one end of the bar in, it does not mask the other */
  const half = inkPoly(
    [
      [x0, y0],
      [xm, y0],
      [xm, y1],
      [x0, y1],
    ],
    79,
    { wobble: 0.55, per: 4, tension: 0.3 },
  );

  /* the uprights overshoot the box top and bottom, the way a ruled tick does */
  const tickAt = (x: number, seed: number) =>
    inkLine([x, y0 - 3.5], [x, y1 + 3.5], seed, { wobble: 0.35, steps: 3 }).d;
  const ticks = [tickAt(x0, 83), tickAt(xm, 89), tickAt(x1, 97)].join(' ');

  /*
   * Two numbers, not three. The labels are HTML at a fixed 11 px (see
   * MapStage), and this bar is drawn at 135 px on /places, 79 px on a place
   * page and 62 px on a phone; "0 / 250 / 500 mi" needs about 70 px of type
   * and collides on two of those three. The halfway mark is not lost — it is
   * the upright in the middle and the end of the inked half, which is what
   * a checkered scale bar says it with anyway.
   *
   * `y` is the bar's own bottom edge. The gap under it is 4 px of CSS, not
   * viewBox units, because the type does not shrink with the map.
   */
  return {
    frame: frame.d,
    half: half.d,
    ticks,
    labels: [
      { x: x0, y: y1, text: '0', anchor: 'start' },
      { x: x1, y: y1, text: `${f.miles} ${f.label}`, anchor: 'end' },
    ],
    miles: f.miles,
    length: Math.round(len * 100) / 100,
  };
}

/* ---------------- the legend, which does not fit on the sheet ----------- */

/*
 * TODO B7 asked for a legend on the map and the map said no.
 *
 * Measured before drawing anything: the US sheet is 1000 x 710 and 70% of it
 * is coastline; the four rectangles with no ink in them are the Gulf (350 x
 * 90 clear), the strip above the northern border (580 x 48), the corner
 * under Florida (200 x 85), and the water under Hawaiʻi. The Gulf is the
 * only one big enough for a key, and the compass and the scale bar are
 * already standing in it. Six entries at a legible size need roughly 260 x
 * 150 units, which is the Gulf entire, and the type inside them would come
 * out at 11 units — 8.9 px at 1440 and 4.1 px on a 390 px phone, i.e. not
 * type at all. The east coast, where eight photographs already overlap, has
 * nothing to spare.
 *
 * So the key is a footnote under the map, in HTML, at real point size, and
 * it is better there: it can carry six entries without crowding anything, it
 * is readable on a phone, it is selectable text, and a screen reader meets
 * it as a list rather than as decoration. The marks in it are drawn by this
 * module's own pen, so the footnote is in the map's handwriting even though
 * it is not on the map.
 *
 * `src/pages/places.astro` renders it. Each key's `d` strings are in a
 * 64 x 26 box of their own; the caller scales that box to the type.
 */

export interface LegendKey {
  id: string;
  /** what the mark is, one phrase */
  label: string;
  /** the paths, with the roles the caller needs to style them differently */
  ink: { d: string; role: 'stroke' | 'dash' | 'dot' | 'faint' | 'hair' }[];
  /** circles, for the keys that are discs rather than strokes */
  discs?: { cx: number; cy: number; r: number; role: 'photo' | 'spot' }[];
}

const KEY_W = 64;
const KEY_H = 26;

/*
 * The keys are drawn at a fifth of the map's size, so the feTurbulence
 * wobble the map puts over its own strokes is deliberately NOT applied
 * here: a displacement of 2 units on a 26-unit-tall mark is not a wobble,
 * it is a smear. What survives at this size is the jitter that is already
 * in the geometry — `inkPoly` and `inkLine` put it in the points — so these
 * are drawn by the same hand, just with the hand's own tremor rather than
 * the paper's.
 */
export const LEGEND_KEYS: LegendKey[] = (() => {
  const insetArrow = inkArrow(21, 14, 36, 16, 29);

  return [
    {
      id: 'pin',
      label: 'a bird photographed there — the bigger the disc, the more species',
      ink: [],
      discs: [
        { cx: 14, cy: 13, r: 6, role: 'photo' },
        { cx: 40, cy: 13, r: 11, role: 'photo' },
      ],
    },
    {
      id: 'dodge',
      label: 'the pin stepped aside to be clickable; the ring is the real spot',
      /* the same three marks MapStage draws for a dodged pin, at key size:
         a hairline leader from the true coordinate to where the disc ended
         up, and a small open ring on the coordinate itself */
      ink: [{ d: inkLine([12, 19], [38, 14], 113, { wobble: 0.7, steps: 4 }).d, role: 'hair' }],
      discs: [
        { cx: 9, cy: 20, r: 2.6, role: 'spot' },
        { cx: 47, cy: 12, r: 9, role: 'photo' },
      ],
    },
    {
      id: 'house',
      /* the pin's own house, moved not redrawn: MapPin.astro draws this same
         path in a 24-unit box, so the key and the mark cannot drift apart */
      label: '\u91d1\u7389\u516c\u5bd3 — the balcony the whole list started on',
      ink: [
        {
          d: 'M 23.4 12.2 L 32 5 L 40.6 12.2 M 25.6 11.4 V 20.4 H 38.4 V 11.4 M 30 20.4 V 15.4 H 34 V 20.4',
          role: 'stroke',
        },
      ],
    },
    {
      id: 'inset',
      label: 'marked with its own shape, and the arrow goes to the box it is drawn larger in',
      ink: [
        { d: inkTri(12, 13, 8.5, 23).d, role: 'stroke' },
        { d: insetArrow.shaft, role: 'stroke' },
        { d: insetArrow.head, role: 'stroke' },
        {
          d: inkPoly(
            [
              [41, 4],
              [61, 4],
              [61, 22],
              [41, 22],
            ],
            103,
            { wobble: 0.4, per: 3, tension: 0.3 },
          ).d,
          role: 'faint',
        },
      ],
    },
  ];
})();

export const LEGEND_BOX = { w: KEY_W, h: KEY_H };

/* ---------------- counts for the lede ---------------- */

export const travelPlaces = places.filter((p) => p.space === 'us');
export const homePlaces = localPlaces;

/** How many birds were recorded in more than one place (110 of the 238).
 *  Spotted only, like `birdsByLocation` above and like every other count. */
export const sharedBirdCount = birds.filter(
  (b) => b.spotted && (b.locationIds ?? []).length > 1,
).length;
