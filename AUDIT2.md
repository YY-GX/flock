# bird_web — UI/UX audit, round two

Read-only audit, 2026-09-21. **Nothing in the repo was changed by this pass.**
`AUDIT.md` is the first-round report; every one of its findings has been dealt
with and none of its numbers are current. This file supersedes it as a
statement of fact. Where a first-round finding is now fixed, it is named in
§0 so nobody re-fixes it.

**Method.** Headless Chrome 153 over CDP against the running dev server
(`http://localhost:8888`), on a private port and profile, both now gone.
Fourteen route shapes visited at 1440×900, 1440×700, 1280×800, 900×900,
768×1024, 430×932 and 360×740, in light and dark, with and without
`prefers-reduced-motion`. Layout shift from a `PerformanceObserver` on
`layout-shift` installed via `Page.addScriptToEvaluateOnNewDocument` (so it
catches the first paint), plus before/after geometry snapshots around every
interaction. **Contrast was measured on resolved composited pixels**, not on
tokens: every visible text run was collected with its resolved colour and
inherited opacity, then the page was re-rendered with all glyphs made
transparent and screenshotted, and the mean *and* worst pixel under each run's
box was read back out of that PNG — so every ratio below is against the
grained paper, or against the photograph, whichever is actually there.
Elements inside a closed `<details>` were excluded via `checkVisibility()`;
without that filter Chrome's `content-visibility: hidden` boxes produce 40
spurious failures on `/list`, which is worth knowing before anyone re-runs
this. Accessibility from `Accessibility.getFullAXTree`, not markup.
Frame rates from a self-counting rAF loop plus a `longtask` observer.

**How to read it.** **[BUG]** = measurably broken, contradicts the data,
violates `src/lib/README.md` / `CLAUDE.md`, or fails WCAG AA. **[TASTE]** =
works as built; the design would read better another way.
Severity: **blocker** · **major** · **minor** · **polish**.

**The headline.** The site is in good shape. Performance, layout stability on
interaction, the accessibility tree, the build output and the two themes are
all clean, and several of them are better than anything the first audit
measured. The weak seam is not craft — it is **arithmetic**. Six separate
places now state a number the data does not support, and on this site, whose
whole distinguishing habit is refusing to claim more than it knows, that is
the most serious category of finding there is. Fix those first; most are one
line each.

---

## Top 10 things to fix first

| # | Where | Severity | What |
|---|---|---|---|
| 1 | `/birds/northern-rough-winged-swallow` | **blocker** | The page says **"not yet seen"** and **"Still on the list. Nothing to show yet."** directly above **"First spotted · 9 Jun 2026"** and **"Seen at · Seattle, WA"**. It asserts both halves of a contradiction as fact. `birds/[slug].astro:287,317` |
| 2 | `/list` (3 strings) + its own OG card | major | **"238 birds photographed" is false — 236 are**, and the page renders **45** empty frames while the copy says 43 twice. `scripts/og-cards.mjs` already computes it correctly, so the card on this page says *236/45* while the meta description on the same page says *238/43*. `list.astro:70,77-78,134`; `ListControls.astro:57` |
| 3 | `/days` | major | The lede is a partition that loses a day: **"49 … 14 it cannot" — 49 + 14 = 63, not 64.** Measured on the rendered page: **50** rows print a place, 14 do not. `days.astro:103-104`, `days.ts:163-165` |
| 4 | `/timeline`, 900×900 / 768×1024 / 360×740 | major | The chart auto-scrolls to a spot that holds **5, 7 and 7 dots**. Two thirds of the "When" view's first screen is empty band. One-token fix, verified: **5 → 54, 7 → 41, 7 → 59**. `Timeline.astro:719` |
| 5 | `/places/<slug>`, `/days/<iso>`, all widths, both themes | major | The Triangle map's town names fail AA on the composited pixels: **Durham 2.65:1** light / 2.92:1 dark, Raleigh 3.03 / 3.66, Chapel Hill 3.19 / 3.92 — and they render at **6 CSS px** below 900 px wide. The palette lives inside `us.svg:13` / `triangle.svg:13`, where `global.css` cannot reach it. |
| 6 | `/list`, ≤700 px wide | major | **CLS 0.0748 at 430×932.** The Type facet ships `open` and the script closes it at ~180 ms; `.cab__facets` goes 174 px → 27 px and the whole cabinet jumps **147 px** up. `ListControls.astro:65` |
| 7 | `/groups`, windows shorter than ~880 px | major | **CLS 0.0686 at 1440×700.** `.gstage` is laid out at 732 px and widened to 1252 px at t=84 ms — all nine bubbles and their labels slide 260 px outward on load. The CSS estimate at `groups.astro:433` and `fitStage()` at `:195` do not agree. |
| 8 | `/places`, every view that counts | major | **Seattle is "50 birds"** on the pin, the index row, the place page lede and its meta description, because `mapView.ts:66` builds `birdsByLocation` over all 281 rather than the 238 spotted. Every other view on the site counts 238. |
| 9 | `/list`, `/birds/<slug>` on paper | major | **224 `loading="lazy"` images on the contact sheet and no `beforeprint` handler** anywhere in `src/`. Chrome force-loads them; Safari and Firefox do not. The 16-page deliverable can print blank. `BirdThumb.astro:258`, `birds/[slug].astro:301` |
| 10 | `/`, `/timeline`, `/days` | minor | Three claims the data does not carry: "each bird flies to **the place it was first seen**" (it is `locationIds[0]`, which has no chronology), "most of them **one summer**" (109/238 = 45.8 %, a plurality), and `days.astro:3` calling them "the 64 **mornings** they were actually found on" — which `days.ts:92` explicitly forbids as "a lie about a morning nobody recorded". |

