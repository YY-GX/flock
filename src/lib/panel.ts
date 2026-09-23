/**
 * Client half of the bird overlay. Shared by every view.
 *
 * A page needs two things for this to work:
 *   1. <BirdPanel birds={...} />  — the markup + the embedded JSON payload
 *   2. any element with data-bird="<bird.id>" — clicking it opens that bird
 *
 * Nothing else. Views that want to open a bird from their own code import
 * { openBird, closeBird } from '../lib/panel', or call window.birdPanel.
 *
 * Opening never navigates, and closing puts you back exactly where you were:
 * window scroll, every scrollable ancestor of the thing you clicked, and focus.
 *
 * Most birds have more than one photograph, so the plate is a small gallery:
 * arrows on hover, Left/Right, a swipe, and a `3 / 24` counter. The plates
 * live in one fixed frame and are matted like a framed print, so paging never
 * resizes the panel. Only the current plate and its two neighbours are
 * fetched. See src/lib/panelData.ts for how the plate list gets here.
 *
 * That gallery itself is src/lib/plateViewer.ts — the panel owns the dialog,
 * the payload and the keys, and hands the viewer its elements. /birds/<slug>
 * is a page rather than an overlay and runs the same viewer over its own
 * markup, which is why the two cannot drift apart.
 *
 * The last line of the field marks is the company the bird was found in —
 * the other birds first seen that same day. A life list records species; a
 * morning records who was out with what. Each name is a link to that bird,
 * and when this page's payload already holds it the overlay simply swaps, so
 * one bird leads to the birds beside it without ever leaving the page. The
 * names come from a second, much smaller payload keyed by date — see
 * `companionTable()` in src/lib/panelData.ts.
 *
 * Beside the magnifier there is a link to the photograph's original file in
 * R2 — bigger than anything the site builds, and so not something the viewer
 * can show. It is off unless PUBLIC_ORIGINALS_BASE is set; see the block at
 * the top of src/lib/panelData.ts.
 *
 * The viewer also zooms and pans, which is why Esc here unwinds in two steps:
 * the first press fits the photograph back into the mat, the second closes the
 * overlay. `+` / `=` / `-` step the magnification; everything else about zoom
 * lives in plateViewer.ts.
 */
import { createPlateViewer, type PlateViewer } from './plateViewer';
import { withBase } from './paths';

const PANEL_ID = 'panel';
const PAYLOAD_ID = 'bird-payload';
const DAY_PAYLOAD_ID = 'day-payload';
const CLOSE_MS = 280;

/** How many companions the "That day" line names before it starts counting. */
const NAMED_COMPANIONS = 3;

export type PanelImage = {
  src: string;
  w: number;
  h: number;
  /** The untouched file in R2, when there is one bigger than this plate. */
  orig?: { name: string; kb: number };
};

export interface PanelEntry {
  id: string;
  slug: string;
  name: string;
  english: string;
  gloss: string;
  genus: string;
  date: string;
  /** `YYYY-MM-DD` when the bird's day has a page, '' otherwise. */
  iso: string;
  type: string;
  tkey: string;
  desc: string;
  size: string;
  colors: string;
  behavior: string;
  conservation: string;
  places: string;
  img: PanelImage | null;
  /** Plates 2..n, front/back-coded. See src/lib/panelData.ts. */
  more?: string;
  /** One token per plate, naming its original. See src/lib/panelData.ts. */
  orig?: string;
}

/* ---------------- payload ---------------- */

let cachedFrom: Element | null = null;
let cached: Record<string, PanelEntry> = {};

function payload(): Record<string, PanelEntry> {
  const el = document.getElementById(PAYLOAD_ID);
  if (!el) return {};
  // The <script> node is replaced on every client-side navigation, so key the
  // cache on the node itself rather than re-parsing on every open.
  if (el !== cachedFrom) {
    cachedFrom = el;
    try {
      cached = JSON.parse(el.textContent || '{}') as Record<string, PanelEntry>;
    } catch {
      cached = {};
    }
  }
  return cached;
}

/** Everything the current page can show in the overlay. */
export function birdData(): Record<string, PanelEntry> {
  return payload();
}

