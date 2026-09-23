/**
 * The photo viewer, on its own.
 *
 * Most birds have several photographs and they are all different shapes, so
 * every place that shows a bird's plates shows them the same way: one fixed
 * frame, the photograph centred inside it at its true ratio, `--paper-sunk`
 * showing through as the mat, never upscaled past the pixels we built. Paging
 * cross-fades two <img> layers, decodes the new one *before* swapping so the
 * frame never blinks, and warms the two neighbours so the next press is
 * instant.
 *
 * That logic used to live inside src/lib/panel.ts, addressing `#panel-img` and
 * friends by id, which meant only the overlay could have it. It is here now so
 * that <BirdPanel /> and /birds/<slug> — a full page that *is* the panel's
 * content — run the same viewer over their own markup instead of two that
 * drift apart. panel.ts keeps its public API (`stepPlate`, `goToPlate`,
 * `plateCount`, `plateIndex`); it just delegates to one of these.
 *
 * Nothing here knows about birds, payloads, dialogs or scroll restore. Give it
 * elements and a list of plates.
 *
 * ## Zoom and pan
 *
 * A matted plate is small on purpose, so there has to be a way to get closer.
 * Both callers pass a `stage` — one element wrapping the two layers — and the
 * viewer puts a `translate() scale()` on it. Scaling the stage rather than the
 * <img> is what keeps the cross-fade, `--iw` / `--ih` and the mat's own layout
 * completely untouched: the stage is stretched to exactly the mat's box, the
 * photograph is centred in it, so scaling the stage about its centre scales
 * the photograph about its centre.
 *
 * The rules, all of them deliberate:
 *
 * * **Fit is 1.** The bottom of the range is the mat's own fit, never smaller.
 * * **Full size is the top.** `maxScale = built pixels / fitted pixels`, so
 *   the most you can ever ask for is the file at 1:1. A photograph already
 *   showing at its built size cannot be zoomed at all and says so by hiding
 *   the control — upscaling is the one thing the mat exists to prevent.
 * * **Zoom goes toward the pointer**, never the centre. Once you have panned
 *   into a corner, zooming toward the centre throws away where you were.
 * * **The photograph always covers the frame**, or is centred in the axis
 *   where it is smaller than the frame. Its edges can never pull inside.
 * * **Paging resets to fit.** A new photograph is a new subject; keeping the
 *   old magnification and offset would land you on an arbitrary crop of it.
 *   Both callers get this for free because it happens in `showPlate`.
 * * **A tap is a toggle; a double-tap goes all the way in.** The second tap of
 *   a pair only acts when the pair *started* at fit, so a double-click never
 *   flickers in and back out again.
 * * **Plain wheel only zooms once you are already zoomed.** Otherwise the
 *   photograph would eat the page scroll every time the pointer crossed it.
 *   Ctrl/⌘ + wheel — which is what a trackpad pinch sends — always zooms.
 *
 * ## The original
 *
 * The ceiling above is 1200 px, because that is what the site builds. The
 * photographs themselves go to 7952 px and 62.6 MB, and they live in an R2
 * bucket rather than in the build. So beside the magnifier there is one more
 * control — a link, `data-plate-original` — that opens the untouched file.
 *
 * Three decisions, all of them about not lying to the person using it:
 *
 * * **It is a link to a new tab, not a fourth zoom step.** Loading a 62 MB
 *   PNG into this viewer would mean decoding it inside a page the user is
 *   already reading, and a phone answers that by dropping the tab. A browser
 *   is a perfectly good image viewer: it streams, it pans, it pinches, it
 *   saves, it has its own back button, and if it takes thirty seconds the
 *   spinner is on a tab the user chose to open. Being a real `<a href>` also
 *   means middle-click, ⌘-click, "copy link" and no-JavaScript all behave.
 * * **The label says what it will cost**, e.g. `Original · 12 MB`, before
 *   the click rather than after it. A control that opens 62 MB without
 *   saying so is a trap, especially on the phone this site is read on.
 * * **It is absent where it would be a lie.** 149 of the 1,278 photographs
 *   are 1200 px or smaller and ship untouched, so the plate on screen is
 *   already the original. Those plates get no control at all — see
 *   `originalOf()` in src/lib/panelData.ts, which is where the judgement is
 *   made and where the bucket URL is documented.
 */