---

## 0. What is verifiably good now — do not churn on this

Measured this pass, not inherited from `AUDIT.md`.

**Zero errors, zero failures.** Fourteen route shapes × {360, 1440} ×
{light, dark} × reduced motion: **0 console errors, 0 exceptions, 0 failed
requests, 0 404s** except the genuine 404 page. The single console line is
Astro's informational "view transition animations are disabled" under reduced
motion.

**Performance is not a concern.** 60.2 / 60.4 / 60.2 / 60.3 / 60.5 / 60.5 fps
on `/`, `/groups`, `/timeline`, `/list` (hard-scrolled), `/places`, `/days`,
and 60.3 fps while dragging the timeline sideways 4800 px. **Zero long tasks
on every one of them.** JS heap peaks at 5 MB.

**Interaction layout shift is zero.** Opening and closing the bird panel on
`/timeline`, `/places/<slug>`, `/groups/<slug>`, `/days/<iso>` and `/`:
**no geometry changes at all** — `scrollbar-gutter: stable` (`global.css:389`)
fully closed the 15 px scrollbar jump that was AUDIT §4b. Also zero on: the
home morph over all four words, map-pin hover, bubble hover, `/list` sort and
`/list` filter. The only load-time shifts are items 6 and 7 above; everything
else measures 0.0000.

**The accessibility tree is clean.** Across ten route shapes:
**0 nested interactive controls** (AUDIT §8's `link > link` is gone),
**0 unnamed controls**, **0 unnamed images**, exactly one `h1` and one `<main>`
per page, and the two skip links are the first two tab stops everywhere.

**The timeline uses a roving tabindex.** 1 of 238 dots carries `tabindex="0"`,
237 carry `-1`. The whole page is **24 tab stops** (AUDIT §8 measured 244).

**Gutters agree.** 86.4 px on the head *and* the content of `/list`,
`/birds/<slug>`, `/groups/<slug>`, `/days`, `/places`, `/places/<slug>`,
`/timeline`. AUDIT §1 — the `/groups/<slug>` grid with no gutter at all — is
gone.

**`/groups` labels are fixed and then some.** The bubble names now sit on
paper chips: **15.29:1 light, 14.97:1 dark** (AUDIT §4 measured 2.21–5.89 with
worst pixels at 1.07). Counts are 4.88 / 5.45. All nine bubbles are above the
fold at 1440×900.

**The home flock reads as a flock.** Three separated arms, real depth-of-field
on the outer ring, and `.hub` is now 340×225 instead of 512×225 — the 172 px
phantom hole in AUDIT §6.2 is closed.

**Reduced motion is correct everywhere.** All six views: `document.getAnimations()`
returns **0 running**, nothing moves across a 1.2 s sample, and the static
frame is attractive on each.

**No horizontal overflow.** `scrollWidth − clientWidth` is −15 (the reserved
gutter) on every view at all seven viewports. The timeline's wide `svg#axis`
is inside its own scroller, as intended.

**`dist/` is clean.** 397/397 pages present; 5,034 root-absolute references
all resolve on disk; **0 referenced-but-missing files, 0 unreferenced images**;
`dist/_astro` is **138 MB of WebP derivatives with zero surviving originals**,
so `prune-originals.mjs` ran and did its job; 397 distinct non-trivial
1200×630 OG cards, each matching its own route; complete favicon set; no
`localhost` and no external host in the output.

**`/places` pin dedup (A3) holds:** 37 pins, **37 distinct photographs**.

**`/list` colophon (I7) is right:** "Photographed on a Fujifilm X-T5 (1,054
frames), a Sony A7C II (151) and an iPhone (73) — 1,278 in all" — all four
numbers check out against `photos.json`.

**The plate viewer (A1) works.** Click zooms to natural pixels and no further
(1200×800 stays 1200×800), the cursor goes `zoom-in` → `grab`, drag pans 1:1,
paging resets zoom and cursor, Left/Right page plates, Esc closes and releases
`documentElement.style.overflow`. Plain wheel correctly declines to zoom until
you are already in (`plateViewer.ts:564-574`) — that is the documented
behaviour, not a bug.

**Copy that is honestly right** — and is the reason the wrong numbers below
stand out: "44 days since the last new bird"; "BY FAMILY — THE DATA KEEPS NO
TIME OF DAY"; "A dotted leg means the two places share a day, and nothing in
this record keeps a time of day, so which came first is not knowable"; "At
this size the map is a drawing — the photographs are 10 to 27 px across. Tap
one if you can; every place is also a line below"; 219 / 19 companions; "The
field notes hold two cards for this bird"; "No measurements for this one in
the field notes yet".

**Contrast, in aggregate.** Of 329 visible text runs measured on composited
pixels at 1440×900, **36 fall below 4.5:1 in light and 18 in dark** — and all
of them belong to the two families named in §3. Everything else, including
every use of `--ink-faint`, clears AA on the grained paper.

---

## 1. Honesty — numbers the data does not support

This is the section that matters. Every item was verified against
`src/data/*.json` and against the rendered page, not against a comment.

### 1.1 `/birds/northern-rough-winged-swallow` contradicts itself on one screen — [BUG], blocker
**Where:** `/birds/northern-rough-winged-swallow`, all viewports, both themes.

**Observed**, in DOM order, inside one 900 px screen:

