# bird_web — UI/UX audit

Read-only audit, 2026-09-19. Nothing in the repo was changed by this pass.

**Method.** Headless Chrome 153 driven over CDP against the running dev server
(`http://localhost:8888`). Every route type was visited at 1440, 1280, 900, 768,
430 and 360 px, in light and dark, with and without `prefers-reduced-motion`.
Contrast ratios were computed in-page from resolved `color` / effective
background / effective opacity; label-over-photograph contrast was computed by
re-drawing the photographs under each label into a canvas and reading back the
pixel luminance. Layout shift was measured with a `PerformanceObserver` on
`layout-shift` plus before/after geometry snapshots.

Screenshots referenced below live in
`/private/tmp/claude-501/-Volumes-2tb-ssd-Dropbox/e27b5ca1-f151-4554-b7c6-babe61d802f8/scratchpad/uxaudit/shots/`
(written `shots/…` from here on). They are in a session scratch directory and
will not survive indefinitely — the numbers in this report are meant to stand
alone without them.

**How to read it.** Every entry is tagged **[BUG]** or **[TASTE]**.
*[BUG]* = measurably broken, or violates the contract in `src/lib/README.md` /
`CLAUDE.md`, or fails WCAG AA. *[TASTE]* = works as built, but the design would
read better another way; the owner asked for both, so they are labelled, never
mixed.

Severity: **blocker** (unusable / unreachable content) · **major** (clearly
wrong, everyone will notice) · **minor** (noticeable, survivable) ·
**polish** (refinement).

**What is already good**, so nobody "fixes" it: zero console errors, zero
failed requests and zero 404s on all 14 route shapes tested (only the genuine
404 page 404s). No long tasks at all — the flock rAF loop, the groups idle loop
and the 238-dot timeline all hold a steady 60 fps (241 frames / 4.00 s on `/`
and `/groups`; 392 frames / 6.51 s while hard-scrolling `/list`). `/list` ships
1.53 MB for the first screen with lazy loading working correctly (126 of 236
images decoded at load). Reduced motion renders a correct, attractive static
frame on every view. Focus rings exist and are visible everywhere (2 px solid
`--ink-soft`, 3 px offset; bubbles get a type-coloured 2 px ring). The panel's
focus trap, Esc handling and scroll restore all work. `M`/`T`/`G`/`L` all
navigate correctly. Gutters are `clamp(20px, 6vw, 88px)` and *identical* on
`/list`, `/places`, `/places/<slug>`, `/timeline` and `/birds/<slug>` — the
gutter problem is localised, not systemic.

---

## Top 10 things to fix first

| # | Where | Severity | What |
|---|---|---|---|
| 1 | `/groups/<slug>` (all 9) | blocker | The bird grid has **no side gutter at all** — first and last columns are cut off by the viewport edge, while the chips and counts above them sit at 86 px. `padding: 0` at `groups/[slug].astro:247` overrides the `padding-inline: var(--gutter)` at line 190. |
| 2 | every view | major | **`--ink-faint` text is 2.44:1 in light and 3.33:1 in dark** — fails AA (4.5:1) everywhere. It is used for the eyebrow, all `.meta` lines, every count, every date, "No photograph yet", and for real links (`← All nine groups`, `the whole map`). |
| 3 | `/timeline` | major | At a 900 px-tall window **only 28 of 238 dots are above the fold; at 800 px, zero**. Head (335 px) + gap pushes the chart to y=452, the chart asks for 558 px. The first screen of the "when" view contains no data. |
| 4 | `/groups` | major | The three big bubbles wear their name **inside**, over photographs, held only by a `text-shadow` halo. Measured mean contrast: 5.89 / 3.92 / 3.78 light, **2.21 / 3.34 / 3.35 dark**, with worst-pixel contrast 1.07–1.24. Dark mode fails outright. |
| 4b | `/timeline`, `/places/<slug>`, `/groups/<slug>` | major | **The reported layout jump is the scrollbar.** Opening the bird panel sets `documentElement.style.overflow = 'hidden'` (`panel.ts:216`) with no gutter compensation; `clientWidth` goes 1425 → 1440 and back, so the whole page shifts 15 px. |
| 5 | every view | major | **Content sits permanently under the fixed compass** (90×90 at 26,784 plus an 18 px paper halo). On `/places/<slug>` the "← the whole map" back link is literally underneath it. No view reserves space; `--page-bottom` maxes at 56 px against a 116 px reach. |
| 6 | `/` | major | The flock reads as random scatter, not a flock: the three spiral arms overlap so completely that the angular histogram is flat (3–7 birds per 30° sector), and a 4.4× radius spread (158→700 px) plus a 172 px-too-wide title hole leaves an empty band across the whole middle of the page. |
| 7 | `/places` | major | **19 overlapping pin pairs** at US level (Tampa/Silver Springs 77 %, Denver/Rocky Mountain NP 67 %), 9 more at Triangle level. Smaller places are hidden behind bigger ones and effectively unclickable. |
| 8 | all views | major | **No skip link and no `<main>` landmark anywhere.** On `/` the first 58 tab stops are flock birds before you can reach the word nav; `/timeline` has 244 tab stops (238 are dots); `/list` has 355. |
| 9 | `/groups` | minor | Two of nine bubbles (Raptors, Doves & Pigeons) are below the fold at 1440×900 with no affordance, and the bubble stage is inset 245 px / 291 px against an 86 px header gutter. |
| 10 | `/timeline` | minor | 238 dots are ~5 px targets (238 sub-24 px hit targets counted). Unusable by touch, and the hover tip lands on top of the compass at the bottom-left. |

---

## `/` — the flock

### 1.1 The distribution reads as noise, not as a flock — [BUG] (design intent not met), major
**Where:** `/`, 1440×900 and 1280×800, both themes.
**Screens:** `shots/1440-light-home.png`, `shots/rm-home.png`

**Measured** (58 live birds, `flock-stats`):

* Angular histogram around the title, 12 sectors of 30°: `5 4 7 5 4 4 5 5 5 3 5 6`.
  Perfectly flat. **The three spiral arms are statistically invisible.**
