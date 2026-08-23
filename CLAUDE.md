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
- Section rules MUST write `padding: <v> var(--pad) <v>`, never a literal. Hardcoding it per-rule is how `.w-grid` drifted to 16px and `.trs-spotlight` to 48px while every sibling sat at 24px.
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

## Intro

The brand loader is kept in `index.html` but disabled by `window.__INTRO = false` in the head. Setting it to `true` re-enables the CSS intro (`html.intro-on #loader`); nothing else needs changing.

## Analytics

Google Analytics 4 loads on first paint from an inline head script on all three pages — no consent gate, no cookie bar, no `window.__consent`, no `emmy-consent` key. GA4 is configured for page views only (no ads, remarketing or profiling signals), which is the minimum-friction setup: the site is usable without clicking anything, and the opt-out is documented on `/legal` (browser cookie blocking or a private window). Do not reintroduce a banner. The script keeps two guards: it skips localhost, and it picks `G-M23QSCSBZ9` on `.co.uk` else `G-J8X45ECTLH`.

## Nav

The nav is bare over the hero and becomes a bar — blurred surface, bottom border, `Emmy Tattoo` wordmark at top left — exactly when the first section seam (`#work`'s top border) reaches it. That swap is a `ScrollTrigger` on `#work-outer` with `start: 'top <--nav-h>'`, not a scroll-offset threshold: `#nav` owns `--nav-h` (94px desktop, 78px at ≤768px) and the trigger re-reads it on every refresh, so the breakpoint needs no second number. `.n-logo` is `opacity: 0` until `#nav.s`; it keeps its box either way, so nothing shifts. `#nav` has no `::before` scrim — over the hero the nav sits on `.hero-bg-photo::after`, and `#nav:not(.s) .n-item` carries the hero text-shadow plate. `html.libs-failed` and the `<noscript>` block pin the bar on, because with no scroll observer the alternative is a nav that never gets a background.

Every nav icon sits on one 16px rhythm: `#nav { gap: 16px }` and `.n-actions { gap: 16px }` with no `margin-left` on `.n-actions` — that margin plus a 26px nav gap is what once left the theme toggle 42px from Facebook. Text links keep `.n-links { gap: 26px }`.

## Footer

The footer carries legal links only — Privacy & Cookies, Terms (subpages prefix a Home link). Social, portfolio and about links live in the nav, not here. There are no buttons in the footer, so no `.ft-btn` rule exists any more.

## Attention budget

The page spends attention in one direction: intrigue → work → reviews → ask. Enforced by three rules.

1. **The hero has no CTA.** No enquiry pill, no "view the work" button — only `.h-scroll` ("See the work", a 34px gold rule plus a mono label, `href="#work"`). The always-available quiet contact is the nav's Instagram/Facebook icons; the loud ask is `#book`, which sits after Reviews and FAQ in the markup. Do not re-add a hero button or a sticky enquiry bar.
2. **`#work` shows one row, then a gate.** `.w-grid` holds four interactive `.wc` cards in a 4-up grid (`.wc:nth-child(n+3)` is `display: none` at ≤1024px, where the grid is 2-up, so it is always exactly one row; ≤480px shows two stacked). Four columns shrink each card to ~327px at 1440, so the in-card chrome is sized to match (`.wc-lbl` `52px 14px 14px`, `.wc-view` 46px, its glyph 19px) and every card/peek `sizes` ends `25vw`. `.w-peek` follows: four decorative `<img>` under `aria-hidden` + `pointer-events: none`, clipped to `clamp(64px, 6vw, 96px)` and masked to transparent, with `.w-more` (gold ring, bobbing down-arrow, "See all work") pulled `-28px` up so it straddles the fade. That gate is the only CTA in the section — never put a second button below the grid. Navigation to `/portfolio` is a native `@view-transition { navigation: auto; }` cross-fade declared in all three documents; never hand-roll it in JS.
3. **One left rail, two staged centres.** Every eyebrow, heading, paragraph and list starts at the `--pad` gutter so the eye learns one vertical line. `text-align: center` is allowed only for the reviews spotlight quote (`.trs-spotlight`), the booking close (`.bk-in`), and the work gate (a symbol on the fade's axis). `#flash` and `#gifts` were centred and are now on the rail; adding a third centred text block is a regression.

## Third-party embeds

Every iframe on the site is injected by one loader — the standalone `<script>` after `__boot`'s block, deliberately outside `__boot` because that function returns early when the CDN libs fail and a map must not depend on a CDN. A container opts in with `data-embed="<url>"` plus optional `data-embed-title`, `data-embed-scroll="no"`, and gets its iframe from an `IntersectionObserver` at `rootMargin: '600px 0px'` (one screen of warning), marked `data-embed-loaded="1"`. There is no click-to-load facade and no "Load map" button; never reintroduce one. Two consumers today: `#loc-map-wrap` and `.fl-ig-frame`.

- The map embed takes **coordinates** (`?q=53.7558,-0.3587&output=embed&z=17`), not the address string: the `?q=<address>` form opens with a permanently blank white place card over the map. The address is set in type above it, and the four Navigate buttons handle routing. `#loc-map-wrap` also carries a `<noscript>` copy of the same iframe, so a JS-less visitor still gets a map.
- Google's `output=embed` map does **not** trap the wheel (vertical scroll passes through to the page; zoom needs ctrl), so the iframe stays fully interactive with no click, hover-dwell or `pointer-events` gate. Measured, not assumed — if you ever change the embed URL, re-measure before adding a gate.
- The Instagram panel is Instagram's own profile embed (`/emmy.tattoo/embed`) — always current, no post IDs to maintain. Its height must equal the embed's content height or the frame scrolls and eats the wheel: `calc(198px + 66.7cqw)` (~198px of chrome + two grid rows at a third of the width each), with a `520px` fallback outside `@supports (container-type: inline-size)`. `container-type` sits on the outer `.fl-ig` and the `cqw` height on the child `.fl-ig-frame` — a container query unit read on its own container is a cyclic dependency and silently falls back to the viewport width, which stretched the panel to 1158px. Its white surface is Instagram's chrome, which is why `#fff` is a sanctioned literal there.
- Instagram's embed has **no theme parameter**: `?theme=dark`, `?cr=1&theme=dark` and `prefers-color-scheme: dark` all return the same white widget, and `/embed/captioned/` is not valid for a profile URL (it renders Instagram's "Page isn't available" shell, which is the only reason a dark background ever appears). oEmbed exposes `maxwidth`, `hidecaption` and `omitscript` only. So the panel cannot follow the visitor's scheme, and `filter: invert()` would negate the photographs too — instead `:root:not([data-theme="light"]) .fl-ig-frame` treats the white as deliberate: gold hairline at `.18` and `0 18px 50px rgba(0,0,0,.55)`, so it reads as a print on a dark wall.

## Section media

- `#location` pairs the shopfront photo with the map in `.loc-media` (`grid-template-columns: 1fr 1fr`, one column at ≤768px). Both sides are `aspect-ratio: 5/3` so the row ends level; `.loc-photo` needs an explicit `height: auto`, because the `width`/`height` attributes are presentational hints and `aspect-ratio` is ignored while both axes are specified. `.loc-photo` reveals with `.loc-map-wrap` in one tween and is listed in all three reveal-fallback selector lists.
- `#gifts` is a two-column row: copy on the `--pad` rail in a `flex: 0 0 clamp(320px, 34%, 520px)` column, the voucher filling the rest out to the right gutter. The voucher is **not an `<img>`** — `.gf-card` is an empty `role="img"` div at `aspect-ratio: 1091/494` whose `background` is `var(--gc-ink)` and whose `mask-image` is `pictures/web/Emmy-Tattoo-Gift-Card-Voucher-Ink.webp`, a lossless alpha-only mask lifted from the grey artwork (`sharp().greyscale().linear(-255/162, 255*190/162)`: paper ≈ grey 190 → alpha 0, ink ≈ 28 → alpha 255). Painting the artwork from a token is what lets one asset read in both themes with no per-theme `filter`, and it is why the section needs no `overflow: hidden` and the card no rotation, stroke or edge fade. The mask lives in `pictures/web/` so `make-webp-variants.js`, which only reads `pictures/*.{jpg,png}`, never re-encodes it lossily.
- One shared `<img>` serves every expertise gallery (`#sk-modal-img`), so `open()` must blank it — `transition: 'none'`, `opacity 0`, `removeAttribute('src')`, force a reflow, restore — before `show(0)`, and `show()` must reveal on the image's own `load`, never behind a timer. A deferred `src` swap let the overlay's `.25s` fade paint the previously viewed photo for ~120ms on every reopen.
- Pictures use Title-Case-Hyphenated descriptive filenames (`Sainthood-Tattoo-Studio-Shopfront-Hull.jpg`) with responsive WebP siblings from `node scripts/make-webp-variants.js`. The script never enlarges, so check the real width before writing a `srcset` descriptor: the 1091px-wide gift card emits a `-1440.webp` that is still 1091px, and only its 480w/960w entries are honest.

## Design Aesthetic
- Follows the OS colour scheme: neutral `#0a0a0a` dark (default) or warm paper `#f6f0ea` light, with a manual nav toggle; gold is the single accent
- Light paper must stay **warmer than the gold**: `--bg #f6f0ea` is OKLCH hue 68 and `--bg2 #fcf9f5` is 75, against gold's 82. The old `#f4f1ea`/`#fbf9f5` sat at 87/85 — greener than the accent — which is what read as a page-wide olive cast. Rotate hue at constant L and C if these ever move, and keep `--bg-rgb`/`--panel-rgb` in step (`246,240,234` / `252,249,245`), including the light `#meta-theme-color` literal in each page's head script and the `--cursor` data-URI stroke.
- No `sepia()` in any `--img-*` filter: it emits R>G>B and the `brightness()` that follows clips red first, so a full-viewport photo's highlights converge on olive (measured: the hero's brightest decile carried a +0.42 green hump, now −0.05). Warmth comes from `--ambient-hero`, which cannot skew channels.
- Gold is ONE token, `#c4a262`, in BOTH palettes — `--gold` / `--gold-rgb: 196,162,98`. There is no `--gold-display` and no per-theme gold; never reintroduce a second value. On the light page that measures 2.1:1, under the WCAG 3:1 non-text floor: a deliberate brand decision, so gold stays decorative in light mode and never carries a run of text under 18.66px. Small mono labels and tiny links use `--fg`/`--fg2` and carry gold as a rule (`.h-eyebrow::before`), ring, border or glyph. Gold text is allowed at display sizes (`em` accents in headings, hero title, `.ft-logo`, `.bk-step-n`); icon/star/arrow glyphs keep gold at any size. Section eyebrows (`.s-label`) are gone — headings lead their sections.
- Decorative gold ink carries its alpha in a token, not in `opacity`: `--ghost-ink` (`.sp-ghost`), `--wm-ink` (`.bk-wm`) and `--gc-ink` (`.gf-card`), because GSAP writes inline `opacity` that outranks CSS. `--gc-ink` is deliberately double `--wm-ink` on the dark page (`.12` vs `.06`): the watermark sits behind a heading that carries the section on its own, while the voucher is the only thing on its side of the row, and at `.06` it read as empty space.
- Every section divider is `border-top: 1px solid transparent; border-image: var(--seam) 1` — one token, two definitions. Dark keeps `.16` ink flanks into a `.55` gold centre; light needs `.42` ink flanks into solid gold, because `.16` ink on `#f6f0ea` is invisible. Tune the light token only, and never hand-roll a divider gradient in a rule.
- Minimal UI — let artwork breathe
- Smooth, deliberate animations — nothing snappy or bouncy
- Monochrome or desaturated palette with one accent color