> … not yet seen
> **Still on the list. Nothing to show yet.**
> …
> First spotted **9 Jun 2026** · Seen at **Seattle, WA** · Group **Perching**

**Root cause.** `src/pages/birds/[slug].astro:287` —
`note={bird.spotted ? 'photograph missing' : 'not yet seen'}` — and `:317`
`Still on the list. Nothing to show yet.` Both key on `bird.spotted`, which is
`false`; the field-marks block keys on the presence of `firstSpotted` and
`locationIds`, which are populated. The Notion record is genuinely
inconsistent (it is item 3 on `TODO.md`'s owner list), but the page presents
both halves as settled fact rather than saying the record disagrees with
itself. Knock-on: the date links to `/days/2026-06-09`, which says "1 new
bird · Seattle, WA" and lists only Ring-necked Duck — the swallow is absent
from the day it claims.

**Fix.** One branch: when `!bird.spotted && bird.firstSpotted`, replace both
strings with something like *"The record disagrees with itself here: this card
is marked unseen, but it carries a date and a place."* That is the honest
sentence, it costs nothing, and it survives the next sync whichever way the
owner resolves it.

### 1.2 "238 birds photographed" — 236 are, and the page shows 45 empty frames while saying 43 — [BUG], major
**Where:** `/list`, all viewports.

**Observed.** Three strings, all rendered:
* `<meta name="description">` → "238 birds photographed, 43 still to find."
* the lede → "238 birds photographed since 2024, and 43 on the list that have not sat still yet."
* the live readout → "238 photographed · 43 still to come"

Counted in the DOM at 1440×900: **238 `.cabinet__cell` + 43 `.ghost` + 2
`.thumb--hollow` inside the photographed grid = 45 empty frames.**

**Root cause.** `shelved` is `rows.filter(r => r.bird.spotted)`
(`src/lib/listView.ts:85`), not "has a photograph". `listView.ts:32` documents
the gap in the same file — *"Has at least one image file on disk. Two spotted
birds do not"* — and computes `hasPhoto` on every row without ever using it for
this count. Fish Crow and the Great Blue Heron record with an empty photo row
are the two. `src/pages/list.astro:70,77-78`, `src/components/ListControls.astro:57`.

**The site already knows.** `scripts/og-cards.mjs:591` computes
`photographed = spotted.filter(b => filesOf(b).length)` = **236**, so the OG
card served for `/list` reads *"236 birds photographed, 45 still to find"* —
the same sentence template, different numbers, on the same page as the meta
description that says 238/43. Same disagreement between `og-cards.mjs:628`
("236 birds photographed since 2024") and `index.astro:94` ("238 species").

**Fix.** Count `r.hasPhoto` in the four `/list` strings, or change the verb to
"recorded". Either way make the page and its own card agree; right now
whichever one a reader sees first is contradicted by the other.

### 1.3 `/days` lede loses a day — [BUG], major
**Where:** `/days`, all viewports.

**Observed.** "64 days out between 7 Sep 2024 and 8 Aug 2026 — **49** of them
somewhere the record can name, **14** it cannot." 49 + 14 = 63. Parsing the
rendered ledger: **50 rows carry a `.row__place`, 14 do not.**

**Root cause.** `src/lib/days.ts:163` counts `placeIds.length > 0` (41
`certain` + 8 `cover` = 49); `:165` counts `certainty === 'none'` (14). The one
`certainty: 'scope'` day — **2025-07-09**, 2 birds — is in neither bucket, yet
`dayWhere()` (`timeline.ts:602`) returns its scope phrase, so its row prints
**"on the road"**. The sentence reads as exhaustive and is not.
`src/pages/days.astro:103-104`. The same arithmetic is duplicated in
`scripts/og-cards.mjs:756-757,771-773`, so the days card carries the gap too,
and `days.astro:19` contradicts the lede three lines above it by saying **50**.

**Fix.** Say all three: *"49 of them somewhere the record can name, one only
as* on the road*, and 14 not at all."* That is both correct and exactly the
register the rest of the site is written in.

### 1.4 Seattle is 50 birds on `/places` and 238 everywhere else — [BUG], major
**Where:** `/places` (index row, pin `aria-label`, pin diameter),
`/places/seattle-wa` (lede + meta description).

**Observed.** `dist/places/seattle-wa/index.html` renders "**50 birds** ·
1 Feb 2025 → 8 Aug 2026"; the index row reads "Seattle, WA 50"; the grid
contains a hollow tile for a bird the rest of the site calls unseen. Computed
from `birds.json`: 50 rows, **49 of them spotted**.

**Root cause.** `src/lib/mapView.ts:66-72` builds `birdsByLocation` over all
281 birds. The 50th is the Northern Rough-winged Swallow from §1.1, the only
unspotted bird that carries a location. Everything downstream inherits it:
`place.count` (`:213`), `place.diameter` / `span` (`:208,:217`),
`MapPin.astro:57`, `places.astro:138`, `places/[slug].astro:58,67`.
`mapView.ts:1944`'s `sharedBirdCount` is unfiltered the same way; it happens
to still give 110 today only because that bird has exactly one location.

**Fix.** Filter on `spotted` in `birdsByLocation`, the same way every other
view does. It changes exactly one number today and makes the map immune to the
next record like it.

### 1.5 The twin note is missing on the one duplicate that most needs it — [BUG], minor
**Where:** `/birds/swainsons-thrush-2`.

**Observed.** `brown-creeper-2`, `greater-yellowlegs-2` and `pied-billed-grebe-2`
all render *"The field notes hold two cards for this bird — the other one is
the unphotographed record."* `swainsons-thrush-2` does not: it renders "not yet
seen / Still on the list. Nothing to show yet." with no explanation, which is
precisely the "reads as a bug" outcome the feature exists to prevent
(`listView.ts:274-277`).

**Root cause.** `twinOf()` (`listView.ts:286-289`) keys on `fold(english)`, and
`fold()` (`:49-55`) does NFD + lowercase but does **not** normalise
apostrophes. The two cards spell the name `Swainson's Thrush` (U+0027) and
`Swainson’s Thrush` (U+2019), so they never match. `panelData.ts:273-278`'s
`slugOf` already strips `['’]`.

**Fix.** Add `.replace(/['’]/g, '')` to `fold()`. One line; also improves the
`/list` search haystack.

### 1.6 The flock's place pick is arbitrary, and the ring says it is proven — [BUG], minor
**Where:** `/`, the "Where" morph.

**Observed.** `index.astro:138` — *"each bird flies to the place it was first
seen"*. `flockView.ts:143-149` resolves the destination as
`places.split(' · ')[0]`, i.e. `locationIds[0]` — Notion relation order, which
carries no chronology at all. **82 of 281 birds** have a raw order that is not
even alphabetical. 48 of the 58 flock birds have *a* local place but only 34
land inside the ring, purely on which id happens to be first. Then
`flockView.ts:945` states the inference as proven: *"everything the ring
encloses really **was first seen in the Triangle**."*

**Fix.** The data cannot support "first", so the copy should not claim it:
*"each bird flies to one of the places it was seen"*, and drop the "really was"
from the comment. Alternatively, restrict the ring to birds whose *only*
location is local, which is provable — and say so.

### 1.7 Three views disagree about what a trip is — [BUG], minor
**Where:** `/timeline`, `/days`.

**Observed.** `Timeline.astro:220` → `aria-label="10 trips"`, 10 brackets
drawn, four of them one-day. `days.ts:125-131` filters `dayCount > 1` → the
ledger draws **6**. Three comments (`days.ts:17-18`, `Timeline.astro:214`,
`timeline.ts:760`) say **nine**, and `days.ts:17-18` specifically promises the
two views share one array *"or the two views would quietly disagree about what
a trip is."* They do disagree: the Delmarva bracket on `/timeline` links to
`/days/2026-05-01`, a day the ledger does not mark as part of any trip.

**Fix.** Pick one rule. If a one-day outing is a trip, the ledger should
bracket it; if it is not, the chart should not. Export the filtered array from
one module and have both import it.

### 1.8 "all 281 … 43 still empty" counts four cards twice — [BUG], minor
`index.astro:144` → *"all 281, as a cabinet — 43 still empty"*;
`list.astro:134-135` → *"43 birds are on the list with nothing to show for
them — seen and not photographed, or only ever read about."*
Only **39 distinct species** have nothing to show; 4 of the 43 are duplicate
cards of birds that are photographed and displayed elsewhere on the same page.
281 is 277 species. And *"seen and not photographed, or only ever read about"*
draws a distinction no field in the data carries.
**Fix.** Either dedupe by English name for these two counts, or say "281
cards" and "43 cards", which is true and is also what the cabinet actually
shows.

### 1.9 "18 within half an hour of home" — [TASTE], minor
`places.astro:94`. The data carries `scope: 'local'` and nothing else — no
distance, no drive time. The 18 include Jordan Lake, Lake Crabtree and Lyon
Farms. It is an editorial claim in the grammar of a measurement, on a site
whose whole point is not doing that. *"18 of them close to home"* costs
nothing and is true.

### 1.10 "most of them one summer" — [TASTE], minor
`index.astro:140`. Summer 2025 holds **109 of 238 = 45.8 %**. A plurality, not
"most". (All summers together are 126, but that is two different summers,
which is not what the line says.) *"nearly half of them in one summer"* is both
truer and more striking.

### 1.11 `/days` breaks its own rule in its own header comment — [TASTE], minor
`days.ts:92-93` is explicit: *"There is no time of day anywhere in this data …
a grid that looked chronological would be a lie about a morning nobody
recorded."* `days.astro:3` then calls them *"the 64 **mornings** they were
actually found on"*, and `panelData.ts:229` says *"a **morning** records
company"*. The two user-facing surfaces that got it right —
`DayGrid.astro:13` and `days/[iso].astro:98` ("the data keeps no time of day")
— are the ones a reader sees, so this is currently only in comments; it is
listed because it is the seam where the next copy edit will get it wrong.

### 1.12 Docstrings that state a false number — [TASTE], polish
Not user-visible, but several are the stated justification for visible
behaviour, and an agent reading them will act on them.

| file:line | claim | actual |
|---|---|---|
| `panelData.ts:231` | Brown Creeper "was found alongside four others" | it was **alone** — one of the 19 solo days |
| `panelData.ts:87-89` | the swallow's day is "a day two spotted birds also share" | **one** (Ring-necked Duck) |
| `Timeline.astro:320` | "Hidden on the **24** days that hold one bird" | **19** |
| `mapView.ts:233` | "37 pins and **127** single-place birds" | **129** |
| `flockView.ts:715` | "**34** of these 58 birds were first seen in July or August 2025" | **41** |
| `BirdThumb.astro:15` | "**43** birds have no photograph" | the component renders **45** hollow — it keys on `firstPhotoFile`, not `spotted` |
| `listView.ts:179` | `photoFiles` "Empty for **44** of the 281" | **45** |
| `days.ts:55` | "**Nine** bands, 64 lookups" | `seasonBands()` returns **8** |
| `days.ts:125` | "**Nine** runs come back" | 10, then 6 after the filter |
| `timeline.ts:624-626` | "16 runs, of which 9 … Florida 16 … New England 5 and 7" | 18 raw, **10** above threshold, Florida **19**, and it is Boston 5 + New England 7, with **Wilmington 5 missing from the list** |
| `groups/[slug].astro:5` | "the **63** tags in Notion finally surface" | 43 exist in the data; 63 is the unused schema-option count `CLAUDE.md:48` warns against |
| `birds/[slug].astro:147` | "measurements for about **150** of the 281" | `sizeInches` on **126** |
| `CLAUDE.md:150` vs `:43` | "Triangle 17 个" vs "Triangle 本地 18 个" | **18** |

---

## 2. Layout shift

Everything not listed here measured **0.0000**, including all five panel
open/close paths and all four hover morphs.

### 2.1 `/list` jumps 147 px on every load below 700 px wide — [BUG], major
**Where:** `/list`, 430×932 (and any width ≤700 px). Both themes.
**Measured:** **CLS 0.0748**, one shift at t=175 ms.

Sampling the geometry every 40 ms:

```
t=150ms   .cab__facets  y=409  h=174     .cabinet__grid  y=640
t=182ms   .cab__facets  y=409  h= 27     .cabinet__grid  y=493
```

**Root cause.** `src/components/ListControls.astro:65` ships the Type
disclosure with a literal `open` attribute (`data-wide-open open`), and the
script closes it below 700 px after hydration — the behaviour is documented at
`:17-18` ("the script closes it below 700px"), but it is done *after* first
paint. The whole 238-plate cabinet slides up 147 px in front of the reader.

**Fix.** Decide `open` before paint, not after. Either (a) render it closed and
open it from the existing inline-script slot when the window is wide, or
(b) add a tiny `is:inline` script immediately after the `<details>` — the same
pattern `Base.astro:139` already uses for the season — that removes `open`
when `innerWidth < 700`. Nothing else on the page has this problem.

### 2.2 `/groups` bubbles slide 260 px outward on short windows — [BUG], major
**Where:** `/groups`, 1440×700 (**CLS 0.0686**), 900×900 (0.0259),
768×1024 (0.0234), 1280×800 (0.0202), 1440×900 (0.0088). Both themes.
**Measured:** one shift at t=84 ms —
`div.gstage [346, 296, 732, 260] → [86, 296, 1252, 260]`.

**Root cause.** Two independent sizers that only agree at one window height.
`groups.astro:433` guesses in CSS: `--fit: clamp(260px, calc(100svh - 454px), 640px)`
and `max-width: calc(var(--fit) * 1000 / 355)`. At 1440×700 that is
`clamp(260, 246, 640) = 260` → max-width **732 px**. Then `fitStage()`
(`groups.astro:195-215`) measures the real head, sets `maxWidth: 'none'` and a
measured height, and the stage becomes **1252 px**. Every bubble and every
label moves.

**Fix.** Make the no-JS approximation a *floor* rather than a competing answer:
drop the `max-width` and let `min-height: var(--fit)` plus `aspect-ratio` carry
the no-JS case, so the script only ever changes the height. Or run `fitStage()`
from an inline script before paint. At 1440×900 the two happen to coincide,
which is why this was never seen.

---

## 3. Contrast — measured on composited pixels

All ratios are mean background under the run's own box; `worst` is the worst
single pixel. Light = default; dark = `prefers-color-scheme: dark` emulated.

### 3.1 The Triangle map's town names fail AA, and are 6 px tall below 900 — [BUG], major
**Where:** `/places/<slug>` (all 37) and `/days/<iso>` (all 64). Both themes.

| label | light | worst | dark | worst |
|---|---|---|---|---|
| Durham | **2.65** | 1.98 | **2.92** | 1.77 |
| Raleigh | **3.03** | 2.52 | **3.66** | 2.93 |
| Chapel Hill | **3.19** | 3.19 | **3.92** | 3.92 |
| I-40 | **3.58** | 3.27 | **3.36** | 3.07 |
| Jordan Lake | 4.08 | 3.42 | 4.21 | 3.19 |
| I-85 | 4.20 | 2.95 | 4.42 | 2.79 |
| RTP | 4.17 | 4.10 | — | — |
| Cary / Pittsboro / Hillsborough | 4.37–4.49 | 2.75–3.69 | — | — |

**And they do not scale.** `font-size: 15px` is baked into the SVG, so the
rendered cap height is **9 px at 1440 but 6 px at 900 and at 360** — the map
shrinks, the type shrinks with it, and a 6 px town name at 2.65:1 is not a
label, it is texture.

**Root cause.** The colours are not tokens. `src/assets/map/us.svg:13` and
`triangle.svg:13` (emitted by `_build-map.py:429`) carry their own
`--map-label` / `--map-ink` palette and their own
`@media (prefers-color-scheme: dark)` block, so `global.css` never sees them
and `--ink-faint`'s hard-won 4.88:1 does not apply here. This is the one place
on the site that escapes the "no hex in your view" rule in `README.md §8`.

**Fix.** Darken `--map-label` in `_build-map.py` until the composited ratio on
the land fill clears 4.5:1 (it needs roughly two stops), and give the label
text `font-size: calc(15px * var(--map-label-scale, 1))` or switch it to a
`vector-effect`-style non-scaling size so it does not fall to 6 px. Re-measure
on pixels, not on the token — the land fill is not `--paper`.

### 3.2 The plate counter fails AA — [BUG], minor
**Where:** `/birds/<slug>`, bottom-right of the hero. `p.bird__count` "1 / 2",
10.88 px: **3.49:1 light** (worst pixel 2.45), **4.25:1 dark** (worst 1.42).
It sits directly on the photograph, so the worst pixel is what a reader
actually gets on a light frame.
**Fix.** It already has a plate; give the plate a `--paper` backing the way the
`/groups` bubble labels got one, or move it onto the paper below the mat.

### 3.3 The map's north arrow and scale bar — [BUG], minor
`span.map-furn__lbl` "N", "0", "5 mi", 10.88 px: **3.81:1 light / 3.37:1 dark**.
They are `aria-hidden`, but a scale bar's numerals are text a sighted reader
has to read; 3.8:1 at 10.88 px does not carry it.
**Fix.** `--ink-soft` instead of whatever they are on now, or 12 px.

### 3.4 Timeline furniture sits just under the line — [TASTE], polish
`/timeline`, light: trip-bracket labels "NC ZOO · 6" **4.29:1**, "WILMINGTON · 5"
4.46:1; month ticks Jan/Feb 4.30, Mar–May 4.31, Jun 4.46; season words
4.31–4.46. The bracket labels are real links, so they should clear 4.5; the
ticks and season words are `aria-hidden` scaffolding and are a judgement call.
The cause is the season band tint under them, not the ink — the same ink reads
4.88:1 on bare paper. **Fix:** nudge the bracket label to `--ink-soft`; leave
the scaffolding.

---

## 4. The first screen

### 4.1 `/timeline` opens on five dots — [BUG], major
**Where:** `/timeline`. Worst at 900×900 and 768×1024; also 360×740.
Both themes.

| viewport | scrollLeft | % into the record | dots fully visible |
|---|---|---|---|
| 1440×900 | 1010 | 23.5 % | 24 |
| 1440×700 | 0 | 0 % | 14 |
| 1280×800 | 786 | 23.8 % | 59 |
| **900×900** | 1396 | 28.8 % | **5** |
| **768×1024** | 2226 | 34.8 % | **7** |
| 430×932 | 2506 | 42 % | 52 |
| **360×740** | 1416 | 36.6 % | **7** |

At 900×900 the reader's first sight of "When" is a 433 px-tall chart, two
thirds of it empty band, holding five dots.

**Root cause.** `Timeline.astro:713-720` searches for the leftmost window of
`win` SVG units that contains 18 dots, then at `:719` scrolls to
`start / units − clientWidth * 0.14` — it bleeds 14 % of the window in on the
left **without having reserved it during the search**. When the 18th dot sits
near the right edge of the found window (and it usually does, because the dots
come in day-clusters), the bleed pushes a whole day's cluster off the right.
`xs` is also unsorted, but I checked and that changes nothing here.

**Fix, verified in the page.** Search against `win * 0.86` instead of `win`:

```ts
if (xs[i + want - 1] - xs[i] <= win * 0.86) { start = xs[i]; break; }
```

Measured result: **900×900 → 54 dots** (from 5), **768×1024 → 41** (from 7),
**360×740 → 59** (from 7), 1440×900 and 430×932 unchanged. One factor, no new
code.

### 4.2 The timeline's footer note is a 315 px right-aligned column on a 1440 px page — [TASTE], minor
**Where:** `/timeline`, 1440×900 and 1440×700.
`.tl__foot` (`Timeline.astro:355-366`) pays for the compass with
`padding-left: max(var(--gutter), var(--compass-safe))` = 146 px, and
`.tl__foot-end` (`:368-375`) is `align-items: flex-end; text-align: right`.
The result is a three-line ragged-left block running 146 → 461 px — "64 DAYS
OUT — THE BIGGEST, 19 AUG 2025 / AT DENVER, CO AND COLORADO SPRINGS, / CO,
BROUGHT 21" — with "SCROLL SIDEWAYS" alone under it and **960 px of empty
paper to its right**. The flex row's `justify-content: space-between` is not
separating anything, because the legend above it already wrapped to full
width. At 360 it stacks to five lines and reads fine; this is a desktop-only
problem.
**Fix.** Let the end block share the legend's row properly (give the legend
`flex: 1 1 auto` and the end block a `min-width`), or simply set
`.tl__days { max-width: none }` and let the sentence run on one line — there is
room for all of it.