* Radius from the title centre: min 158, median 403, max 700 px — a 4.4× spread.
* Occupancy of a 12×8 cell grid over the page (`.` = empty):

  ```
  .....111....
  .1.21323111.
  21...3....1.
  11......1.1.
  .11.......1.
  ..2111.112..
  11.12232.12.
  ......1.1...
  ```

  Rows 3–5 (y ≈ 225–560, the middle third of the page) are empty except for the
  two outermost columns. The flock is a dense arc on top, a dense arc on the
  bottom, and a void through the middle.
* Nearest-neighbour edge gaps: min 6 px, **median 13 px**, max 102 px.
* Sizes: only three values — 52 px (14 birds), 66 px (34), 86 px (10). 59 % of
  the flock is exactly one size.

**Root causes, in order of impact:**

1. **The arms overlap by design.** `src/lib/flockView.ts:161` —
   `a = (arm * 2π / arms) + t * 3.6 + jitter`. With `arms = 3`, each arm sweeps
   3.6 rad = 206° while the arms are only 120° apart, so every angular sector
   contains birds from two different arms at two different radii. There is no
   angular gap anywhere for an arm to read against. Either the sweep has to
   drop below 120° or the arms need a radial offset.
2. **The hole is 172 px wider than the title.** `src/pages/index.astro:296` —
   `.hub { padding: 0 var(--gutter); }` on a *centred* block. The hub box
   measures 512×225 while the word "Flock" is 340×70.
   `flockView.ts:150` then takes `hubHW = hub.width/2 + 34 = 290` as the
   horizontal exclusion radius. The flock is pushed 172 px further out
   horizontally than the words need, which is exactly where the empty middle
   band comes from. **Cheapest single fix on this page:** drop the gutter
   padding from `.hub` (use `margin-inline: auto; max-width: …` instead), or
   measure the exclusion off `.display`+`.lede` rather than off `.hub`.
3. **Rectangular outer bound on an elliptical layout.**
   `flockView.ts:164` — `rOut = edge(a, W/2 - half - margin, H/2 - half - margin)`.
   At 1440×900 the horizontal reach is ~690 px but the vertical reach is ~420 px,
   so birds at the same `t` land at wildly different radii. That is the 4.4×
   radius spread.
4. **Everything is packed to the minimum.** `flockView.ts:196` —
   `want = (p.size + q.size) / 2 + 13`. The relaxation drives every pair to
   exactly the 13 px floor, so density is uniform everywhere and the eye gets
   no rhythm to read.
5. **Size carries no information.** `index.astro:91` —
   `size = favorite ? 86 : n >= 10 ? 66 : 52`. A 1.65× range across three tiers
   with two-thirds of the flock in the middle tier reads as jitter, not as
   hierarchy.

**Not the cause:** the drift. The drift is a CSS keyframe on `.fb__d` with a
small amplitude and the reduced-motion static frame (`shots/rm-home.png`) has
exactly the same legibility problem, so freezing it changes nothing.

**Suggested fix (smallest first):** (a) remove `padding: 0 var(--gutter)` from
`.hub`; (b) cut the per-arm sweep from `3.6` to about `1.9` rad and give each
arm its own radial phase so the arms separate; (c) normalise `rOut` to an
ellipse (`edge` on a circle scaled by `W/H`) so radius is comparable at every
angle; (d) widen the size range (e.g. 44 / 60 / 78 / 104 on four tiers driven
by photo count) so the flock has foreground and background.

### 1.2 Birds and their hover names sit under the compass — [BUG] major
**Where:** `/`, every viewport. Not scrollable away — the page is exactly 100 vh.

`underCompass()` at 1440×900 returns a `.thumb--circle` button at
`[57,713]–[124,780]` and the names "Yellow-crowned Night Heron" `[80,752,267,769]`
and "Tufted Titmouse" `[37,785,146,803]`, all inside the compass box
`[26,784]–[116,874]` + 18 px halo.

**Root cause:** `flockView.ts:177` guards the compass with
`if (x < 150 && y > H - 150)` using the **centre of the picture box only**. The
`.fb__name` caption renders *below* the picture, outside that box, so a bird
whose centre is legally clear still drops its name onto the compass. The 150 px
box is also smaller than the compass's real reach (116 px + label).

**Fix:** inflate the guard to the full element box including the caption
(`b.size/2 + captionHeight`), and raise the box to 150×170 to cover the halo.

### 1.3 Hover names overflow the viewport edges — [BUG] minor
At 1280 a `.fb__name` sits at `left: -3`; at 900, `-9` and `-12`; at 360,
`right: 361` and `373` against a 360 px page. The captions are
`position: absolute` and centred on the bird with no clamp to the container.
They are `opacity: 0` until hover, so it only bites on hover, but on a 360 px
phone the outermost birds' names are clipped.
**Fix:** clamp the caption's translate to the container, or flip it inward for
birds within one caption-width of an edge.

### 1.4 The word nav is the last thing a keyboard reaches — [BUG] major
58 flock buttons precede "Where / When / Which / All" in the DOM, so the
primary navigation of the home page is tab stop 59–62.
**Fix:** put the `.hub` before `.flock` in the DOM and position it with CSS, or
give the flock `tabindex="-1"` and rely on the panel's own trigger handling —
they are decorative duplicates of birds reachable elsewhere.

### 1.5 "Which" vs "Groups" vs "Life list" vs "All" — [TASTE] minor
Three vocabularies for four views: `flock.ts:26-30` says
Flock / Where / When / **Groups** / **Life list**; `index.astro:108-111` says
Where / When / **Which** / **All**; the `<h1>`s say Flock / Where / When /
Groups / All. `CLAUDE.md` intends "哪一类 / Which". Pick one set and use it in
the compass labels, the home words and the `<h1>`s.

---

## `/timeline` — when

### 2.1 Opening the panel jumps the page 15 px — [BUG] major — *this is the reported bug*
**Where:** `/timeline`, `/places/<slug>`, `/groups/<slug>`; any window where the
page is taller than the viewport and the OS draws a classic scrollbar
(Windows/Linux Chrome & Firefox, macOS with "Show scroll bars: Always").

