/**
 * Enlarging a map, and what the room is spent on.
 *
 * The owner asked for two things in one sentence — "可以放大地图? 放大之后可以
 * 看那一部分更多的鸟?" — and they are two different jobs. Getting closer is the
 * easy half and is deliberately the same gesture set as the photo viewer
 * (`src/lib/plateViewer.ts`): wheel and trackpad pinch anchored at the
 * pointer, drag to pan, a double click for a step, a clamp that never lets an
 * edge pull inside the frame, and a reset on navigation. A reader who has
 * enlarged a photograph on this site already knows how to enlarge the map,
 * and there is no second idiom to learn.
 *
 * The other half is the point. **The pins do not grow with the sheet.** A pin
 * scales as `z ** 0.35` while the artwork scales as `z` (the exponent, and
 * why it is that number, are documented over `PIN_ZOOM_EXP` in mapView.ts),
 * so the air between two photographs — measured in photographs — grows, and
 * the north-east stops being one blob. The room that opens up is then spent:
 * each pin fans out the deck of birds it already carries, one satellite at a
 * time, as the geometry lets it. `fanPlan()` in mapView.ts solved which
 * directions and at which zoom; this file only reads the answer.
 *
 * ## Three rules that are not negotiable
 *
 * * **Nothing extra loads at rest.** The deck is `display: none` until it is
 *   asked for, which is why a map nobody touches fetches none of its 154
 *   cards (TODO A3's "静止零加载"). Enlarging the map *is* asking, so a fanned
 *   satellite loading its photograph is right; a resting page loading one is
 *   not, and `FAN_FLOOR` is above 1 so it cannot happen.
 * * **Zoom is a state, not an animation.** Under `prefers-reduced-motion` the
 *   transform is applied with no transition at all — no easing on a step, no
 *   drift after a wheel.
 * * **A pointer that cannot hover does not get this.** See `usable()`.
 */

import { MAP_ZOOM_MAX, PIN_ZOOM_EXP, FAN_MIN_PX, FAN_SIZE_PCT, pinScaleAt } from './mapView';

/** Below this a pointerup is a click on whatever is under it, not a drag. */
const DRAG_SLOP = 5;
/** What one double click is worth. Two of them cross most of the range. */
const STEP = 2;
/** Let the artwork over-cover by this much, so no hairline of page shows. */
const EDGE_SLACK = 0.5;

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Whether this pointer gets to enlarge the map at all.
 *
 * **It is off on touch, and that is the considered answer rather than a gap.**
 * A pinch on a 240 px-tall map inside a page that scrolls is the classic
 * trap: `touch-action` is fixed for the life of a gesture, so the only way to
 * own a two-finger pinch is to cancel the browser's own scroll on the touch
 * that starts it, and the moment a one-finger drag pans instead of scrolling,
 * a reader who has zoomed in has no way to get past the map. That is a worse
 * page than the one we have.
 *
 * And the phone already has a better answer to the question zoom is asking.
 * `/places` prints all 37 places as a 48 px-row text index directly under the
 * map (TODO C3) precisely because 37 photographs cannot be thumb-sized on a
 * 338 px sheet; that list is the "equivalent control on the same page" WCAG
 * 2.5.8 asks for, it is already there, and it does not need a gesture. The
 * fan could not help either: at a 287 px sheet the smallest pin is 10.6 px,
 * so its satellite would need z = 50 to reach `FAN_MIN_PX`.
 *
 * Re-evaluated on resize, so dragging a window between a touch screen and an
 * external monitor does the right thing.
 */