---

## 5. The compass, and touch

### 5.1 The phone place index runs under the compass — [BUG], minor
**Where:** `/places` at 360×740 and 430×932. Both themes.

The C3 index is 37 full-bleed rows starting at the 20 px gutter; the compass is
fixed at `left: 10px`, 78 px wide plus an 18 px halo, so **every row passes
under the rose as you scroll** and two are under it at any moment. Measured
mid-scroll: "Beaver Marsh Nature Preserve" and "University of North
Carolina…" both intersect. The halo is solid `--paper` for only its inner 58 %
(`Compass.astro:118-124`), so a name under the fade comes out blurred rather
than hidden, which reads as a rendering fault.

Same shape elsewhere, less severely: `/list` at 360 (the "Blue 24" colour chip
and the "TAGS 43" heading), `/days` at 1440 (the "NEW ENGLAND · 3 DAYS" margin
label), `/birds/<slug>` at 1440 (the groups glyph sits **on** the first
contact-strip thumbnail, and "2 FRAMES · IPHONE 17 PRO" starts 18 px to its
right).

**Fix.** The index is the one case worth changing, because it is 37 rows rather
than one: right-align the count column and start the name column at
`var(--compass-safe)` below 760 px — or, cheaper and good everywhere, take the
halo to solid `--paper` out to ~80 % so nothing ever half-shows through it.

