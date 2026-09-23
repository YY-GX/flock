/**
 * Everything the GROUPS view needs that is not DOM: how the nine groups are
 * built from the flock, and the cheap circle-packing that arranges them.
 *
 * Two halves, both pure:
 *
 *   1. data      buildGroups / representatives / tag counts
 *   2. geometry  radiiFor / seedNodes / relaxStep / settle / clusterDiscs
 *
 * The geometry half runs twice: once at build time (so the page is packed
 * before a single byte of JavaScript arrives) and again in the browser, where
 * the same relaxStep is called from requestAnimationFrame so the bubbles are
 * seen shoving each other into place. Same code, same result — only the box
 * differs, because only the browser knows how wide the stage really is.
 *
 * Deliberately imports nothing but ./flock and a type: this module is in the
 * client bundle, and pulling in ./data would drag birds.json along with it.
 */

import type { Bird } from './types';
import { TYPE_ORDER, canonicalType, typeKey, typeLabel, typeVar } from './flock';

/* ================================================================== *
 *  1. data
 * ================================================================== */

export interface GroupTag {
  /** As stored in Notion, e.g. "Hawks & Eagles". */
  tag: string;
  /** URL/attribute-safe, e.g. "hawks-eagles". */
  slug: string;
  count: number;
}

export interface Group {
  /** Canonical Notion string, e.g. "Perching Birds". Never compare by hand. */
  type: string;
  /** Short form for a heading or a bubble, e.g. "Perching". */
  label: string;
  /** Route segment: /groups/<slug>. */
  slug: string;
  /** "1".."9" or "other" — the index behind var(--t-N). */
  key: string;
  /** "var(--t-1)" — drop into a fill, a background or --t. */
  colour: string;
  /** Every spotted bird in the group, name order. */
  birds: Bird[];
  /** The subset that actually has a photograph: bubbles are built from these. */
  withPhoto: Bird[];
  /** birds.length — the honest count, photographed or not. */
  count: number;
  /** Tags present in this group, biggest first. */
  tags: GroupTag[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const byName = (a: Bird, b: Bird) => a.name.localeCompare(b.name);

/**
 * The nine groups, biggest first, built from whichever birds you hand in.
 * Pass the spotted birds and a "does this bird have a usable photograph"
 * predicate — the module never touches the photo tables itself.
 */
export function buildGroups(birds: Bird[], hasPhoto: (b: Bird) => boolean): Group[] {
  const buckets = new Map<string, Bird[]>();

  for (const bird of birds) {
    const type = canonicalType(bird.type);
    if (!type) continue; // no type in Notion: it cannot join a group
    const list = buckets.get(type);
    if (list) list.push(bird);
    else buckets.set(type, [bird]);
  }

  const groups: Group[] = [];

  for (const type of TYPE_ORDER) {
    const list = buckets.get(type);
    if (!list || !list.length) continue;
    list.sort(byName);

    const counts = new Map<string, number>();
    for (const bird of list) {
      for (const tag of bird.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }

    const label = typeLabel(type);
    groups.push({
      type,
      label,
      slug: slugify(label),
      key: typeKey(type),
      colour: typeVar(type),
      birds: list,
      withPhoto: list.filter(hasPhoto),
      count: list.length,
      tags: [...counts]
        .map(([tag, count]) => ({ tag, slug: slugify(tag), count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    });
  }

  return groups;
}

/**
 * How many photographs a bubble of this many birds is built from.
 *
 * Proportional to the count, not to its square root, because a bubble's
 * *area* is proportional to the count: keeping photographs-per-area constant
 * means one photograph is about the same size in every bubble, from the
 * enormous perching clump down to the three specialists. Capped at 30 so the
 * biggest bubble is ~98 pictures of DOM, not 109 — the whole group is one
 * click away.
 */
const BUBBLE_MAX = 30;
const BUBBLE_MIN = 3;

export function bubbleSize(available: number, count: number): number {
  const wanted = Math.round((count * BUBBLE_MAX) / 109);
  return Math.max(1, Math.min(available, Math.min(BUBBLE_MAX, Math.max(BUBBLE_MIN, wanted))));
}

/**
 * `k` birds that show what the group is made of: round-robin across its tags,
 * biggest tag first, so a Perching bubble is not thirty warblers. Only birds
 * with a photograph are eligible — a bubble is built from pictures.
 */
export function representatives(group: Group, k: number): Bird[] {
  if (k >= group.withPhoto.length) return group.withPhoto.slice();

  const lanes = new Map<string, Bird[]>();
  for (const bird of group.withPhoto) {
    const tag = bird.tags?.[0] ?? '';
    const lane = lanes.get(tag);
    if (lane) lane.push(bird);
    else lanes.set(tag, [bird]);
  }

  const order = [...lanes.values()].sort((a, b) => b.length - a.length);
  const out: Bird[] = [];
  for (let i = 0; out.length < k; i++) {
    let drew = false;
    for (const lane of order) {
      if (i >= lane.length) continue;
      out.push(lane[i]);
      drew = true;
      if (out.length === k) break;
    }
    if (!drew) break; // every lane exhausted
  }
  return out;
}

/** The view-transition name for a whole bubble. Never build it by hand. */
export function groupTransitionName(group: Group | string): string {
  return `group-${typeof group === 'string' ? group : group.slug}`;
}

/* ================================================================== *
 *  2. geometry
 * ================================================================== */

export interface PackNode {
  /** Radius in px, proportional to sqrt(count): area tells the truth. */
  r: number;
  /** Breathing room outside r, so labels and floats never collide. */
  pad: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/* Tuned against the real nine: 109 / 59 / 28 / 13 / 9 / 6 / 6 / 5 / 3.
   The three the pack's scale depends on are exported, because /groups has
   to size the bubbles once before the first paint — from an inline script,
   which cannot import this module — and two different answers on one load
   is a layout shift. See the note over that script. */
export const FILL_WIDE = 0.4; // share of the stage the circles cover, landscape
export const FILL_TALL = 0.46; // a phone can afford to be fuller
export const CAP = 0.44; // no bubble wider than this share of the short edge
const GRAV = 1.35; // pull toward the middle, px per frame^2 at full alpha
const DAMP = 0.8;
const SEP = 0.62; // share of an overlap resolved per step
const MARGIN = 3;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Radii for the nine counts inside a w x h box.
 *
 * r ∝ sqrt(count), so *area* ∝ count and the size contrast stays honest:
 * Perching really is thirty-six times Specialists, and nothing here
 * normalises that away. The only freedom taken is the shared scale factor,
 * chosen so the circles cover a fixed share of whatever box they are in.
 */
export function radiiFor(counts: number[], w: number, h: number): { r: number; pad: number }[] {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...counts, 1);
  const fill = w < h ? FILL_TALL : FILL_WIDE;

  // sum(pi * r_i^2) = fill * w * h, with r_i = R * sqrt(n_i / max)
  const R = Math.min(Math.sqrt((fill * w * h * max) / (Math.PI * total)), CAP * Math.min(w, h));

  return counts.map((n) => {
    const r = R * Math.sqrt(n / max);
    // the small ones carry their label underneath, and a short label is
    // still wider than a small bubble, so they ask for a lot more room
    return { r, pad: R * (r < R * 0.42 ? 0.21 : 0.05) };
  });
}

/**
 * A rectangle in the stage's own coordinates that nothing may sit on.
 * There is exactly one on this page: the corner the fixed compass reaches
 * into (--compass-safe in global.css).
 */
export interface KeepOut {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Push any bubble that has drifted onto `box` back off it and kill the
 * velocity that took it there, so it rests against the edge instead of
 * buzzing on it. The box is always the stage's own bottom-left corner, so a
 * bubble that ends up wholly inside it leaves upwards or to the right —
 * never left or down, which would be off the stage.
 *
 * Called after every step, so it holds for the settle, the idle and the
 * static reduced-motion frame alike. Cheap: nine circles, one rectangle.
 */
export function avoid(nodes: PackNode[], box: KeepOut | null): void {
  if (!box || box.x1 <= box.x0 || box.y1 <= box.y0) return;

  for (const n of nodes) {
    // nearest point of the rectangle to this centre
    const cx = Math.max(box.x0, Math.min(box.x1, n.x));
    const cy = Math.max(box.y0, Math.min(box.y1, n.y));
    const inside = cx === n.x && cy === n.y;

    if (!inside) {
      const dx = n.x - cx;
      const dy = n.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= n.r || d < 1e-6) continue;
      n.x = cx + (dx / d) * n.r;
      n.y = cy + (dy / d) * n.r;
    } else if (box.x1 - n.x < n.y - box.y0) {
      n.x = box.x1 + n.r; // out to the right
    } else {
      n.y = box.y0 - n.r; // out over the top
    }
    n.vx = 0;
    n.vy = 0;
  }
}

/** Deterministic sub-pixel jitter, so symmetric seeds still break apart. */
const wobble = (i: number) => ((Math.sin((i + 1) * 12.9898) * 43758.5453) % 1) * 2 - 1;

/** A phyllotaxis seed: biggest first at the middle, the rest spiralling out. */
export function seedNodes(sizes: { r: number; pad: number }[], w: number, h: number): PackNode[] {
  const n = sizes.length || 1;
  return sizes.map((s, i) => {
    const rho = Math.sqrt((i + 0.35) / n);
    const a = i * GOLDEN;
    return {
      r: s.r,
      pad: s.pad,
      x: w / 2 + Math.cos(a) * rho * w * 0.33 + wobble(i) * 2,
      y: h / 2 + Math.sin(a) * rho * h * 0.33 + wobble(i + 99) * 2,
      vx: 0,
      vy: 0,
    };
  });
}

/**
 * One step of the whole simulation. Three forces, no library:
 *
 *   gravity    toward the middle, divided by w and h separately, which is
 *              what makes the cluster take the shape of its box — a wide
 *              stage spreads sideways, a phone stacks into a column;
 *   collision  any two overlapping circles are pushed apart along their
 *              centre line, the heavier (bigger) one moving less;
 *   walls      a hard clamp, velocity killed on contact.
 *
 * `alpha` fades from 1 to 0 across a settle, so it comes to rest instead of
 * churning forever. Returns the largest distance anything moved, which is
 * how the caller knows it is done.
 */
export function relaxStep(nodes: PackNode[], w: number, h: number, alpha = 1): number {
  const cx = w / 2;
  const cy = h / 2;

  for (const n of nodes) {
    n.vx += ((cx - n.x) / w) * GRAV * alpha;
    n.vy += ((cy - n.y) / h) * GRAV * alpha;
  }

  collide(nodes);
  return integrate(nodes, w, h, DAMP);
}

/**
 * Push every overlapping pair apart along its centre line, weighted by area
 * so the big bubble barely notices and the small one does the moving.
 */
function collide(nodes: PackNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const min = a.r + a.pad + b.r + b.pad;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) {
        // exactly coincident: split them along a fixed, arbitrary axis
        dx = Math.cos(i * GOLDEN);
        dy = Math.sin(i * GOLDEN);
        d = 1;
      }
      const push = ((min - d) * SEP) / d;
      const wa = (b.r * b.r) / (a.r * a.r + b.r * b.r);
      a.x -= dx * push * wa;
      a.y -= dy * push * wa;
      b.x += dx * push * (1 - wa);
      b.y += dy * push * (1 - wa);
    }
  }
}

/** Move, damp, and bounce off the walls. Returns the largest distance moved. */
function integrate(nodes: PackNode[], w: number, h: number, damp: number): number {
  let moved = 0;
  for (const n of nodes) {
    const px = n.x;
    const py = n.y;
    n.x += n.vx;
    n.y += n.vy;
    n.vx *= damp;
    n.vy *= damp;

    const lo = n.r + MARGIN;
    if (n.x < lo) (n.x = lo), (n.vx = 0);
    if (n.x > w - lo) (n.x = w - lo), (n.vx = 0);
    if (n.y < lo) (n.y = lo), (n.vy = 0);
    if (n.y > h - lo) (n.y = h - lo), (n.vy = 0);

    moved = Math.max(moved, Math.abs(n.x - px) + Math.abs(n.y - py));
  }
  return moved;
}

/** Run the simulation to a standstill. Used at build time and on resize. */
export function settle(nodes: PackNode[], w: number, h: number, steps = 500): PackNode[] {
  let alpha = 1;
  for (let i = 0; i < steps; i++) {
    const moved = relaxStep(nodes, w, h, alpha);
    alpha *= 0.99;
    if (i > 80 && moved < 0.02) break;
  }
  return nodes;
}

/** Seed and settle in one call. */
export function packGroups(counts: number[], w: number, h: number): PackNode[] {
  return settle(seedNodes(radiiFor(counts, w, h), w, h), w, h);
}

/* ---------------- staying alive ---------------- */

export interface XY {
  x: number;
  y: number;
}

/* A settled bubble is tethered to where it settled; it breathes around that
 * point rather than wandering off, so the arrangement never degenerates. */
const IDLE_SPRING = 0.0045; // ~3s period, damping ratio ~0.5: no visible bounce
const IDLE_DAMP = 0.93;
const IDLE_DRIFT = 0.022; // px per step^2; / IDLE_SPRING = the wander in px
const IDLE_REF_R = 58; // a mid-size bubble: bigger ones drift less than this

/**
 * One frame of the idle. The bubbles are already packed; this is the part
 * that makes them look alive without ever making them look busy.
 *
 *   drift      two slow sines per bubble, one per axis, at periods between
 *              about 7 and 14 seconds, amplitude inversely proportional to
 *              radius — the little bubbles bob, the big one barely stirs;
 *   tether     a spring back to `homes[i]`, the settled position, which is
 *              what bounds the wander (amplitude ≈ drift / IDLE_SPRING,
 *              i.e. 2px for perching, 12px for specialists);
 *   collision  the same pass the settle uses, so a bubble that drifts into
 *              its neighbour shoves it, and the shove propagates.
 *
 * `t` is a timestamp in ms, so the phases do not depend on the frame rate.
 * Total cost at nine nodes: 36 distance checks. Call it at 30fps and forget
 * about it.
 */
export function idleStep(nodes: PackNode[], homes: XY[], w: number, h: number, t: number): void {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const home = homes[i] ?? n;
    const amp = IDLE_DRIFT * Math.min(2.4, Math.max(0.45, IDLE_REF_R / n.r));
    const wx = 0.00052 + (i % 4) * 0.00011;
    const wy = 0.00041 + (i % 3) * 0.00013;
    n.vx += Math.cos(t * wx + i * 2.399) * amp - (n.x - home.x) * IDLE_SPRING;
    n.vy += Math.sin(t * wy + i * 1.117) * amp - (n.y - home.y) * IDLE_SPRING;
  }
  collide(nodes);
  integrate(nodes, w, h, IDLE_DAMP);
}

/* ---------------- inside a bubble ---------------- */

export interface Disc {
  /** Centre, as a percentage of the bubble's own diameter. */
  x: number;
  y: number;
  /** Diameter, same units. */
  d: number;
}

/**
 * Where the photographs sit inside a bubble: a sunflower spiral, which packs
 * a disc evenly at any count and never looks like a grid. Coverage is held
 * near 0.9, so the little pictures jostle and overlap slightly and the bubble
 * reads as one organic clump rather than a circle full of dots.
 *
 * Percentages, so one set of numbers works at every bubble size.
 */
export function clusterDiscs(k: number): Disc[] {
  if (k <= 0) return [];
  if (k === 1) return [{ x: 50, y: 50, d: 100 }];

  const d = Math.min(0.94 / Math.sqrt(k), 0.6); // disc diameter, as a share of the bubble's
  const reach = 1 - d; // keep every disc inside the bubble
  const out: Disc[] = [];
  for (let i = 0; i < k; i++) {
    const rho = reach * Math.sqrt((i + 0.5) / k);
    const a = i * GOLDEN;
    out.push({
      x: 50 + Math.cos(a) * rho * 50,
      y: 50 + Math.sin(a) * rho * 50,
      d: d * 100,
    });
  }
  return out;
}