function usable(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export interface MapZoom {
  /** Current scale. 1 is the sheet drawn to fit, and the floor. */
  scale(): number;
  /** Multiply the scale by `f`, about the map's centre. */
  by(f: number): void;
  /** Back to 1x. Returns true if it had been enlarged. */
  reset(animate?: boolean): boolean;
  /** Pan so this element is inside the frame. Used when focus lands off-screen. */
  reveal(el: HTMLElement): void;
  /** Stop listening. */
  destroy(): void;
}

export function createMapZoom(map: HTMLElement): MapZoom | null {
  const found = map.querySelector<HTMLElement>('.map__zoom');
  if (!found) return null;
  const wrap: HTMLElement = found;

  let k = 1;
  let tx = 0;
  let ty = 0;

  const readout = map.querySelector<HTMLElement>('[data-map-zoom-reset]');
  const live = map.querySelector<HTMLElement>('[data-map-zoom-live]');

  /* ---------------- the transform ---------------- */

  const box = () => map.getBoundingClientRect();

  /** The artwork must always cover the sheet's own box. */
  function clampPan(): void {
    const r = box();
    const mx = Math.max(0, (r.width * k - r.width) / 2 - EDGE_SLACK);
    const my = Math.max(0, (r.height * k - r.height) / 2 - EDGE_SLACK);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }

  function apply(animate: boolean): void {
    wrap.style.transitionDuration = animate && !reduced() ? '' : '0s';
    wrap.style.transform = k > 1 ? `translate(${tx}px, ${ty}px) scale(${k})` : '';
    /*
     * `--mz` is the sheet's scale and `--pin-k` is the pin's counter-scale
     * against it. Everything drawn on the map reads one or the other; nothing
     * anywhere recomputes the exponent.
     */
    map.style.setProperty('--mz', String(k));
    map.style.setProperty('--pin-k', String(pinScaleAt(k)));
    map.toggleAttribute('data-zoomed', k > 1);
    fan();
    if (readout) {
      readout.hidden = k <= 1;
      const label = readout.querySelector('[data-map-zoom-label]') ?? readout;
      label.textContent = `${k.toFixed(1)}×`;
    }
    if (live) live.textContent = k > 1 ? `Map enlarged ${k.toFixed(1)} times` : '';
  }

  /** Go to scale `nk` holding whatever is under `at` (viewport px) still. */
  function zoomTo(nk: number, at: { x: number; y: number } | null, animate: boolean): void {
    nk = Math.min(MAP_ZOOM_MAX, Math.max(1, nk));
    const r = box();
    const px = at ? at.x - (r.left + r.width / 2) : 0;
    const py = at ? at.y - (r.top + r.height / 2) : 0;
    // the map point under the pointer is (p - t) / k; hold it there
    tx = px - (nk / k) * (px - tx);
    ty = py - (nk / k) * (py - ty);
    k = nk;
    if (k <= 1) {
      k = 1;
      tx = 0;
      ty = 0;
    }
    clampPan();
    apply(animate);
  }

  function reset(animate = true): boolean {
    if (k <= 1) return false;
    k = 1;
    tx = 0;
    ty = 0;
    apply(animate);
    return true;
  }

  /* ---------------- the fan ---------------- */

  /*
   * How many of a pin's deck birds are standing on the paper right now.
   *
   * Two gates, and a pin shows the smaller answer. `data-fan` is the
   * per-place schedule `fanPlan()` measured against every neighbour, every
   * other fan and the Triangle marker — it is geometry, in percentages of the
   * sheet, and holds at any size the sheet is drawn at. The second gate is
   * the one that cannot be known at build time: a satellite has to actually
   * be a photograph on this screen, so it waits until it reaches
   * `FAN_MIN_PX`. That is why the 476 px map on a place page asks for more
   * zoom than the 811 px one on `/places`, from the same data.
   */
  let lastN = new WeakMap<HTMLElement, number>();

  function fan(): void {
    const w = box().width;
    if (!w) return;
    for (const pin of map.querySelectorAll<HTMLElement>('.map-pin[data-fan]')) {
      const at = pin.dataset.fan!.split(' ').filter(Boolean).map(Number);
      /* the pin's own width as a share of the sheet, from the same custom
         property that lays it out — never re-derived from a measured rect,
         which is the transformed one */
      const dp = parseFloat(getComputedStyle(pin).getPropertyValue('--dp')) || 0;
      const satPx = (dp / 100) * w * FAN_SIZE_PCT * Math.pow(k, PIN_ZOOM_EXP);
      let n = satPx >= FAN_MIN_PX ? at.filter((z) => z <= k + 1e-9).length : 0;
      if (lastN.get(pin) === n) continue;
      lastN.set(pin, n);
      pin.classList.toggle('is-fanned', n > 0);
      const cards = pin.querySelectorAll<HTMLElement>('.map-pin__card');
      cards.forEach((c, i) => c.classList.toggle('is-out', i < n));
    }
  }

  /* ---------------- bringing a focused pin into view ---------------- */

  /*
   * Tab order is the drawing order and takes no notice of the pan, so a
   * keyboard reader can focus a pin that is currently off the sheet. Pan the
   * least that puts it back — never re-centre, which would throw away where
   * the reader was.
   */
  function reveal(el: HTMLElement): void {
    if (k <= 1) return;
    const r = box();
    const e = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    let dy = 0;
    if (e.left < r.left + pad) dx = r.left + pad - e.left;
    else if (e.right > r.right - pad) dx = r.right - pad - e.right;
    if (e.top < r.top + pad) dy = r.top + pad - e.top;
    else if (e.bottom > r.bottom - pad) dy = r.bottom - pad - e.bottom;
    if (!dx && !dy) return;
    tx += dx;
    ty += dy;
    clampPan();
    apply(true);
  }

  /* ---------------- pointers ---------------- */

  const pts = new Map<number, { x: number; y: number }>();
  let mode: '' | 'pan' | 'pinch' = '';
  let startX = 0;
  let startY = 0;
  let panX = 0;
  let panY = 0;
  let moved = false;
  let pinchD = 0;
  let pinchM = { x: 0, y: 0 };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const two = () => {
    const it = pts.values();
    const p1 = it.next().value;
    const p2 = it.next().value;
    return p1 && p2 ? ([p1, p2] as const) : null;
  };

  /* The reset pill is a button; it must behave like one. */
  const CHROME = '[data-map-zoom-reset]';

  const onDown = (e: PointerEvent) => {
    if (!usable()) return;
    if ((e.target as Element | null)?.closest(CHROME)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* a pointerup can go missing; anything left here between gestures is a
       ghost, and one ghost turns every later press into half a pinch */
    if (!mode) pts.clear();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const pair = two();
      if (!pair) return;
      mode = 'pinch';
      moved = true;
      pinchD = dist(pair[0], pair[1]);
      pinchM = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      return;
    }
    if (k <= 1) return; // nothing to pan; leave the pins their clicks
    startX = e.clientX;
    startY = e.clientY;
    panX = tx;
    panY = ty;
    moved = false;
    mode = 'pan';
    try {
      map.setPointerCapture(e.pointerId);
    } catch {
      /* already gone; the up handler still cleans up */
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (mode === 'pinch') {
      const pair = two();
      if (!pair || pinchD <= 0) return;
      const d = dist(pair[0], pair[1]);
      const m = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      tx += m.x - pinchM.x;
      ty += m.y - pinchM.y;
      pinchM = m;
      const f = d / pinchD;
      pinchD = d;
      zoomTo(k * f, m, false);
      e.preventDefault();
      return;
    }

    if (mode === 'pan') {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > DRAG_SLOP) moved = true;
      if (!moved) return;
      map.setAttribute('data-panning', '');
      tx = panX + dx;
      ty = panY + dy;
      clampPan();
      apply(false);
      e.preventDefault();
    }
  };

  const endPointer = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    try {
      map.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (mode === 'pinch') {
      if (pts.size === 1) {
        const p = pts.values().next().value!;
        startX = p.x;
        startY = p.y;
        panX = tx;
        panY = ty;
        moved = true;
        mode = 'pan';
      } else {
        mode = '';
      }
      return;
    }
    const dragged = mode === 'pan' && moved;
    mode = '';
    map.removeAttribute('data-panning');
    /*
     * A pin is a link. A drag that started on one must not also follow it, so
     * the click that is about to be dispatched is swallowed — once, in the
     * capture phase, before Astro's router sees it.
     */
    if (dragged) {
      const eat = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      map.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => map.removeEventListener('click', eat, { capture: true }), 0);
    }
  };

  /*
   * Wheel. A trackpad pinch arrives as ctrl/⌘ + wheel and always zooms; a
   * plain wheel only zooms once you are already in, so a map you were merely
   * scrolling past never eats the page's scroll. Straight out of the photo
   * viewer, for the same reason.
   */
  const onWheel = (e: WheelEvent) => {
    if (!usable()) return;
    const pinch = e.ctrlKey || e.metaKey;
    if (!pinch && k <= 1) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomTo(k * Math.exp(-e.deltaY * unit * (pinch ? 0.01 : 0.003)), { x: e.clientX, y: e.clientY }, false);
  };

  const onDbl = (e: MouseEvent) => {
    if (!usable()) return;
    if ((e.target as Element | null)?.closest(CHROME)) return;
    e.preventDefault();
    const out = e.shiftKey || e.altKey;
    zoomTo(out ? k / STEP : k * STEP, { x: e.clientX, y: e.clientY }, true);
  };

  const onFocus = (e: FocusEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('.map-pin, .map-home');
    if (el && map.contains(el)) reveal(el);
  };

  const onResize = () => {
    if (!map.isConnected) return destroy();
    if (!usable() && k > 1) return void reset(false);
    if (k > 1) {
      clampPan();
      apply(false);
    } else {
      fan(); // the size gate moves with the sheet's width
    }
  };

  map.addEventListener('pointerdown', onDown);
  map.addEventListener('pointermove', onMove);
  map.addEventListener('pointerup', endPointer);
  map.addEventListener('pointercancel', endPointer);
  map.addEventListener('wheel', onWheel, { passive: false });
  map.addEventListener('dblclick', onDbl);
  map.addEventListener('focusin', onFocus);
  window.addEventListener('resize', onResize);

  if (readout) {
    readout.addEventListener('click', (e) => {
      e.preventDefault();
      reset(true);
      /* the pill vanishes on reset, so focus must not vanish with it */
      map.querySelector<HTMLElement>('.map-pin, .map-home')?.focus({ preventScroll: true });
    });
  }

  function destroy(): void {
    map.removeEventListener('pointerdown', onDown);
    map.removeEventListener('pointermove', onMove);
    map.removeEventListener('pointerup', endPointer);
    map.removeEventListener('pointercancel', endPointer);
    map.removeEventListener('wheel', onWheel);
    map.removeEventListener('dblclick', onDbl);
    map.removeEventListener('focusin', onFocus);
    window.removeEventListener('resize', onResize);
  }

  apply(false);

  return {
    scale: () => k,
    by: (f) => zoomTo(k * f, null, true),
    reset,
    reveal,
    destroy,
  };
}
