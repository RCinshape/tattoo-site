# Tattoo Portfolio — Project Instructions

## Project Overview
Single-file HTML tattoo portfolio with rich animations and scroll effects.

**Stack (all via CDN):**
- GSAP + ScrollTrigger + other GSAP plugins
- Lenis smooth scroll (integrated with GSAP ticker)
- Custom cursor
- Particle effects (canvas or tsParticles)
- No build step — single `index.html` file

## Core Rules

### File structure
- Everything lives in one `index.html`: inline `<style>`, inline `<script>`, no external local files unless explicitly requested.
- CDN links go in `<head>` before any scripts that depend on them.

### Theming (dark default + OS light mode)
- Both pages carry two token blocks in their inline `<style>`: `:root` (dark) and `:root[data-theme="light"]`. Every surface colour comes from a token — never write a raw colour literal in a rule.
- Alpha surfaces compose from RGB-triplet tokens: `rgba(var(--panel-rgb),.88)`, `rgba(var(--fg-rgb),.07)`, `rgba(var(--gold-rgb),.4)`. `--on-gold` is the ink on a gold fill; `--ok*`/`--warn*` are the status colours; `--img-*` are the per-theme photo filters.
- The head script (before the CDN `<script src>` tags) resolves `localStorage['emmy-theme'] ?? matchMedia('(prefers-color-scheme: light)')` pre-paint, writes `data-theme` + `data-pref` + `color-scheme` on `<html>`, updates `#meta-theme-color`, and fires a `themechange` event. With no key stored the page follows the OS live (`pref = 'system'`).
- `#theme-toggle` is binary on screen: it always shows the theme it switches **to** — sun while dark, moon while light — keyed off `[data-theme]`, never `[data-pref]`. Clicking always writes an explicit `light`/`dark`. There is no third "auto/system" icon; do not reintroduce one.
- The toggle's click handler lives in its own top-level `<script>` at the end of `<body>` on all three pages — **never inside `__boot()`**. `__boot` returns at its first line when the GSAP/Lenis CDN fails, which is exactly what a phone on a bad connection hits: the button rendered, the icon was right, and clicking wrote nothing. Anything inside it may use `gsap` only behind `if (window.gsap)`.
- Chrome drawn over photography stays dark in both themes by re-declaring tokens on the subtree (`#loader, .wc-lbl, .wc-view` in `index.html`; `.pw-over, .pw-zoom` in `portfolio.html`) — never by pinning individual literals.
- Never animate `backgroundColor` on `<body>` or any themed surface: an inline style outranks the tokens and strands the page in one theme. Third-party brand colours (WhatsApp/Instagram/Facebook/Google) and black photo scrims are the only sanctioned literals.

### Responsive gutters
- One token owns the horizontal page gutter: `--pad` (`max(48px, calc(50vw - 720px))`, narrowed to `24px` by a single `@media (max-width: 768px) { :root { --pad: 24px; } }` right after the light token block in both pages).
- Section rules MUST write `padding: <v> var(--pad) <v>`, never a literal. Hardcoding it per-rule is how `.w-grid` drifted to 16px while every sibling sat at 24px.
- A `max-width`-capped child of a single-column grid needs `justify-self: center`, and a button stack inside an `align-items: flex-start` parent needs `width: 100%` — otherwise both shrink-wrap and read as drift.

### GSAP / ScrollTrigger
- Always initialize Lenis first, then sync it with GSAP ticker via `gsap.ticker.add((time) => lenis.raf(time * 1000))` and `gsap.ticker.lagSmoothing(0)`.
- Register all GSAP plugins at the top of the script: `gsap.registerPlugin(ScrollTrigger, ...)`.
- Pin sections with `ScrollTrigger` using `pin: true, anticipatePin: 1` to avoid jank.
- Use `ScrollTrigger.refresh()` after dynamic content loads or fonts are ready.
- Prefer `scrub: true` for parallax; use `scrub: 1.5` or higher for smoother feel.
- Never mix `window.scrollY` with Lenis — always use Lenis events or ScrollTrigger for scroll position.

