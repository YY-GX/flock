# bird_web — DESIGN2

Second art-direction pass. Written 2026-09-20, 22:00–22:40, from the running
dev server on 8888 (headless Chrome 153 over CDP on 9333; 1440×900 and
390×844; light and dark). Four assignments: design "Days out" (I1), design
"pencil trip routes" (I2), design B8 and B9, and review A2/A3/A4 as shipped.

Same rules as `DESIGN.md`: this file proposes, names the files it would
touch, and does not implement. Read `DESIGN.md` §0 first — its four facts
still hold. §0 below adds the facts this pass needed and did not have.

Everything here was measured on the site as it stood at 22:20–22:35. Two of
the three reviewed features (A2, A3 layer 1) landed *during* this pass; the
review says what had landed when.

---

## 0. New facts from the data

Measured with one-off Node scripts over `src/data/*.json` and the live DOM.
Every number below is quoted somewhere later; none is assumed.

1. **A day is placeable only through its single-place birds.** `locationIds`
   is unordered and global (DESIGN.md §0 fact 4), so the only birds that
   *prove* where a day happened are the ones seen at exactly one place. By
   that rule: **41 of the 64 days** have at least one certain place; **8
   more** have exactly one place that every bird of the day shares (a unique
   cover — e.g. 21 Jun 2025, five birds, all of them include Wilmington);
   **1** (9 Jul 2025) has only travel candidates but no unique one; and
   **14 days, 22 birds, cannot be placed at all** — ten of them are one-bird
   days where that bird was later seen elsewhere. Any design that prints a
   place for those 14 is guessing.
2. **Days come in three sizes.** 19 days have one bird, 27 have 2–4, 18 have
   five or more, 4 have ten or more (21, 17, 13, 11). Half the record's
   pages will be very short. The index has to make a one-bird day look
   deliberate, not empty.
3. **Only four journeys are drawable.** Under a rule an implementer can
   defend — certain places only, consecutive days ≤ 7 apart, hop between
   days ≤ 250 mi — the 19 travel places fall into 18 runs, and only **four**
   touch two or more places: Colorado (Colorado Springs, Denver, RMNP · 19–22
   Aug 2025 · 49 birds), Florida (Silver Springs → Tampa · 4–6 Dec 2025 · 19),
   New England (Portland → Parker River → Boston · 7–14 Mar 2026 · 7), and
   Delmarva (Chincoteague + Cape May · 1 May 2026 · 13). Plus one local
   same-day pair (Duke Garden + Sandy Creek Park, 8 Jul 2025, 3 mi). Hawaiʻi
   (5 days, 25 birds) and Seattle (5 days, 14 birds) are one place each — no
   line. The distance rule is what keeps Seattle→Maui (2,646 mi) and Puerto
   Rico→Miami (1,012 mi) off the map; it also happens to prevent any route
   entering an inset box.
4. **Within a day, order is unknowable.** Three of the four Colorado days
   have two certain places; there is no time of day anywhere in the data.
   Same-day segments must be drawn as *undirected*.
5. **On `/timeline` a day is three pixels.** At 1440 the SVG renders at
   0.821× (2.96 px/day). The four Colorado days span 9 px; the five Hawaiʻi
   days 12 px; dot jitter is ±19 px. Days cannot be hovered individually on
   the timeline; *runs* can. The band between the axis (`AXIS_Y` 312) and the
   top of the dot row (356) is 44 viewBox units ≈ 36 px — enough for one
   hairline bracket and one 11 px label, and nothing else.
6. **Every spotted bird has a Chinese name.** 238/238 carry a gloss, 2–7
   characters long (94 are four characters). Only 2 of the 43 unphotographed
   birds have one, so the ghost wall cannot be B8's canvas. The one Latin
   gloss ("Eurasian eagle owl") is on an unspotted bird. Bodoni Moda is
   subset to 110 ASCII glyphs; CJK always falls to the system: macOS has
   Songti SC / STSong / Kaiti SC, Windows SimSun, Android Noto Serif CJK.
7. **The season tokens are marks, not text.** WCAG on the token values,
   light theme, on `--paper`: autumn 3.80:1, winter 3.78:1, spring 3.05:1,
   **summer 2.11:1**. All four pass in dark (6.8–10:1). So in light mode the
   accent may be a hairline or a fill, never a word, and summer may not even
   be a focus ring. The record itself is summer-heavy: 32 of 64 days and 126
   of 238 birds are June–August; 13 birds are autumn.
8. **What actually shipped by 22:35.** A4 (home morph): landed in full
   (`flockView.ts`, `index.astro`, 22:14). A2 (Triangle marker): landed at
   22:18–22:21 (`mapView.ts`, `MapStage.astro`) — the first screenshot caught
   it mid-edit with unstyled black SVG; the settled state is reviewed in §5.
   A3 layer 1 (one face per pin): landed with A2 — 19 distinct faces.
   A3 layer 2 (the hover flip-book): landed at 22:26–22:29 (`MapPin.astro`
   `data-deck`, `.map-pin__deck`, a 500 ms dwell in the `MapStage` script)
   — **after this review's screenshots**, so it is noted but not judged.
   A3 layer 3 (daily face): not landed.

Geometry used below, 1440×900, `/`: hub box x 543–882, y 337–563; the row of
four words ends at y 563; the Where caption spans x 601–824, y 577–594. Ghost
map box `--gx/--gy/--gw/--gh` = 121 / 56 / 1110 / 788; the Triangle anchor
lands at (1035, 448). `/places`: US map 811×576 at (307, 296).

---

## 1. Days out — I1, designed

### 1.1 What a day is

A **day** is one `firstSpotted` date and the birds that carry it. It is the
only unit in the data with a real chronology (the timeline already sorts
by it) and it is what the owners actually did: 64 outings in two years.

A day has: a date; a bird list (unordered within the day); a **place
label** derived by the rule in §0.1; a **run** (the trip it belongs to, if
any, §0.3); a season; and previous/next days. It does *not* have: a time,
an order of birds, a route within the day, or — for 14 days — a place.

Place label rule, in the order tried (put it in one function and one
comment; nothing else on the site may invent a place):

```
certain      = places attested by a single-place bird of the day        → name them all ("Denver and Colorado Springs")
unique cover = no certain place, but exactly one place is in every bird → name it ("Wilmington")
scope only   = no unique cover; every candidate place is travel / local → "on the road" / "around home"
none         = mixed candidates                                        → no place line at all
```