/* ---------------- the day table ---------------- */

/*
 * A second, much smaller blob: iso -> "<how many birds that day>:<name>;…".
 * It is its own <script> rather than a key inside the bird payload so that
 * `birdData()` keeps the documented shape (Record<id, PanelEntry>) that four
 * views already read. See companionTable() in src/lib/panelData.ts.
 */
let dayFrom: Element | null = null;
let dayCached: Record<string, string> = {};

function dayTable(): Record<string, string> {
  const el = document.getElementById(DAY_PAYLOAD_ID);
  if (!el) return {};
  if (el !== dayFrom) {
    dayFrom = el;
    try {
      dayCached = JSON.parse(el.textContent || '{}') as Record<string, string>;
    } catch {
      dayCached = {};
    }
  }
  return dayCached;
}

/*
 * slug -> bird.id, for the birds this page happens to hold. A companion in
 * the payload becomes a trigger that swaps the overlay; one that is not stays
 * an ordinary link to its own page. Built once per payload node, from the
 * same cache key the payload uses.
 */
let slugFrom: Element | null = null;
let slugIndex: Record<string, string> = {};

function idBySlug(slug: string): string {
  const data = payload();
  if (cachedFrom !== slugFrom) {
    slugFrom = cachedFrom;
    slugIndex = {};
    for (const id in data) slugIndex[data[id].slug] = id;
  }
  return slugIndex[slug] || '';
}

export interface Companion {
  name: string;
  slug: string;
}

/** The build's slug rule, so a name alone can reach /birds/<slug>. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Who else was first seen on this bird's day, and how many in all.
 *
 * Undoes the wire format from src/lib/panelData.ts: a `<count>:` head, then
 * up to four `<name>` or `<name>|<slug>` records. The open bird is dropped
 * from the list, so `others` is the company and `total - 1` is how much of
 * it there was. Anything malformed comes back empty — a bird with no line is
 * a much better failure than an overlay that will not open.
 */
export function companionsOf(bird: PanelEntry): { others: Companion[]; total: number } {
  const none = { others: [] as Companion[], total: 0 };
  if (!bird.iso) return none;

  const raw = dayTable()[bird.iso];
  if (!raw) return none;

  const cut = raw.indexOf(':');
  const total = cut < 0 ? 0 : Number(raw.slice(0, cut));
  if (!Number.isFinite(total) || total < 1) return none;

  const others: Companion[] = [];
  for (const token of raw.slice(cut + 1).split(';')) {
    if (!token) continue;
    const bar = token.indexOf('|');
    const name = bar < 0 ? token : token.slice(0, bar);
    const slug = bar < 0 ? slugify(name) : token.slice(bar + 1);
    if (slug !== bird.slug) others.push({ name, slug });
  }

  return { others, total };
}

/**
 * Undo `encodeMore()` from src/lib/panelData.ts. One plate is
 * `<2-digit prefix fold><the rest of the src>,<h>[,<w>]`, folded against the
 * previous plate's src — the first against `first`.
 *
 * Anything malformed stops the list rather than throwing; a bird showing one
 * photograph is a much better failure than a panel that will not open.
 */
export function decodeMore(more: string, first: PanelImage): PanelImage[] {
  const out: PanelImage[] = [];
  if (!more) return out;

  let prev = first.src;
  for (const token of more.split(';')) {
    if (token.length < 4) break;
    const p = parseInt(token.slice(0, 2), 36);
    const comma = token.indexOf(',', 2);
    if (!Number.isFinite(p) || p > prev.length || comma < 0) break;

    const src = prev.slice(0, p) + token.slice(2, comma);
    const nums = token.slice(comma + 1).split(',');
    const h = Number(nums[0]);
    const w = nums.length > 1 ? Number(nums[1]) : first.w;
    if (!h || !w) break;

    out.push({ src, w, h });
    prev = src;
  }
  return out;
}

/**
 * Undo `encodeOrig()` from src/lib/panelData.ts, hanging each plate's
 * original off the plate itself. One token per plate, in plate order, folded
 * against that plate's own built file name:
 * `<2-digit prefix fold><the rest of the name>,<size in KiB, base 36>`.
 *
 * Mutates, because the list it is given was built one line earlier and the
 * viewer wants one array. A plate with no token, a short list, or a token
 * that does not parse simply ends up with no original — which is exactly what
 * every plate looked like before this existed, and what all of them look like
 * while PUBLIC_ORIGINALS_BASE is unset.
 */
