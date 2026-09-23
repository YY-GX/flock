/**
 * The hand that draws this site, in one place.
 *
 * `src/assets/map/_build-map.py` draws the coastline with a 32-bit LCG and
 * Catmull-Rom smoothing; this module is the TypeScript port of those two
 * functions, and everything on the site that wants to look drawn — the pen
 * ring round the Triangle, the arrow into its inset box, the pencil trip
 * routes, the compass rose, the scale bar, the timeline's season boundaries
 * — comes through here. `scripts/ink.mjs` is the same hand again in plain
 * JavaScript, because the build-time scripts run in bare Node and cannot
 * import anything that Vite resolves.
 *
 * It used to live inside `mapView.ts`, which was fine while the only drawn
 * things were on the map. The timeline needs the same pen now, and
 * `mapView.ts` imports `timeline.ts`, so the pen had to come out rather than
 * become a fourth copy.
 *
 * Two rules:
 *
 *   1. **Deterministic.** Every stroke is a pure function of its arguments.
 *      No clock, no Math.random, no build order. A line that reshuffles on
 *      every build is a diff nightmare and a view-transition bug.
 *   2. **Erasable TypeScript only.** `timeline.ts` is imported by bare Node
 *      (`scripts/og-cards.mjs`) through Node's type stripping, so this file
 *      must not use anything that needs a real transform: no enums, no
 *      namespaces, no parameter properties, no decorators.
 */

/** The LCG from `_build-map.py`. Deterministic, seeded, and not very random. */
export function rng(seed: number) {
  let s = seed & 0xffffffff;
  return () => {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * A pen stroke: the path data and, just as important, how long it is.
 *
 * The length is what lets a stroke draw itself with stroke-dasharray /
 * stroke-dashoffset. SVG's own `pathLength` attribute would do the same job
 * in one line, but Safari ignores it on a dashed stroke, so the length is
 * measured here at build time instead: each cubic is sampled and its chords
 * summed, which is within a fraction of a percent at 24 samples.
 */
export interface InkStroke {
  d: string;
  length: number;
}

const CUBIC_SAMPLES = 24;

function cubicLength(
  p0: [number, number],
  c1: number[],
  c2: number[],
  p1: [number, number],
): number {
  let len = 0;
  let px = p0[0];
  let py = p0[1];
  for (let i = 1; i <= CUBIC_SAMPLES; i++) {
    const t = i / CUBIC_SAMPLES;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1];
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

/** Catmull-Rom through the points -> cubic bezier path data, and its length. */
export function catmull(pts: [number, number][], closed = true, tension = 1): InkStroke {
  const n = pts.length;
  if (n < 3) {
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return {
      d: 'M ' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L '),
      length: len,
    };
  }
  const P = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const d = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
  const last = closed ? n : n - 1;
  let length = 0;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d.push(
      `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ` +
        `${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`,
    );
    length += cubicLength(p1, c1, c2, p2);
  }
  if (closed) d.push('Z');
  return { d: d.join(' '), length: Math.round(length * 100) / 100 };
}

/**
 * One loop of a pen round a spot: slightly oval, slightly wobbly, and it
 * overshoots where it started instead of closing cleanly. Deterministic.
 *
 * `turn` is how far round the pen goes. 1.75 — almost twice — is an
 * emphatic circling rather than a note to self, and the two passes never
 * coincide because the radius carries 5% noise.
 */
export function inkLoop(cx: number, cy: number, r: number, seed = 23, turn = 1.75): InkStroke {
  const rnd = rng(seed);
  const n = 26;
  const tilt = -0.22; /* radians; nobody draws a circle square to the page */
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turn * Math.PI * 2 - 0.9;
    const rr = r * (1 + (rnd() * 2 - 1) * 0.05) * (1 - 0.05 * t);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.9;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return catmull(pts, false, 0.95);
}

/** The loop as plain path data, for callers that do not animate it. */
export function inkRing(cx: number, cy: number, r: number, seed = 23, turn = 1.75): string {
  return inkLoop(cx, cy, r, seed, turn).d;
}

/**
 * The same circling gesture, but round a triangle — the mark for the one
 * place on this map that is called The Triangle.
 *
 * Raleigh, Durham and Chapel Hill are a triangle on the ground and the
 * region is named for it, so a ring round them was the one mark on these
 * sheets that said less than the thing it pointed at. The owner asked for
 * the shape, in both places it is drawn.
 *
 * It is `inkLoop`'s hand, not `inkPoly`'s: `inkPoly` draws a shape that was
 * always going to be that shape (the compass needle, the scale box), and
 * closes exactly. This is a pen going round something on a map — the corners
 * carry the same 5% radius noise the loop has, the edges bow, and the stroke
 * runs `over` past the corner it started from rather than meeting it, which
 * is what stops it reading as printed. Overshoot rather than `turn`: three
 * corners twice round is a scribble, not emphasis.
 *
 * Apex up, and `tilt` matches `inkLoop`'s -0.22 so the ring and the triangle
 * lean the same way for the same reason — nobody draws a shape square to the
 * page. The three corners are NOT the three cities: the pins for all
 * eighteen local places collapse to one anchor at country scale (see
 * flockView's PLACE_UV), so a triangle claiming to be the real geometry
 * would be a claim the drawing cannot keep. It is a monogram.
 */
export function inkTri(cx: number, cy: number, r: number, seed = 23, over = 0.22): InkStroke {
  const rnd = rng(seed);
  const tilt = -0.22;
  const per = 5; /* points along each edge, so the sides bow like the loop's */
  /* apex up, then clockwise; y is down, hence -90 deg first */
  const corner = (k: number): [number, number] => {
    const a = -Math.PI / 2 + (k % 3) * ((Math.PI * 2) / 3);
    const rr = r * (1 + (rnd() * 2 - 1) * 0.05);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.9; /* the loop's squash, kept */
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
  };
  /* four corners, not three: the fourth is the first one again, drawn a
     second time with its own noise, so the stroke arrives a hair off where
     it set out — the loop's overshoot, in a shape that has corners */
  const c = [corner(0), corner(1), corner(2), corner(0)];
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = c[i];
    const b = c[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const w = k === 0 ? 0 : (rnd() * 2 - 1) * r * 0.035;
      pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]);
    }
  }
  pts.push(c[3]);
  /* and on, a fifth of an edge past the start, the way a hand carries through */
  const d0 = c[1][0] - c[3][0];
  const d1 = c[1][1] - c[3][1];
  pts.push([c[3][0] + d0 * over, c[3][1] + d1 * over]);
  return catmull(pts, false, 0.6);
}