Yields 41 / 8 / 1 / 14. Never print "probably". The lede for a `none` day
says only the count.

### 1.2 The index — `/days`

**Route.** `src/pages/days/index.astro`. Standard furniture: eyebrow
"Birding checklist", display **Days**, lede "64 days out between 7 Sep 2024
and 8 Aug 2026 — 41 of them somewhere we can name." (numbers computed).

**Form: a field-notebook ledger, oldest first, grouped by month.** Not a
calendar grid (a heatmap is a dashboard, and 64 marks in 730 cells is
mostly empty), not cards. One row per day:

```
 19  Denver and Colorado Springs · 21 new birds        ●●●●●●●●●●●● +9
 20  Denver and Colorado Springs · 7                    ●●●●●●●
 21  Rocky Mountain NP · 4                              ●●●●
 22  Denver and Rocky Mountain NP · 17                  ●●●●●●●●●●●● +5
```

Row anatomy, desktop (≥ 900):

- **Day numeral**, left column, 64 px wide: `var(--serif)`, `var(--fs-lg)`
  (1.25rem), `var(--ink)`, `font-variant-numeric: tabular-nums`. Not Bodoni:
  `.display` is one word per page, and 64 Didone numerals would be a
  poster.
- **Month heading** once per month: `.meta`, "AUGUST 2025", `var(--ink-faint)`,
  margin-top `clamp(28px, 4vh, 44px)`, a `--rule-soft` hairline under it.
  Year appears in the heading, not on rows.
- **Place · count**: `var(--serif)` `var(--fs-base)` `var(--ink)` for the place,
  ` · 21 new birds` in `var(--ink-faint)`. On `none` days the row reads
  "1 new bird" only, no dash, no "unknown".
- **Contact strip**, right: up to **12** `<BirdThumb size={36} shape="circle"
  name={false} opens={false} transition />` at 36 px with 6 px gaps (the first
  12 by `TYPE_ORDER` then name — the same in-day order the day page uses),
  then `+9` in `.meta` if there are more. 36 px circles at 2× are ~2 KB WebP
  each; 238 of them ≈ 0.5 MB, lazy. Every bird appears on exactly one day,
  so **every thumb on this page may carry `bird-<slug>`** — click a row and
  its visible birds fly into the day page's grid. This is the one page on
  the site where a full-page transition name set is free.
- **Run bracket**, gutter: consecutive rows belonging to one run (§0.3, incl.
  single-place runs of ≥ 2 days: Hawaiʻi, Seattle 2026, US-101) get a pencil
  bracket in the left margin — a vertical `inkArrow`-style jittered line
  from `mapView.ts` (`catmull`, `rng(seed = day index)`), stroke 1.2
  `var(--ink-soft)`, `vector-effect: non-scaling-stroke`, with a `.meta`
  label rotated `writing-mode: vertical-rl` reading "COLORADO · 4 DAYS". Run
  names: the state or region shared by the run's places, from a nine-entry
  map in `days.ts` (`Colorado`, `Florida`, `New England`, `Delmarva`,
  `Hawaiʻi`, `Seattle`, `Oregon coast`, `Puerto Rico`, `New York`) —
  hand-written, because the data has no region field. Missing name →
  label omitted, bracket kept. This is B5's "hand-drawn vocabulary" doing
  useful work.
- The whole row is one `<a href="/days/2025-08-19">`; hover: the numeral
  and place go `var(--ink)` (they already are) and the row gains a
  `--rule-soft` background over `padding: 10px 12px`, 160 ms. Focus-visible:
  global outline.

Row height ≈ 56 px; 64 rows + 24 month heads ≈ 4,600 px of page. Acceptable
for a ledger; add a `position: sticky` year rail? No — the month headings
scroll past and the compass is the nav. Keep it a page you read.

Phone (390): numeral 48 px column; the strip drops to **6** thumbs at 30 px,
below the place line, not beside it; bracket labels become a `.meta` line
above the run's first row ("Colorado · 4 days"), no rotation. Row ≈ 84 px.

**One-bird days** are 19 rows with a single 36 px circle. That is fine as a
ledger entry — a notebook has short days — as long as the numeral and the
rule of the month keep the rhythm. Do not pad them.

### 1.3 One day — `/days/<yyyy-mm-dd>`

**Route.** `src/pages/days/[date].astro`, `getStaticPaths` over the 64
dates; 64 pages.

**Furniture.**

- eyebrow: `<a href="/days">Days</a> · Colorado, day 1 of 4` (run
  position when in a run; else `· a day out`; `· around home` for local
  certain days). The `Days` link uses the `.place__up` treatment from
  `places/[slug].astro`.
- display: **`formatDate(date)`** → "19 Aug 2025". The one-word rule already
  bends for place names ("Sandy Creek Park", "Denver, CO"); a date in Bodoni's
  figures is the best-looking thing this face can be asked to do. Break
  after the day+month on phone (`text-wrap: balance` handles it).
- lede: "21 new birds · Denver and Colorado Springs" — the place label from
  §1.1; then a second `.place__note`-style line for the run: "The first day
  of a four-day trip · 49 birds in all". For `none` days: "1 new bird ·
  seen at 3 places since" (`locationIds.length`), which is the honest thing
  to say about a Canada Goose.
- season dot (see §4.3): 6 px, `var(--season-summer)`, before the date line.

**Body.** Same two-column body as `places/[slug].astro` (`minmax(300px,38%)
minmax(0,1fr)` at ≥ 900, sticky left). Left: `<MapStage>` of the space that
holds the day's certain places (US if any certain place is travel; else
Triangle; a mixed day — none exist today — takes the US), with **all** the
day's certain places drawn `is-active`. MapStage takes one `activeSlug`; add
`activeSlugs?: string[]` beside it in `MapStage.astro` / `MapPin.astro`
(view-owned; two lines). If the day's run has a route (§2) it is shown in
its held state. For `none` days: no map — a column of paper with the lede is
the truth. Right: the birds as a `bloom` grid (`MapPlaceGrid.astro` markup;
extract the `<ol class="bloom">` into `DayGrid.astro` or give
`MapPlaceGrid` a `birds` prop) ordered by **`TYPE_ORDER` then English name**
— say in a comment that there is no time-of-day, so this is a field-guide
order, not a sighting order. Each tile keeps `data-locs` so hovering a bird
still lights its pins (the MapStage script is delegated on `document` and
needs nothing new).