export function attachOriginals(plates: PanelImage[], orig: string): void {
  if (!orig) return;

  const tokens = orig.split(';');
  for (let i = 0; i < tokens.length && i < plates.length; i++) {
    const token = tokens[i];
    if (token.length < 4) continue;

    const fold = parseInt(token.slice(0, 2), 36);
    const comma = token.indexOf(',', 2);
    if (!Number.isFinite(fold) || comma < 0) continue;

    const src = plates[i].src;
    const against = src.slice(src.lastIndexOf('/') + 1);
    if (fold > against.length) continue;

    const kb = parseInt(token.slice(comma + 1), 36);
    if (!kb) continue;

    plates[i].orig = { name: against.slice(0, fold) + token.slice(2, comma), kb };
  }
}

/* ---------------- state ---------------- */

interface Restore {
  x: number;
  y: number;
  scrollers: { el: Element; left: number; top: number }[];
  focus: Element | null;
}

let restore: Restore | null = null;
let closeTimer = 0;
let openId: string | null = null;

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function panelEl(): HTMLElement | null {
  return document.getElementById(PANEL_ID);
}

function sheetOf(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>('.panel__sheet');
}

/** Is the overlay currently up? */
export function isPanelOpen(): boolean {
  const p = panelEl();
  return !!p && !p.hidden;
}

/** Which bird is showing, or null. */
export function currentBird(): string | null {
  return isPanelOpen() ? openId : null;
}

/** How many photographs the open bird has. 0 when nothing is open. */
export function plateCount(): number {
  return isPanelOpen() ? (view()?.count() ?? 0) : 0;
}

/** Which photograph is showing, 0-based. */
export function plateIndex(): number {
  return isPanelOpen() ? (view()?.index() ?? 0) : 0;
}

/* ---------------- the plate gallery ---------------- */

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/*
 * The gallery is src/lib/plateViewer.ts. All the panel does is point it at
 * this document's elements — and they are replaced wholesale on every
 * client-side navigation, so the instance is cached against the frame node and
 * rebuilt when that node changes.
 */
let viewer: PlateViewer | null = null;
let viewerFor: Element | null = null;

function view(): PlateViewer | null {
  const frame = byId('panel-plate');
  const front = byId<HTMLImageElement>('panel-img');
  const back = byId<HTMLImageElement>('panel-img-b');
  if (!frame || !front || !back) {
    viewer = null;
    viewerFor = null;
    return null;
  }
  if (frame !== viewerFor) {
    viewerFor = frame;
    viewer = createPlateViewer({
      frame,
      front,
      back,
      stage: byId('panel-zoom'),
      empty: byId('panel-noimg'),
      prev: byId('panel-prev'),
      next: byId('panel-next'),
      count: byId('panel-count'),
      zoom: byId('panel-zoom-btn'),
      original: byId<HTMLAnchorElement>('panel-orig'),
      live: byId('panel-live'),
    });
  }
  return viewer;
}

/** Page by `d` plates, wrapping. No-op unless the bird has more than one. */
export function stepPlate(d: number): void {
  if (!isPanelOpen()) return;
  view()?.step(d);
}

/** Jump straight to a plate, 0-based. */
export function goToPlate(i: number): void {
  if (!isPanelOpen()) return;
  view()?.goTo(i);
}

/** Is the photograph currently enlarged past the mat's fit? */
export function isPlateZoomed(): boolean {
  return isPanelOpen() ? (view()?.zoomed() ?? false) : false;
}

/** Fit -> full size, or full size -> fit. No-op on a plate already at 1:1. */
export function togglePlateZoom(): void {
  if (!isPanelOpen()) return;
  view()?.toggleZoom();
}

/* ---------------- fill ---------------- */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fact(label: string, value: string, style = ''): string {
  if (!value) return '';
  const dd = style
    ? `<dd style="${escapeHtml(style)}"><span class="swatch"></span>${escapeHtml(value)}</dd>`
    : `<dd>${escapeHtml(value)}</dd>`;
  return `<dt>${label}</dt>${dd}`;
}