### 5.2 "Hover a bird" is unfollowable on the devices that most need it — [BUG], minor
**Where:** `/places/<slug>` and `/days/<iso>` at 360 and 430.
Rendered: *"Hover a bird: 42 of these were seen somewhere else too, and those
pins light up. A ↗ means the rest of that bird's map is on the US map — 30 of
45 here — and follows it to the bird's own page."* On `/days/<iso>`: *"Hover a
bird: 11 of these were seen somewhere else too, and those pins light up."*

A touch device cannot hover, and on `/places/<slug>` this sentence is the
**only** explanation of what the ↗ means — so the instruction and the legend
are lost together. `/places` handles the same problem honestly two routes away
("Tap one if you can; every place is also a line below"), which is the model.
**Fix.** Split the sentence: keep the ↗ explanation unconditional, and put
"Hover a bird…" behind `@media (hover: hover)`.

### 5.3 Map pins stay sub-24 px on the two pages with no list fallback — [TASTE], minor
At 360×740: `/places` has **15 of 37** pins under 24 px (min 12.0) but also has
the index list underneath and says so. `/places/<slug>` and `/days/<iso>` have
**17 pins under 24 px (min 11.2)** and **no list at all** — the only way to
reach a place from a day page is the pin. Also sub-24 at 360: the 30
`.bloom__count` "↗" links on a place page (16.3 px) and the `/list` sort chips
(22.8 px). Inline text links (`← the whole map`, `64 days out`, `← All nine
groups`, 13–17 px) are exempt under WCAG 2.5.8 and are fine.
**Fix.** Give `/places/<slug>` and `/days/<iso>` the same invisible thumb pad
that C3 added on `/places`, or reuse the phone index component on them.