**Chapter navigation.** Below the grid, a two-cell row:
`← 13 Aug 2025 · 1 bird` and `20 Aug 2025 · 7 birds →`, `.meta` with the
date in `var(--ink)` serif; the first and last days show one cell. Keyboard:
`,` and `.` step days (outside `M T G L`, and only when `!isPanelOpen()`),
announced in a `.sr-only` hint like the timeline's.

**Motion.** Arrival from `/days` — the 12 named thumbs glide into the grid
(view transition), the rest `bloom-in` (existing keyframes, 26 ms stagger,
capped at `--i` 26). Arrival from anywhere else: bloom only. Reduced
motion: `bloom` already has its `animation: none`.

### 1.4 Where days hang, and how they close C6

Days hang under **When**: `viewOf()` in `src/lib/flock.ts` should return
`'timeline'` for `/days` and `/days/*` so the compass marks north. That is
one line in a foundation file — ask, do not fork. Without it days are
unmarked like `/birds/*`, which is survivable.

Entry points, in order of value:

1. **Panel date → day.** `#panel-date` ("19 Aug 2025") becomes
   `<a href="/days/2025-08-19">`. Every bird on the site then leads to its
   day, and the day leads to the birds beside it — I8's "companions" for
   free, one hop away. `BirdPanel.astro` + `panel.ts` are foundation: the
   change is `entry.iso` (10 bytes/bird) in `panelData.ts` and an `href` set
   in `fill()`. Coordinate.
2. **Timeline run brackets — this is C6.** In `Timeline.astro`, for each run
   with ≥ 5 birds (§0.3 rule gives 8 such runs: Colorado, Florida,
   Delmarva, Hawaiʻi, Seattle May–Jun, Boston Feb, US-101, NC Zoo), draw in
   the 44-unit band above the dot row:
   - a hairline bracket at `y = 330`, from `x(firstDay) − 6` to
     `x(lastDay) + 6`, with 6-unit down-ticks at both ends, `var(--rule)`
     stroke 1 non-scaling (a plain path; the pencil wobble at 1 px on a
     0.82× SVG would just look like a blurry line — save the hand for the
     ledger);
   - a `<text>` label centred over it at `y = 324`, `font: 11px var(--sans)`,
     `letter-spacing .12em`, uppercase, `fill: var(--ink-faint)` (4.88:1):
     "COLORADO · 49" — place or region, then count. Runs narrower than the
     label (Boston Feb is 1 day) let the label overhang; two labels closer
     than 90 units alternate `y` 324 / 306 (Hawaiʻi and Seattle May are
     18 px apart at 1440).
   - the whole `<g>` is `<a href="/days/<first day>">` (SVG `<a>` works and
     is focusable); hover: label → `var(--ink)`, bracket → `var(--ink-soft)`,
     160 ms; `cursor: pointer`.
   The hover tip on a dot gains a second line only when the day has ≥ 2
   birds: "one of 21 that day" in the existing `.tip__date` style — so a
   dot still opens the bird, and the bracket opens the day. `Timeline.astro`
   is foundation-owned; the bracket data (`runs`) comes from `days.ts` so the
   foundation edit is markup + 20 lines of CSS. Phone: brackets stay
   (they scale with the SVG); labels hide below 760 px, the same rule the
   `.dot-hit` uses.
3. **Home stats line.** `238 species · 37 places · 64 days` — replace
   "since Sep 2024" (the timeline says when it started). `index.astro`, one
   template string. Do not make the three numbers links; `.meta` at 0.68rem
   is not a target.
4. **Timeline footer.** Beside "scroll sideways": `<a class="meta"
   href="/days">64 days out →</a>`. Foundation file; trivial.

Not an entry point: place pages. A place cannot list "its days" — a bird's
date is not tied to the place (fact 4). Do not add it.

### 1.5 What days cannot say (so nobody builds it later)

- Order within a day. No times → the grid is field-guide order.
- "First bird of the day". Same reason.
- Where a multi-place bird was that day. The day page shows it in the grid
  because its date is the day's; the map lights *all* its places on hover,
  which is honest.
- Revisits with no new bird. Invisible. The lede says "new birds", never
  "birds seen".
- Weather, companions, hours. Not in Notion.

### 1.6 Files

- `src/lib/days.ts` (new, pure data): `days: Day[]` (date, iso, birds,
  certain, label, how, season, run), `runs: Run[]` (days, places, name,
  count), the region-name map, `dayOf(iso)`, `runOf(day)`. Imports
  `timelineBirds`, `locationsById`, `placeById`. ~120 lines.
- `src/pages/days/index.astro`, `src/pages/days/[date].astro` (new).
- `src/components/MapStage.astro`, `MapPin.astro` — `activeSlugs`.
- `src/components/MapPlaceGrid.astro` — accept `birds`/`order` or split
  into `DayGrid.astro`.
- `src/pages/index.astro` — stats line.
- Foundation (coordinate): `flock.ts` `viewOf`; `Timeline.astro` brackets +
  tip line + footer link; `panelData.ts` / `panel.ts` / `BirdPanel.astro`
  date link.
- `prune-originals.mjs`: 64 pages × up to 21 `BirdThumb`s and 238 36-px
  thumbs on the index are all Astro-transformed (hashed names in HTML) —
  safe by the same argument as A3-2, but **count `dist/_astro` images
  before and after** (3,408 at 22:16 tonight) and build alone.

---

## 2. Pencil trip routes — I2, specified

### 2.1 Inference (the whole rule, so it can be argued with)

```
1. dayPlaces(d)  = certain(d) ∪ uniqueCover(d)                    (§1.1; never scope-only)
2. travel days   = days with ≥ 1 travel place in dayPlaces
3. run           = maximal sequence of travel days where, for each consecutive pair,
                     gap ≤ 7 days  AND  min great-circle distance between the two days'
                     place sets ≤ 250 mi
4. route(run)    = run's places, ordered by first day in the run; places sharing a first
                     day are ordered by nearest-neighbour from the previous place
5. draw only if  places ≥ 2  (else the run is a single pin and has no line)
6. segment kind  = 'days'  if its two places have different first days  (dashed, directed by date)
                 = 'same'  if they share a day                            (dotted, undirected)
7. local routes  = same rule on the Triangle map with local places (gap rule irrelevant:
                     one pair exists, Duke Garden + Sandy Creek, 8 Jul 2025)
```

Result today: 4 US routes + 1 Triangle route (§0.3). Colorado has three
`same` segments and zero `days` segments that add information (Denver
appears on 19, 20 and 22 Aug; RMNP on 21 and 22), so it draws as a dotted
triangle — which is the truth: they went back and forth. New England is
three `days` segments, dashed, drawn Portland → Parker River → Boston.
Florida is one `days` segment. Delmarva is one `same` segment.