/**
 * "That day" — the last row of the field marks, and the only one that is
 * about the morning rather than the species.
 *
 * Every companion is an `<a href="/birds/<slug>">`, and one the page's own
 * payload holds also carries `data-companion`, which swaps the overlay in
 * place instead of navigating (see onClick). So a name is always a door:
 * with the payload it is the next bird in the same overlay, without it the
 * bird's own page, and with no JavaScript at all still a working link.
 *
 * 19 of the 238 spotted birds were the only new bird of their day. Those get
 * the line too — this record says "43 photographs not taken" and "14 days
 * that cannot be placed" out loud, and a morning that found one bird is the
 * same kind of fact. Saying nothing would make a solo day look like a bug.
 */
function companionRow(bird: PanelEntry): string {
  const { others, total } = companionsOf(bird);
  if (!total) return '';

  if (total < 2) {
    return '<dt>That day</dt><dd class="panel__alone">the only new bird</dd>';
  }

  const link = (c: Companion): string => {
    const id = idBySlug(c.slug);
    const trigger = id ? ` data-companion="${escapeHtml(id)}"` : '';
    const href = withBase(`/birds/${encodeURIComponent(c.slug)}`);
    return `<a class="with" href="${href}"${trigger}>${escapeHtml(c.name)}</a>`;
  };

  const shown = others.slice(0, NAMED_COMPANIONS);
  const rest = total - 1 - shown.length;

  let text: string;
  if (rest > 0) {
    /* On the day's own page the rest are already behind the overlay, so the
       count stays a count. Linking a page to itself is a dead end. */
    /* A URL from the start, not a route that gets prefixed later: both uses
       want the real path. `location.pathname` carries the deployment's base,
       so comparing it against a bare `/days/<iso>` matched nothing under
       /flock/ and the day's own page linked to itself. */
    const day = withBase(`/days/${encodeURIComponent(bird.iso)}`);
    const here = location.pathname.replace(/\/$/, '') === day.replace(/\/$/, '');
    const label = `${rest} more bird${rest === 1 ? '' : 's'} on ${bird.date}`;
    const tail = here
      ? `${rest} more`
      : `<a class="with" href="${day}" aria-label="${escapeHtml(label)}">${rest} more</a>`;
    text = `${shown.map(link).join(', ')} and ${tail}`;
  } else if (shown.length === 1) {
    text = link(shown[0]);
  } else {
    text = `${shown.slice(0, -1).map(link).join(', ')} and ${link(shown[shown.length - 1])}`;
  }

  return `<dt>That day</dt><dd class="panel__with">${text}</dd>`;
}

function fill(bird: PanelEntry): void {
  const pDate = byId('panel-date');
  const pName = byId('panel-name');
  const pGloss = byId('panel-gloss');
  const pGenus = byId('panel-genus');
  const pDesc = byId('panel-desc');
  const pFacts = byId('panel-facts');

  if (pDate) {
    pDate.textContent = bird.date;
    // #panel-date is an <a>, but only a link when there is a day to go to.
    // No href means no underline, no tab stop and no /days/undefined — the
    // 43 birds with no date keep the plain line they have always had.
    if (bird.iso) pDate.setAttribute('href', withBase(`/days/${bird.iso}`));
    else pDate.removeAttribute('href');
  }
  if (pName) pName.textContent = bird.english || bird.name;
  if (pGloss) pGloss.textContent = bird.gloss;
  if (pGenus) pGenus.textContent = bird.genus;
  if (pDesc) pDesc.textContent = bird.desc;

  if (pFacts) {
    pFacts.innerHTML = [
      fact('Group', bird.type, `--dot: var(--t-${bird.tkey})`),
      fact('Length', bird.size),
      fact('Colours', bird.colors),
      fact('Behaviour', bird.behavior),
      fact('Status', bird.conservation),
      fact('Seen at', bird.places),
      companionRow(bird),
    ].join('');
  }

  const plates = bird.img ? [bird.img, ...decodeMore(bird.more ?? '', bird.img)] : [];
  attachOriginals(plates, bird.orig ?? '');
  view()?.set(plates, bird.english || bird.name);
}

