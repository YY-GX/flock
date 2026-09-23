/**
 * Shared vocabulary for the five views. Pure, no DOM, safe on both sides.
 *
 * The site is one flock of 238 birds that re-forms when you change view, so
 * the two things every view must agree on live here: what a bird's type
 * colour is called, and what a bird's view-transition name is.
 */

import type { Bird } from './types';
/* `.ts` on purpose: scripts/og-cards.mjs imports this file from bare Node,
   which resolves the specifier literally and cannot guess the extension.
   Same reason timeline.ts writes `./ink.ts` (src/lib/README.md). */
import { stripBase } from './paths.ts';

/* ---------------- routes ---------------- */

export type ViewId = 'home' | 'map' | 'timeline' | 'groups' | 'list';

export interface ViewDef {
  id: ViewId;
  /**
   * Path the compass links to, as a **site-root route** — keep these exact,
   * siblings build them. The site is served from `/flock/` on GitHub Pages,
   * so this is not a URL: put it through `withBase()` from `./paths` before
   * it reaches an `href` or `navigate()`. `Compass.astro` does both.
   */
  href: string;
  /** Label read by screen readers and shown in the compass tooltip. */
  label: string;
  /** Keyboard shortcut, or null for home (reachable via the compass hub). */
  key: string | null;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'home', href: '/', label: 'Flock', key: null },
  { id: 'map', href: '/places', label: 'Where', key: 'M' },
  { id: 'timeline', href: '/timeline', label: 'When', key: 'T' },
  { id: 'groups', href: '/groups', label: 'Groups', key: 'G' },
  { id: 'list', href: '/list', label: 'Life list', key: 'L' },
] as const;

/**
 * Which view a pathname belongs to, for marking the compass.
 *
 * Takes a **real** pathname — `Astro.url.pathname` or `location.pathname` —
 * which carries the deployment's base in front of the route (`/flock/places`,
 * not `/places`). `stripBase` takes it back off, so the table below goes on
 * being written in site-root routes however the site is mounted. Without that
 * step every page would match nothing and the compass would mark no view at
 * all, which is the quietest possible failure.
 */
export function viewOf(pathname: string): ViewId | null {
  const p = stripBase(pathname).replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  if (p === '/places' || p.startsWith('/places/')) return 'map';
  if (p === '/timeline') return 'timeline';
  // Days is a sub-route of When, not a sixth point of the compass: /days and
  // /days/<iso> are the same chronology the timeline draws, read as a ledger
  // instead of a chart (DESIGN2 §1.4). See src/lib/README.md §1.
  if (p === '/days' || p.startsWith('/days/')) return 'timeline';
  if (p === '/groups' || p.startsWith('/groups/')) return 'groups';
  if (p === '/list') return 'list';
  return null; // /birds/* and anything else: nothing marked
}

/* ---------------- type colours ---------------- */

/**
 * Exactly the strings Notion stores in `Type`, biggest group first. Note the
 * first two: the data says "Perching Birds" and "Water Birds", not the
 * shorthand CLAUDE.md uses. Getting this wrong silently paints 168 of the 238
 * birds grey, so always go through typeKey / typeVar instead of comparing
 * strings yourself.
 */
export const TYPE_ORDER = [
  'Perching Birds',        // 109
  'Water Birds',           //  59
  'Wading & Shorebirds',   //  28
  'Raptors',               //  13
  'Tree-Climbers',         //   9
  'Landfowls',             //   6
  'Doves & Pigeons',       //   6
  'Swifts & Hummingbirds', //   5
  'Specialists',           //   3
] as const;

/** Shorthand people write that should still resolve to a real group. */
const TYPE_ALIASES: Record<string, string> = {
  perching: 'Perching Birds',
  water: 'Water Birds',
  wading: 'Wading & Shorebirds',
  shorebirds: 'Wading & Shorebirds',
  'tree-climbers': 'Tree-Climbers',
  'doves & pigeons': 'Doves & Pigeons',
  'swifts & hummingbirds': 'Swifts & Hummingbirds',
};

/** Normalise any spelling to the canonical TYPE_ORDER string, or ''. */
export function canonicalType(type: string | null | undefined): string {
  const raw = (type ?? '').trim();
  if (!raw) return '';
  if ((TYPE_ORDER as readonly string[]).includes(raw)) return raw;
  return TYPE_ALIASES[raw.toLowerCase()] ?? '';
}

/** "Raptors" -> "4"; anything unknown -> "other". */
export function typeKey(type: string | null | undefined): string {
  const i = (TYPE_ORDER as readonly string[]).indexOf(canonicalType(type));
  return i === -1 ? 'other' : String(i + 1);
}

/** "Perching Birds" -> "Perching". Short enough for a legend or a bubble. */
export function typeLabel(type: string | null | undefined): string {
  return canonicalType(type).replace(/ Birds$/, '');
}

/** "Raptors" -> "var(--t-4)". Drop straight into fill / background / --dot. */
export function typeVar(type: string | null | undefined): string {
  return `var(--t-${typeKey(type)})`;
}

/* ---------------- view transitions ---------------- */

/**
 * The name that makes a bird the same bird across two routes.
 *
 * Rules (all five views must obey, or the morph silently degrades to a fade):
 *   - exactly ONE element per document may carry a given name;
 *   - it is keyed on the slug, which is unique and already a CSS ident;
 *   - put it on an HTML box (SVG shapes do not animate in most browsers).
 */
export function birdTransitionName(bird: Bird | string): string {
  const slug = typeof bird === 'string' ? bird : bird.slug;
  return `bird-${slug}`;
}

/** Ready-made style attribute: style={birdTransitionStyle(bird)}. */
export function birdTransitionStyle(bird: Bird | string): string {
  return `view-transition-name:${birdTransitionName(bird)}`;
}

/** Same idea for a place pin on the map. */
export function placeTransitionName(slug: string): string {
  return `place-${slug}`;
}

/* ---------------- small shared formatting ---------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-08" -> "8 Aug 2026". UTC, so no timezone drift. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y) return '';
  return `${d ?? 1} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/**
 * Names in Notion carry a Chinese gloss: "Brown Creeper (美洲旋木雀)".
 * Split it so a view can set the English in serif and the gloss small.
 */
export function splitName(name: string): { english: string; gloss: string } {
  const m = name.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  return m ? { english: m[1].trim(), gloss: m[2].trim() } : { english: name.trim(), gloss: '' };
}