**Ambiguity, handled by kind, not by hiding.** Dotted means "the same day,
order unknown". The label says "3 places · 4 days" and never "Denver →
Colorado Springs". If a future sync adds a fifth place to a run, the rule
still produces one drawable answer.

Great-circle uses `lat/lng` from `locations.json` (authoritative; x/y are
relaxed). The 250 mi is a driving day; document it as such and keep it a
named constant.

### 2.2 Geometry

Drawn in the map's own viewBox units in a new `<svg class="map__routes">`
inside `.map`, **after** `.map__dodge` and **before** `.map__pins` (under
the discs, over the artwork). Points are the pins' *displayed* tail tips
(`place.x/y` after the dodge — the leader lines already tell the truth
about the displacement; a route to the true point would cross the leader).

Per segment `(A, B)`: 4 intermediate points on the chord at t = .2 .4 .6 .8,
each pushed off the chord by `sin(πt) · 9` units to the **north** side (so a
route bows the way a pen does, and is not mistaken for a leader) plus
jitter ±2.2 units from `rng(seed)`, `seed = 31 + runIndex·7 + segIndex`;
through `catmull(pts, false, 0.9)`. Same `rng`, same `catmull` as the ring —
that is what "the same hand" means here. The segment starts and ends **8
units short** of the tail tips, so the line never touches the pin's tail.

Filter: the ring's `#ring-wobble-<space>` (`feDisplacementMap scale 2.2`),
applied to the whole `<g>`.

Stroke, at rest:

```
.map__routes path        { fill:none; stroke:var(--ink-soft); stroke-width:1.3;
                           stroke-linecap:round; vector-effect:non-scaling-stroke;
                           opacity:.38; transition: opacity 220ms var(--ease); }
.map__routes .seg--days  { stroke-dasharray: 6 4; }
.map__routes .seg--same  { stroke-dasharray: 1.5 3.5; }
```

0.38 over grain reads as a pencil line you have to look for — present,
not shouting; the map's story at rest is still the pins. Dark: `--ink-soft`
is #b0a798 (7.8:1), keep 0.38.

**Direction** for `days` segments: a 5-unit open chevron at the end of the
segment (two 5-unit strokes at ±30°, same `inkArrow` head code with size
5), only on `days` segments, only when held (below). Not at rest — five
arrowheads on the east coast at rest is a diagram.

**Avoidance.** Routes must clear `HOME_INSET` + count rect and the arrow
corridor. Today none comes within 6 units (Delmarva's south end,
Chincoteague at y 36.4 %, is 19 % above the box). Add a build-time check in
`mapView.ts`: sample each route at 24 points; if any sample falls inside
`HOME_INSET` grown by 2 units, push the bow to the *south* side for that
segment and re-check; if it still fails, log a warning and draw it anyway.
Never move pins for a route — the dodge is for pins.

### 2.3 Behaviour

| state | route | sibling pins | label |
|---|---|---|---|
| rest | opacity .38, no heads | — | none |
| hover / focus-visible any pin of the run | **re-traces**: `stroke-dasharray: var(--len) var(--len); stroke-dashoffset: var(--len) → 0` over 480 ms `var(--ease)` from the run's first place; then the dash pattern above returns (swap classes at 480 ms via `transitionend`, or run the trace on a second overlaid path like `.map-home__ink--trace` and leave the base as is — do the second, it is what A2 already does); opacity → .9; heads fade in at 400 ms | other pins of the run get the existing `is-lit` ring with `--glow: var(--ink-soft)` (not a type colour: this glow means "same trip", not "same bird"); the rest of the map does **not** step back to 0.3 — that dimming belongs to the bird glow | fades in at 300 ms |
| leave | 220 ms back, trace un-draws | 240 ms | out 120 ms |
| `/places/<slug>` page whose place is in a run | held state, permanently; label shown | held | shown |
| `/days/<date>` (§1.3) | held for that run | held | shown |
| touch | no hover; the place page shows the held state, which is where a tap goes | | |
| reduced motion | no trace, no heads animating; opacity and label jump (global 0.01 ms) | | |
| ≤ 560 px | routes render (they scale); labels hidden; strokes stay 1.3 px via non-scaling-stroke — at a 350 px map that is fine for a pencil line | | |

`--len` for each segment is returned by `catmull()` (it already measures
length for the ring). The trace path for a run is **one** path: concatenate
segment `d` strings in route order so the pen runs Portland → Boston in one
480 ms stroke.

**Label.** HTML, not SVG, so it keeps its point size: `<span
class="map__route-lbl meta">Colorado · Aug 2025 · 3 places · 49 birds</span>`
absolutely positioned at the run's centroid (percent of the map), offset
`translate(-50%, -100%)` and **−14 px** so it sits above the middle
segment; `background: var(--paper)` padding `.15em .5em` like `.map-pin__label`;
`color: var(--ink-faint)`; `pointer-events: none`; opacity 0 → 1, 200 ms,
delay 300 ms. For the Triangle pair the label is "8 Jul 2025 · 2 places · 7
birds". Month or range: "Aug 2025" for one month, "Mar 2026" idem,
"Dec 2025"; a run crossing months prints "Apr–May 2026" (none today).

The label is the honest caveat's home too: on `/places/<slug>` only, append
" · birds new to the list" as a second `.meta` line under the label. A trip
that added no bird does not exist in this data, and a page is where there
is room to say so once.

### 2.4 Interaction with the existing dodge and pins

Routes are drawn *after* `placesIn(space)` has relaxed the pins, from the
final coordinates, so they follow the pins wherever the dodge puts them.
They add no obstacles to the dodge (a route is a line the pin may sit on;
the 8-unit short-stop keeps it out of the tail). `pointer-events: none` on
the whole `<svg>`: a route never steals a click from a pin, a leader, or
the Triangle marker's hit shapes.

The `is-lit` treatment for "same trip" uses `--glow: var(--ink-soft)`. The
existing script sets `--glow` to a type colour from `data-tkey`; the route
hover sets it to `var(--ink-soft)` instead and adds `map.is-routing` (so the
`:not(.is-lit)` dimming rule can be scoped to `.is-glowing:not(.is-routing)`).
Two lines in the MapStage script, delegated on `pointerover/focusin` over
`.map-pin[data-run]`.

### 2.5 Data and files