**Measured**, `/timeline` at 1440×900, scrolled to y=150 and `#scroller` to 400:

```
before open : innerWidth 1440, clientWidth 1425, scrollbar 15
panel open  : innerWidth 1440, clientWidth 1440, scrollbar  0   ← +15px reflow
after close : innerWidth 1440, clientWidth 1425, scrollbar 15   ← −15px reflow
```

`layout-shift` reports 0 because the shift is attributed to a user gesture, but
the geometry is unambiguous. The timeline shows it worst because the season
bands, the `#axis` SVG and the scroller are all width-driven, so a 15 px
`clientWidth` change re-lays out the entire chart under the cursor. `/places/<slug>`
and `/groups/<slug>` show the same 1425→1440 swing; `/list` happens to escape it
because the open panel still leaves the document 938 px tall (> viewport) so the
scrollbar survives.

**Root cause:** `src/lib/panel.ts:216` (`open`) and `:231`, `:339`, `:347`
(`close`) set / clear `document.documentElement.style.overflow` with no
compensation for the reclaimed scrollbar width.

**Fix (one line, global):** add `scrollbar-gutter: stable;` to `html` in
`src/styles/global.css` §3 — it reserves the gutter always, so hiding overflow
changes nothing. If you would rather not reserve it on every page, measure
`window.innerWidth - documentElement.clientWidth` in `openBird()` and apply it
as `padding-right` on `<html>` while the lock is on.

### 2.2 The first screen of the timeline is empty — [BUG] major
**Where:** `/timeline`, all viewports; worst at ≤900 px tall.
**Screens:** `shots/1440-light-timeline.png`, `shots/timeline-hover.png`,
`shots/430-light-timeline.png`

**Measured:**

| viewport | head height | scroller top | scroller height | first dot at y | dots fully above fold |
|---|---|---|---|---|---|
| 1440×900 | 335 | 452 | 569 | **936** | **28 / 238** |
| 1440×800 | 335 | 439 | 507 | **869** | **0 / 238** |
| 1512×982 | 335 | 462 | 611 | 983 | 158 / 238 |
| 430×860 | 300 | 411 | 499 | 845 | 238 (but on the very bottom edge, under the compass) |

At the two most common laptop heights the visible 450 px of chart is a beige
band with a flat line along the bottom and nothing else — see
`shots/430-light-timeline.png`, which is a completely empty plot area.

**Root causes, both additive:**

1. **Vertical budget.** `Timeline.astro:225` asks for
   `height: clamp(430px, 62vh, 600px)` = 558 px at a 900 px window, but the head
   already consumes `--page-top` 63 + `.tl__head` 335 + `--head-gap` 54 = 452 px.
   452 + 558 = 1010 > 900. The chart is 110 px taller than the room left for it,
   and the dots are the bottom-most thing in it.
2. **Where the marks sit in the viewBox.** `src/lib/timeline.ts:17-22` —
   `H = 560`, `CURVE_TOP = 64`, `AXIS_Y = 392`, `DOT_Y = 462`, month labels at
   524, year labels at 548. The dot row, the month ticks and the year ticks are
   all in the bottom 25 % of a box that is already overflowing.

**Compounding:** the cumulative curve is pinned near the baseline for the first
~14 months because the data is back-loaded, so the 328 units reserved for the
curve (64→392) are visually empty for the left two-thirds of the chart. The
scroller also starts at `scrollLeft: 0` (Sep 2024, the sparse end) and is never
nudged toward the data.

**Suggested fix:** (a) move `.tl__legend` out of `.tl__head` to below the chart
or beside the lede — that alone returns ~95 px; (b) cap the chart with
`height: min(clamp(430px, 62vh, 600px), calc(100vh - 340px))`; (c) raise
`DOT_Y` to ~300 and drop `AXIS_Y`/`CURVE_TOP` so the dots and the curve share the
upper half; (d) set an initial `scrollLeft` at the first busy month so the view
opens on data.

### 2.3 238 dots are 238 tab stops — [BUG] major
`Timeline.astro:132` puts `tabindex="0"` on every `.dot-g`. Keyboard users need
239 Tab presses to cross the timeline, and there is no way out but Shift+Tab
back to the start. 238 hit targets are also below the 24 px minimum, so the
chart is effectively untouchable on a phone.
**Fix:** make `#scroller` a single roving-tabindex composite — one tab stop,
arrow keys move between dots, Enter opens the panel — and give each dot an
invisible ≥24 px `<circle>` hit area (`fill="transparent"`, `pointer-events:
all`) behind the 5 px visible dot.

### 2.4 The hover tip lands on the compass and off the bottom of the window — [BUG] minor
**Screen:** `shots/timeline-hover.png`. Hovering a dot in the left third puts
the "Golden-crowned Kinglet / 1 Nov 2025" tip at roughly `[65,830]–[247,880]`,
overlapping the compass and half-clipped by the window bottom.
Root cause: `Timeline.astro:394` flips the tip above the dot
(`top = r.top - t.height - 12`) but never clamps it to the viewport or steers it
away from the compass's fixed box. Since the dots sit at the bottom of the
chart, this is the normal case rather than an edge case.
**Fix:** clamp the tip into the viewport and shift it right when it would enter
`x < 150 && y > vh - 150`.

### 2.5 The "0" / "238" endpoint labels are effectively invisible — [BUG] minor
Measured at load: `#axis > text "238"` and `"0"` resolve to `opacity: 0.01`,
giving a 1.02:1 ratio. They appear to be waiting on a scroll/intersection cue
that has not fired for the left edge. At minimum the "0" at the origin should be
visible on arrival.

### 2.6 The content under the compass is the chart itself — [BUG] minor
`#scroller` spans `[0,452]–[1440,1010]` at 1440×900; the compass sits at
`[26,784]–[116,874]` with an 18 px halo. The compass's `::before` paper
gradient punches a soft 126 px hole through the season bands at the bottom-left
of the chart on every screenshot. See §6.1.

