# The shared foundation

Everything four of the five views need, and the rules they have to agree on.
Read this plus `CLAUDE.md` and you have the whole contract.

Owned by the foundation — **do not edit these**:

```
src/layouts/Base.astro          src/lib/flock.ts
src/styles/global.css           src/lib/panel.ts
src/components/BirdPanel.astro  src/lib/panelData.ts
src/components/BirdThumb.astro  src/lib/data.ts  (pre-existing)
src/components/Compass.astro    src/lib/images.ts  (pre-existing)
src/components/Timeline.astro   src/lib/timeline.ts (timeline geometry)
src/pages/timeline.astro        src/lib/ink.ts      (the pen)
                                src/lib/paths.ts    (withBase — see §1)
```

**`src/lib/ink.ts` is the one hand.** `rng`, `catmull`, `cubicLength`, `inkLoop`,
`inkRing`, `inkArrow`, `inkPoly`, `inkLine` — every wobbly line on the site comes
from here, and `mapView.ts` re-exports them so existing callers are unchanged.
It lives apart from `mapView.ts` because `mapView.ts` imports `timeline.ts`, so
the timeline could not reach the pen without a fourth copy of it. The geometry
has already drifted once (the site mark was drawn three different ways in three
files); if you need a drawn shape, add a generator here rather than inlining one.

Keep it **erasable TypeScript** — `scripts/og-cards.mjs` imports `timeline.ts`
from bare Node via type stripping, and `timeline.ts` imports `./ink.ts`.

If something you need is missing, say so rather than forking it — a second
palette or a second panel is the one thing that breaks the whole idea.

---

## 1. Routes

The compass is wired to these exact paths. Build your page at yours.

| View | Path | File you own | Key |
|---|---|---|---|
| Home / the flock | `/` | `src/pages/index.astro` | — (compass hub) |
| Where / map | `/places` | `src/pages/places/index.astro` | `M` |
| When / timeline | `/timeline` | *(done)* | `T` |
| Groups / bubbles | `/groups` | `src/pages/groups/index.astro` | `G` |
| Life list | `/list` | `src/pages/list.astro` | `L` |
| Days out | `/days`, `/days/<iso>` | `src/pages/days.astro`, `src/pages/days/[iso].astro` | — (marks When) |
| One bird (optional) | `/birds/<slug>` | `src/pages/birds/[slug].astro` | — |

Sub-routes are fine and stay marked in the compass: `/places/<slug>` marks
Where, `/groups/<slug>` marks Groups. Change a path and you must also change
`VIEWS` in `src/lib/flock.ts` — ping the foundation instead of editing it.

### ⚠️ Those are routes, not URLs — every one goes through `withBase()`

The site is published at **`https://yy-gx.github.io/flock/`**, one directory
down from the root of its origin. `astro.config.mjs` sets `base: '/flock'`,
which fixes the URLs **Astro** mints — images, bundled JS and CSS, the
`public/` copy — and touches nothing you write by hand. A literal
`href="/places"`, and every template string like `` `/birds/${bird.slug}` ``,
ships exactly as typed and 404s.

So: **a `/`-leading internal path is written `withBase('/…')`, always.**

```astro
import { withBase } from '../lib/paths';      // ../../lib/paths from a nested page

<a href={withBase(`/places/${place.slug}`)}>…</a>
<a href={withBase('/days')}>…</a>
```

It works the same in `.astro` frontmatter and in client TypeScript
(`panel.ts` uses it), it leaves external URLs, `#fragments` and relative paths
alone, and it is idempotent — a path that already carries the base is handed
back unchanged, so a `href` prop defaulted in one component and overridden by
its caller cannot end up as `/flock/flock/…`.

**The trap is the other direction.** `Astro.url.pathname` and
`location.pathname` carry the prefix too. Anything that *matches* on a path
has to take it off first:

```ts
import { stripBase } from '../lib/paths';
stripBase(Astro.url.pathname)   // "/flock/places" -> "/places"
```

`viewOf()` already does this, so the compass keeps marking the right arm; you
only need it if you are matching a pathname yourself. Often the simpler move
is to build the URL with `withBase()` and compare that against
`location.pathname` directly, which is what the panel does.

Nothing anywhere spells `/flock` out — it is read from
`import.meta.env.BASE_URL` — so a custom domain is one line in
`astro.config.mjs` and the whole site follows.