---

## 6. Print

Verified by reading the rules; the block at `global.css:666-1076` is genuinely
careful — the dark `:root` at `:222` is correctly overridden by source order,
shadows are redrawn as real borders, and the compass, panel, filter bar, pager
and zoom button are all hidden. These are the gaps.

### 6.1 224 lazy images and no `beforeprint` — [BUG], major
`dist/list/index.html` ships **224 `loading="lazy"` of 236 `<img>`**
(`BirdThumb.astro:258`), and `grep -r beforeprint src/` returns nothing. Chrome
force-loads lazy images into print preview; Safari and Firefox do not reliably,
and even Chrome can lose the race on 224 fetches. Same on `/birds/<slug>`:
`[slug].astro:301` is `loading={i < 6 ? 'eager' : 'lazy'}` and **61 of 281 birds
have more than 6 frames** (max 24), while `global.css:1027-1030` forces
`.bird__frame img { opacity: 1 !important }` in print — so frames 7+ are made
fully opaque whether or not they ever loaded.
**Fix.** One handler: `addEventListener('beforeprint', …)` that flips every
`img[loading="lazy"]` to eager and awaits `decode()`. The contact-sheet plates
are build-cropped to ≤448 px, so making them eager outright costs bandwidth,
not layout.

### 6.2 The maps print dark from a dark desktop — [BUG], major
`us.svg:13` and `triangle.svg:13` carry their own
`@media (prefers-color-scheme: dark){ .map-root:not([data-map-theme="light"]){…} }`.
The print block only redefines tokens on `:root`, never `--map-*`, and
`.map-root` outranks `:root` anyway. SVG `fill` is not a background graphic, so
it prints. Printing any of the 37 place pages or 64 day pages from a dark
desktop puts a near-black rectangle across ~38 % of the sheet — the exact
failure the print block's own note 1 was written to prevent, one layer down.
**Fix.** Emit a `@media print` override for `--map-*` from `_build-map.py:429`
so both SVGs stay in step.