### 2.7 The chart has no baseline or gridline — [TASTE] polish
The "238" floats at the top of the plot with nothing to anchor it, and the
curve has no y-axis. One hairline at `y = CURVE_TOP` labelled "238" and one at
`AXIS_Y` labelled "0" would make the climb legible without adding chrome.

---

## `/places` — where

### 3.1 Pins overlap so badly that places disappear — [BUG] major
**Where:** `/places` both levels, all viewports, both themes.
**Screens:** `shots/1440-light-places.png`, `shots/places-triangle2.png`

**Measured** (pairs whose centre distance is under 75 % of the sum of their radii):

* US level: **19 overlapping pairs of 37 pins.** Worst: Tampa/Silver Springs
  77 %, Denver/Rocky Mountain NP 67 %, Boston/Parker River 60 %,
  Cape May/Chincoteague 54 %, Boston/Horn Pond 52 %, Cape May/New York City 50 %.
* Triangle level: **9 overlapping pairs of 18 pins.** Mason Farm/Finley Golf
  Club 60 %, Mason Farm/NC Botanical Garden 55 %, NC Botanical Garden/UNC 51 %,
  Sandy Creek/金玉公寓 41 %.

Because pin size is bird count and the later pin paints on top, the *smaller*
place is the one that vanishes — Parker River (4 birds) is 60 % behind Boston
(27). Those pins cannot be hovered or clicked at all where they are covered.

**Root cause:** hand-placed `x`/`y` in `src/data/locations.json` with no
collision resolution at render time, and pin radius scaling with bird count
(`src/components/MapPin.astro`). The coordinates are geographically honest;
the pins are not.

**Fix:** run a one-pass circle relaxation over the pins at layout time (the same
trick `flockView.ts:185-210` already uses) and draw a hairline leader from the
displaced pin back to its true coordinate — that keeps the map honest and the
pins legible. Failing that, at least raise `z-index` on hover and make the
smaller pin paint on top.

### 3.2 The "Home patch" callout is a card — [BUG-ish] minor, contract violation
`src/lib/README.md` §8 house style: "No card borders, no drop shadows on
content, no rounded boxes." `.map-home` renders as a filled rounded box with a
border at `[955,683]–[1110,728]`. In dark it also sits at low contrast against
the slate map (`shots/1440-dark-places.png`). The Hawai'i / Puerto Rico dashed
inset frames have the same issue but read as map cartography, so those are
defensible.
**Fix:** drop the fill and border; a house icon + two lines of type on the paper
would match the rest of the site.

### 3.3 Inset and pin labels fail AA — [BUG] major (part of §6.2)
`HAWAI'I`, `PUERTO RICO`, `18 spots · 84 birds`, "Every pin is the best bird
seen there…" are all `--ink-faint`: **2.44:1 light, 3.33:1 dark**.

### 3.4 The map is bottom-heavy and the top-right quadrant is empty — [TASTE] minor
At 1440×900 the head block ends at y=242 and is 586 px wide (a 62ch measure),
so roughly 850×180 px of the top-right is blank, then the map runs from y=270
to y=860 and the hint sits at y=899 — below the fold. The same 62ch-wide head
with an empty right shoulder appears on all five views; it is a deliberate
typographic measure and it reads well at ≤1280, but at 1440+ five pages in a
row open with a blank top-right corner. Consider letting the map rise into it,
or moving the legend/hint there.

### 3.5 The level switch is clean — no finding
`/places` → `#triangle` produced **CLS 0.000**, no document-height change
(987 px both ways), correct hash, correct `popstate`, and focus moves to a
`.map-pin`. Nicely done; leave it alone.

---

## `/places/<slug>` — one place

### 4.1 "← the whole map" is underneath the compass — [BUG] blocker (for that control)
**Where:** every place page, 1440/1280/768; both themes.
**Screens:** `shots/1440-light-place-sandy.png`, `shots/edge-_places_bolin-creek-trail.png`