**`npm run build` fails if you forget.** `src/integrations/check-base.mjs`
reads the built site back and hard-fails on any `href`, `src`, `srcset`,
`url()`, `og:image` or route-shaped JS literal under `dist/` that starts with
`/` but not with the base. 23,519 URLs are checked on every build; a missed
call site is a dead link, not a warning.

> **Days is not a sixth compass point.** `/days` and all 64 `/days/<iso>`
> pages are the same chronology `/timeline` draws — the ledger reading of it —
> so `viewOf()` returns `'timeline'` for them and the compass marks **When**
> (DESIGN2 §1.4). There is no sixth arm and no sixth shortcut key; `T` goes
> to the chart, and the ledger is reached from the chart's footer, the
> timeline's trip brackets, and every bird's date in the overlay. If you are
> tempted to add an arm, that is a `VIEWS` change and a `Compass.astro`
> redraw — ping the foundation, do not fork.

> **Home agent, one chore for you:** `astro.config.mjs` still has
> `redirects: { '/': '/timeline' }` from before there was a home page. Delete
> that line in the same commit that adds `src/pages/index.astro`, or the two
> will fight over `/`.

---

## 2. Layout

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Where · Birding Checklist" description="37 places, 238 birds.">
  …your view…
</Base>
```

| Prop | Type | Default | |
|---|---|---|---|
| `title` | `string` | — | required; `<title>`. Format: `Word · Birding Checklist` |
| `description` | `string` | a generic line | meta description |
| `bodyClass` | `string` | — | optional hook on `<body>` |

`Base` already gives you the stylesheet, the compass, `<ClientRouter />`, two
skip links, and **`<main id="main">` around your slot**. Do not add a nav, a
header, a footer, or a `<main>` of your own — there is no chrome on this site
and a second landmark breaks the skip links.

---

## 3. `<BirdThumb />` — one bird as a picture and a name

```astro
import BirdThumb from '../components/BirdThumb.astro';

<BirdThumb bird={bird} />                                  <!-- 160px square, opens the panel -->
<BirdThumb bird={bird} size={72} shape="circle" name={false} />   <!-- a map pin -->
<BirdThumb bird={bird} size={240} genus gloss />           <!-- a plate in the life list -->
<BirdThumb bird={bird} href={`/birds/${bird.slug}`} />     <!-- a link instead of an overlay -->
<BirdThumb bird={bird} opens={false} transition={false} />  <!-- decorative only -->
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `bird` | `Bird` | — | **required**, the whole record from `birds.json` |
| `size` | `number` | `160` | edge of the picture box in CSS px; the image is built at 2× |
| `shape` | `'square' \| 'circle' \| 'portrait' \| 'free'` | `'square'` | 1:1, round 1:1, 3:4, or the photo's own ratio |
| `name` | `boolean` | `true` | show the English name under the picture |
| `genus` | `boolean` | `false` | also show the scientific name, italic |
| `gloss` | `boolean` | `false` | also show the Chinese gloss from the Notion name, small |
| `eager` | `boolean` | `false` | `loading="eager"`; use for the few above the fold |
| `opens` | `boolean` | `true` | clicking opens `<BirdPanel />`. Ignored when `href` is set |
| `href` | `string` | — | render an `<a>` to this URL instead of a panel trigger |
| `transition` | `boolean` | `true` | claim `view-transition-name` (see §5) |
| `class` | `string` | — | extra classes on the root |
| `style` | `string` | — | extra inline style, appended after the transition name |

What it gives you without being asked:

* **Sizing.** The root is exactly `size` px wide (`max-width: 100%`), the plate
  is cropped **at build time by sharp, aimed at the bird** — `planCrop` calls
  `getImage({width, height, fit: 'cover', position})`, so the file that ships is
  already the 3:4 (or 1:1) window, not a full frame the CSS narrows. Measured
  2.44× the rendered detail and no upscaling at desktop widths, at +35% wire.
  `object-position` still carries the last few per cent of the aim: `npm run focal`
  (`scripts/focal-points.mjs`) writes one focal point per photograph to
  `src/data/focal.json`, and the component turns it into `object-position`.
  A file with no entry falls back to centre, biased slightly high. The
  heuristic misses sometimes — fix an entry by hand and set `"by": "hand"`.