### Custom cursor
- Replace default cursor with CSS `cursor: none` on `html`.
- Use two elements: a small dot (instant follow) and a larger ring (lerp follow with `gsap.quickTo`).
- Add hover states on interactive elements via JS `mouseenter`/`mouseleave`.

### Particles
- Use canvas-based particles for performance.
- Cap particle count (≤150 on desktop, ≤60 on mobile).
- Pause/stop animation when tab is hidden (`visibilitychange`).

### Performance
- Use `will-change: transform` sparingly — only on actively animating elements.
- Wrap all animation setup in `DOMContentLoaded`.
- Debounce resize handlers; call `ScrollTrigger.refresh()` on resize end.
- Always test on mobile viewport (375px wide) — disable heavy effects on `(max-width: 768px)` if needed.

### Code style
- Keep JS in one `<script>` block at end of `<body>`.
- Group code: (1) Lenis init, (2) GSAP/ScrollTrigger setup, (3) cursor, (4) particles, (5) page-specific animations.
- Use `const` and arrow functions; no jQuery.
- Comment each major animation block with its section name.

## Commands
```bash
# Serve locally
npx live-server --port=3000 --open=index.html

# Or
npx serve .
```

## Shipping work

Work that came in as an approved plan ends with a push. Once the plan's steps are done and verified, commit and `git push` to `origin main` without being asked again — the live site is `main`, so unpushed work is work that does not exist. Do not stop at "committed", and do not wait for a second go-ahead.

Never commit `.claude/settings.local.json`, and never move `latest-stable` as part of shipping; that branch only moves on an explicit instruction.

## Stable snapshot

`latest-stable` is a branch that points at the last known-good commit of `main`.

- Mark the current `main` as stable: `git branch -f latest-stable main && git push -f origin latest-stable`
- Restore the site to it: `git fetch origin && git reset --hard origin/latest-stable && git push --force-with-lease origin main`
- Inspect it without moving anything: `git log --oneline origin/latest-stable -5`

The live site is whatever `main` points at, so restoring means force-moving `main` back onto `latest-stable`.

## Pages

`index.html`, `portfolio.html` (`/portfolio`) and `legal.html` (`/legal` — privacy, cookies and website terms). The legal page carries its own minimal stylesheet and a copy of the theme script; it deliberately does NOT duplicate the site CSS.

`--pad` is a full-bleed section gutter and must never be the horizontal padding of a **centred, max-width column**: it grows with the viewport (`50vw - 720px`), so on `/legal` it ate 480px of a 760px box at 1920 and left a 280px noodle of text. `.lg-main` is `max-width: 808px; margin: 0 auto; padding: 72px 24px 96px` — measure from the max-width, fixed inline padding.

## Intro

The brand loader is kept in `index.html` but disabled by `window.__INTRO = false` in the head. Setting it to `true` re-enables the CSS intro (`html.intro-on #loader`); nothing else needs changing.

## Analytics

Google Analytics 4 loads on first paint from an inline head script on all three pages — no consent gate, no cookie bar, no `window.__consent`, no `emmy-consent` key. GA4 is configured for page views only (no ads, remarketing or profiling signals), which is the minimum-friction setup: the site is usable without clicking anything, and the opt-out is documented on `/legal` (browser cookie blocking or a private window). Do not reintroduce a banner. The script keeps two guards: it skips localhost, and it picks `G-M23QSCSBZ9` on `.co.uk` else `G-J8X45ECTLH`.

## Nav