- `src/lib/days.ts` (§1.6) owns `runs`; `src/lib/mapView.ts` adds
  `routes(space): Route[]` — `{ run, segments: [{a, b, kind, d, len}],
  traceD, traceLen, centroid: {x, y}, label }` — computed after the dodge,
  memoised per space like `placesIn`. `PlaceView` gains `run: string | null`
  (run id) so `MapPin` can write `data-run`.
- `src/components/MapStage.astro` — the `<svg class="map__routes">`, the
  overlaid trace path, labels, CSS above, script additions; `runSlug?: string`
  prop for the held state (`/places/<slug>` passes its own place's run;
  `/days/<date>` passes the day's).
- `src/components/MapPin.astro` — `data-run`.
- `src/pages/places/[slug].astro`, `src/pages/days/[date].astro` — pass
  `runSlug`.
- `src/assets/map/_build-map.py`, `us.svg`, `triangle.svg` — untouched;
  routes are view furniture computed from the relaxed pins, exactly like the
  ring and the box.
- `prune-originals.mjs` — no images involved.

### 2.6 What it cannot be

- A route through Hawaiʻi or Puerto Rico. Inset pins are fixed in a box at a
  false position; a line to them would draw a lie, and the distance rule
  already excludes them. Say so in the comment on rule 3.
- A directed same-day route. No times.
- A "trips" view on the compass. Four lines is a detail of Where, not a
  sixth point; `DESIGN.md` §4 "rejected" stands.
- Seattle → Oregon coast (222 mi, 13 days apart). The gap rule cuts it; if
  the owner says it was one trip, the fix is data (a `trip` field in
  Notion), not a looser constant.

---

## 3. B8 — the Chinese names as a design element

### 3.1 The idea

A Chinese bird painting carries its inscription *beside* the image, set
vertically, in a brush or Song-style serif — never as a caption under it
in grey sans. Every plate on this site has such a name (fact 6). Treat the
gloss as the plate's **inscription**: a second voice in a second script,
in `--ink-soft`, in a CJK serif, vertical where there is a margin to stand
in and horizontal where there is not. It is never decoration alone — it is
the bird's name in the owners' language, so it stays legible (≥ 4.5:1) and
selectable everywhere it appears.

Rejected: a page-sized watermark. It has nothing to say on pages without a
single bird (`/`, `/places`, `/groups`, `/list`), and on a bird page a
70 %-opacity glyph behind a photograph is a poster trick this paper does
not do. Rejected: the ghost wall — 2 of 43 have a gloss.

### 3.2 One token, one rule

`global.css` (foundation — coordinate; this is the one thing B8 needs from
the foundation):

```
--serif-cjk: "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC",
             "SimSun", "Songti TC", serif;
```

A Song-style face is the CJK counterpart of an old-style Latin serif, which
is what `--serif` is; Bodoni never sees a CJK glyph (it has none, and
`.display` never carries a gloss). `lang="zh-Hans"` on every gloss element,
so browsers pick Simplified glyph forms and hyphenation stays off.

### 3.3 Where, exactly

**a. `/birds/<slug>` — the inscription (the hero of B8).**
`src/pages/birds/[slug].astro`. Move `.bird__gloss` out of `.bird__sub` and
into `.bird__plates`, as the first child of a new two-column row:

```
.bird__plates { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 18px; }
.bird__inscription {
  writing-mode: vertical-rl; text-orientation: upright;
  font: 1.75rem/1 var(--serif-cjk);         /* 28px; a 4-char name is 112px tall */
  letter-spacing: .18em;                    /* vertical: this is the inter-glyph gap */
  color: var(--ink-soft);                   /* 6.84:1 */
  align-self: start; padding-top: 6px;      /* top-aligned with the mat's top edge */
  white-space: nowrap;
}
```

It stands in the right margin of the frame, top-aligned, the way an
inscription sits on a scroll; the fact rows (`.bird__facts`) begin to its
right at ≥ 900, so the column costs 28 px + gap and nothing else. The
7-character glosses (two birds) are 196 px tall — still inside a 300 px
frame. Under 760 px it returns to the `.bird__sub` line, horizontal,
`var(--fs-body)` `var(--serif-cjk)` `var(--ink-soft)`, after the genus.
Reduced motion / hover: none — it is type.

**b. The panel — `BirdPanel.astro` CSS only (foundation; coordinate).**
`.panel__gloss`: `font: var(--fs-lg)/1.2 var(--serif-cjk); letter-spacing:
.12em; color: var(--ink-soft); margin: .35rem 0 0;` — from 0.86rem grey sans
to 1.25rem serif. No vertical setting here: the guide column is a column
of text and the mat's margins vary per photograph.

**c. The cabinet — `/list`.** Pass `gloss` to the plate `BirdThumb` in
`list.astro` and restyle `.thumb__gloss` in `BirdThumb.astro` (foundation;
coordinate) to `font: var(--fs-small)/1.3 var(--serif-cjk); letter-spacing:
.08em; color: var(--ink-soft); margin-top: .1em`. Cost: one 18 px line per
plate in a 3:4 grid that already carries two lines; the rhythm survives
because every spotted bird has one (fact 6) — no ragged cells. Keep it off
`GhostFrame` (already styled; only 2 glosses).

**d. The flock hover name — `index.astro`.** `.fb__name` becomes
"Barred Owl <span lang="zh-Hans">横斑林鸮</span>" with the span in
`var(--serif-cjk)` `var(--ink-soft)` after a hair space. The home is the
one place a visitor meets ten birds in a minute; the bilingual name is the
site's signature and this is where it should first appear.

**e. Day and place pages — the bloom tiles.** Nothing. Four lines under a
132 px tile is too many; the panel opens on click and shows it large.

### 3.4 Checks

- Grain: `--ink-soft` at 28 px on grained paper — measured 6.4:1 on `--paper-sunk`
  by the foundation's own note; the inscription sits on `--paper`, better.
- Fallback: if no CJK serif is installed the stack ends in `serif`, which
  on every OS resolves to a CJK-capable face for CJK codepoints. No layout
  depends on glyph width except the vertical column, whose width is
  `1em` by construction.
- Safari: `writing-mode: vertical-rl` + `text-orientation: upright` are
  supported unprefixed since 10.1.
- The Latin-glossed owl is unspotted and has no `/birds` hero image; if it
  ever gets one, `text-orientation: upright` will stack its letters — add
  `:not([data-latin])` or set `text-orientation: mixed` when the gloss
  matches `/[A-Za-z]/`. One conditional in the template.

---

## 4. B9 — the accent follows the real date

### 4.1 What "accent" may mean here

The site has no accent colour; ink does everything. Fact 7 says the season
tokens cannot be text in light mode and summer cannot even be a UI mark. So
the seasonal accent is confined to **hairlines, small fills and dots** — the
places where ink currently signals *state*: an underline, an active
background, a selected chip. "Amber in September, cold blue in January" is
achieved by every state mark on the page turning that colour, not by
tinting the paper. Do **not** tint `--paper`, `--paper-sunk` or
`--paper-ground`: `--ink-faint` sits at 4.60:1 on the mat with 0.1 to spare
and the grain compensation was tuned to the current base.

### 4.2 Mechanism

`Base.astro` (foundation; coordinate), in `<head>` before the stylesheet:

```html
<script is:inline data-astro-rerun>
  /* the season the visitor is standing in; server-side fallback = build month */
  var m = new Date().getMonth();
  document.documentElement.dataset.season =
    m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
</script>
```

`data-astro-rerun` because ClientRouter re-copies `<html>` attributes from
the new document on every swap, and `<html data-season={buildSeason}>`
rendered server-side so no-JS and the first paint agree with the build
month. Meteorological seasons (Dec–Feb winter), matching `SEASON_OF_MONTH`
in `timeline.ts`. Northern hemisphere only; say so in the comment.

`global.css`:

```
:root { --accent: var(--ink); --accent-band: transparent; }
:root[data-season="spring"] { --accent: var(--season-spring); --accent-band: var(--band-spring); }
:root[data-season="summer"] { --accent: var(--season-summer); --accent-band: var(--band-summer); }
:root[data-season="autumn"] { --accent: var(--season-autumn); --accent-band: var(--band-autumn); }
:root[data-season="winter"] { --accent: var(--season-winter); --accent-band: var(--band-winter); }
```

Dark mode needs nothing: the `--season-*` tokens already switch.

### 4.3 The slots (each currently `--ink` or `--ink-soft`)

| # | slot | file | change | note |
|---|---|---|---|---|
| 1 | `.way::after` — the underline under Where/When/Which/All | `index.astro` | `background: var(--accent)` | 1 px amber under a Bodoni-adjacent serif word: the first thing a September visitor sees change |
| 2 | current compass point background | `Compass.astro` (foundation) | `color-mix(in srgb, var(--accent) 16%, transparent)` (was ink 8 %) | 16 % because the season hues are lighter than ink |
| 3 | selected chips | `ListControls.astro` `.chip[aria-pressed=true]` | `border-bottom-color: var(--accent)`; `.chip--type` keeps `--dot` | |
| 4 | text selection | `global.css` | `::selection { background: color-mix(in srgb, var(--accent) 24%, transparent); }` | site-wide, free |
| 5 | favicon | `Base.astro` | the inline script swaps the data-URI circle fill to the season hex (four literals in the script, the one place a hex is allowed because SVG data-URIs cannot read CSS variables) | the tab dot is amber in September |
| 6 | timeline: the current season's bands | `Timeline.astro` (foundation) | `.bands rect[data-season=<now>] { opacity: 1.3 }` via `:root[data-season="autumn"] .band--autumn { fill-opacity: 1.35 }` — the band you are standing in is a shade deeper | subtle and truthful; the timeline is where the seasons already live |
| 7 | I4's "today" line | `Timeline.astro` | `stroke: var(--accent)` | if I4 is built |
| 8 | GhostFrame hover rule, flock hover ring, `is-lit` glow, active pin | — | **unchanged** | those carry type colour or ink for a reason (a bird, a place); the season must not compete with them |
| 9 | `:focus-visible` outline | — | **unchanged**, `--ink-soft` | summer is 2.11:1; a focus ring must hold 3:1 |

Per-date season marks — the second half of B9, and the half that ties the
colours to content rather than to the clock: a **6 px dot** in the *date's
own* season colour before the date line in the panel (`.panel__date`), on
`/birds/<slug>` (`.bird__date` if present, else the facts row), on the day
page lede (§1.3) and on the `/days` index numeral (a 5 px dot in the
numeral's left gutter). `seasonOfIso()` in `days.ts`; the dot is
`<i class="season-dot" style="--s: var(--season-summer)">` with
`background: var(--s)`. It is a mark (3:1 not required for a 6 px non-text
graphic under WCAG 1.4.11's "part of a picture" reading, but it is beside
text that says the date, so nothing depends on it).

### 4.4 Checks

- Grain: a 1 px `--season-autumn` underline on grained cream reads as a
  coloured pencil line; the 16 % compass fill over grain measured visually
  fine in the token's light value. Re-check spring (3.05:1) at 1 px — if it
  vanishes, `.way::after` may go to 2 px (`height: 2px`) for all seasons.
- Bodoni: the accent never touches `.display`; the `.way` words are `--serif`.
- Reduced motion / touch / 390: no motion involved; all slots exist at 390.
- No-JS: build-month season from the server-rendered attribute.
- The record's own bias: 126 of 238 birds are summer, so per-date dots will
  be mostly `--season-summer` — the weakest colour in light mode (2.11:1).
  Acceptable for a 6 px mark beside a date; not acceptable for anything that
  must be read.

---

## 5. Review of what shipped — A2, A3, A4

Honest version. Where the spec was wrong I say so.

### 5.1 A4 — the home morph (landed in full)

**What worked.**
- The ghost coastline at 0.16 / 0.22 does exactly what §1 promised: "Where"
  reads as a map before the birds have finished moving. The 38 % rule put
  the words on Kansas; the Denver clump (x 440–536) clears the eyebrow
  (633) with room; the sweep west→east is visible.
- The caption is the fix. "each bird flies to the place it was first seen"
  under the word turns a trick into a sentence.
- "Which" is the best of the four: nine hairline rings and nine `.meta`
  names, exactly the bubbles of `/groups` rehearsed. The Raptors and Wading
  rings touch at 1440 — cosmetic.
- The hub fading to 0.35 while a word is held is right; nobody misses the
  masthead while choosing.
- Phone: the map takes the band *above* the words (the implementer found
  the taller band; the spec only said "below"). Better than the spec.

**Where reality disagreed.**
- **The home clump is too big and the ring circles the wrong birds.** The
  spec said 34 home birds at 0.7× make "a clump of radius ≈ 140 px". Measured:
  the clump-fitted ring is **476 px across (r ≈ 205)**, because the favourites
  are 100 px and at 0.7× they are still 70 px discs. At r 205 the ring
  encloses Cape May (185 px from the anchor), Chincoteague, NYC and
  Wilmington — 48 birds sit inside a mark that means "home". It looks
  confident and it is false. The implementer's decision to size the ring to
  the clump was the right reading of the spec; the spec's uniform-scale
  principle was the mistake. **Change:** home-place birds at **0.5×**, travel
  birds at **0.75×** — the clump shrinks to r ≈ 120 (34 discs of 23–50 px,
  golden-angle packing with the existing 10 px air), Cape May stays outside
  by 60 px, and the ring is `max(r_clump + 12, 0.031·bw)`. A smaller bird at
  home is also a true statement: the same bird photographed from a balcony
  is not "bigger" than one seen once in Colorado. Keep the caption.
- **"When" is bottom-heavy.** The axis at 0.81·H (729 px) with the swarm
  hanging 604–888 leaves the top 60 % of the paper empty, and the swarm's
  bottom sits 12 px from the paper's edge. The spec put it there to clear
  the words and the compass. It works; it is not beautiful. Two honest
  options: (a) accept it — the emptiness *is* the record's shape; (b) let
  the lens breathe upward by moving the axis to `0.76·H` and shrinking the
  swarm's downward half (`bot = H − 40`). Recommend (b) plus one thing the
  spec turned off: the four **season bands** (`--band-*` at `opacity .5`)
  under the swarm strip, 100 px tall, so the empty axis is at least a
  calendar. With B9 in place the current season's band is a shade deeper
  and the two features meet.
- The ghost ring's opacity landed at 0.32 not 0.45 — fine, and with the
  clump fix it should go back to 0.45 because it will be a smaller mark.
- `MORPH_T.groups` went to 1 (spec left it at a lean). Correct call: the
  rings only make sense round finished clumps.

### 5.2 A2 — the Triangle marker (landed 22:18–22:21; reviewed settled at 22:30)

**What worked.**
- Option B was right. The dashed inset box with 18 dots in the Atlantic
  reads as "enlarged here" at a glance at 1440 and still reads as *an inset*
  at 390 (a speckled box with "Home" under it). Same idiom as the artwork's
  two boxes, so it looks printed, not added.
- The wash inside the ring at 0.07 (the implementer raised it from 0.05
  for the grain — correct) and the 1.75-turn loop make the ring emphatic
  without being a pin.
- Hover: the re-traced ring, the box going solid, the dots lifting in a
  12 ms stagger — all as specified, all legible in the screenshot, and the
  un-draw on leave is the right feel.
- One name, "The Triangle", everywhere. Count as HTML under the box, right
  aligned, keeps its size. Dark mode reads well.
- The dodge moved the east-coast pins as predicted; Wilmington and Miami
  cleared the box with air. Nothing overlaps.

**Where the spec was wrong.**
- **The arrow is ~24 units long, not "≈ 75".** My own geometry gave the
  start ≈ (852, 381) and the end (866, 400); that is 24 units, ≈ 19 px at
  811 wide, and the head is tucked 5 units under the box's top edge. In the
  settled screenshot it is a faint tick between the ring and the box — the
  one element the owner explicitly asked for is the weakest. The spec was
  internally inconsistent and the implementer built the numbers, not the
  prose. The box cannot move right (it ends at 98.2 %) or down (the count
  would hit Miami). **Change:** start the arrow at the ring's rim at **20°**
  below horizontal (≈ (865, 366)), end at the box's **left edge, 12 units
  below its top** (852, 407), so the shaft runs ≈ 43 units down-left-to-right
  with a visible bow; stroke **1.8**, `var(--ink)` at opacity .7 (not
  `--ink-soft`); head 7 units. If that still reads thin at 1440, an arrow
  is the wrong idiom at this distance and the honest alternative is a
  leader *tick*: the box's dashed border opens for 14 units at its top-left
  and a short pen stroke continues from the ring to that gap.
- The `.map-home__lbl` at 11.5 px SVG type is ~9.5 px on a 1440 screen — at
  the edge; it is fine because the HTML count repeats the meaning.

### 5.3 A3 — one face per pin (layer 1 landed with A2; layer 2 landed at 22:26, unreviewed; layer 3 not landed)

**What worked.** 19 distinct faces, deterministic, both routes agree. The
map now advertises what a place *is*: Common Eider on Boston, Common Murre
on the Oregon coast, White Tern on Hawaiʻi, Pygmy Nuthatch on RMNP,
Frigatebird on Tampa. That is the map the site should have had.

**Where reality disagreed.** The score's `+2 seen only here` surfaces the
rarities — and rarities are often the worst photographs: a swallow, a
frigatebird and a murre are all small silhouettes against white sky, and
the Seattle and Tampa pins went from a blue Bald Eagle to a pale smudge.
The map is more truthful and a little greyer. The old rule was wrong
because it repeated; the new one is right but does not weigh the picture.
**Change:** among candidates with `seenOnlyHere`, require `photoCount ≥ 2`
when any such candidate exists (a bird photographed twice was worth
stopping for), and add `+1` for a favourite-tagged *place-unique* bird —
i.e. keep the assignment, tilt the score toward the photograph. Layer 2
(the hover flip-book) is the real answer to "the face is dull": five more
faces on dwell. It landed as this file was being written (`MapPin.astro`
22:26, `MapStage.astro` 22:29, with the `display:none`-until-armed deck and
the 500 ms dwell from the spec); whoever reviews next should check the
crossfade timing, the second label line, and — per `TODO.md` — the
`dist/_astro` image count after the first build that includes it.

### 5.4 Two things nobody asked about

- The per-place "trip report" order on `/places/<slug>` still puts Canada
  Goose (1 Feb 2025, 10 places) first on Denver's page. Days out (§1) is the
  honest home for chronology; once it exists, the place-page lede could drop
  the date range or say "first bird on the list from here".
- The 22:20 screenshot showed the marker with black fills and both count
  spans visible: the component's `<style>` had not applied. It settled
  within a minute. It is the Dropbox/Vite stale-asset hazard from `TODO.md`,
  not a bug — but implementers should screenshot twice before judging.

---

## 6. Ranking — impact ÷ effort

Impact 1–5 against "memorable, not merely good"; effort S = 1, M = 2,
L = 3. "Coord." needs a foundation owner for the named lines.

| # | item | impact | effort | score | notes |
|---|---|---|---|---|---|
| 1 | **A4 fix** — home birds 0.5×, travel 0.75×, ring from the smaller clump (§5.1) | 4 | S | 4.0 | Two constants and one `max()`. Stops the ring lying. |
| 2 | **B9 slots 1, 3, 4, 5** + `data-season` script (§4) | 3 | S (coord. `Base.astro`, `global.css`) | 3.0 | Ten lines; the site changes with the month. |
| 3 | **B8 a + d** — the inscription on `/birds`, the bilingual flock name (§3.3) | 4 | S (+ `--serif-cjk` token, coord.) | 3.5 | The site's signature, on the two pages that carry it best. |
| 4 | **A2 arrow fix** (§5.2) | 2 | S | 2.0 | Four numbers in `HOME_ARROW`, two CSS values. |
| 5 | **I1 core** — `days.ts`, `/days`, `/days/<date>`, home stats line (§1.2–1.3) | 5 | M | 2.5 | Also the data spine for I2, C6 and I8. |
| 6 | **I1 entry points** — panel date link, timeline brackets (= C6), footer link (§1.4) | 4 | S–M (coord. `Timeline.astro`, `panel*.ts`) | 2.5 | After 5. Brackets close C6. |
| 7 | **I2 routes** (§2) | 4 | M | 2.0 | After 5 (needs `runs`) and after A2 (avoidance). Four lines, drawn well. |
| 8 | **A3 score tilt** (§5.3) | 2 | S | 2.0 | One filter, one term. |
| 9 | **B8 b + c** — panel gloss, cabinet gloss (§3.3) | 3 | S (coord. `BirdPanel`, `BirdThumb`) | 2.0 | |
| 10 | **B9 slots 2, 6, 7** + per-date season dots (§4.3) | 2 | S (coord.) | 2.0 | Slot 6 is the nicest; it waits on the foundation. |
| 11 | **A4 When** — axis to 0.76·H, season bands under the swarm (§5.1) | 2 | S | 2.0 | Try once; drop if the owner blinks, as before. |
| 12 | **A3 layer 2** flip-book (`DESIGN.md` §3.2) | 3 | M | 1.5 | Unchanged advice; verify `dist/` counts. |

Order of work: 1, 3, 2 (an afternoon, all view-owned except two tokens);
then 5 → 6 → 7 as one arc, because they share `days.ts`; the rest as time
allows.

---

## 7. Constraint flags

- **Foundation files.** This pass asks the foundation for: `--serif-cjk`,
  `--accent`/`--accent-band` and `::selection` in `global.css`; the
  `data-season` script and favicon swap in `Base.astro`; `viewOf('/days')`
  in `flock.ts`; brackets, tip line, footer link and band opacity in
  `Timeline.astro`; `iso` + date link in `panelData.ts`/`panel.ts`/
  `BirdPanel.astro`; `.panel__gloss` and `.thumb__gloss` restyles; the
  compass current-point fill. Every one is ≤ 10 lines and listed per
  section. Nothing here forks a component.
- **`prune-originals.mjs`.** I1 adds 64 pages of `BirdThumb`s and a 238-thumb
  index — all transformed by Astro, hashed names appear in HTML, so the
  prune keeps them. I2, B8, B9 add no raster. Still: count `dist/_astro`
  images before and after the first build with `/days` (3,408 tonight),
  build alone, and re-`xattr` `dist` after a clean build.
- **Contrast floors.** All new *text* is `--ink-faint` (4.88:1) or darker:
  bracket labels, route labels, ledger meta, gloss (`--ink-soft`, 6.84:1).
  Season colours are never text and never a focus ring (§4.1). `--ink-faint`
  stays untouched; no ground is tinted.
- **Compass.** `/days` pages are `.page` views and inherit `--page-bottom`;
  the day page's sticky map column must inset its footnotes by
  `--compass-safe` exactly as `places/[slug].astro` does (copy the rule).
  Route labels on `/places` at 1440 are ≥ 300 px from the corner; at 390 they
  are hidden.
- **View transitions.** `/days` index names every thumb `bird-<slug>` —
  legal because each bird has one first date. The day page names its grid
  tiles (one per bird) and passes `transition={false}` to its `MapStage`
  pins? No — `place-<slug>` names are a separate namespace and one map per
  page is fine. Routes and brackets are SVG and never carry a name.
- **43 hollow frames, 3:4 grid, query-string filters, ~1.3 ms filter.** The
  cabinet gloss (§3.3 c) adds one line per plate and no filter logic;
  everything else leaves `/list` alone.
- **Dev server.** Nothing here touches 8888; my Chrome ran on 9333 with its
  own profile in the session scratchpad and is closed with this file.
- **Concurrent edits.** `index.astro`, `flockView.ts`, `mapView.ts` and
  `MapStage.astro` were being edited while this was written; the A4 and A2
  changes in §5 are against the 22:14–22:21 versions. Re-read before
  applying constants.
- **Data honesty.** §1.1's rule and §2.1's rule are the only two places
  allowed to turn `locationIds` into a place-for-a-day. Any future "first
  bird at", "route within a day" or "days at this place" feature is
  unbuildable on this data and should be refused with a pointer to
  `DESIGN.md` §0 fact 4 and this file's §0.1.

---

## Appendix — what was measured

Screenshots (session scratch; will not survive):
`/private/tmp/claude-501/-Volumes-2tb-ssd-Dropbox/e27b5ca1-f151-4554-b7c6-babe61d802f8/scratchpad/d2/shots/` —
`L-home-idle/where/when/which/all`, `D-home-where/when`, `P-home-idle/where/when`,
`L-places-idle` (pre-A2), `L-places-now` (A2 mid-edit, black fills),
`L-places-a2`, `L-places-a2-hover`, `P-places-a2`, `D-places-a2-hover`,
`L-places-triangle`, `L-place-page`, `L-place-denver`, `L-timeline`,
`L-timeline-hover`, `P-timeline`, `L-list-top/bottom`, `L-bird-page`,
`L-groups`, `L-groups-hover`.

Numbers: day/place set-cover and trip runs from `birds.json` +
`locations.json` (`days.mjs`, `trips.mjs`, `rules.mjs` in the same scratch
dir); Where/When formation geometry and the ghost ring's `--rx/--ry/--rd`
from the live DOM with a JS-dispatched `pointerenter` (a CDP mouse move
alone did not hold the formation during `Runtime.evaluate`); timeline
scale and cluster columns from `#axis`'s bounding box; pin faces and
percent positions from `.map-pin__disc`; CJK font availability via
`document.fonts.check`; contrast ratios from the token hex values with the
WCAG 2.x formula. Nothing in the repo was changed except this file.