* **The edge.** Square and portrait plates carry `--plate-edge` (a hairline)
  and `--plate-lift` (the faintest shadow): a print mounted on the paper.
  Circles stay bare. This is the one card edge on the site; do not add others.
* **Lazy loading** and explicit `width`/`height`, so nothing reflows.
* **The 43 birds with no photograph.** They render as a hollow hairline frame
  with "No photograph yet" inside (dropped under 96px, where there is no room),
  never as an empty hole. Detect them yourself with
  `!(bird.photoIds ?? []).length`, or just style `.thumb--hollow`.
* **`--t`** on the root, set to this bird's type colour, so you can tint
  a caption or a ring without importing anything: `color: var(--t)`.
* `data-slug` on the root, for your own querying.

Root element is a `<button>` (default), an `<a>` (with `href`), or a `<div>`
(`opens={false}` and no `href`). Style it from the outside with `class`.

---

## 4. `<BirdPanel />` — the field-guide overlay

One per page, anywhere in the markup. Give it the birds that page can open.

```astro
import BirdPanel from '../components/BirdPanel.astro';
---
<BirdPanel birds={shownBirds} />
```

| Prop | Type | Default |
|---|---|---|
| `birds` | `Bird[]` | every bird in `birds.json` (281) |

It renders the dialog, embeds a JSON payload keyed by `bird.id`, and pulls in
`src/lib/panel.ts`, which owns click handling, the focus trap, Esc, the body
scroll lock, and putting your scroll position back on close.

**Pass the subset you actually show.** The payload is roughly **887 bytes a
bird** (238 birds ≈ 206 KB of HTML, all 281 ≈ 230 KB) — it grew when the panel
learned to page through every photograph, not just the first. All 281 is fine
but wasteful if your view only shows ten.

Each entry carries a `more` field: plates 2..n front-coded into one string
rather than an array of objects. Decode it with the helper in `panel.ts`; never
parse it by hand.

### Opening a bird

**The normal way — no JavaScript at all.** Put `data-bird="<bird.id>"` on any
element. `BirdThumb` already does this.

```astro
<button data-bird={bird.id}>…</button>
<g data-bird={bird.id} tabindex="0" role="button" aria-label={bird.name}>…</g>
```

Click, Enter and Space all work; a real `<a>`/`<button>` keeps its own Enter
behaviour and is not double-handled. A trigger for a bird that is not in this
page's payload does nothing and does not swallow the click.

**From your own script**, when the trigger is not an element (a canvas hit
test, a bubble simulation, a URL hash):

```ts
import { openBird, closeBird, isPanelOpen, currentBird, birdData } from '../lib/panel';

openBird(bird.id, triggerEl);  // triggerEl is optional; it is what scroll
                               // restore walks up from. Returns false if the
                               // id is not in this page's payload.
closeBird();
isPanelOpen();   // boolean
currentBird();   // the open bird's id, or null
birdData();      // Record<id, PanelEntry> — this page's whole payload
```

The panel also pages photographs, so four more functions sit alongside those
five — `stepPlate`, `goToPlate`, `plateCount`, `plateIndex`:

```ts
stepPlate(+1);      // next photograph, wrapping
goToPlate(0);       // jump to one
plateCount();       // how many this bird has (1278 across 213 multi-photo birds)
plateIndex();       // which one is showing
```

`window.birdPanel` exposes all nine, for inline scripts.

### "That day" — the birds beside this one

The last row of the field marks is the company the bird was found in: *That
day — Black-billed Magpie, Bushtit, Common Raven and 17 more*. 219 of the 238
spotted birds share their first day with another bird; the other **19** were
the only new bird of their day and say so, in italic, rather than dropping
the row.

You get it for free — there is nothing to pass and nothing to call. Two
things are worth knowing:

* **It costs almost nothing.** Companions belong to the *day*, not the bird,
  so they ship as a second `<script type="application/json" id="day-payload">`
  with one row per day rather than three names per bird. On `/timeline`, the
  page with all 238: **3,785 bytes** against 215,559 of `PanelEntry`
  (**+1.8%**), and no images at all. Like `birds`, it only carries the days
  your subset was found on.
* **Every name is a link.** `<a href="/birds/<slug>">`, so it works with no
  script and with a middle click — but when your payload already holds that
  bird the overlay swaps in place instead of navigating, and one bird leads
  to the next. Pass the wider subset and you get more of the chain.

