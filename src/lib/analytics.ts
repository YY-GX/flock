/* ================================================================
 * ⚠️  THE ONE PLACE THE GOOGLE ANALYTICS ID GOES
 * ================================================================
 *
 * The site has a GA4 property. Its measurement ID lives in a file called
 * `.env` at the root of this repository:
 *
 *     PUBLIC_GA_ID=G-XXXXXXXXXX
 *
 * and, for the published site, in the `env:` block of
 * `.github/workflows/deploy.yml` — in the open, beside PUBLIC_ORIGINALS_BASE,
 * because a measurement ID is not a secret: it is compiled into the page and
 * anyone can read it out of the HTML. A repository secret would hide it from
 * nobody and break pull-request builds.
 *
 * `PUBLIC_` is the prefix Astro/Vite exposes to client code, which is what
 * lets the value reach the browser at all. `.env.example` carries the same
 * line, commented, as the record of what a checkout may set.
 *
 * **Unset — which is what `npm run dev` is, unless you opt in — nothing is
 * emitted.** Not a hidden script, not a no-op stub: `Base.astro` renders no
 * tag, so there is no request to Google, no `dataLayer`, and not one byte of
 * difference in the layout. Local work never lands in the owner's property.
 *
 * ## Why the snippet Google hands out is wrong here
 *
 * Every view on this site is reached through `<ClientRouter />`. Moving
 * between the compass's five arms, into a bird, or through `/days/<iso>` is a
 * client-side swap with no document load, so the stock
 * `gtag('config', ID)` — which sends a `page_view` when it runs — would fire
 * exactly once, on first paint, and all 397 pages would report as one.
 *
 * So `Base.astro` configures with `send_page_view: false` and sends the
 * `page_view` itself on every `astro:page-load`. That event fires on the
 * initial load *and* after each swap, including back and forward, and it
 * fires **after** the new document has been swapped in — which is the whole
 * reason it, and not `astro:before-swap`/`astro:after-swap`, is the hook:
 * `document.title` and `location.href` are the arriving page's by then, not
 * the departing one's.
 *
 * The counting is therefore: configure once, send zero page_views from the
 * config, one per `astro:page-load`. First load is counted exactly once, not
 * twice and not zero times.
 *
 * ## ⚠️ One box to untick in the GA4 property, once
 *
 * There is a second thing that counts pages, and it is not in this repository.
 * GA4 **enhanced measurement** has an option called *"Page changes based on
 * browser history events"*, on by default, which makes gtag.js send a
 * `page_view` of its own whenever `history.pushState`/`popstate` fires —
 * measured here: a bare `history.pushState()` on a page with no other
 * JavaScript running produced an unasked-for `page_view` about six seconds
 * later. ClientRouter changes history on every swap, so with that box ticked
 * **every client-side navigation is counted twice**: ours immediately, GA4's
 * a few seconds behind it. The first load is counted once either way.
 *
 * This is Google's own known single-page-app double count, and their fix is
 * the same one:
 *
 *     GA4 → Admin → Data streams → the web stream → Enhanced measurement
 *       → the cog → untick "Page changes based on browser history events"
 *
 * Leave the rest of enhanced measurement alone; scrolls, outbound clicks and
 * file downloads are not page views and do not collide with anything here.
 * Nothing in code can switch that option off — it is a property setting, so
 * it is written down here rather than fixed in `Base.astro`.
 *
 * ## The visitor's signal
 *
 * `navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl === true`
 * and the loader returns before it has done anything — no gtag.js, no
 * `dataLayer`, no listener. This is a personal gallery, not a funnel; the
 * cost of honouring the signal is one `if`. (Deliberately no cookie banner:
 * that is a bigger decision and has not been asked for.)
 */

/**
 * The GA4 measurement ID, or `''` when analytics are off.
 *
 * Read at build time, server side. Nothing else on the site reads
 * `PUBLIC_GA_ID`; `Base.astro` hands this value to the one inline script.
 */
export const GA_ID: string = String(import.meta.env.PUBLIC_GA_ID ?? '').trim();

/**
 * Shape check, so a pasted stray — a quoted value, a `UA-` property, an
 * `.env` line left as `PUBLIC_GA_ID=` — turns analytics off rather than
 * shipping a tag that measures nothing.
 */
export const gaEnabled: boolean = /^G-[A-Z0-9]+$/i.test(GA_ID);