Measured: `.place__back` occupies `[86,821]–[220,841]`. The compass occupies
`[26,784]–[116,874]` and its paper halo reaches `[8,766]–[134,892]`. The left
~30 px of the back link — including the "←" glyph at `[86,822]–[98,835]` — is
covered by the compass, which is `z-index: 45`, i.e. on top. The click goes to
the compass. The hint line above it ("Hover a bird: 42 of these were seen
somewhere else too") is covered too.

This is the single clearest instance of the contract line in
`src/lib/README.md` §9: *"the compass is not covered by your content."*

**Fix:** move `.place__back` to the top of the right-hand column, or give
`.place__map` a `padding-bottom` / the page a `padding-left` on the last block
that clears 150×170 px at the bottom-left.

### 4.2 A place with one bird wastes two-thirds of the page — [BUG] minor (edge state)
**Screen:** `shots/edge-_places_bolin-creek-trail.png` (Bolin Creek Trail, 1 bird).
The layout is a fixed two-column split (`.place__map` 482 px | `.bloom` 730 px
with `gap: 56px`). With one bird the right column holds a single 125 px
thumbnail and 600 px of nothing. Miami Beach (1 bird) is the same.
**Fix:** when `birds.length <= 3`, collapse to a single centred column, or let
the bloom grid shrink to `max-content` and centre it against the map.

### 4.3 Caption lines wrap unevenly, so the grid rows go ragged — [TASTE] polish
In `.bloom__meta` the date and the "n places" chip are inline, so
"8 Feb 2025 · 10 places" fits on one line for some birds and wraps for others
("13 places" alone on line 2 for Great Blue Heron), giving rows of unequal
height inside a grid that is otherwise square. Fix the meta line to a fixed
two-line block, or drop the place count to a `title`/hover.

### 4.4 The location named "Location" — [BUG] minor, content
`/places/location` resolves to a page titled `金玉公寓`. The slug was derived
from a placeholder name in Notion. The URL is user-visible and wrong.
Per `CLAUDE.md` this is a Notion-side content fix, not a repo fix.

---

## `/groups` — the bubbles

### 5.1 The three big bubbles' labels are unreadable — [BUG] major — *this is the reported bug*
**Where:** `/groups` at every viewport; **worst in dark, where all three fail.**
**Screens:** `shots/1440-light-groups.png`, `shots/1440-dark-groups.png`,
`shots/430-light-groups.png`

**Measured** — the photographs actually under each label were re-drawn to a
canvas and the luminance read back, then compared against the resolved `--ink`:

| label | mean contrast (light) | mean contrast (dark) | worst pixel |
|---|---|---|---|
| Perching 109 | 5.89 | **2.21** | 1.21 light / 1.20 dark |
| Water 59 | **3.92** | **3.34** | 1.20 / 1.07 |
| Wading & Shorebirds 28 | **3.78** | **3.35** | 1.24 / 1.15 |

AA needs 4.5:1. Two of three fail in light, **all three fail in dark**, and the
worst-case pixels are near 1:1 — the letter strokes crossing a bright wing or a
dark branch simply are not there.

**Root cause:** `src/components/BubbleCluster.astro:166-175`. `.bubble__label--in`
is placed at `top: 50%` over the clump, and its only protection is
`text-shadow: 0 0 4px/10px/18px var(--paper)`. A text-shadow is a *blur*, not a
plate: it spreads the paper colour thinly and is overwhelmed by photographic
detail. It is also self-defeating in dark, where `--paper` is #131311 — a dark
glow drawn around cream text over a bright photo. The count is worse still: it
is `var(--t)`, a mid-chroma type colour, measured at 2.28–3.60:1 even over plain
paper (`groups` low-contrast scan).

**Which bubbles get it:** `src/pages/groups.astro:52,66` —
`inside: Math.sqrt(count / 109) >= 0.36`, i.e. any group with ≥ 15 birds, which
is exactly Perching, Water and Wading & Shorebirds. There is no free space in
the middle of those bubbles because the disc packing is a sunflower spiral
(`groupsView.ts:387-400`) that fills the centre first.

**Suggested fixes, strongest first:**
1. Give the inside label a real plate:
   `background: color-mix(in srgb, var(--paper) 86%, transparent);
   padding: 0.15em 0.5em; border-radius: 2px; backdrop-filter: blur(3px);`
   and drop the text-shadow. A 4-line change, fixes light and dark at once.
2. Or clear a hole for the label in the sunflower packing (skip the first *k*
   spiral positions in `groupsView.ts`) and fill it with paper.
3. Or put every label outside with a 1 px `--rule` leader line back to its
   bubble, which also fixes §5.3 and gives all nine bubbles one treatment.

Whatever is chosen, make the count `var(--ink-soft)` rather than `var(--t)`, or
keep `var(--t)` only as the dot and not the digits.

### 5.2 Two of nine bubbles are below the fold — [BUG] minor
At 1440×900: `docH` 1027 vs viewport 900. Raptors (`bottom: 924`) and
Doves & Pigeons (`bottom: 924`) are clipped, with no scroll cue and nothing
below them, so the page looks finished when it is not. The stage itself is
`.gstage { aspect-ratio: 1000/620; max-width: min(100%, 104vh) }`
(`groups.astro:331-338`) = 936×580 at this window, and bubbles overflow it
slightly.
**Fix:** cap the stage at `max-height: calc(100vh - <headBottom> - 2rem)` and
let `aspect-ratio` follow, or shrink the head on this page.

### 5.3 Small-bubble labels run off the left edge at phone width — [BUG] minor
At 430 px: `.bubble__label` at `left: -3` (its `.bubble__name` at `-2`); at
360 px: `-9` and `-8`. "Swifts & Hummingbirds" loses its first characters —
visible in `shots/430-light-groups.png`.
**Root cause:** `BubbleCluster.astro:138-146` — the label is
`position: absolute; left: 50%; transform: translateX(-50%); width: max-content`
with no clamp against the stage, and the stage runs to the page edge at phone
width.
**Fix:** clamp with `left: clamp(<halfLabel>, 50%, calc(100% - <halfLabel>))`, or
switch the outer labels to `text-align` toward the inside of the stage.

### 5.4 The bubble stage does not share the page's gutter — [BUG] minor
`.gstage` sits at `left: 245`, `right: 259` at 1440 while `.page__head` sits at
86. The bubbles then cluster within `[299,1149]`, so the composition drifts
right of the title by ~210 px and the whole left third of the page below the
lede is empty. It is an artefact of `max-width: min(100%, 104vh)` centring, not
a decision.
**Fix:** left-align the stage to the gutter, or centre it on the page and let it
use the full `100% - 2 * var(--gutter)`.

### 5.5 Nothing tells you the bubbles are links — [TASTE] polish
Hovering a bubble scales its discs 6 % (`.bubble:hover .bubble__disc`) but the
label does not change and the cursor is the only other cue. Every other view
underlines or inks-up on hover. One consistent hover convention across the five
views would help (see §7.2).

---

## `/groups/<slug>` — one group

### 6.0 The bird grid has no gutter — [BUG] blocker
**Where:** all nine group pages, every viewport ≥ 360, both themes.
**Screen:** `shots/1440-light-group.png` — the first column is visibly sliced by
the window edge and "Alder Flycatcher" is cut off.

**Measured** at 1440×900:

| block on the page | left | right |
|---|---|---|
| `.page__head` | 86 | (86) |
| `.chips` | **86** | 86 |
| `.count` | **86** | 86 |
| `.grid` (the birds) | **0** | **0** |
| `.others` | **86** | 86 |

**Root cause, exactly:** `src/pages/groups/[slug].astro` sets
`padding-inline: var(--gutter)` for `.chips, .count, .grid, .others` at
**line 190**, and then at **line 247** the later, more specific `.grid` rule
resets `padding: 0;` (there to kill the `<ul>` default indent). The shorthand
wins because it comes later, and takes the inline padding with it.

**Fix:** in the `.grid` rule at line 242-249, change `padding: 0;` to
`padding-block: 0;` — one word. (Or delete the line and add
`margin: 1.6rem 0 0` / `list-style: none` only.)

**Worth doing at the same time:** `src/styles/global.css:190` gives `.page` no
horizontal padding, so every block inside every view has to remember the gutter
on its own. That is why this is easy to break. Consider
`.page > :where(*) { padding-inline: var(--gutter); }` with an explicit
`.bleed { padding-inline: 0 }` opt-out for the full-bleed stages.

### 6.1 Filtering by a tag reflows the whole grid — [BUG] minor
Clicking a tag chip on `/groups/perching` produced **CLS 0.394** (sources:
thumbnails moving from x=1263 to x=0 and back). `/list` search input produced
0.235, `/list` type chip 0.076. Some reflow is inherent to filtering an
auto-fill grid — but 0.39 is the whole grid re-flowing under a click near the
top of the page, which is jarring on a long list.
**Mitigations:** keep the grid's column count fixed while filtering
(`grid-template-columns` already is `auto-fill`, so this is stable — the shift
comes from *cells* moving, not columns); animate the reorder with
`view-transition-name` per cell, or at minimum scroll the grid's top into view
so the movement happens where the eye already is.
**Not a bug:** sorting on `/list` measured **CLS 0**, and opening the bird panel
measured **CLS 0** on every view. Those two are clean.

### 6.2 Thumbnails scroll under the compass — [BUG] minor
At 1440 the first grid cell is `[0,658]–[176,864]` and "Apapane" is at
`[0,845]–[176,864]`, both inside the compass box. At 430/360 the same happens
to whichever cell lands there. With the §6.0 gutter fix the cell moves to x=86,
which reduces but does not remove the overlap — the compass still reaches to
x=134 with its halo. See §7.1.

### 6.3 `Specialists` (3 birds) is nearly an empty page — [TASTE] minor
`shots/group-specialists.png`: 3 thumbnails in a 7-column grid, 645 px of page,
then a 42 px "other eight" nav. It is honest, but a 3-bird group in a grid sized
for 109 looks like a loading failure. Consider larger plates when
`count <= 6`, and moving the "other eight" nav up.
The tag filter on it works correctly (`#tag-cuckoos`, "1 bird tagged Cuckoos.",
1 cell shown).

---

## `/list` — all

### 7.0 The filter drawer eats a third of the screen — [TASTE] minor
`.cabinet__bar` is `position: sticky; top: 0` above 700 px
(`list.astro:129-137`), correctly disabled on phones. Its stuck height:

| viewport | bar height | % of a 900 px window |
|---|---|---|
| 1440 | 284 | 32 % |
| 1024 | 309 | 34 % |
| 900 | 309 | 34 % |
| 768 | 334 | **37 %** |

`max-height: 72vh` with internal scroll is a sensible guard, but a third of the
window permanently given to filters while browsing 238 photographs is a lot.
Consider collapsing Colours and Tags behind a summary once anything is scrolled,
or letting the whole drawer collapse to a one-line summary on scroll-down.

### 7.1 The first grid cell sits under the compass — [BUG] minor
`[86,616]–[245,875]`, with "Alder Flycatcher" / *Empidonax alnorum* at
`[86,838]–[245,875]`, under the compass box. See §7.1 in *Cross-cutting*.

### 7.2 Collapsed tag chips are 1.63:1 — [BUG] minor
Inside `.facet__chips--tags`, chips render at `opacity: 0.35`, giving
`.chip__label` 1.63:1 and `.chip__n` 1.32:1. If they are meant to be disabled,
they should be `disabled`/`aria-disabled` and visibly so; if they are meant to
be readable, 0.35 is far too low. (Disabled controls are exempt from the
contrast minimum, so this is only a bug if they are live.)

### 7.3 The ghost wall — [TASTE] polish
**Screen:** `shots/list-ghosts.png`. All 43 ghosts render (the
`.cabinet__ghostgrid` is correctly gutter-aligned at 86 px via
`.cabinet__ghosts`'s own padding, so no gutter bug here). But the hairline frames
are `--rule-soft` = `rgba(35,32,27,0.07)`, about 1.06:1 against paper — at a
glance the section reads as a block of floating text rather than 43 empty
plates. The name+genus sits at the top of a 210 px box, leaving ~150 px of blank
inside each frame. Consider `--rule` instead of `--rule-soft` for the ghost
outline, and vertically centring the text in its frame.

### 7.4 A thumbnail means two different things in two different views — [TASTE] minor
`/list` renders `<BirdThumb href={`/birds/${slug}`}>` (`list.astro:73-80`), so
clicking navigates to a full page. `/places/<slug>`, `/groups/<slug>`, `/` and
`/timeline` all open the `<BirdPanel>` overlay instead. The thumbnails look
identical. The comment at `birds/[slug].astro:10` shows both are intentional,
but the user cannot tell which gesture they are about to get. Either make
`/list` open the panel too (and keep `/birds/<slug>` for deep links and
no-JS), or mark the navigating thumbs differently.

---

## `/birds/<slug>`

### 8.1 The frame strip and its caption sit under the compass — [BUG] minor
`.bird__platefoot` "2 frames · iPhone 17 Pro" measures `[86,876]–[257,889]`, and
at 768/430/360 the fact labels "First spotted", "Seen at", "Group", "Filed
under" land there too. Same root cause as §7.1.

### 8.2 The heading breaks the type scale — [TASTE] minor
Every other view's `<h1>` is `.display` at **70.4 px**. `/birds/<slug>` uses
`.bird__name` at **34.4 px** with no `.display` class and no `.lede`. It may be
deliberate — a bird is not a view — but it is the one place where the five-views-
as-one-book rule visibly breaks, and it arrives from `/list` where the type is
twice the size. If it is deliberate, consider giving it its own consistent
"detail page" scale shared with the panel.

### 8.3 The facts column is half empty — [TASTE] polish
`shots/1440-light-bird.png`: `.bird__facts` is 487×325 in a 669 px-tall row, so
roughly 340 px of the right column is blank when a bird has no measurements.
The same shape appears in the panel (`shots/panel-dark.png`): a fixed 1080×499
sheet with the guide column ending after two rows. Consider letting the plate
grow to the row height when the facts are short.

### 8.4 The `-2` duplicate pages read correctly — no finding
`/birds/brown-creeper-2` and `/birds/greater-yellowlegs-2` both render, both
carry the "The field notes hold two cards for this bird — the other one is the
unphotographed record" cross-link, and both are console-clean. This is handled
better than expected; leave it.

### 8.5 `/birds/fish-crow` (spotted, no photograph) — no finding
Renders a hollow frame and a complete field-guide column, 1165 px, clean.

---

## Cross-cutting

### 9.1 The compass covers content on every route — [BUG] major
**Where:** `/`, `/timeline`, `/places` (768, 900), `/places/<slug>`,
`/groups` (430, 360), `/groups/<slug>`, `/list`, `/birds/<slug>` — i.e. all of
them, at most viewports, in both themes.

The compass is `position: fixed; left: clamp(10px,2.2vw,26px);
bottom: clamp(10px,2.2vw,26px); z-index: 45` with a 90×90 grid (78×78 below
760 px) and a `::before` radial paper halo at `inset: -18px`, so it owns
roughly **150×150 px of the bottom-left corner at all times**. Nothing in the
type or spacing scale reserves that space: `--page-bottom` peaks at 56 px and
no view sets a bottom-left inset.

The specific collisions measured, at load position:

| route | what is under it |
|---|---|
| `/` | a clickable bird thumb `[57,713]–[124,780]`, plus two bird names |
| `/places/<slug>` | **the "← the whole map" back link** and the hover hint |
| `/list` | the first grid cell and its caption; at 430/360, filter chips ("Tags", "43", "Ducks & Geese") |
| `/groups/<slug>` | the first grid cell and its caption |
| `/birds/<slug>` | the frame-strip caption; at 360, three `<dt>` labels |
| `/timeline` | the chart itself, plus the hover tip |
| `/groups` at 430/360 | the "Water" bubble and its label |
| `/places` at 768/900 | the map hint / the "Hawaiʻi" inset label |

**Suggested fix, one place:** add a token, e.g.
`--compass-safe: 150px` in `global.css`, and use it as the bottom-left inset
every view respects — `.page { padding-bottom: max(var(--page-bottom), var(--compass-safe)) }`
plus a `padding-left` on the last block, or (cheaper and more robust) give the
last row of each grid a `scroll-margin`/`margin-bottom` of `--compass-safe`.
For `/` and `/timeline`, which are viewport-locked, the layout maths has to know
about the box directly (see §1.2).

### 9.2 `--ink-faint` fails WCAG AA everywhere it is used — [BUG] major
**Measured** (resolved colour over resolved background, at the rendered size):

| theme | colour | on | ratio | required |
|---|---|---|---|---|
| light | `--ink-faint` #a8a093 | `--paper` #faf8f3 | **2.44:1** | 4.5:1 |
| dark | `--ink-faint` #6f6759 | `--paper` #131311 | **3.33:1** | 4.5:1 |

Used for: `.eyebrow` (`global.css:205`), `.meta` (`:229`), every count
(`.chip__n`, `.others__n`, `.tl__n`, `.map-pin__count`, `.bubble__count`),
every date (`.bloom__date`), "No photograph yet" (`.thumb__empty`), all the
hints (`.map-hint`, `.place__hint`, `.tl__hint`), the Chinese gloss, and the
inset map labels. It is also used for **links**: `← All nine groups`
(`groups/[slug].astro`), `← the whole map`, `Where ·`, `Life list ·`,
`The whole cabinet`. Links below 4.5:1 are the sharp end of this.

These are all small sizes (10.9–13.8 px), so none of them qualify for the 3:1
large-text exception.

**Fix:** this is one token. Darken `--ink-faint` to about **#8a8378** in light
(≈4.6:1) and lighten to about **#8c8477** in dark (≈5.0:1). That keeps the
"third voice" clearly quieter than `--ink-soft` (#6b655c, currently ~5.3:1 and
passing) while clearing AA. Where the design really wants a whisper, use
`--ink-faint` for decorative dots and rules only, never for words.

The other colour failures fall out of the same family: type-coloured counts on
paper measure 2.28 (Specialists gold), 2.87 (Doves & Pigeons), 3.10 (Swifts),
3.43 (Perching), 3.54 (Wading), 3.60 (Tree-Climbers) — all below 4.5:1 at
10.9 px. The nine type colours are fine as *marks* (they clear 3:1 as graphics)
but should not carry digits.

### 9.3 No skip link, no `<main>` — [BUG] major
`src/layouts/Base.astro:42-46` renders `<body><slot /><Compass /></body>`. There
is no skip link, no `<main>`, and no landmark other than the compass `<nav>`.
Tab-stop counts before any content: `/` 58 birds, `/timeline` 239, `/list` 355,
`/groups/perching` 141.
**Fix:** in `Base.astro`, wrap the slot in `<main id="main">` and add a
`.sr-only:focus` skip link as the first child of `<body>`. `.sr-only` already
exists in `global.css:141`.

### 9.4 The compass itself is below the graphics-contrast minimum — [BUG] minor
`.compass { opacity: 0.4 }` (`Compass.astro:100`, 0.5 below 760 px) over
`--ink-soft` #6b655c on paper gives an effective #c1bdb7, about **1.7:1** — the
site's only navigation, well under the 3:1 required of a UI graphic. It is a
deliberate aesthetic (`CLAUDE.md`: "40% 不透明度") and it does ink up on hover
and focus, but a first-time visitor has to find a 1.7:1 rose in a corner with no
other navigation on the page. Raising the resting opacity to ~0.62 reaches 3:1
and is still very quiet.

### 9.5 Layout-shift summary — measured, for the fix agents
| interaction | CLS | verdict |
|---|---|---|
| open bird panel (`/list`, `/places/<slug>`, `/groups/<slug>`, `/timeline`) | **0.000** | clean |
| close panel with Esc | **0.000** | clean |
| `/timeline` click a dot | 0.000 *(but 15 px scrollbar reflow — §2.1)* | **bug** |
| `/list` sort (A–Z → First spotted) | **0.000** | clean |
| `/places` level switch (US ↔ Triangle) | **0.000** | clean |
| `/groups` hover a bubble | **0.000** | clean |
| `/list` filter by type chip | 0.076 | acceptable |
| `/list` type in the search field | 0.235 | borderline |
| `/groups/<slug>` click a tag chip | **0.394** | **worth attention (§6.1)** |

### 9.6 Reduced motion is genuinely handled — no finding
With `prefers-reduced-motion: reduce`, `/`, `/groups`, `/timeline` and `/places`
all render a correct static frame with **0 running animations** and no loss of
content or reachability (`shots/rm-home.png`, `shots/rm-groups.png`). The flock
still lays out and still marks `is-ready`. This is better than most sites
manage; the only note is that the *same* legibility problems (§1.1, §5.1) are
present in the static frame, which confirms they are layout problems rather than
motion problems.

### 9.7 Performance is not a problem — no finding
No long tasks recorded on any view. 60 fps sustained on `/` (58 transformed
elements + rAF), `/groups` (idle loop) and `/timeline` (238 SVG dots) over 4-6 s
samples. `/list` holds 60 fps while hard-scrolling 12,808 px with 236 images
(126 decoded at load, the rest lazy). Node counts: `/` 501, `/groups` 404,
`/timeline` 909, `/list` 2,186. Heap 5-6 MB everywhere. The 189 KB of script on
`/list` is the only line item worth a second look, and it is not hurting
anything today.

### 9.8 Console and network are clean — no finding
Zero errors, warnings, exceptions or 4xx on `/`, `/timeline`, `/places`,
`/places/sandy-creek-park`, `/places/miami-beach-fl`, `/places/location`,
`/groups`, `/groups/perching`, `/groups/specialists`, `/list`,
`/birds/brown-creeper`, `/birds/fish-crow`, `/birds/brown-creeper-2`. Four
client-side navigations in sequence (`M`→`T`→`G`→`L` via View Transitions)
also produced nothing. The only 404s in the whole sweep are the deliberate
`/nope-404` probe and `/favicon.ico` on that 404 page (Astro's dev 404 does not
use `Base.astro`, so it never gets the data-URI icon — harmless in dev, worth a
glance at the production 404).

### 9.9 Cross-view consistency — [TASTE], mostly good
**Holding together:** the `--gutter` is the same value on `/list`, `/places`,
`/places/<slug>`, `/timeline`, `/birds/<slug>` at every width tested
(86.4 / 61.4 / 54 / 46.1 / 43.2 / 25.8 / 21.6 px). `.eyebrow` sits at y=63 and
`.display` at y=102 on all six `.page` views. All `<h1>`s are 70.4 px. All
`.lede`s are 16.32 px. That is a real achievement and the audit found no
accidental drift.

**Not holding together:**
* `/groups/<slug>`'s grid (§6.0) and `/groups`'s stage (§5.4) are the two places
  where the gutter breaks.
* `/birds/<slug>`'s heading is half the size of everything else (§8.2).
* A thumbnail opens an overlay on four views and navigates on one (§7.4).
* Back-navigation wears three different shapes: `← All nine groups` (eyebrow
  slot), `← the whole map` (footer of the left column, under the compass),
  `Life list · Tree-Climbers` (breadcrumb), and nothing at all on `/places`.
* Hover conventions differ: underline on `/list`'s captions, disc-scale on
  `/groups`' bubbles, glow-siblings on `/places/<slug>`'s map, grow-to-thumbnail
  on `/timeline`, parallax-lean on `/`. Each is lovely on its own; there is no
  shared "this is interactive" signal.
* The vertical rhythm below the head varies a lot because the legend is inside
  `.tl__head`: content starts at y=242 on `/places`/`/list`/`/groups/<slug>`,
  y=293 on `/groups`, y=309 on `/places/<slug>` and **y=398 on `/timeline`**.

---

## Appendix — files most likely to be touched

| Finding | File:line |
|---|---|
| §6.0 grid gutter | `src/pages/groups/[slug].astro:247` (and `:190`) |
| §2.1 scrollbar jump | `src/lib/panel.ts:216`, `:231`, `:339`, `:347`; fix in `src/styles/global.css` §3 (`html`) |
| §9.2 `--ink-faint` | `src/styles/global.css:28` (light), `:104` (dark) |
| §5.1 in-bubble labels | `src/components/BubbleCluster.astro:166-175`; threshold at `src/pages/groups.astro:52,66` |
| §2.2 timeline budget | `src/components/Timeline.astro:170-178` (head), `:225` (scroller height); `src/lib/timeline.ts:17-22` (viewBox constants) |
| §2.3 dot tab stops | `src/components/Timeline.astro:132` |
| §2.4 hover tip | `src/components/Timeline.astro:394` |
| §1.1 flock hole | `src/pages/index.astro:296` (`.hub` padding); `src/lib/flockView.ts:150` (exclusion), `:161` (arm sweep), `:164` (rOut), `:196` (packing floor); `src/pages/index.astro:91` (sizes) |
| §1.2 flock vs compass | `src/lib/flockView.ts:177` |
| §5.2/§5.4 bubble stage | `src/pages/groups.astro:331-338` |
| §5.3 bubble label clamp | `src/components/BubbleCluster.astro:138-146` |
| §3.1 pin overlap | `src/data/locations.json` (x/y), `src/components/MapPin.astro` (radius), `src/lib/mapView.ts` |
| §3.2 home-patch card | `src/components/MapStage.astro` (`.map-home`) |
| §4.1 back link | `src/pages/places/[slug].astro` (`.place__back`) |
| §7.0 sticky drawer | `src/pages/list.astro:119-137` |
| §9.1 compass safe area | `src/components/Compass.astro:96-101`; token in `src/styles/global.css:85` |
| §9.3 skip link / `<main>` | `src/layouts/Base.astro:42-46` |
| §9.4 compass opacity | `src/components/Compass.astro:100`, `:181` |
| §6.0 follow-up (`.page` has no inline padding) | `src/styles/global.css:190` |