Do not reuse the id `day-payload` or the attribute `data-companion`; the
panel claims `click` in the capture phase for the latter, because
`<ClientRouter />` would otherwise follow the link first.

⚠️ **Do not bind Left/Right yourself while the panel is open.** The panel owns
those keys for paging. Check `isPanelOpen()` first, or your view and the photo
viewer will both fire.

A `PanelEntry` (what `birdData()` returns) is all strings, ready for the DOM:
`id slug name english gloss genus date iso type tkey desc size colors behavior
conservation places` plus `img: { src, w, h } | null`. `name` is the full
Notion name; `english` and `gloss` are the split halves.

`date` is the rendered line ("19 Aug 2025"); `iso` is the same day as
`YYYY-MM-DD`, **and only when `/days/<iso>` was built for it** — the panel
turns `#panel-date` into a link to that day, and `iso` is `''` for the 43
birds with no date, which renders as plain text. Do not build the URL from
`date`.

### Events

`document` gets `bird:open` and `bird:close`, both with `detail.id`. Use them
to pause a simulation or dim a map:

```ts
document.addEventListener('bird:open', (e) => pause((e as CustomEvent).detail.id));
document.addEventListener('bird:close', resume);
```

### What you must not do

* Do not add your own Esc handler for the panel. `panel.ts` takes Esc in the
  capture phase and stops it, so the compass does not also navigate back.
* Do not toggle `#panel` yourself, and do not reuse the ids `panel`,
  `panel-img`, `panel-name`, `panel-facts`, `bird-payload`, `day-payload`,
  `scroller`, `tip`.
* Do not set `document.documentElement.style.overflow`; the panel owns it.

### Re-running your own setup after a navigation

View Transitions are on, so a module script runs **once per document**, not
once per page. Any script that queries the DOM must re-run on navigation:

```ts
function setup() {
  const root = document.getElementById('my-view');
  if (!root || root.dataset.wired === '1') return;   // idempotent
  root.dataset.wired = '1';
  …
}
setup();
document.addEventListener('astro:page-load', setup);
```

---

## 5. View transitions — the naming convention

This is the whole point of the site: the same 238 birds re-form when you change
view. It works when one element in the page you leave and one element in the
page you arrive at carry the **same** `view-transition-name`.

### The rule

```
view-transition-name: bird-<slug>      e.g. bird-brown-creeper
view-transition-name: place-<slug>     e.g. place-sandy-creek-park
```

Never build that string by hand:

```astro
import { birdTransitionName, birdTransitionStyle, placeTransitionName } from '../lib/flock';

birdTransitionName(bird)    // "bird-brown-creeper"  (also accepts a slug string)
birdTransitionStyle(bird)   // "view-transition-name:bird-brown-creeper"

<div style={birdTransitionStyle(bird)}>…</div>
```

`<BirdThumb />` does it for you. Pass `transition={false}` to opt out.

### Four rules you have to keep

1. **One element per page per name.** Two elements with
   `view-transition-name: bird-brown-creeper` in the same document and the
   browser silently abandons the whole transition — every bird stops animating,
   not just that one. If a bird can appear twice in your view (a map bird that
   was seen in three places, a bird in two groups), give exactly one instance
   the name and pass `transition={false}` to the rest.
2. **HTML boxes only.** `view-transition-name` does not work on elements inside
   `<svg>` in current browsers. Draw birds as HTML (a `BirdThumb` positioned
   with CSS) if you want them to fly; use SVG for the scaffolding around them.
   *This is why the timeline's 238 dots do not morph — they are SVG circles. It
   is a known and accepted gap; the timeline still cross-fades like any page.*
3. **Only name what you render.** Naming birds that are off-screen or
   `display: none` costs nothing but also does nothing. Do not name all 281 on
   a page that shows 12.
4. **Degrade.** A browser with no View Transitions just navigates. Never make
   layout, correctness or reachability depend on the animation.

The `<html>` root cross-fades automatically (`::view-transition-old(root)` /
`(root)` in `global.css`), and everything is disabled under
`prefers-reduced-motion: reduce`. You do not need to handle either.

### Which views can participate

Home, Where (pins), Groups (bubbles) and the Life list are all HTML, so a bird
can fly between any two of them. Give each rendered bird its name and the effect
is free.

---

## 6. The compass