### 6.3 Smaller print leaks — [BUG], minor
* `.flock` is `position: fixed; inset: 0; overflow: hidden` (`index.astro:299`)
  with no print rule, so `/` prints as one clipped page of 58 overlapping
  birds. The `<noscript>` block at `index.astro:289` already describes the
  static layout that should be used.
* `global.css:932-940` puts the pencil tick box on **every** `.ghost`, and
  `GhostFrame.astro:62` renders `.ghost` on the 43 photograph-less *bird*
  pages too — so a one-page specimen record prints a stray empty tick box.
  Scope it to `.cabinet__ghostcell`.
* `global.css:942` hides `.ghost__note` everywhere. On `/list` the section lede
  explains the wall; on a bird page that note *is* the explanation
  ("Recorded in the field notes, but no photograph made it back.",
  `[slug].astro:315`), and hiding it leaves a blank square. Scope it the same
  way.

---

## 7. Build and output

### 7.1 `og:image` ships relative, so the card does not render on X or LinkedIn — [BUG], major (blocked on a domain)
`astro.config.mjs` has no `site:` and `SITE_URL` is unset, so `abs()`
(`Base.astro:63`) is the identity and all 397 pages emit
`og:image` / `twitter:image` as `/og/…jpg`. Facebook, Slack and Discord resolve
that against the fetched page; **X's card renderer and LinkedIn's inspector do
not.** 397 hand-drawn cards, invisible on the two platforms that need an
absolute URL. `<link rel="canonical">` is relative for the same reason.
`og:url` is correctly omitted rather than asserted wrongly — good call.
**Fix.** One line once a domain exists. Until then
`SITE_URL=https://… npm run build` already works and is worth using for any
staging link somebody might share.

