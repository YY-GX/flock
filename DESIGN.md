# bird_web — DESIGN

Art direction for TODO A2, A3, A4 and a set of new ideas. Written 2026-09-20
from the running dev server (headless Chrome 153 over CDP; 1440×900 and
390×844; light and dark). Implementing agents work from this file. It
proposes; it does not implement. Everything below names the files it touches.

Read `TODO.md` for the task list and its constraints, `src/lib/README.md` for
the component contract. Nothing here needs a new palette, a new font, a nav
bar, or a card border.

---

## 0. Four facts from the data that change the brief

These were measured, not assumed. They drive every recommendation below.

1. **The flock's dates are a spike, not a line.** Of the 58 birds on the home
   page, **34 were first seen in July–August 2025**. Across all 238 birds:
   Jul 2025 = 47, Aug 2025 = 57, May 2026 = 45; 238 birds fall on only **64
   distinct days** (21 on 19 Aug 2025 alone). Any truthful "When" arrangement
   of the flock is a pile in one place. The *scaffold* — axis, ticks, years —
   has to carry the meaning, because the birds cannot.
2. **The home birds are two-thirds local.** 34 of 58 have a Triangle place as
   their first place (10 of them 金玉公寓). A truthful "Where" is one heavy
   clump on North Carolina plus a scatter. That is a fine picture *if the
   coastline is under it*.
3. **The map is dull because it repeats, not because it is deterministic.**
   Under the current rule, Northern Cardinal faces **10** of 37 pins, Bald
   Eagle **6**, White-breasted Nuthatch 3. Three birds cover half the map.
   127 spotted birds with photographs were seen in exactly one place — there
   is no shortage of distinct faces.
4. **The data cannot say which bird was seen first *at a place*.**
   `firstSpotted` is the bird's global first date; `locationIds` is an
   unordered set of every place it was ever seen. "The first bird at Sandy
   Creek" is not knowable — Canada Goose (1 Feb 2025, 10 places) would "win"
   nine pins. Any design that claims a per-place chronology is lying. The
   place-page "trip report" ordering is already an approximation; keep it,
   but do not build more on it.

Measured geometry used below (1440×900, `/`): the hub text block is
x 543–882, y 337–563; the row of four words is y 518–563; eyebrow/title
text itself is narrower, x ≈ 633–792. On `/places` at 1440 the US map
renders 811×576 px; the RTP ring occupies 79.0–85.2% × 45.5–53.3% of it, the
label 82–95% × 85–91%, and the dashed leader is ~200 px long.

---

## 1. TODO A4 — the home morph is illegible (most important)

**Problem in one line.** Hovering a word drags 58 circles 60–66% of the way
toward positions that only mean something against a scaffold that is not
there; the Triangle is drawn as a 30%-wide inset that lies about the map; and
for "When" the truthful answer is a pile.

**Principle.** Birds cannot draw the United States. Paper can. Each hover
must (a) show the *destination view's own scaffold* faintly under the flock,
(b) let the birds *finish* the formation instead of leaning 60% into it, and
(c) whisper one line saying what the arrangement means. All three land
inside 800 ms and are gone 220 ms after the pointer leaves.

### 1.1 Options

| | Option | Verdict |
|---|---|---|
| A | **Ghost scaffold + full formation.** The US coastline (from `us.svg`) fades in under the flock at hairline weight; for "When", an axis with month ticks and the three year numbers draws itself. Birds go to t = 1 at a reduced scale. | **Recommended.** Only option that makes "map" and "timeline" recognisable without reading. |
| B | **Staged motion as a sentence.** Birds first gather to one ball at the hub, then burst to positions. | Rejected as the fix — motion alone still cannot say "America". Keep one element: a *west-to-east / past-to-future stagger* so the formation lays itself down like a line being drawn. Folded into A. |
| C | **Caption only.** One line under the words: "each bird flies to the place it was first seen". | Necessary, insufficient alone. Folded into A as layer 3. |
| D | **Literal preview.** A miniature of the destination page beside the word. | Rejected. It becomes a nav menu with thumbnails and kills the one idea the site has. |

### 1.2 Recommendation — three layers, one timeline

Hover or focus a word → three things happen, in this order:

| t (ms) | Layer | What | Duration / easing |
|---|---|---|---|
| 0 | birds | begin moving to the **full** formation (t = 1), scale per view below; per-bird `transition-delay` = destination order × 4 ms (0–230 ms), west→east for Where, oldest→newest for When, by group index for Which, row-major for All | 820 ms `var(--ease)` (existing) |
| 0 | hub | `.hub > .eyebrow`, `.hub > .display`, `.hub > .hub__stats` fade to opacity **0.35**; the four words stay at full ink | 300 ms `var(--ease)` |
| 80 | ghost | scaffold fades in (Where: opacity 0 → 0.16 light / 0.22 dark; When: axis draws left→right) | 480 ms / 520 ms `var(--ease)` |
| 120 | caption | one italic line fades in under the words | 200 ms |
| 350 | labels | year numbers (When) / nine group names (Which) fade in | 250 ms |
| ≈ 820 | — | everything settled | |

Pointer leaves → caption out 120 ms, ghost out 220 ms (no delay), hub text
back 300 ms, birds home over 1150 ms (existing).