The nav is bare over the hero and becomes a bar — blurred surface, bottom border, `Emmy Tattoo` wordmark at top left — exactly when the first section seam (`#work`'s top border) reaches it. That swap is a `ScrollTrigger` on `#work-outer` with `start: 'top <--nav-h>'`, not a scroll-offset threshold: `#nav` owns `--nav-h` (94px desktop, 78px at ≤768px) and the trigger re-reads it on every refresh, so the breakpoint needs no second number. `.n-logo` is `opacity: 0` until `#nav.s`; it keeps its box either way, so nothing shifts. `#nav` has no `::before` scrim — over the hero the nav sits on `.hero-bg-photo::after`, and `#nav:not(.s) .n-item` carries the hero text-shadow plate. `html.libs-failed` and the `<noscript>` block pin the bar on, because with no scroll observer the alternative is a nav that never gets a background.

Every nav icon sits on one 16px rhythm: `#nav { gap: 16px }` and `.n-actions { gap: 16px }` with no `margin-left` on `.n-actions` — that margin plus a 26px nav gap is what once left the theme toggle 42px from Facebook. Text links keep `.n-links { gap: 26px }`.

## Footer

One row, three tracks: `display: grid; grid-template-columns: 1fr auto 1fr` with the links `justify-self: center` and the copyright `justify-self: end`. It was `justify-content: space-between`, which centres nothing — the wordmark and the copyright have very different widths, so at 1920 the links sat 121px left of true centre. One column, centred, at ≤768px.

The middle group routes to every page the visitor is not on, then the legal pages: home → `Portfolio · Privacy & Cookies · Terms`; portfolio → `Home · Privacy & Cookies · Terms`; legal → `Home · Portfolio`. Both legal links carry their in-page anchor (`/legal#privacy`, `/legal#terms`). Social and about links live in the nav, not here, and there are no buttons in the footer, so no `.ft-btn` rule exists.

## Scrolling

Lenis runs in **lerp mode** (`lerp: 0.1`, `wheelMultiplier: 1.05`), not `duration`/`easing`: a fixed 1.25s tween restarted from zero on every wheel event, so a fast scroll or a second flick stalled and had to be repeated. Programmatic `lenis.scrollTo` calls still pass their own duration, which is where the deliberate 1.2–1.6s anchor glides live.

Keyboard paging is ours, on `index.html` and `portfolio.html` alike. The browser's native PageUp/PageDown/Home/End/space scrolling writes `scrollY` directly, which Lenis's rAF loop then overwrites — the page snapped back and the key had to be pressed again. The handler routes those keys (plus arrows) through `lenis.scrollTo`, keeps its own `keyTarget` so a burst of presses stacks instead of re-measuring a half-finished animation, and clamps to the document height. Two details are load-bearing: it always calls `preventDefault()` before checking the lock — returning early hands the key back to the browser, which then scrolls the page behind an open modal — and the lock itself is read from a shadowed `lenis.stop`/`lenis.start` pair, because this Lenis build exposes no public stopped flag and every overlay locks the page through `lenis.stop()`.

## Attention budget

The page spends attention in one direction: ask → work → proof → detail → ask again. Enforced by three rules.

1. **The hero asks, in two buttons.** `.h-cta` holds `Book now` (`.h-btn-go`, solid `--gold` with `--on-gold` ink, to `#book`) and `View portfolio` (`.h-btn-alt`, the same glass as `.h-dir` because it sits over photography, to `/portfolio` through the cross-document `@view-transition`). The hero is centred — `#hero` and `.h-inner` both centre, and `.h-eyebrow` mirrors its gold rule with an `::after`, because a single leading dash reads as a stray mark once the line leaves the left rail. This replaced a deliberately CTA-less hero whose only affordance was a small `.h-scroll` cue; the change was made against direct competitor comparison and is not to be quietly reverted. Full-width buttons below 768px. The quiet contact is still the nav's Instagram/Facebook icons.
2. **`#work` shows one row, then a gate.** `.w-grid` holds four interactive `.wc` cards in a 4-up grid (`.wc:nth-child(n+3)` is `display: none` at ≤1024px, where the grid is 2-up, so it is always exactly one row; ≤480px shows two stacked). Four columns shrink each card to ~327px at 1440, so the in-card chrome is sized to match (`.wc-lbl` `52px 14px 14px`, `.wc-view` 46px, its glyph 19px) and every card/peek `sizes` ends `25vw`. `.w-peek` follows: four decorative `<img>` under `aria-hidden` + `pointer-events: none`, clipped to `clamp(64px, 6vw, 96px)` and masked to transparent, with `.w-more` (gold ring, bobbing down-arrow, "See all work") pulled `-28px` up so it straddles the fade. That gate is the only CTA in the section — never put a second button below the grid. Navigation to `/portfolio` is a native `@view-transition { navigation: auto; }` cross-fade declared in all three documents; never hand-roll it in JS.
3. **One left rail, three staged centres.** Every eyebrow, heading, paragraph and list starts at the `--pad` gutter so the eye learns one vertical line. `text-align: center` is allowed only for the hero (`#hero`), the booking close (`.bk-in`), and the work gate (a symbol on the fade's axis) — the reviews spotlight that used to hold the third slot is gone. Inside the centred booking block the enquiry form itself is left-aligned (`.bk-form { text-align: left }`), because centred field labels are unreadable. `#flash` and `#gifts` were centred and are now on the rail; adding a fourth centred text block is a regression.

## Converting

Section order on the home page is `hero → work → trust → about → exp → faq → book → gifts → aftercare → flash → location`. Reviews sit directly behind the work that earned them; the ask is at the bottom because the hero already offered it.

- **Reviews are six cards, never a carousel.** `#tr-stage` is a `repeat(3, 1fr)` grid (2-up ≤1024, 1-up ≤768) of `.trv-card`. The spotlight it replaced showed one review at a time and auto-advanced past it, which wastes the only asset that scales: twenty five-star reviews. Google's Places API returns **at most five** reviews, so `roster()` takes the live five and tops up from `SEEDED` — seven transcribed from the same listing — de-duped by lowercased name, to fill six. A "read full review" button is rendered on every card and then **removed where the 6-line clamp did not actually bite**, measured after `document.fonts.ready` because the fallback serif wraps to a different line count. A character-count guess was wrong: a 296-character quote fits five lines at 1440 and got a button that revealed nothing.
- **The enquiry form is the ask.** `.bk-form` collects the seven answers Emmy needs to quote — name, email, idea, placement, size, budget, availability, references — because every DM used to arrive as "hi how much for". `FORM_KEY` (Web3Forms, a deliberately public client key) posts it to her inbox so the lead exists somewhere she owns; the WhatsApp button composes the identical structured message. **With `FORM_KEY` empty the email button is removed and WhatsApp is promoted to the filled style** — never leave a submit button that cannot submit. The honeypot is `name="botcheck"` positioned off-screen, not `display: none`, which bots skip. The form is `novalidate` so both buttons can run one shared `guard()`; required fields carry `data-ask` for the error wording.
- **The deposit block is config-gated.** `DEPOSIT = { url, amount }` at the top of the same script. Empty `url` keeps `#bk-dep` hidden; set it to a Stripe Payment Link and the block appears with `Pay <amount> deposit`. No keys, no backend, no half-built button on the page.
- **Reference photos are config-gated too, and go nowhere near the page's own hosting.** `UPLOAD = { cloud, preset }` beside `FORM_KEY`. Either string empty and JS `.remove()`s `#bkf-up` entirely, so the form is what it always was. Filled, photos POST straight from the visitor's browser to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` with only `file` and `upload_preset` — every other limit (folder, tags, allowed formats, max size, `c_limit,w_1600,h_1600`) lives in the **unsigned** preset, because an unsigned call may not carry them. The returned `secure_url`s are appended to the WhatsApp message under a `Photos:` line and to the email body as `photos`. A static site cannot attach a file: `wa.me?text=` carries no files, Web3Forms attachments are Pro-only, and `navigator.share` with `files` drops the `text` on Android and iOS, which would strip the whole structured enquiry. Never put a Cloudinary API key or secret in the page — the preset name is the only public credential, and if it is abused the fix is a new preset, not a signature.
- **Photos upload on pick, not on send, and are shrunk first.** Uploading at send time would put an `await` between the click and `window.open`, and the popup blocker eats a `window.open` outside the gesture's own task. So `change` starts the upload, `guard()` refuses to send while any row is `state="up"`, and a row that failed shows `Failed` + `Retry` without blocking the enquiry — photos are optional. `shrink()` canvas-resizes to 1600px on the long edge at JPEG q .82 (measured: a 3.30 MB shopfront photo uploads as 149 KB), which keeps a free Cloudinary tier clear of its credits; a file the browser cannot decode — desktop HEIC — uploads untouched and Cloudinary decodes it. Filenames are visitor-supplied and only ever reach the DOM through `textContent`.
- **`<select>` is the one form control that must not be translucent.** Chrome and Edge paint the native option list from the control's own used `background-color`, and the `.03` wash every other field uses composites against the popup's default white — in dark that shipped a white list with near-white `--fg` text, i.e. a budget you could not read. `--field` (`#111111` dark, `#f0e8e5` light) is that wash already resolved over `#book`'s `--bg`, so the field looks identical on the page and the popup is legible; `option` is painted explicitly as well because Firefox reads option colours instead. The `:focus-visible` rule is split for the same reason: `select` gets the gold ring only, never a translucent wash, and the rule uses `background-color` not the `background` shorthand, which used to wipe the caret SVG the moment the field took focus. `color-scheme: dark` on `:root` does not help — an author background on the control outranks it.
- **Four top-level scripts must never move inside `__boot`**: the theme toggle, the deferred embed loader, the enquiry form, and the reviews grid. `__boot` returns at its lib guard when the GSAP/Lenis CDN fails — a real mobile-network failure mode — and none of those four may die with it. They read `window.gsap` / `window.ScrollTrigger` at call time, never at init, because the deferred bundles have not executed when they first run. The reviews modal locks the page through `window.__scrollLock`, the shadowed `lenis.stop`/`start` pair published by `__boot`, and no-ops when it is absent.
- **`/portfolio` renders 12 pieces at a time** behind `#pw-gate`, a `grid-column: 1 / -1` child holding `.pw-more`, which reveals the next 12, reports the remainder, hands focus to the first new card with `preventScroll`, and hides itself when the matched set runs out. Filtering resets to the first batch. `#pw-gate[hidden]` is restated in CSS because `display: flex` on the same element outranks the UA rule. A filter button that matches nothing hides itself — that is what lets the `healed` filter ship before the healed photographs do. `.pw-healed` is an always-visible gold chip (unlike the hover-only `.pw-tag`) for work photographed months after it settled, which is the only honest answer to "will fine line blur".
- **Schema is three blocks, not one.** `LocalBusiness` carries `founder` (Person) and `aggregateRating`; a second script carries `FAQPage`. The six question/answer strings **must stay word-for-word identical to the visible `#faq` copy** or Google drops the rich result. Expect the FAQ result, not stars: Google ignores an `AggregateRating` a business marks up about itself, and it is there because it is true, not because it will render.

## Third-party embeds

Every iframe on the site is injected by one loader — the standalone `<script>` after `__boot`'s block, deliberately outside `__boot` because that function returns early when the CDN libs fail and a map must not depend on a CDN. A container opts in with `data-embed="<url>"` plus optional `data-embed-title`, `data-embed-scroll="no"`, and gets its iframe from an `IntersectionObserver` at `rootMargin: '600px 0px'` (one screen of warning), marked `data-embed-loaded="1"`. There is no click-to-load facade and no "Load map" button; never reintroduce one. Two consumers today: `#loc-map-wrap` and `.fl-ig-frame`.

- The map embed takes **coordinates** (`?q=53.7558,-0.3587&output=embed&z=17`), not the address string: the `?q=<address>` form opens with a permanently blank white place card over the map. The address is set in type above it, and the four Navigate buttons handle routing. `#loc-map-wrap` also carries a `<noscript>` copy of the same iframe, so a JS-less visitor still gets a map.
- Google's `output=embed` map does **not** trap the wheel (vertical scroll passes through to the page; zoom needs ctrl), so the iframe stays fully interactive with no click, hover-dwell or `pointer-events` gate. Measured, not assumed — if you ever change the embed URL, re-measure before adding a gate.
- The Instagram panel is Instagram's own profile embed (`/emmy.tattoo/embed`) — always current, no post IDs to maintain — but it is **cropped to its photo grid**, because the widget is white in every theme: `?theme=dark`, `?cr=1&theme=dark`, `prefers-color-scheme: dark` emulation and a `Sec-CH-Prefers-Color-Scheme: dark` request header all return the same white page, `/embed/captioned/` is not valid for a profile URL (it renders the "Page isn't available" shell, which is the only reason a dark background ever appears), and oEmbed exposes `maxwidth`, `hidecaption` and `omitscript` only. `filter: invert()` would negate the photographs too.
- The crop: `.fl-ig-panel` owns the border, radius and `--bg2` surface; `.fl-ig-frame` is `aspect-ratio: 3/2` with `overflow: hidden`; the iframe inside is absolutely positioned at `top: -147px` with `height: calc(100% + 197px)`, which pushes the 147px white header and the 49px "View full profile" band outside the clip. Measured against the live embed: three columns of `(W-2)/3` with 1px gutters, two rows, so the grid is exactly 2/3 of the width — `aspect-ratio` gets that in every browser, which is why no container query is needed and `.fl-ig` no longer sets `container-type`. `.fl-ig-frame::after` paints the embed's 1px white gutters out with two repeating gradients at period `tile + 1px`. Every tile anchor in the embed is `href="#"`, so the crop costs no interaction, and `.fl-ig-cap` carries the attribution link the cropped footer used to provide. If Instagram changes its chrome, re-measure and fix those two numbers — never fall back to showing the white widget.

## Section media

- `#location` pairs the shopfront photo with the map in `.loc-media` (`grid-template-columns: 1fr 1fr`, one column at ≤768px). Both sides are `aspect-ratio: 5/3` so the row ends level; `.loc-photo` needs an explicit `height: auto`, because the `width`/`height` attributes are presentational hints and `aspect-ratio` is ignored while both axes are specified. `.loc-photo` reveals with `.loc-map-wrap` in one tween and is listed in all three reveal-fallback selector lists.
- `#gifts` is a two-column row: copy on the `--pad` rail in a `flex: 0 0 clamp(320px, 34%, 520px)` column, the voucher filling the rest out to the right gutter. The voucher is **not an `<img>`** — `.gf-card` is an empty `role="img"` div at `aspect-ratio: 1091/494` whose `background` is a token and whose `mask-image` is `pictures/web/Emmy-Tattoo-Gift-Card-Voucher-Ink.webp`, a lossless alpha-only mask lifted from the grey artwork (`sharp().greyscale().linear(-255/162, 255*190/162)`: paper ≈ grey 190 → alpha 0, ink ≈ 28 → alpha 255). Painting the artwork from a token is what lets one asset read in both themes with no per-theme `filter`, and it is why the section needs no `overflow: hidden` on desktop and the card no rotation, stroke or edge fade. The mask lives in `pictures/web/` so `make-webp-variants.js`, which only reads `pictures/*.{jpg,png}`, never re-encodes it lossily.
- At ≤768px that voucher stops being a block and becomes the section's watermark: `#gifts` goes `position: relative; overflow: hidden`, `.gf-body` takes `z-index: 1`, and `.gf-card` is absolutely positioned at `left/right: -8%`, vertically centred, painted `--gc-ink-wm`. As a 342×155 block under the CTA it read as a floating smudge with dead space around it.
- The expertise rows reuse the FAQ accordion wholesale: `<li class="ei">` with a hairline `border-top`, a `<button class="ei-trigger">` (title + circular `.ei-toggle` that CSS-rotates 45° when open), an absolutely positioned `.ei-rule` gold sweep whose width GSAP animates (60% open, 30% hover), and the `height: 0` panel measured and tweened exactly like `.fq-panel` (0.55 expo.out / 0.35 expo.in). Same mechanic, same width: `.exp-list` carries **no `max-width`**, so the `.ei` hairlines are exactly as long as the FAQ's `.fq-item` hairlines (1344px at 1440) and both toggles pin to the same right edge. The measure is protected by `.ei-expand-text`'s own `50ch` cap and the panel's fixed 240px image column, never by capping the list. There are no per-skill summary lines, no numerals (numbering three styles reads as a ranking), no card border and no hover timeline — the old GSAP `x`/`color` timeline was the only writer of inline colours in the section, which is why the theme toggle no longer needs a `clearProps` call. The accordion listens on `.ei-trigger`, not the `<li>`, so `.ei-see-more` inside the panel needs no `stopPropagation` and opening the gallery cannot collapse the row.
- `/portfolio` is a uniform 4-up grid, not masonry: `#pw-grid` is `display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px` (2-up at ≤1024px and at ≤768px), every `.pw-item` is `aspect-ratio: 3/4` and every image is `height: 100%; object-fit: cover`. Nine of the ten pieces are natively 3:4 so the crop costs almost nothing, and the `sizes` attribute on all ten is `(max-width: 1024px) 50vw, 25vw`. The lightbox reads each item's live rect at click time, so it needs no changes when the grid does.
- The gallery renders **12 pieces at a time** behind `#pw-gate` — a `grid-column: 1 / -1` child of the grid holding a `.pw-more` button that reveals the next 12, reports how many are left, hands focus to the first new card (`preventScroll`, or the browser fights Lenis) and hides itself when the matched set runs out. Changing a filter resets to the first batch. `#pw-gate[hidden]` must be restated in CSS: `display: flex` on the same element outranks the UA's `[hidden]` rule. Filtering and batching live in **one top-level script under the grid, never inside `__boot`** — `__boot` returns at its lib guard when the CDN bundles fail, and the gallery must survive that — and the script reads `window.gsap` at call time, not at init, because the deferred bundles have not executed when it first runs. Hiding is by `display`, which is why the three `opacity` reveal-fallback lists need no entry for the gate. The lightbox is untouched: `vis()` reads `.pw-hidden` off the live DOM.
- `#flash` is the mirror of `#gifts`: copy on the `--pad` rail, the Instagram panel **30px to its right** — `justify-content: flex-start; gap: 30px`. `.fl-left` keeps `flex: 1 1 460px; max-width: 640px`, so it grows to its cap before the gap is measured and the panel starts at `--pad + 640 + 30`; the leftover width falls to the right of the panel, which is the point — pinned to the far gutter by `space-between` the panel read as a detached card. `align-items: center` (not `flex-start`) because the panel is roughly half the copy column's height. The ≤1024px stack re-declares `align-items: stretch`, or the copy column would shrink-wrap and leave the rail.
- One shared `<img>` serves every expertise gallery (`#sk-modal-img`), so `open()` must blank it — `transition: 'none'`, `opacity 0`, `removeAttribute('src')`, force a reflow, restore — before `show(0)`, and `show()` must reveal on the image's own `load`, never behind a timer. A deferred `src` swap let the overlay's `.25s` fade paint the previously viewed photo for ~120ms on every reopen.
- Pictures use Title-Case-Hyphenated descriptive filenames (`Sainthood-Tattoo-Studio-Shopfront-Hull.jpg`) with responsive WebP siblings from `node scripts/make-webp-variants.js`. The script never enlarges, so check the real width before writing a `srcset` descriptor: the 1091px-wide gift card emits a `-1440.webp` that is still 1091px, and only its 480w/960w entries are honest.

## Design Aesthetic
- Follows the OS colour scheme: neutral `#0a0a0a` dark (default) or warm paper `#f7efeb` light, with a manual nav toggle; gold is the single accent
- Light **paper and ink share one warm hue family**, OKLCH ~50-56 against gold's 82: `--bg #f7efeb`, `--bg2 #fdf8f6`, `--fg #1b1613`, `--fg2 #4d443e`, `--dim #6e625b`. Rotating only the paper was not enough — the ink sat at hue 82-89, the yellow-green boundary, and it paints every word on the page, which is what still read as an olive cast (measured green hump `G − (R+B)/2` across light-mode screenshots: ≈0 before, −1.0 to −2.3 after). Rotate at constant L and C if these ever move, keep `--bg-rgb`/`--panel-rgb`/`--fg-rgb` in step (`247,239,235` / `253,248,246` / `27,22,19`), and update the light `#meta-theme-color` literal in each page's head script plus the `--cursor` data-URI stroke. A wide-gamut or "vivid" phone display stretches saturation along the existing hue, so this rotation is also the HDR mitigation; the next lever, if one is ever needed, is `@media (dynamic-range: high)` with `--bg: #faeeea`.
- No `sepia()` in any `--img-*` filter: it emits R>G>B and the `brightness()` that follows clips red first, so a full-viewport photo's highlights converge on olive (measured: the hero's brightest decile carried a +0.42 green hump, now −0.05). Warmth comes from `--ambient-hero`, which cannot skew channels.
- Gold is ONE token, `#c4a262`, in BOTH palettes — `--gold` / `--gold-rgb: 196,162,98`. There is no `--gold-display` and no per-theme gold; never reintroduce a second value. On the light page that measures 2.1:1, under the WCAG 3:1 non-text floor: a deliberate brand decision, so gold stays decorative in light mode and never carries a run of text under 18.66px. Small mono labels and tiny links use `--fg`/`--fg2` and carry gold as a rule (`.h-eyebrow::before`), ring, border or glyph. Gold text is allowed at display sizes (`em` accents in headings, hero title, `.ft-logo`, `.bk-step-n`); icon/star/arrow glyphs keep gold at any size. Section eyebrows (`.s-label`) are gone — headings lead their sections.
- Decorative gold ink carries its alpha in a token, not in `opacity`: `--wm-ink` (`.bk-wm`), `--gc-ink` and `--gc-ink-wm` (`.gf-card`), because GSAP writes inline `opacity` that outranks CSS. There was a third, `--ghost-ink`, for the reviews spotlight's ghost initial; the spotlight is gone and the token went with it — do not reintroduce an unused token. The voucher runs at two weights — illustration beside the copy, watermark behind it on phones — and it is the one decorative element that leaves the gold family in light mode: gold's lightness is 72.9 against paper at 95.7, so it tops out at 1.23:1 and looks washed out, while `rgba(var(--fg-rgb),.26)` measures 1.84:1 and reads as graphite on cream, which is what the artwork is. Dark keeps gold (`.12` / `.10`), double the watermark's alpha because the `Book` watermark hides behind a heading that carries its section while the voucher stands alone.
- A lone lowercase article in a display heading gets `.h-art` (`var(--display)`, `font-style: normal`, `font-weight: 400`, `font-size: 1.12em`). Cormorant Garamond's x-height is .39em against the display face's .45em (measured 78px vs 90px at 200px), so a standalone `a` in the serif reads as a speck — and its italic form reads as an `@`. Two uses today: `Book a session.` and `Give someone a tattoo.`
- Decorative display type opts out of selection: `-webkit-user-select: none; user-select: none` on `.h-title` and `.h-eyebrow`, joining `.bk-wm` and `.fq-num` which already had it. Selectable text accepts a text caret, so a visitor browsing with Chrome's caret browsing (F7) clicked the hero wordmark and got a blinking cursor sitting in it. Keep the opt-out to type nobody has a reason to copy — `.h-loc` (studio address and hours) stays selectable, and never reach for `caret-color: transparent` on `body` or any ancestor, which would blank the caret inside the enquiry-form fields and strip the navigation cursor from anyone using caret browsing deliberately.
- Every section divider is `border-top: 1px solid transparent; border-image: var(--seam) 1` — one token, two definitions. Dark keeps `.16` ink flanks into a `.55` gold centre; light needs `.42` ink flanks into solid gold, because `.16` ink on `#f7efeb` is invisible. Tune the light token only, and never hand-roll a divider gradient in a rule.
- Minimal UI — let artwork breathe
- Smooth, deliberate animations — nothing snappy or bouncy
- Monochrome or desaturated palette with one accent color