/* ---------------- scroll capture ---------------- */

function capture(from: Element | null): Restore {
  const scrollers: Restore['scrollers'] = [];
  let node: Element | null = from;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1) {
      scrollers.push({ el: node, left: node.scrollLeft, top: node.scrollTop });
    }
    node = node.parentElement;
  }
  return {
    x: window.scrollX,
    y: window.scrollY,
    scrollers,
    focus: document.activeElement,
  };
}

function restoreScroll(r: Restore): void {
  for (const s of r.scrollers) {
    s.el.scrollLeft = s.left;
    s.el.scrollTop = s.top;
  }
  window.scrollTo({ top: r.y, left: r.x, behavior: 'auto' });
  const back = r.focus;
  if (back instanceof HTMLElement || back instanceof SVGElement) {
    (back as HTMLElement).focus?.({ preventScroll: true });
  }
}

/* ---------------- open / close ---------------- */

/**
 * Show a bird. `id` is bird.id as it appears in birds.json (also the value of
 * data-bird). `from` is the element that triggered it, used to remember the
 * scroll position to come back to — pass the clicked element when you have it.
 *
 * Returns false when the page's payload does not contain that bird.
 */
export function openBird(id: string, from?: Element | null): boolean {
  const panel = panelEl();
  if (!panel) return false;

  const bird = payload()[id];
  if (!bird) return false;

  fill(bird);

  // Keep the first restore point if the panel is already up (bird -> bird).
  if (panel.hidden) restore = capture(from ?? document.activeElement);
  openId = id;

  window.clearTimeout(closeTimer);
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.dataset.bird = id;
  document.documentElement.style.overflow = 'hidden';

  requestAnimationFrame(() => panel.classList.add('is-open'));
  sheetOf(panel)?.focus({ preventScroll: true });

  document.dispatchEvent(new CustomEvent('bird:open', { detail: { id } }));
  return true;
}

/** Hide the overlay and put the page back the way it was. */
export function closeBird(): void {
  const panel = panelEl();
  if (!panel || panel.hidden) return;

  panel.classList.remove('is-open');
  document.documentElement.style.overflow = '';

  if (restore) restoreScroll(restore);
  restore = null;
  const was = openId;
  openId = null;

  const finish = () => {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    delete panel.dataset.bird;
    view()?.clear(); // drops both layers and abandons any decode in flight
  };

  if (reduced()) finish();
  else closeTimer = window.setTimeout(finish, CLOSE_MS);

  document.dispatchEvent(new CustomEvent('bird:close', { detail: { id: was } }));
}

/* ---------------- wiring (registered once per document) ---------------- */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function triggerFor(target: EventTarget | null): HTMLElement | SVGElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-bird]');
  // The panel root also carries data-bird while open; that is not a trigger.
  if (!el || el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) return null;
  return el as HTMLElement | SVGElement;
}

function onClick(e: MouseEvent): void {
  // let modified clicks through, in case a trigger is also a link
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const panel = panelEl();
  if (panel && !panel.hidden) {
    const t = e.target as HTMLElement | null;
    const nav = t?.closest<HTMLElement>('[data-plate-step]');
    if (nav) {
      e.preventDefault();
      stepPlate(Number(nav.dataset.plateStep) || 0);
      return;
    }
    // A companion whose bird this page does not hold falls through to here:
    // it is an ordinary <a> and <ClientRouter /> takes it to that bird's own
    // page. (One this page *does* hold never gets here — onCompanionClick
    // below swallows it in the capture phase.)
    if (t?.closest('[data-companion]')) return;
    if (t?.closest('[data-close]') || t?.closest('#panel-close')) {
      e.preventDefault();
      closeBird();
    }
    return;
  }

  const trigger = triggerFor(e.target);
  const id = trigger?.getAttribute('data-bird');
  if (!id) return;
  // only swallow the click if we actually have this bird to show
  if (openBird(id, trigger)) e.preventDefault();
}