Click → existing behaviour (`apply(view, 1, 520)` then navigate at 360 ms).
The ghost stays up until the view transition takes over; nothing new.

The "lean" concept survives as *scale and faintness*, not as an unfinished
move: the birds are smaller than at rest (0.7×) and the scaffold is a ghost.
It still reads "the flock is about to become this", but now you can tell
what "this" is.

### 1.3 Where — specifics

**Formation box.** Fit the US viewBox aspect (1000/710 = 1.408) *uniformly*
into the stage minus `pad` (56 desktop / 22 phone). Do not stretch (today's
1.45× allowance would make the ghost coastline a fat America). Then place the
box horizontally so that its **38% line sits on the hub's left edge**:

```
bw = min(W − 2·pad, (H − 2·pad) · 1.408)
bh = bw / 1.408
bx = clamp(hubLeft − 0.38 · bw, pad, W − pad − bw)
by = (H − bh) / 2
```

At 1440×900 this gives bw 1109, bh 788, bx 122. Checked against the hub text
(x 633–792 for eyebrow/title, x 566–860 for the stats line):
Denver clump centre (548, 366) r ≈ 58 → right edge 606 < 633 ✓;
Colorado Springs (510, 425) r ≈ 54 → 564 < 566 ✓; RMNP (460, 337) ✓;
North Carolina clump (1035, 448) r ≈ 143 → left edge 892 > 882 ✓ (the word
"All" ends at 882); NYC (1068, 313) ✓; Tampa (984, 686) ✓. The middle of the
country — Kansas — is empty of pins, so the words sit on prairie. If a future
data sync moves a pin into the text, nudge the 0.38 constant, not the data.

**The Triangle is one pin.** Delete the `TRI_SPREAD` inset. Every bird whose
first place is local goes to `mapMeta.spaces.triangle.anchorOnUs`
(82.37%, 49.76%) and is laid out by the existing golden-angle blob + pin
relaxation, exactly like the other places. 34 birds at scale 0.7 make a
clump of radius ≈ 140 px over North Carolina, spilling into the Atlantic.
That is the truth of this record — most of it was seen at home — and with the
coastline under it, it reads as "home" at a glance. Draw the RTP ink ring
under the clump (see ghost below) so the clump and `/places` share a mark.

**Scale.** All birds `s = 0.7` for Where (was 0.8). Uniform: no "near/far"
game inside a map.

**Ghost.** Inline `us.svg?raw` into `index.astro` the way `MapStage.astro`
does (namespace `id="wobble"` → `wobble-home`). Wrap it in
`<div class="ghost ghost--map" aria-hidden="true">` positioned absolutely at
`left: var(--gx); top: var(--gy); width: var(--gw); height: var(--gh)` — four
custom properties `flockView.ts` writes on `#flock` whenever it computes the
formation box (px). Layer order inside `.flock`: ghost (z 0) under
`.flock__field` (z 1) under `.hub-wrap` (z 3). Theme it to a pencil outline
with the SVG's own variables, no edits to the artwork:

```
.ghost--map {
  --map-land: transparent; --map-land2: transparent; --map-town: transparent;
  --map-edge: var(--ink);            /* coastline */
  --map-water: var(--ink-faint);     /* the Great Lakes — the one interior feature people recognise */
  --map-inset: var(--ink);           /* Hawaiʻi / Puerto Rico boxes stay, dashed */
  --map-label: var(--ink);           /* the two 11.5px inset labels stay */
  opacity: 0;
  transition: opacity 220ms var(--ease);
}
.flock[data-form="map"] .ghost--map { opacity: .16; transition: opacity 480ms var(--ease) 80ms; }
@media (prefers-color-scheme: dark) { .flock[data-form="map"] .ghost--map { opacity: .22; } }
```

The `.land-edge` stroke is 2.4 viewBox units → ~2.7 px at 1109 wide; at 16%
ink that is a soft pencil line, and the artwork's second offset outline
(`.land-edge.ghost`) gives the doubled hand-drawn edge for free.

Add one more element to the same ghost layer: the RTP ring, `inkRing(cx, cy,
r)` from `src/lib/mapView.ts` at the anchor, `r = 0.031 · bw`, in its own
`<svg>` so it can have its own opacity (0 → 0.45, same timing as the ghost),
stroke `var(--ink)` 2 px `vector-effect: non-scaling-stroke`, no fill. Same
seed as `/places` (23), so it is literally the same mark.

**Sweep.** Sort the live birds by destination x once per formation (cache
with the formation), and set each `b.el.style.transitionDelay =
`${k · 4}ms`` in `apply()` when a view is held; restore the rank-based delay
(`calc(var(--i) * 2.5ms)`) on release by clearing the inline value. The map
then lays down Seattle first and Boston last: a hand drawing a line.

### 1.4 When — specifics

**Axis.** A horizontal line at `y0`, from `x = pad` to `x = W − pad`, time
mapped linearly from the first to the last `firstSpotted` (index.astro
already computes `first`/`last`/`span`).

```
y0 = min(0.81 · H, H − compassSafePx − 24)      // 729 at H = 900
```

At 900 tall that keeps the swarm's top (see below) 16 px under the row of
words and its bottom 21 px above the paper's edge; the axis passes above the
compass's reach (`H − 134` at desktop) and a Sep-2024 straggler at x ≈ 69 has
its disc bottom at ≈ 754 < 766 ✓.