`Base.astro` renders it. **Do not build navigation.** It is a small compass rose
bottom-left at 40% opacity: When north, Where west, Groups east, Life list
south, home at the hub. The current view is drawn in full ink via
`aria-current="page"`, derived from `Astro.url.pathname` by `viewOf()`.

Keyboard, live on every page: `M` `T` `G` `L` navigate; `Esc` closes the bird
panel, or goes back when nothing is open. Shortcuts are ignored while typing in
an input, a textarea or a contenteditable, and when a modifier is held — if your
view adds a text filter, you get that for free.

If your view needs its own single-letter shortcut, pick one outside `M T G L`
and check `isPanelOpen()` before acting.

---

## 7. Data

Already loaded and shaped for you — do not re-read the JSON.

```ts
import {
  birds,            // Bird[] — all 281
  timelineBirds,    // Bird[] — the 238 spotted, oldest first
  locations,        // LocationRec[] — 37
  photos,           // Photo[] — 237
  photosById, locationsById,
  firstPhotoFile,   // (bird) => "3be…-0.png" | null
  locationNames,    // (bird) => string[]
  usingFixture,     // true only if birds.json is missing
} from '../lib/data';

import { photoAsset } from '../lib/images';   // file name -> ImageMetadata | null
```

Handy filters:

```ts
const spotted   = birds.filter((b) => b.spotted);              // 238
const missing   = birds.filter((b) => !b.spotted);             // 43  → hollow frames
const favourite = birds.filter((b) => b.favorite);             // 10  → home
const local     = locations.filter((l) => l.scope === 'local');// 18
```

Two birds have no usable photograph even though they are spotted (Fish Crow,
and one Great Blue Heron record whose photo row has no files). `BirdThumb`
and the panel both handle that; you do not need to special-case it.

Names carry a Chinese gloss — `"Brown Creeper (美洲旋木雀)"`. Split it with:

```ts
import { splitName } from '../lib/flock';
const { english, gloss } = splitName(bird.name);   // "Brown Creeper", "美洲旋木雀"
```

The bird panel deliberately shows the full Notion name; captions in your view
should generally show `english` (that is what `BirdThumb` does).

Dates: `formatDate('2026-08-08')` → `"8 Aug 2026"` (UTC, no timezone drift),
from `src/lib/flock.ts`.

---

## 8. Colour, type and spacing

Everything is a CSS custom property in `src/styles/global.css`, light and dark.
**Do not write a hex value in your view.**

### The 9 type colours

> **Read this before you touch `bird.type`.** Notion stores
> **`"Perching Birds"`** and **`"Water Birds"`**, not the shorthand
> `Perching` / `Water` that CLAUDE.md uses. Comparing against the short form
> silently misses 168 of the 238 birds — that bug was live on the timeline
> until the foundation landed. Go through these helpers and you cannot hit it.

```astro
import { typeVar, typeKey, typeLabel, canonicalType, TYPE_ORDER } from '../lib/flock';

typeVar(bird.type)        // "var(--t-4)" — drop into fill / background / --dot
typeKey(bird.type)        // "4", or "other"
typeLabel(bird.type)      // "Perching" — the short form, for legends and headings
canonicalType('perching') // "Perching Birds" — normalises any spelling

<circle fill={typeVar(bird.type)} />
<li style={`--dot: ${typeVar(bird.type)}`}>   <!-- then background: var(--dot) -->
```

`TYPE_ORDER` is the canonical order, biggest group first:

| # | `TYPE_ORDER` value | `typeLabel` | Spotted | Colour |
|---|---|---|---|---|
| 1 | `Perching Birds` | Perching | 109 | `--t-1` |
| 2 | `Water Birds` | Water | 59 | `--t-2` |
| 3 | `Wading & Shorebirds` | Wading & Shorebirds | 28 | `--t-3` |
| 4 | `Raptors` | Raptors | 13 | `--t-4` |
| 5 | `Tree-Climbers` | Tree-Climbers | 9 | `--t-5` |
| 6 | `Landfowls` | Landfowls | 6 | `--t-6` |
| 7 | `Doves & Pigeons` | Doves & Pigeons | 6 | `--t-7` |
| 8 | `Swifts & Hummingbirds` | Swifts & Hummingbirds | 5 | `--t-8` |
| 9 | `Specialists` | Specialists | 3 | `--t-9` |

Counts are spotted-only; unfiltered, Perching is 110 and Water 60. Anything
unrecognised maps to `--t-other`.

### The 4 season colours