/** The original behind a plate. See `originalOf()` in src/lib/panelData.ts. */
export type PlateOriginal = { name: string; kb: number };

export type PlateImage = { src: string; w: number; h: number; orig?: PlateOriginal };

export interface PlateViewerParts {
  /** The frame. Gets `data-empty` / `data-many` / `data-zoomable` /
   *  `data-zoomed` so CSS can react. */
  frame: HTMLElement;
  /** The two cross-fading layers. `front` is the one that starts visible. */
  front: HTMLImageElement;
  back: HTMLImageElement;
  /**
   * The element that carries the zoom transform. It must wrap both layers and
   * fill the mat exactly. Leave it out and the viewer has no zoom.
   */
  stage?: HTMLElement | null;
  /** Shown when the bird has no photograph at all. */
  empty?: HTMLElement | null;
  /** Paging chrome; each is hidden while there is only one plate. */
  prev?: HTMLElement | null;
  next?: HTMLElement | null;
  /** "3 / 24". */
  count?: HTMLElement | null;
  /** The zoom toggle; hidden while the plate is already at full size. */
  zoom?: HTMLElement | null;
  /**
   * The link to the untouched file. Stays hidden unless this plate has an
   * original bigger than the one we built *and* a base URL is configured, so
   * a page can render it unconditionally and never show an empty affordance.
   */
  original?: HTMLAnchorElement | null;
  /** An aria-live region: "Photograph 3 of 24". */
  live?: HTMLElement | null;
  /** Called after every change, for a thumbnail strip or a caption. */
  onShow?: (index: number, total: number) => void;
  /** Wire the horizontal drag on `frame`. Default true. */
  swipe?: boolean;
}

export interface PlateViewer {
  /** Show this bird's plates, starting at the first, with no animation. */
  set(plates: PlateImage[], alt: string): void;
  /** Page by `d`, wrapping. No-op with fewer than two plates. */
  step(d: number): void;
  /** Jump to a plate, 0-based. */
  goTo(i: number): void;
  count(): number;
  index(): number;
  /** Is the plate currently enlarged past fit? */
  zoomed(): boolean;
  /** Can this plate be enlarged at all, or is it already at full size? */
  canZoom(): boolean;
  /** Multiply the zoom by `f`, about the frame centre. */
  zoomBy(f: number): void;
  /** Fit -> full size, or full size -> fit. */
  toggleZoom(): void;
  /** Back to fit. Returns true if it was zoomed. */
  resetZoom(): boolean;
  /** Blank both layers and abandon any decode still in flight. */
  clear(): void;
}

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SWIPE_MIN = 42;
/** Below this a pointerup counts as a tap rather than a drag. */
const TAP_SLOP = 6;
/** Two taps closer together than this are a double. Chrome's own dblclick
 *  window is about half a second; this is deliberately a little tighter, so a
 *  second, considered click still reads as "and back out again". */
const TAP_GAP = 400;
/** Where one plain click lands, when the plate can go further than that. */
const TAP_STEP = 2.2;
/** A plate this close to full size already is not worth a zoom control. */
const ZOOM_FLOOR = 1.02;
/**
 * Let the photograph over-cover the frame by this much at the end of a pan.
 * Sub-pixel layout rounding can otherwise leave a hundredth of a pixel of mat
 * showing along an edge, and half a pixel of overhang is the cheaper error.
 */
const EDGE_SLACK = 0.5;

/**
 * The chrome that sits on top of the photograph: buttons and a link, which
 * have to behave like buttons and a link rather than like the surface of the
 * plate. Every gesture handler below steps around anything matching this.
 */
const CHROME = '[data-plate-step], [data-plate-zoom], [data-plate-original]';

/**
 * Where the untouched originals live, e.g. `https://pub-xxxx.r2.dev`.
 *
 * **Set it in `.env` as `PUBLIC_ORIGINALS_BASE`.** The block at the top of
 * src/lib/panelData.ts is the one place that is written down properly; this
 * is the other half of the same switch and deliberately repeats none of it.
 * Unset, this is `''`, the payload carries no originals either, and the
 * control never appears.
 */