**The swarm.** Real dates on x, then a *beeswarm*: relax overlapping discs
apart on **y first**, allowing at most ±110 px of x displacement (two months
— the standard beeswarm lie), symmetric about the axis. The July 2025 pile
becomes a lens ~230 wide × ~300 tall centred on x ≈ 627 (at 1440). The 24
stragglers sit alone on the line. Scale:

```
s_when = clamp( 0.5 · sqrt( (y0 − waysBottom − 16) / 150 ), 0.32, 0.5 )
```

= 0.5 at 1440×900; shrinks on short windows (0.32 at 1280×720, where the
swarm must still clear the words). The floor 0.32 leaves a 100 px bird at
32 px — small, but the *shape* is the point here, and the lens over "that
summer" is exactly the story the /timeline climb tells.

**Ghost.** `<svg class="ghost ghost--tl" viewBox="0 0 1000 100"
preserveAspectRatio="none">` positioned at `left: pad; width: W − 2·pad;
top: y0 − 50px; height: 100px` via the same `--g*` properties (write a
second set, `--tx --ty --tw --th`). Inside, all strokes
`vector-effect: non-scaling-stroke`:

- axis: **an HTML hairline, not SVG** — `<div class="ghost__axis">` 1 px
  tall, `background: var(--rule)`, `transform: scaleX(0)` with
  `transform-origin: left`; draw-in via `scaleX(0 → 1)` over 520 ms
  `var(--ease)` delay 80 ms; out: 220 ms back to 0 (it un-draws —
  pleasant). HTML because `pathLength`/dash tricks are unreliable in Safari
  and a scaled hairline is exact everywhere.
- month ticks: 24 `<i>` hairlines 1 px wide below the axis, height 6 px,
  `background: var(--rule-soft)`; January ticks 12 px, `var(--rule)`. Fade
  0 → 1 over 250 ms delay 300 ms. Positioned by `left: calc(t * 100%)` inside
  the same absolutely-positioned strip, so no SVG at all is needed for When.
- year numbers: **HTML**, not SVG, so type stays crisp: three
  `<span class="ghost__year meta">2024 / 2025 / 2026</span>` absolutely
  positioned at the x of each 1 January (2024 at the axis start), 14 px below
  the axis, `var(--ink-faint)`. Fade 0 → 1 over 250 ms delay 350 ms.
- season bands (`--band-*` at half strength via `opacity: .5`): **optional,
  default off.** They rehearse /timeline nicely but colour the bottom of a
  page whose whole point is calm. Try once; if the owner blinks, drop them.
- the cumulative climb curve: **not** drawn — no vertical room above the
  lens. Say so in the code comment so nobody adds it later.

### 1.5 Which and All — small additions

- **Which** already reads (nine clumps on a ring). Add the nine names:
  `<span class="ghost__tag meta">` at each clump centre + blob radius + 8 px,
  text `typeLabel(type)`, `var(--ink-faint)`, fade 250 ms delay 350 ms; and a
  hairline ring per clump (`border: 1px solid var(--rule)`, radius = blob
  + 10 px) fading with the same timing — the bubbles of `/groups`,
  rehearsed. Positions come out of `formation('groups')`; expose them as a
  small array the view can render into nine pre-made spans.
- **All**: nothing. The grid reads.

### 1.6 The caption

Four `<p class="hub__hint">` inside `.hub`, absolutely positioned
`top: calc(100% + 14px)`, `left: 0; right: 0; text-align: center`, so the hub
box does **not** grow (flockView measures the hole off `.hub`). Pure CSS: the
one matching `.flock[data-form="…"] .hub__hint[data-for="…"]` shows.

```
Where → each bird flies to the place it was first seen
When  → each bird lands on the day it was first seen — most of them one summer
Which → nine kinds, sized by how many
All   → all 238, as a cabinet — 43 still empty
```

Style: `font: italic var(--fs-small)/1.3 var(--serif); color: var(--ink-faint);`
no full stop, sentence case, `pointer-events: none`. Fade 0 → 1 over 200 ms
delay 120 ms; out 120 ms. Contrast: `--ink-faint` is 4.88:1 ✓.

### 1.7 States

- **Reduced motion**: today the flock is `flock--still` and never morphs.
  Keep that. No ghost, no swarm. The caption still appears on hover/focus
  (global 0.01 ms transitions make it instant) — the explanation is the part
  that must not depend on motion.
- **Keyboard**: `focus` already calls `hold()`; everything above rides on
  `data-form`, so focus gets the full treatment.
- **Touch / 390 px**: no hover. `pointerenter` fires before `click` on touch,
  so the formation and ghost show for the 360 ms before navigation — fine.
  Below 560 px the hub is nearly the paper's width, so the formation box and
  ghost occupy **the band below the words**: `y` from `waysBottom + 20` to
  `H − compassSafe`, map fitted uniformly into it (≈ 234×166 at 390×844).
  Small, brief, honest.
- **Dark**: ghost 0.22, everything else is tokens.

### 1.8 Files

- `src/pages/index.astro` — ghost layers (inline `us.svg?raw`, ring, axis
  svg, year spans, nine tags), four captions, hub-fade CSS, all timings
  above. Imports: `inkRing` from `../lib/mapView` (build-time safe),
  `typeLabel` from `../lib/flock`.