`--season-spring|summer|autumn|winter` are solid, for marks and labels.
`--band-spring|…|winter` are the same hues washed out, for background bands.

### Everything else

| Group | Tokens |
|---|---|
| Ground | `--paper` `--paper-sunk` `--paper-raised` |
| Ink | `--ink` `--ink-soft` `--ink-faint` |
| Rules | `--rule` `--rule-soft` (hairlines — **no card borders, no boxes**) |
| Depth | `--lift` `--lift-sm` `--scrim` `--plate-edge` `--plate-lift` (the last two only on `BirdThumb` plates) |
| Faces | `--serif` (names, prose) `--sans` (labels, numbers, ticks) `--display-serif` (`.display` only) `--serif-cjk` (Chinese glosses) `--brush-cjk` (the vertical inscription on `/birds/<slug>` only) |
| Sizes | `--fs-micro` `--fs-tiny` `--fs-small` `--fs-base` `--fs-body` `--fs-lg` `--fs-name` `--fs-display` |
| Tracking | `--track-wide` (eyebrows) `--track-label` (dt labels) |
| Space | `--gutter` `--page-top` `--page-bottom` `--head-gap` |
| Compass | `--compass-inset` `--compass-size` `--compass-halo` `--compass-safe` |
| Motion | `--ease` `--dur-fast` `--dur` `--dur-slow` |

**`--compass-safe`** (146px desktop / 118px ≤760px) is how much bottom-left
space the compass actually occupies, halo included. `--page-bottom` is already
`max(clamp(28px,5vh,56px), var(--compass-safe))`, so any `.page` view — and
`Timeline.astro`'s `.tl` — inherits the reserve for free.

**But inheriting `--page-bottom` is not enough if your view positions its own
children**, e.g. a bubble stage, an absolutely-positioned flock, or a
`position: sticky` column. Those need to inset their own bottom-left by
`var(--compass-safe)`. Never hardcode a pixel equivalent — the token shrinks on
phones.

`--ink-faint` is a real 4.88:1 (light) / 5.45:1 (dark) as of the accessibility
pass, so it is safe for small text. The nine `--t-*` type colours are **marks,
not text** — they measure 2.28–3.60:1 and fail as digits. Colour the dot, give
the number `--ink-faint`.

### Page furniture

Open every view the same way so the five read as one book:

```astro
<section class="page">
  <header class="page__head">
    <p class="eyebrow">Birding checklist</p>
    <h1 class="display">Where</h1>
    <p class="lede">37 places, 18 of them within half an hour of home.</p>
  </header>
  …
</section>
```

`.page` `.page__head` `.eyebrow` `.display` `.lede` `.meta` `.genus` `.sr-only`
are all global. One word in `.display`, please: Flock / Where / When / Groups /
All.

### Stacking

Fixed layers are already assigned. Stay under 40 for your own content.

| z-index | |
|---|---|
| 50 | `<BirdPanel />` — the modal, covers everything |
| 45 | the compass |
| 40 | the timeline's hover label |
| < 40 | your view |

### House style

Off-white paper, restrained serif, generous whitespace. No card borders, no
drop shadows on content, no rounded boxes, no dashboards. Separate things with
space, or a `--rule-soft` hairline if you must. Phone width (360px) has to work:
the compass shrinks and drops its labels by itself, but your layout is yours.

Reduced motion is already handled globally for animations, transitions and view
transitions. If you write a `requestAnimationFrame` loop (the bubbles), check
`matchMedia('(prefers-reduced-motion: reduce)').matches` and render one static
frame.

---

## 9. Checklist before you call your view done

- [ ] `npm run build` passes (which includes the base check — see §1).
- [ ] Wrapped in `<Base>`; no nav of your own.
- [ ] One `<BirdPanel birds={…} />` if anything is clickable; triggers use `data-bird`.
- [ ] Every rendered bird has a unique `bird-<slug>` transition name, or none.
- [ ] Birds with no photograph render as hollow frames, not gaps.
- [ ] No hex colours, no `px` font sizes — tokens only.
- [ ] Every internal path is `withBase('/…')`; no bare `href="/…"` anywhere.
- [ ] Any DOM setup re-runs on `astro:page-load` and is idempotent.
- [ ] 360px wide is usable; the compass is not covered by your content.
- [ ] `M` `T` `G` `L` and `Esc` still work on your page.