const ORIGINALS_BASE = String(import.meta.env.PUBLIC_ORIGINALS_BASE ?? '')
  .trim()
  .replace(/\/+$/, '');

/** "940 KB", "3.2 MB", "63 MB" — the price on the label. */
function fileSize(kb: number): string {
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function createPlateViewer(parts: PlateViewerParts): PlateViewer {
  const { frame, front: a, back: b, empty, prev, next, count, live, onShow } = parts;
  const stage = parts.stage ?? null;
  const zoomBtn = parts.zoom ?? null;
  const origLink = parts.original ?? null;

  let plates: PlateImage[] = [];
  let ix = 0;
  let alt = '';
  /** Guards against a slow decode landing after the user has paged on. */
  let showToken = 0;

  /* ---------------- zoom state ---------------- */

  /** 1 is the mat's own fit. Never below it. */
  let k = 1;
  /** Offset from centred, in CSS px, applied after the scale. */
  let tx = 0;
  let ty = 0;
  /** Full size for the plate showing now; 1 when it cannot be enlarged. */
  let maxK = 1;

  function paint(img: HTMLImageElement, p: PlateImage): void {
    img.width = p.w;
    img.height = p.h;
    // The mat never stretches a photograph past the pixels we actually built.
    img.style.setProperty('--iw', `${p.w}px`);
    img.style.setProperty('--ih', `${p.h}px`);
    img.src = p.src;
  }

  function blank(img: HTMLImageElement): void {
    img.removeAttribute('src');
    img.alt = '';
  }

  /** Warm the HTTP cache for one neighbour. Nothing else is ever fetched. */
  function warm(i: number): void {
    const n = plates.length;
    if (n < 2) return;
    const p = plates[((i % n) + n) % n];
    if (!p) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = p.src;
  }

  /**
   * Aim the "view the original" link at the plate showing now, or take it
   * away. Every plate is judged on its own: a bird can hold one frame that
   * came off a camera at 4700 px and the next one a 900 px screenshot, and
   * paging between them has to add and remove the control honestly.
   *
   * `hidden` rather than a disabled state — an affordance for something that
   * does not exist should not be on the screen, and `display: none` means the
   * focus trap skips it and nothing in the corner moves.
   */
  function original(): void {
    if (!origLink) return;

    const o = ORIGINALS_BASE ? plates[ix]?.orig : undefined;
    if (!o) {
      origLink.hidden = true;
      origLink.removeAttribute('href');
      return;
    }

    const size = fileSize(o.kb);
    const label = origLink.querySelector('[data-orig-label]') ?? origLink;
    origLink.href = `${ORIGINALS_BASE}/originals/${encodeURIComponent(o.name)}`;
    label.textContent = `Original · ${size}`;
    origLink.title = `The photograph as it came off the camera — ${size}`;
    origLink.setAttribute(
      'aria-label',
      `Open the original photograph, ${size}, in a new tab`,
    );
    origLink.hidden = false;
  }

  function chrome(): void {
    const n = plates.length;
    const many = n > 1;

    original();

    if (prev) prev.hidden = !many;
    if (next) next.hidden = !many;

    if (count) {
      count.hidden = !many;
      count.textContent = many ? `${ix + 1} / ${n}` : '';
    }

    frame.toggleAttribute('data-empty', n === 0);
    frame.toggleAttribute('data-many', many);

    if (live) live.textContent = many ? `Photograph ${ix + 1} of ${n}` : '';

    onShow?.(ix, n);
  }

  /* ---------------- zoom ---------------- */

  /** Whichever layer is showing; the other one is transparent. */
  const frontEl = (): HTMLImageElement => (a.classList.contains('is-front') ? a : b);

  /**
   * The mat's box, untransformed. `stage` itself is the thing we scale, so its
   * own rect is the *scaled* one and useless for anchoring — its parent is the
   * mat, which never moves.
   */
  const matEl = (): HTMLElement => (stage?.parentElement as HTMLElement | null) ?? frame;

  /**
   * The mat's box and the photograph's size inside it at fit, in subpixels.
   *
   * Worked out rather than measured. The photograph's own rect is the
   * *transformed* one, and dividing it back out lands mid-animation half the
   * time; `offsetWidth` is honest but rounds, and half a pixel of rounding is
   * a hairline of mat showing along an edge at the end of a pan. The mat's
   * rule — `width/height: auto` under `max-width: min(100%, --iw)` — makes the
   * fitted size exactly this, so it is safe to compute it.
   */
  function fitSize(): { w: number; h: number; box: DOMRect } | null {
    const p = plates[ix];
    const box = matEl().getBoundingClientRect();
    if (!p || !p.w || !p.h || box.width <= 0 || box.height <= 0) return null;
    const s = Math.min(1, box.width / p.w, box.height / p.h);
    return { w: p.w * s, h: p.h * s, box };
  }

  /** How far this plate can go: the built pixels over the fitted pixels. */
  function measure(): void {
    const f = stage ? fitSize() : null;
    maxK = f ? (plates[ix] as PlateImage).w / f.w : 1;
    if (!(maxK > ZOOM_FLOOR)) maxK = 1;

    frame.toggleAttribute('data-zoomable', maxK > 1);
    if (zoomBtn) zoomBtn.hidden = maxK <= 1;
  }

  /** Never let an edge pull inside the frame. */
  function clampPan(): void {
    const f = stage ? fitSize() : null;
    if (!f) return;
    const mx = Math.max(0, (f.w * k - f.box.width) / 2 - EDGE_SLACK);
    const my = Math.max(0, (f.h * k - f.box.height) / 2 - EDGE_SLACK);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  }

  function apply(animate: boolean): void {
    if (!stage) return;
    stage.style.transitionDuration = animate && !reduced() ? '' : '0s';
    stage.style.transform = k > 1 ? `translate(${tx}px, ${ty}px) scale(${k})` : '';
    frame.toggleAttribute('data-zoomed', k > 1);
    if (zoomBtn) {
      const on = k > 1;
      zoomBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      zoomBtn.setAttribute('aria-label', on ? 'Fit the photograph to the frame' : 'Enlarge the photograph');
    }
  }

  /**
   * Go to scale `nk`, keeping whatever is under `at` (viewport coordinates)
   * exactly where it is. `at` of null anchors the frame's centre.
   */
  function zoomTo(nk: number, at: { x: number; y: number } | null, animate: boolean): void {
    if (!stage) return;
    measure();
    nk = Math.min(maxK, Math.max(1, nk));

    const r = matEl().getBoundingClientRect();
    const px = at ? at.x - (r.left + r.width / 2) : 0;
    const py = at ? at.y - (r.top + r.height / 2) : 0;

    // The image point under the pointer is (p - t) / k; hold it still.
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

  function resetZoom(animate = true): boolean {
    if (k <= 1) return false;
    k = 1;
    tx = 0;
    ty = 0;
    apply(animate);
    return true;
  }

  /**
   * Show plate `i`. `dir` is -1 or 1 for the direction the new plate slides in
   * from, 0 for a fresh bird. The two <img> layers cross-fade so the frame
   * never blinks; under reduced motion it is a straight swap.
   */
  async function showPlate(i: number, dir: number, instant: boolean): Promise<void> {
    // A new photograph is a new subject: the old magnification and offset
    // would land on an arbitrary crop of it. Instant, so paging looks exactly
    // as it did before zoom existed.
    resetZoom(false);

    const p = plates[i];

    if (!p) {
      blank(a);
      blank(b);
      a.hidden = true;
      b.hidden = true;
      if (empty) empty.hidden = false;
      chrome();
      measure();
      return;
    }

    if (empty) empty.hidden = true;
    a.hidden = false;
    b.hidden = false;

    ix = i;
    chrome();
    measure();
    // The overlay fills itself while still `hidden`, so nothing has a layout
    // box yet; the plate's real size only exists a frame later.
    requestAnimationFrame(() => {
      if (plates[ix] === p) measure();
    });

    const my = ++showToken;
    const head = a.classList.contains('is-front') ? a : b;
    const tail = head === a ? b : a;

    if (instant || reduced() || !head.getAttribute('src')) {
      paint(head, p);
      head.alt = alt;
      head.classList.add('is-front');
      tail.classList.remove('is-front');
      blank(tail);
    } else {
      paint(tail, p);
      tail.style.setProperty('--dir', String(dir));
      head.style.setProperty('--dir', String(-dir));
      try {
        await tail.decode();
      } catch {
        /* src swapped again, or the file is gone — fall through and show it */
      }
      if (my !== showToken) return;
      tail.alt = alt;
      head.alt = '';
      tail.classList.add('is-front');
      head.classList.remove('is-front');
    }

    measure();
    warm(i + 1);
    warm(i - 1);
  }

  /* ---------------- pointers ----------------
   *
   * One block for all three gestures, because they are the same pointers:
   *
   *   one pointer, at fit   -> a horizontal drag pages, a tap zooms in
   *   one pointer, zoomed   -> a drag pans, a tap zooms back out
   *   two pointers          -> pinch, and the midpoint pans while you pinch
   *
   * Paging yields to panning rather than the other way round: while zoomed
   * there is somewhere to drag *to*, and a swipe that both panned and paged
   * would be unusable.
   */
  if (parts.swipe !== false && frame.dataset.swipe !== '1') {
    frame.dataset.swipe = '1';

    const pts = new Map<number, { x: number; y: number }>();
    let mode: '' | 'swipe' | 'pan' | 'pinch' = '';
    let startX = 0;
    let startY = 0;
    let panX = 0;
    let panY = 0;
    let moved = false;
    let pinchD = 0;
    let pinchM = { x: 0, y: 0 };
    /** Tap pairing, for double-click and double-tap. */
    let lastTap = 0;
    let pairFromFit = true;

    const two = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      const it = pts.values();
      const p1 = it.next().value;
      const p2 = it.next().value;
      return p1 && p2 ? [p1, p2] : null;
    };

    function beginOne(id: number): void {
      const p = pts.get(id);
      if (!p) return;
      startX = p.x;
      startY = p.y;
      panX = tx;
      panY = ty;
      moved = false;
      mode = k > 1 ? 'pan' : 'swipe';
    }

    function beginPinch(): void {
      const pair = two();
      if (!pair) return;
      mode = 'pinch';
      moved = true;
      pinchD = dist(pair[0], pair[1]);
      pinchM = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      measure();
    }

    /** A stationary press. Toggles; the second of a pair goes all the way in. */
    function tap(at: { x: number; y: number }): void {
      if (!stage) return;
      measure();
      if (maxK <= 1) return;

      const now = performance.now();
      if (now - lastTap < TAP_GAP) {
        lastTap = 0;
        // Only a pair that *started* at fit means "closer". A pair that
        // started zoomed already got what it asked for on the first tap, and
        // acting again here is the flicker everyone hates.
        if (pairFromFit) zoomTo(maxK, at, true);
        return;
      }
      lastTap = now;
      pairFromFit = k <= 1;
      if (k > 1) resetZoom(true);
      else zoomTo(Math.min(maxK, TAP_STEP), at, true);
    }

    frame.addEventListener('pointerdown', (e) => {
      // the arrows and the zoom control are buttons; let them be buttons
      if ((e.target as Element | null)?.closest(CHROME)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      // A pointerup can go missing — a touch swallowed by a scroll the browser
      // decided to take, a window losing focus mid-drag. Nothing is in flight
      // between gestures, so anything left in the map here is a ghost, and one
      // ghost would otherwise turn every later press into half a pinch.
      if (!mode) pts.clear();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        frame.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone; the up handler still cleans up */
      }

      if (pts.size >= 2 && stage) beginPinch();
      else if (pts.size === 1) beginOne(e.pointerId);
    });

    frame.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;

      if (mode === 'pinch') {
        const pair = two();
        if (!pair || pinchD <= 0) return;
        const d = dist(pair[0], pair[1]);
        const m = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
        // two fingers move the photograph as well as scale it
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
        if (!moved && Math.hypot(dx, dy) > TAP_SLOP) moved = true;
        tx = panX + dx;
        ty = panY + dy;
        clampPan();
        apply(false);
        e.preventDefault();
        return;
      }

      if (mode === 'swipe' && !moved) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_SLOP) moved = true;
      }
    });

    function endPointer(e: PointerEvent, cancelled: boolean): void {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      try {
        frame.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      if (mode === 'pinch') {
        // one finger left: carry straight on panning with it
        if (pts.size === 1) {
          const id = pts.keys().next().value as number;
          beginOne(id);
          moved = true;
        } else {
          mode = '';
        }
        return;
      }

      // A one-pointer gesture is over the moment that pointer is up.
      const wasSwipe = mode === 'swipe';
      const wasPan = mode === 'pan';
      mode = '';
      if (cancelled) return;

      if (wasSwipe) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (plates.length > 1 && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.4) {
          step(dx < 0 ? 1 : -1);
          return;
        }
        if (!moved) tap({ x: e.clientX, y: e.clientY });
        return;
      }

      if (wasPan && !moved) tap({ x: e.clientX, y: e.clientY });
    }

    frame.addEventListener('pointerup', (e) => endPointer(e, false));
    frame.addEventListener('pointercancel', (e) => endPointer(e, true));

    /*
     * `touch-action: pan-y` on the mat keeps one finger scrolling the page,
     * which is right — but it also leaves a two-finger gesture looking like a
     * scroll, and the browser would cancel our pointers halfway through the
     * pinch. touch-action is fixed for the life of a gesture, so the only way
     * out is to cancel the default here, on the touch that starts the pinch.
     * One finger is never touched, so scrolling is exactly as it was.
     */
    frame.addEventListener(
      'touchstart',
      (e) => {
        if (!stage || e.touches.length < 2 || maxK <= 1) return;
        if ((e.target as Element | null)?.closest(CHROME)) return;
        e.preventDefault();
      },
      { passive: false },
    );

    /*
     * Wheel. A trackpad pinch arrives as ctrlKey + wheel and always zooms. A
     * plain wheel only zooms once you are already in, so the photograph never
     * swallows the scroll of a page you were only passing over.
     */
    frame.addEventListener(
      'wheel',
      (e) => {
        if (!stage) return;
        if ((e.target as Element | null)?.closest(CHROME)) return;
        const pinch = e.ctrlKey || e.metaKey;
        if (!pinch && k <= 1) return;
        measure();
        if (maxK <= 1) return;
        e.preventDefault();
        // line- and page-mode deltas are tiny numbers; normalise them roughly
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const f = Math.exp(-e.deltaY * unit * (pinch ? 0.01 : 0.003));
        zoomTo(k * f, { x: e.clientX, y: e.clientY }, false);
      },
      { passive: false },
    );

    if (zoomBtn) {
      zoomBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleZoom();
      });
    }

    /* The fit size changes with the viewport, so the ceiling and the clamp do
       too. The viewer is never torn down explicitly — it is dropped when the
       document is replaced — so the listener retires itself. */
    const onResize = () => {
      if (!frame.isConnected) {
        window.removeEventListener('resize', onResize);
        return;
      }
      measure();
      if (k > 1) {
        if (k > maxK) k = maxK;
        clampPan();
        apply(false);
      }
    };
    window.addEventListener('resize', onResize);
  }

  function step(d: number): void {
    const n = plates.length;
    if (n < 2 || !d) return;
    void showPlate((((ix + d) % n) + n) % n, d < 0 ? -1 : 1, false);
  }

  function toggleZoom(): void {
    measure();
    if (maxK <= 1) return;
    if (k > 1) resetZoom(true);
    else zoomTo(maxK, null, true);
  }

  return {
    set(list, label) {
      plates = list;
      alt = label;
      ix = 0;
      void showPlate(0, 0, true);
    },
    step,
    goTo(i) {
      const n = plates.length;
      if (i === ix || i < 0 || i >= n) return;
      void showPlate(i, i > ix ? 1 : -1, false);
    },
    count: () => plates.length,
    index: () => ix,
    zoomed: () => k > 1,
    canZoom() {
      measure();
      return maxK > 1;
    },
    zoomBy(f) {
      measure();
      if (maxK <= 1) return;
      zoomTo(k * f, null, true);
    },
    toggleZoom,
    resetZoom: () => resetZoom(true),
    clear() {
      showToken++; // abandon any decode still in flight
      resetZoom(false);
      plates = [];
      ix = 0;
      blank(a);
      blank(b);
      // no plate, no original: the link must not survive into the next bird
      original();
    },
  };
}