### 7.2 `prune-originals.mjs` still scans all of `dist/` — [BUG], minor
`src/integrations/prune-originals.mjs:39` decides keep-or-delete by literal
substring presence across every text file in `dist`, and it walks the whole
tree — so `dist/og/*.jpg` (397 cards) and the root `*.png` favicons are
deletion candidates today, surviving only because `Base.astro` writes their
literal paths. And anything referenced by concatenation is invisible to it:
`Base.astro:149` builds `'/favicon-' + s + '.svg'`, safe only because `.svg` is
not in `ORIGINAL`. Ship one seasonal favicon as `.png` and it is deleted
silently with a green build.
**Fix.** Restrict the delete pass to `dist/_astro` — originals cannot land
anywhere else — and/or add a keep-list for `og/` and the favicon set.

### 7.3 Dependency and engine floors — [TASTE], minor
`scripts/og-cards.mjs` and `make-icons.mjs` both `import sharp`, and
`"prebuild"` runs on every build, but `sharp` is not in `dependencies` — it
resolves only through Astro's hoist. And `og-cards.mjs` imports `.ts` from
plain Node, which needs Node ≥22.18; `package.json` has no `engines`, so a
contributor on Node 20 gets `ERR_UNKNOWN_FILE_EXTENSION` from `prebuild`
before Astro is reached.

### 7.4 Dead code and a stale order — [TASTE], polish
`scripts/merge-photo-manifests.mjs` is referenced by nothing, and
`src/data/photos-part-{1..4}.json` (74 KB) are read only by it. Delete the five
together or neither. Separately, `src/lib/README.md:61-64` still tells every
incoming agent to remove `redirects: { '/': '/timeline' }` from
`astro.config.mjs` — that line is gone and `src/pages/index.astro` ships; the
blockquote should go with it. `src/data/birds.sample.json` is **not** dead
(`data.ts:2,24`, `Timeline.astro:113`).

---

## 8. Smaller things

* **[TASTE] polish — the day map's route pill says more than the day.**
  `/days/2025-08-19` draws "Colorado · Aug 2025 / 3 places · 49 birds" over a
  page headed "21 new birds · Denver, CO and Colorado Springs, CO". The pill is
  the whole four-day trip; on a one-day page the two numbers invite being read
  as that day's. `routeNote()` (`mapView.ts:1499`) appends "new to the list" on
  place pages but the index/day pill (`:1472`) does not.
* **[TASTE] polish — one place list, two orders.** `placesFor()`
  (`listView.ts:266`) sorts alphabetically for `/birds/<slug>`;
  `panelData.ts:327` uses raw `locationIds` order for the overlay's Places
  line. 82 birds show their places in a different order depending on which
  surface you are on — and `flockView` treats position 0 of the raw order as
  meaningful (§1.6).
* **[TASTE] polish — hardcoded counts that will drift.**
  `places.astro:131` `aria-label="All 37 places, as a list"` and
  `groups/[slug].astro:54` "← All nine groups" are the only two counts on their
  pages not read from the data.
* **[TASTE] polish — `/birds/<slug>` hero alt text.** `[slug].astro:133`
  `heroAlt = \`${english}, photographed\`` restates the caption and describes
  nothing. On a page whose subject is the photograph, a screen-reader user gets
  nothing from it.
* **[TASTE] polish — `/places/location`.** 金玉公寓 slugifies to the literal
  word `location`, the one unreadable URL of 37. Cosmetic, and changing it
  breaks any existing link.
* **[TASTE] polish — a straight apostrophe on `/groups`.** The lede reads
  "its own birds' photographs" with U+0027 where the rest of the site sets
  typographic quotes.
* **[TASTE] polish — `Timeline.astro:92-98`** tallies the legend on the raw
  `b.type` string and then filters `TYPE_ORDER`, bypassing `canonicalType()`.
  Correct today, and exactly the failure mode `README.md §8` is written to
  prevent — an aliased spelling would drop birds from the legend while the
  "238 species" lede above it stayed put.
* **[TASTE] polish — no web manifest.** No `manifest.json` and no
  `<link rel="manifest">`, so Android "add to home screen" falls back to the
  180 px apple icon.

---

## Appendix — the numbers this audit is measured against

Computed from `src/data/*.json` this pass, for whoever checks the next claim.

| | |
|---|---|
| rows in `birds.json` / distinct species | **281 / 277** (4 twin cards) |
| spotted / not spotted | **238 / 43** (39 distinct never-spotted) |
| spotted with **no photograph** | **2** (Fish Crow, Great Blue Heron) |
| unspotted **with** a date | **1** (Northern Rough-winged Swallow, 2026-06-09, Seattle) |
| distinct first-spotted days | **64** · pages built **64** |
| day certainty | certain **41** / cover **8** / scope **1** / none **14** |
| days that print a place | **50** |
| biggest day | 2025-08-19, **21** new birds |
| birds alone on their day / with company | **19 / 219** |
| trips above threshold / multi-day | **10 / 6** |
| locations, local / travel | **37**, 18 / 19 |
| distinct birds at local places | **84** |
| birds in ≥2 locations | **110** |
| photo files / multi-plate birds | **1,278 / 213** (X-T5 1,054 · A7C II 151 · iPhone 73) |
| date range | 2024-09-07 → 2026-08-08 |
| birds in summer 2025 | **109** (45.8 %) |