/** The triangle as plain path data, for callers that do not animate it. */
export function inkTriPath(cx: number, cy: number, r: number, seed = 23): string {
  return inkTri(cx, cy, r, seed).d;
}

/**
 * A pen leader with a slight bow and an open two-stroke head at the end —
 * the "enlarged over here" arrow of a paper map, drawn by the same hand as
 * the coastline. The head sits at (x2, y2) and points the way the shaft
 * travels; nothing is dashed.
 */
export function inkArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed = 29,
): { shaft: string; head: string; length: number } {
  const rnd = rng(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  /* the normal that points south-west when the arrow runs south-east */
  const nx = -dy / len;
  const ny = dx / len;
  /*
   * The bow and the head are proportions, not constants, so a short leader
   * never turns into a fish-hook with a head a third of its own length.
   * On the 71-unit home arrow both clamps bind and the spec's numbers win.
   */
  const bowMax = Math.min(6, len * 0.14);
  const headLen = Math.min(10, len * 0.28);
  const jitter = Math.min(1.6, len * 0.05);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const bow = Math.sin(Math.PI * t) * bowMax;
    const jx = i === 0 || i === 4 ? 0 : (rnd() * 2 - 1) * jitter;
    const jy = i === 0 || i === 4 ? 0 : (rnd() * 2 - 1) * jitter;
    pts.push([x1 + dx * t + nx * bow + jx, y1 + dy * t + ny * bow + jy]);
  }
  const shaft = catmull(pts, false, 0.95);

  /* the head is aimed along the last bit of the shaft, not the chord */
  const tail = pts[3];
  const a = Math.atan2(y2 - tail[1], x2 - tail[0]);
  const wing = (sign: number) => {
    const w = a + sign * 30 * (Math.PI / 180);
    return `M ${(x2 - Math.cos(w) * headLen).toFixed(2)} ${(y2 - Math.sin(w) * headLen).toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  return { shaft: shaft.d, head: `${wing(1)} ${wing(-1)}`, length: shaft.length };
}

/**
 * A shape somebody drew round a straight edge rather than against a ruler.
 *
 * Give it the corners. Each edge is walked in `per` steps, every interior
 * step is pushed off the edge by up to `wobble`, and the whole thing goes
 * through `catmull` at a low tension — low enough that the corners stay
 * corners (a compass needle with rounded points is a leaf) while the edges
 * between them breathe.
 *
 * This is the generator for every drawn shape that is not a loop or an
 * arrow: the compass needle's two lobes, the scale bar's box, the ticks,
 * the keys in the map's legend.
 */
export function inkPoly(
  corners: [number, number][],
  seed = 41,
  { wobble = 0.9, per = 3, tension = 0.34, closed = true } = {},
): InkStroke {
  const rnd = rng(seed);
  const n = corners.length;
  const pts: [number, number][] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    /* the normal to this edge; the jitter rides it, so a wobble never
       shortens or lengthens the edge, it only bends it */
    const nx = -dy / len;
    const ny = dx / len;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      /* corners are exact, the points between them are not */
      const w = k === 0 ? 0 : (rnd() * 2 - 1) * wobble;
      pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]);
    }
  }
  if (!closed) pts.push(corners[n - 1]);
  return catmull(pts, closed, tension);
}

/**
 * A line drawn down a page freehand: straight in intent, never in fact.
 *
 * `from` and `to` are the two ends. The pen drifts off the chord by up to
 * `wobble` on the way, in `steps` slow swings rather than a tremor.
 *
 * `pinEnds` decides whether the two ends are exact. True for a line that has
 * to meet something (an arrow, a tick); false for one that runs off the edge
 * of the sheet, where a pinned end reads as a pinch. The point *list* is
 * returned as well as the path, because a caller that is filling the shape
 * on both sides of the line — the timeline's season bands — needs the same
 * points back to walk the other way.
 */
export function inkLine(
  from: [number, number],
  to: [number, number],
  seed = 53,
  { wobble = 3, steps = 8, tension = 0.9, pinEnds = true } = {},
): InkStroke & { pts: [number, number][] } {
  const rnd = rng(seed);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const free = !pinEnds || (i !== 0 && i !== steps);
    const w = free ? (rnd() * 2 - 1) * wobble : 0;
    pts.push([from[0] + dx * t + nx * w, from[1] + dy * t + ny * w]);
  }
  return { ...catmull(pts, false, tension), pts };
}