/**
 * A companion name in the "That day" line.
 *
 * Each one is a real `<a href="/birds/<slug>">`, so it works with no script,
 * with a middle click, and for a bird this page's payload never had. But when
 * the payload *does* have the bird there is no reason to leave: the overlay
 * swaps in place and one bird leads to the birds beside it.
 *
 * ## Why this is a capture-phase listener of its own
 *
 * `<ClientRouter />` also listens for link clicks on `document`, and it is
 * installed from `<head>` — before this module, which arrives with the panel.
 * A bubble-phase `preventDefault()` therefore lands *after* the router has
 * already decided to navigate, and clicking a companion took you to the
 * bird's page instead of swapping (it did; that is why this exists). Capture
 * runs outside-in and so beats every bubble listener whatever the order they
 * were added in. `stopPropagation()` then keeps onClick from seeing it twice.
 */
function onCompanionClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const panel = panelEl();
  if (!panel || panel.hidden) return;

  const target = e.target;
  if (!(target instanceof Element)) return;
  const el = target.closest<HTMLElement>('[data-companion]');
  const cid = el?.dataset.companion;
  // No id, or a payload that no longer holds it: let the <a> be an <a>.
  if (!cid || !openBird(cid)) return;

  e.preventDefault();
  e.stopPropagation();
}

function onKeydown(e: KeyboardEvent): void {
  const panel = panelEl();
  const open = !!panel && !panel.hidden;

  if (open && e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation(); // the compass must not also treat this as "go back"
    // Esc unwinds one layer at a time: out of the photograph first, out of
    // the overlay second. Closing both on one press loses your place twice.
    if (!view()?.resetZoom()) closeBird();
    return;
  }

  // Zoom the photograph. `=` is `+` without the shift, and `_` is `-` with it.
  if (open && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const v = view();
    if (!v?.canZoom()) return;
    e.preventDefault();
    e.stopPropagation();
    v.zoomBy(e.key === '-' || e.key === '_' ? 1 / 1.6 : 1.6);
    return;
  }

  // Paging the plates. Only when there is something to page to, so a
  // one-photograph bird leaves the arrow keys to the browser.
  if (open && plateCount() > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    stepPlate(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }

  if (open && e.key === 'Tab' && panel) {
    const sheet = sheetOf(panel);
    if (!sheet) return;
    // [hidden] arrows are in the DOM but cannot take focus; trapping onto one
    // would drop focus out of the dialog entirely.
    const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (f) => !f.hidden && f.offsetParent !== null,
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
    return;
  }

  if (open) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;

  const trigger = triggerFor(e.target);
  const id = trigger?.getAttribute('data-bird');
  if (!id) return;
  // a real <a>/<button> already fires click on Enter; let it, don't double-open
  if (e.key === 'Enter' && trigger instanceof HTMLElement && trigger.matches('a[href], button')) return;
  if (openBird(id, trigger)) e.preventDefault();
}

let wired = false;

/** Idempotent. Called on load and after every client-side navigation. */
export function initPanel(): void {
  if (!wired) {
    // capture, and before onClick: it has to beat <ClientRouter />
    document.addEventListener('click', onCompanionClick, true);
    document.addEventListener('click', onClick);
    // capture phase so Esc reaches us before a view's own handler
    document.addEventListener('keydown', onKeydown, true);
    wired = true;
  }
  // a fresh document means a fresh payload node and a closed panel
  restore = null;
  openId = null;
  // the frame node itself is new, so the viewer is rebuilt against it
  viewer?.clear();
  viewer = null;
  viewerFor = null;
  window.clearTimeout(closeTimer);
  document.documentElement.style.overflow = '';
}

if (typeof document !== 'undefined') {
  initPanel();
  document.addEventListener('astro:page-load', initPanel);
  document.addEventListener('astro:before-swap', () => {
    // leaving the page with the overlay up must not leave the body locked
    document.documentElement.style.overflow = '';
  });

  (window as unknown as Record<string, unknown>).birdPanel = {
    openBird,
    closeBird,
    isPanelOpen,
    currentBird,
    birdData,
    stepPlate,
    goToPlate,
    plateCount,
    plateIndex,
    isPlateZoomed,
    togglePlateZoom,
  };
}
