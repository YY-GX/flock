/**
 * The hand that draws this site, in plain JavaScript.
 *
 * `src/assets/map/_build-map.py` draws the coastline with a 32-bit LCG and
 * Catmull-Rom smoothing; `inkRing()` in `src/lib/mapView.ts` is a TypeScript
 * port of the same two functions so the map's markers match the map. This is
 * the third copy, and it exists for one reason: the build-time scripts in
 * `scripts/` run in bare Node, and `src/lib/mapView.ts` imports `./data`,
 * which is built on `import.meta.glob` and only resolves inside Vite.
 *
 * Keep the three in step. Same LCG constants, same tension, same tilt — an
 * icon drawn by a different hand than the maps is the whole problem.
 */

/** The LCG from _build-map.py. Deterministic, seeded, and not very random. */
export function rng(seed) {
  let s = seed & 0xffffffff;
  return () => {
    s = (1103515245 * s + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Catmull-Rom through the points -> cubic bezier path data. */
export function catmull(pts, closed = true, tension = 1) {
  const n = pts.length;
  if (n < 3) return 'M ' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ');
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const d = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d.push(
      `C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ` +
        `${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`,
    );
  }
  if (closed) d.push('Z');
  return d.join(' ');
}

/**
 * One loop of a pen round a spot: slightly oval, slightly wobbly, and it
 * overshoots where it started instead of closing cleanly.
 *
 * `turn` is how far round the pen goes. The map circles a place at 1.75 —
 * emphatic, two passes that never coincide. An icon 16 pixels across cannot
 * hold two passes, so callers there ask for a little over one.
 */
export function inkLoop(cx, cy, r, { seed = 23, turn = 1.75, wobble = 0.05, squash = 0.9, tilt = -0.22 } = {}) {
  const rnd = rng(seed);
  const n = 26;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turn * Math.PI * 2 - 0.9;
    const rr = r * (1 + (rnd() * 2 - 1) * wobble) * (1 - 0.05 * t);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * squash;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return catmull(pts, false, 0.95);
}

/**
 * A blob drawn freehand: a closed loop with the radius breathing around `r`.
 * The ink dot at the middle of the mark is one of these rather than a
 * `<circle>`, because a perfect circle inside a wobbly ring looks like a
 * mistake.
 */
export function inkBlob(cx, cy, r, { seed = 11, wobble = 0.08, squash = 0.94, tilt = -0.22 } = {}) {
  const rnd = rng(seed);
  const n = 11;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rnd() * 2 - 1) * wobble);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * squash;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return catmull(pts, true, 1);
}

/* ------------------------------------------------------------------ the mark
 *
 * The site's own mark, in one place, because three files draw it: the
 * favicon (scripts/make-icons.mjs), the raster fallbacks beside it, and the
 * corner of every social card (scripts/og-cards.mjs). It used to be copied
 * into two of them and they had already drifted by half a unit.
 *
 * A pen gone round a spot and overshot its own start, with the spot in
 * ochre — the gesture the map makes when it rings the Triangle, and the
 * colour the first bird type is drawn in.
 *
 * Two numbers are load-bearing and were arrived at by looking at the thing
 * at 16 pixels:
 *
 *   turn 1.30   The pen has to visibly cross where it began, or the ring
 *               closes cleanly and stops looking drawn. 1.13 (the first
 *               draft) doubles back inside its own stroke width and the
 *               overshoot is invisible at every size.
 *   the offset  A round spot in the middle of a ring is an egg — a fried
 *               one, at this palette. Pushed up and right by ~2 units it
 *               reads as something circled on a page instead, which is what
 *               a life list does to a bird. Small enough to stay a spot,
 *               big enough to survive being three pixels.
 */
export const MARK_BOX = 32;
export const MARK_STROKE = 2.3;

/** `{ ring, spot }` — two path strings in a 32-unit box. */
export function siteMark() {
  return {
    ring: inkLoop(16, 16, 12.2, { seed: 23, turn: 1.3, wobble: 0.05 }),
    spot: inkBlob(16 + 1.9, 16 - 1.7, 2.9, { seed: 11 }),
  };
}