- `src/lib/flockView.ts` — formation box rule (§1.3), Triangle as one pin
  (delete `TRI_SPREAD` block), `MORPH_T.map = 1`, `MORPH_T.timeline = 1`,
  scales 0.7 / `s_when`, beeswarm, `--gx…--th` custom properties, sweep
  delays, `clear()` skipped for the two t = 1 formations (its hole is the hub
  *box*, far bigger than the text; the boxes above are designed to miss the
  text). Keep `clear()` for Which and All.
- `src/assets/map/us.svg`, `_build-map.py` — untouched.

### 1.9 If only one thing can be done

The caption (§1.6) plus `MORPH_T.map = 1` with the Triangle as one pin. Two
hours, and "baffling" becomes "oh, a map". The ghost is what makes it
beautiful; the caption is what makes it understood.

---

## 2. TODO A2 — the RTP marker

**Problem in one line.** A thin pen loop that does nothing on hover, a
200 px dashed leader running off to a label parked at 88% of the map's
height, and two different names for the same place ("RTP" here, "The
Triangle" on level 2).

### 2.1 What the marker has to say

"This ring is a whole second map. Go in." Three cues do that in this map's
own language: a *circled* region (pen), an *arrow* (the owner's request), and
an **inset box** — the dashed-rounded-rectangle idiom the map already uses
for Hawaiʻi and Puerto Rico. A small box with the Triangle's 18 spots as dots,
joined to the ring by a hand-drawn arrow, is how paper maps say "enlarged
here". Nothing else on the map looks like it, and it is unmistakably not a
photo pin.

### 2.2 Options

| | Option | Verdict |
|---|---|---|
| A | **Ring + arrow + two-line label** in the sea SE of the ring. Hover: the pen redraws the ring, the arrow draws, the label goes to full ink. | Good, cheap. Fixes everything the owner named. |
| B | **Ring + arrow + inset box** with 18 dots (the Triangle's spots at their true relative positions), labelled inside like the other insets. Hover: pen redraws, arrow draws, box goes solid, dots lift. | **Recommended.** Same cost as A plus one rect and 18 circles; says "a region with things in it" instead of a name. |
| C | **Magnifier**: on hover the ring scales 1.6× and reveals the 18 dots inside itself. | Rejected: 50 px is too small for 18 dots, and it leaves the label problem unsolved. |

### 2.3 Recommendation — B, specified

All coordinates are **percent of the US viewBox** (1000 × 710) unless noted;
`px()`/`py()` in `MapStage.astro` convert. Ring centre `homeMarker` =
(82.37, 49.76), ring radius `HOME_RING_R` = 3.1% of width (31 units).

**The ring (rest).** Keep `inkRing()` but make it an *emphatic* circling:
`turn` 1.1 → **1.75** (the pen goes round almost twice; the two passes do
not coincide because of the 5% radius noise), stroke **2.2**, `stroke:
var(--ink)`, opacity **0.8**, round caps. Inside the loop, a wash: a plain
`<circle r = ringR·0.92>` with `fill: var(--ink); fill-opacity: 0.05` —
"this area", the way a highlighter would. Wobble filter unchanged.

**The arrow.** From the ring's rim at 40° below horizontal, to the inset
box's top-left corner region, arrowhead **at the box end, pointing lower
right** — as the owner asked; the sign reads "this → is here, enlarged".
Add to `mapView.ts`:

```ts
/** A pen leader with a slight bow and an open two-stroke head at the end. */
export function inkArrow(x1, y1, x2, y2, seed = 29): { shaft: string; head: string }
```

Shaft: 5 points along the segment, bowed 6 units to the SW at the middle,
jittered ±1.6 with the existing `rng(seed)`, through `catmull(..., false,
0.95)`. Head: two 9-unit strokes at ±28° from the shaft direction, ending at
(x2, y2). Stroke 1.4, `var(--ink-soft)`, round caps, **no dash**. Length
≈ 75 units. Start point: `(824 + 31·1.18·cos 40°, 353 + 31·1.18·sin 40°)`
≈ (852, 381). End point: (866, 400) — 14 units inside the box's top-left
corner so the head tucks in.

**The inset box.** `HOME_INSET = { x: 85.2, y: 55.6, w: 13.0, h: 16.3 }`
(percent; in units: x 852–982, y 395–511). Checked clear of every pin at
rest: Wilmington's disc spans ≈ x 86.2–91.4, y 46.8–52.7 (it stands on a tail
at 88.8, 53.7) → 20 units of air above the box ✓; Silver Springs (80.0, 67.8)
disc right edge ≈ 82.7 ✓; Miami (84.0, 82.4) is below ✓; Puerto Rico's box
ends at x 78.8 ✓. Style, in `MapStage.astro`'s own CSS (do not rely on the
inlined artwork's `<style>` leaking):

```
rect.map-home__box  { fill: var(--paper); fill-opacity: .55; stroke: var(--ink-faint);
                      stroke-width: 1.6; stroke-dasharray: 7 6; stroke-linecap: round; rx: 10;
                      vector-effect: non-scaling-stroke; }
rect.map-home__box--solid { same geometry; stroke: var(--ink); stroke-width: 1.6; opacity: 0; }
```

The 18 dots: the Triangle's 18 `locations.json` x/y (percent of the 1000 ×
870 triangle viewBox) mapped into the box with 10-unit padding
(110 × 95.7 → box interior 110 × 96 ✓ — that is why h is 16.3%, not a rounder
number). `r = 2.2`, `fill: var(--ink-soft)`, opacity 0.7. 金玉公寓 is a 3.4-unit
hollow square, stroke `var(--ink-soft)` 1, matching its house pin. Label
inside, bottom-left, like the other two insets: `<text class="map-home__lbl"
x = 862 y = 504>The Triangle</text>`, `font: 11.5px var(--serif); letter-spacing:
.09em; text-transform: uppercase; fill: var(--ink-faint)`. The count stays
**HTML** (it must not shrink with the map): `.map-home__sub` "18 spots · 84
birds", `var(--fs-micro)` `var(--sans)` `var(--ink-faint)`, right-aligned
under the box at `left: 98.2%; top: 72.8%; transform: translateX(-100%)`.

**One name.** The marker says "The Triangle", like the level-2 bar. Retire
"RTP" from the UI (the TODO can keep calling it that).

**Hit areas** (`<a class="map-home" data-level-to="triangle">` stays
`pointer-events: none` with children opting in): the ring's hit circle at
`r · 1.3` (was 1.05), the box rect, the count. The arrow is not a target.
`cursor: zoom-in` on all three.

### 2.4 Hover / focus-visible

| t (ms) | Part | Change | Duration |
|---|---|---|---|
| 0 | ring ink | the pen **re-traces the loop**: `stroke-dasharray: var(--len) var(--len)`, `stroke-dashoffset` `var(--len)` → 0; opacity → 1. `--len` is the path's length in viewBox units, computed at build by sampling the Catmull polyline in `inkRing()` (return `{ d, length }`) — do not rely on `pathLength`, Safari ignores it | 620 ms `var(--ease)` |
| 0 | ring wash | `fill-opacity` .05 → .12 | 260 ms |
| 180 | arrow | shaft draws (same `--len` dash technique, `inkArrow()` also returns its length), then head fades in at 420 ms | 360 ms / 120 ms |
| 380 | box | `--solid` rect opacity 0 → 1 (dashed becomes solid ink); fill-opacity .55 → .8 | 260 ms |
| 300 + 12·k | dot k | `transform: scale(1.35)` (`transform-box: fill-box; transform-origin: center`), fill → `var(--ink)` | 220 ms each, k = 0…17 |
| 0 | label, count | → `var(--ink)` | 200 ms |

Leave: all transitions run backwards in **240 ms** with no delay; the ring's
dashoffset going 0 → 1 *un-draws* the loop, which is the right feel.
Focus-visible: identical, plus the `--solid` rect at `stroke-width: 2.4` as
the visible focus ring (SVG cannot take `outline`). Touch: tap dives
(existing); no hover state needed. Reduced motion: dash animations are
0.01 ms globally, so states jump — acceptable; do not add exceptions.

### 2.5 Phone (≤ 560 px)

Delete the north slot (`HOME_NARROW_SLOT`, `.leader--narrow`, the `--nx/--ny`
swap). The box stays where it is — at 350 px the map is 350 wide, the box
45 × 40 px: a small speckled box with an arrow, still legible as "inset".
Hide the in-SVG label below 560 (4 px type is noise) and shorten the HTML
count to **"Home"** at 9 px. The arrow is 26 px long there; keep it.

### 2.6 Files

- `src/lib/mapView.ts` — `inkRing` gets a `turn` parameter (default 1.75);
  new `inkArrow()`; new `HOME_INSET`; **delete** `homeMarker.labelX/labelY`
  and `HOME_NARROW_SLOT`; `dodgeObstacles('us')` swaps the two label capsules
  for the box (four corner circles r 3.6 plus a centre one, or a proper
  rect-distance) and a thin corridor for the arrow (three circles r 1.2 along
  it). The dodge is deterministic — pins will shift a little; check Wilmington
  and Miami visually at 1440 and 390.
- `src/components/MapStage.astro` — replace `.map__leader` and the
  `.map-home__text` block with ring wash + arrow + box + dots + label + count;
  all CSS in §2.3–2.4. No script changes (the `data-level-to` handler in
  `places.astro` already covers the whole `<a>`).
- `src/pages/places.astro` — the `.map-hint` copy: "…Click the boxed
  Triangle to go in." Optional.
- `_build-map.py` — untouched; the box is view furniture, not artwork.

---

## 3. TODO A3 — how a place picks its representative bird

**Problem in one line.** Not the rule but its output: three birds face 19
of 37 pins, and nothing about a pin tells you who else is there.

### 3.1 What is and is not buildable

- **Per-visit random**: possible only client-side (static site), with every
  candidate image shipped and a swap before first paint; every reload
  produces a different map, so the map stops being a picture you remember,
  and the pin that flies from `/places` to `/places/<slug>` under the view
  transition would change face mid-flight unless both pages agree. Not
  recommended as the *rest* state.
- **First bird seen here**: **not buildable** (fact 4). Do not promise it.
- **Seasonal**: possible as a *tie-break* (birds first seen in the current
  month first) but with 64 days of data most places have no bird for most
  months. Weak; skip.
- **Deterministic, but no repeats**: cheap, and fixes the actual complaint.
- **Flip-through on hover**: a presentation layer; moderate cost.

### 3.2 Recommendation — three layers, in this order

**Layer 1 — one face per bird, site-wide (build time, small).**
Replace `pickPinBird(list)` with `assignFaces(places)` in `mapView.ts`:

```
score(place, bird) = 3·favourite + 2·(bird seen only at this place)
                   + 1·(photoCount ≥ 5) + photoCount/100      // last term is the tie-break
```

Process places in **ascending** candidate count (Miami Beach, with one bird,
chooses first; Seattle, with 49, last). Each place takes its highest-scoring
bird *not already used*; if every candidate is used (cannot happen with 37
pins and 127 single-place birds, but guard it), fall back to the highest
score. Expected result: 37 different faces; Northern Cardinal on one pin, the
Hawaiian and Colorado pins wearing birds you *cannot* see anywhere else —
which is exactly what a pin should advertise. Both maps and every place page
get the same face for the same place, so the view transition stays honest.

**Layer 2 — the flip-book (hover; medium).**
Each pin carries a **deck** of up to **5 more** birds (after the face):
favourites first, then single-place birds, then by photo count. Hover a pin
and, after a **500 ms** dwell, the disc crossfades to the next bird every
**700 ms** (crossfade 260 ms `var(--ease)`), looping; the label under the pin
grows a second line with the bird's English name in `var(--ink-soft)`:

```
Sandy Creek Park  45
Eastern Bluebird
```

Leave → crossfade back to the face in 260 ms; the second line fades. The
place name and count never move. Focus-visible does the same. Touch does
nothing extra (a tap navigates). Reduced motion: no cycling; hover shows the
face only. `aria-label` stays "Sandy Creek Park — 45 birds"; the deck is
`aria-hidden`.

Cost, honestly: 37 × 5 = 185 extra `<BirdThumb size={diameter} shape="circle"
name={false} opens={false} transition={false}>` at 2× (60–136 px) ≈ 3–6 KB
each as WebP ≈ 0.7–1 MB. Keep them `display: none` until first hover (Chrome
does not fetch `loading="lazy"` images with no box), then show and start
cycling after the 500 ms dwell, which covers the fetch from a warm cache.
`transition={false}` keeps the one-name-per-page rule. Astro transforms the
images, so `prune-originals.mjs` keeps them — but **verify `dist/` image
counts after the build, and build alone** (TODO constraints).

**Layer 3 — the daily face (optional, small once layer 2 exists).**
The rest face rotates through `[face, …deck]` by the day:
`index = (daysSinceEpoch + placeOrdinal) % deck.length`, set by a tiny
synchronous inline script *right after the map markup* (before first paint)
that writes `data-face="k"` on each pin; CSS shows the k-th image. On
client-side navigation, re-run on `astro:page-load` — the view transition
covers the swap. Same for every visitor that day, different tomorrow; the
map and its place pages agree within a day. This is the well-behaved version
of the owner's "random sampling". Say so in the commit message so nobody
"fixes" it back to `Math.random()`.

### 3.3 Files

- `src/lib/mapView.ts` — `assignFaces()`, `deck: Bird[]` on `PlaceView`.
- `src/components/MapPin.astro` — deck markup, crossfade CSS, second label
  line, `data-face`.
- `src/components/MapStage.astro` — the delegated `pointerover/focusin`
  script gains a dwell timer + cycling for `.map-pin`; clear on
  `astro:page-load` and `bird:open` like the glow does.
- `src/pages/places.astro` — `.map-hint`: "Every pin wears one of its birds
  — hover to meet the others."

---

## 4. New ideas

Ranked roughly by how much they change the site. Difficulty: **S** (an
afternoon), **M** (a day or two), **L** (a week). "Coord." = touches a
foundation file listed in `src/lib/README.md` and needs the foundation
owner's agreement.

### I1. Days out — the 64 birding days as chapters · **M**

238 first sightings fall on **64 days**. That is the natural unit of this
record and nothing on the site names it. The big ones are real stories:
19 Aug 2025 (21 birds, Colorado), 22 Aug 2025 (17), 1 May 2026 (13, Cape
May), 6 Dec 2025 (11, Tampa), 11–15 May 2026 (25 over five days, Hawaiʻi).

*Build.* `src/lib/days.ts`: group `timelineBirds` by `firstSpotted`; infer
the day's place as the `locationId` shared by the most of that day's birds,
with a confidence = share (19 Aug 2025: Denver 13/21, Colorado Springs
10/21 → "Colorado"; name the place only when share ≥ 0.6, else "on the
road" / "around home"). Surfaces:
(a) `/timeline` cluster hover: "19 Aug 2025 · Denver · 21 new birds" — this
*is* TODO C6; (b) a static route `/days/<iso>` (64 pages) with the standard
furniture — eyebrow "A day out", display the date, lede the place and count,
a `BirdThumb` grid, the place's `MapStage` with that pin active; (c) the home
stats line gains "· 64 days out"; (d) see I8. Constraints: one `bird-<slug>`
name per page ✓; the compass needs no new point (days hang under When via
the timeline, like `/places/<slug>` hangs under Where). Caveat: the place is
inferred — show the confidence rule in a code comment, and never print a
place under 0.6.

### I2. Trip roads on the US map · **M**

Cluster the 19 travel places by shared or adjacent days (≤ 7 days apart):
Colorado (Denver, Colorado Springs, RMNP · Aug 2025), Florida (Silver
Springs, Tampa · Dec 2025), New England (Boston, Horn Pond, Portland, Parker
River · Jan–Apr 2026), Mid-Atlantic (Cape May, Chincoteague, NYC · Jul 2025 &
May 2026), Hawaiʻi (May 2026), Pacific Northwest (Seattle, US-101 ·
May–Aug 2026). Draw each as a **pencil route**: jittered Catmull-Rom through
its pins in date order (same `rng` + `catmull` as the ring), stroke 1.2
`var(--ink-soft)`, `stroke-dasharray: 2 4`, opacity 0. Hover any pin of a trip
→ its route fades in (220 ms), sibling pins get a `--rule` ring, and a small
`.meta` label sits at the route's midpoint: "Colorado · Aug 2025 · 3 places ·
62 birds". *Build:* `trips` in `mapView.ts` (pure data), paths in
`MapStage.astro` next to `.map__dodge`. Routes must avoid the two inset boxes
and the new Triangle box; single-place trips (Hawaiʻi) draw nothing. Honest
caveat for the label: a revisit that produced no *new* bird is invisible in
this data, so these are "trips that added to the list".

### I3. A bird's own map in the panel · **M, coord.**

The panel lists places as text. Give it a 140 × 100 px ghost US outline (the
same treatment as §1.3) with a dot at each of the bird's places, the Triangle
collapsed to the ink ring. 110 of 238 birds have two or more places; the
10-place Cardinal and 13-place Great Blue Heron get real range maps. *Build:*
`panelData.ts` adds `pts` ("82.4,49.8;12.6,16.2…", ≤ 13 pairs, ≈ 2 KB across
238 birds), `BirdPanel.astro` adds the svg, `panel.ts` fills the dots.
Foundation files → coordinate. Decoration only; no transition names in SVG.

### I4. The record against today · **S**

The site has a real end (8 Aug 2026) and the visitor has a real now. One
client-side line on `/timeline`: a hairline at today if inside the domain,
otherwise at the right edge — "the record ends 8 Aug 2026 · today is 20 Sep
2026 · 43 quiet days". `var(--rule)` line, `.meta` text, no data plumbing.
Noscript shows nothing, which is fine.

### I5. Anniversaries on the home flock · **M**

In September, birds first seen in a September fly closest (size tier 100)
and their hover caption adds "two years ago this month" — the Monk Parakeet
of 7 Sep 2024 is the record's first bird. *Build:* at build time
(`index.astro` reads the build month) it is an afternoon, but stale until the
next sync-build; client-side it means shipping ~30 extra birds hidden and
re-tiering sizes in `flockView.layout()` (sizes come from `dataset`, so it is
feasible). Recommend build-time only if the owner rebuilds at least monthly.

### I6. The half-hour circle · **S**

The lede says "18 within half an hour of home". Draw it: a faint dashed
pencil circle on the Triangle map centred on 金玉公寓, radius ≈ 20 mi
(0.29° lat; scale longitude by cos 35.9°), `.land-edge.ghost` weight, from
`_build-map.py` so it shares the hand. Plus a 10 mi scale bar bottom-left of
the Triangle map (part of TODO B7). Ties the sentence to the picture.

### I7. A colophon at the foot of the cabinet · **S**

1,278 photographs · six cameras: Fujifilm X-T5 with the 70-300 (427) and the
500 (627), Sony A7C II (151), iPhones (73). One `.meta` block after the ghost
wall on `/list`: "1,278 photographs · Fujifilm X-T5 · Sony A7C II · iPhone".
`photos.json` `camera` strings are inconsistent ("iphone 15 Pro Max",
"Fujifilm XT-5 + XF 500") — normalise with a five-entry map. Optional
extension (coord.): the plate's camera as a whisper under the panel image.

### I8. Companions in the panel · **S, coord.**

"Seen the same day, same place: Snowy Egret, Northern Flicker and 18 more."
**216 of 238 birds** have at least one such companion. The panel payload
adds `with` = up to 3 slugs + a count (≈ 40 bytes/bird, ≈ 10 KB); each name
is a `data-bird` trigger, so the panel becomes a chain — one bird leads to
the birds beside it, which is how a birding day felt. Pairs naturally with
I1. Foundation files → coordinate.

### I9. Wanted · **S**

`wishlist` is set on exactly **one** bird today. If the owner marks more in
Notion, the 43 empty frames could show a pencil "wanted" tick (`GhostFrame`
`note` prop) and sort first. Trivial to build; only worth it if the owner
will maintain the field. Ask before building.

### Considered and rejected (so nobody re-derives them)

- **A size shelf** (all birds to scale): `sizeInches` exists for **85 of
  238**. Not buildable as a line-up; at most a panel-only bar for those 85.
- **By genus** in `/list`: 174 genera for 238 birds — almost all singletons.
- **The same bird across seasons**: `photos.json` has no dates.
- **Sound**: no recordings in the data.
- **A sixth compass point** for trips or days: the rose is four points and a
  hub; new views hang under an existing point (days under When, trips under
  Where) or they break the one navigation idea.

---

## 5. Ranking — impact ÷ effort

Impact 1–5 as judged against "memorable, not merely good"; effort S = 1,
M = 2, L = 3. Start at the top of the table, except that **A4 comes first
regardless** because the owner ranked it so.

| # | Item | Impact | Effort | Score | Notes |
|---|---|---|---|---|---|
| 1 | **A4** home morph, full (§1) | 5 | M–L (2.5) | 2.0 | Do first anyway. §1.9 is the two-hour version. |
| 2 | **A3-1** one face per bird (§3.2 L1) | 4 | S | 4.0 | Pure data, no visual risk. |
| 3 | **I8** companions in the panel | 3 | S (coord.) | 3.0 | Needs the foundation owner for ~30 lines. |
| 4 | **A2-A** ring + arrow + label | 3 | S | 3.0 | Fallback if B is too much. |
| 5 | **A2-B** ring + arrow + inset box (§2.3) | 4 | M | 2.0 | Recommended over A. |
| 6 | **I1** days out | 4 | M | 2.0 | Also closes TODO C6. |
| 7 | **I2** trip roads | 4 | M | 2.0 | After A2-B, so routes avoid the new box. |
| 8 | **I4** today line | 2 | S | 2.0 | |
| 9 | **I6** half-hour circle | 2 | S | 2.0 | Fold into B7. |
| 10 | **I7** colophon | 2 | S | 2.0 | |
| 11 | **A3-3** daily face | 2 | S | 2.0 | Only after A3-2. |
| 12 | **A3-2** flip-book | 3 | M | 1.5 | ~1 MB lazy; verify `dist/`. |
| 13 | **I3** bird's own map | 3 | M (coord.) | 1.5 | Reuses the A4 ghost asset. |
| 14 | **I5** anniversaries | 2 | M | 1.0 | Only with monthly rebuilds. |
| 15 | **I9** wanted | 1 | S | 1.0 | Ask the owner first. |

---

## 6. Constraint flags (against the list at the bottom of `TODO.md`)

- **Foundation files.** A4, A2, A3 touch only view-owned files
  (`index.astro`, `flockView.ts`, `mapView.ts`, `MapStage.astro`,
  `MapPin.astro`, `places.astro`). I3, I7-panel and I8 touch
  `panelData.ts` / `BirdPanel.astro` / `panel.ts` — coordinate, do not fork.
- **`prune-originals.mjs`.** A3-2 adds ~185 transformed images; A4 inlines
  an SVG (no raster). After any build: count images in `dist/_astro/` before
  and after, and build **alone**.
- **Contrast floors.** Every new text token here is `--ink-faint` or darker
  (4.88:1 / 5.45:1 ✓). Ghost scaffolds are decoration and exempt, but the
  Which labels and year numbers are text and use `--ink-faint`. The inset
  box's 11.5 px SVG label uses `--ink-faint` fill, not the artwork's
  `.label.sm` at 0.62 opacity.
- **Compass.** The When axis and its stragglers are held above
  `H − compassSafe − 24` (§1.4). The ghost map's Hawaiʻi box starts at x ≈
  160 px at 1440, clear of the compass's 150 px reach; on narrower stages the
  box rule clamps to `pad`, so re-check at 900 px wide.
- **View transitions.** No new `view-transition-name` anywhere; deck images
  pass `transition={false}`; SVG never carries a name.
- **43 hollow frames, 3:4 grid, query-string filters, ~1.3 ms filter.**
  Untouched by everything above.
- **Dev server on 8888.** Nothing here starts or kills it; my Chrome ran on
  9333 and is closed.
- **Dodge is deterministic** but sensitive: A2's new obstacles will move a
  few east-coast pins. Look at Wilmington, Miami and Chincoteague at 1440 and
  390 before calling it done.
- **Dark mode** is tokens throughout; the only literal number is the ghost
  opacity (0.16 / 0.22).
- **Concurrent B1–B3 work.** While this was written, `global.css` gained the
  paper grain (`--grain`, `--paper-ground`), the warm mat (`--paper-sunk`
  #f8f1e0) and the pressed empty slot (`--ghost-fill`, `--ghost-press`), and
  `GhostFrame.astro` adopted them. Nothing above conflicts, but two things
  should be re-checked on the grained ground rather than on the flat token:
  the ghost scaffold's 0.16 opacity (§1.3) and the inset box's 0.55 paper
  fill (§2.3). Both may want +0.02 over grain.

---

## Appendix — what was measured

Screenshots (session scratch, will not survive):
`/private/tmp/claude-501/-Volumes-2tb-ssd-Dropbox/e27b5ca1-f151-4554-b7c6-babe61d802f8/scratchpad/design/shots/` —
`L-home-idle`, `L-home-where`, `L-home-when`, `L-places-idle`,
`L-places-rtp-hover`, `L-places-triangle`, `L-place-sandy-glow`,
`L-timeline`, `L-groups`, `L-list-bottom`, `L-home-390`,
`L-places-390-scrolled`, plus dark-mode twins without the `L-` prefix.

Numbers quoted in the text: hub/ways boxes and first-place split from the
live DOM on `/`; US pin x/y/diameter, ring and label boxes from the live DOM
on `/places`; date histograms, face repetition, single-place birds, 64 days
and their inferred places, camera counts, `sizeInches`/`wishlist` coverage
from `src/data/*.json` with a one-off Node script. Nothing in the repo was
changed except this file.
