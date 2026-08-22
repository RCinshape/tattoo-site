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
- The head script (before the CDN `<script src>` tags) resolves `localStorage['emmy-theme'] ?? matchMedia('(prefers-color-scheme: light)')` pre-paint, writes `data-theme` + `color-scheme` on `<html>`, updates `#meta-theme-color`, and fires a `themechange` event. `#theme-toggle` in `.n-actions` flips and persists it.
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

## Stable snapshot

`latest-stable` is a branch that points at the last known-good commit of `main`.

- Mark the current `main` as stable: `git branch -f latest-stable main && git push -f origin latest-stable`
- Restore the site to it: `git fetch origin && git reset --hard origin/latest-stable && git push --force-with-lease origin main`
- Inspect it without moving anything: `git log --oneline origin/latest-stable -5`

The live site is whatever `main` points at, so restoring means force-moving `main` back onto `latest-stable`.

## Pages

`index.html`, `portfolio.html` (`/portfolio`) and `legal.html` (`/legal` — privacy, cookies and website terms). The legal page carries its own minimal stylesheet and a copy of the theme + consent scripts; it deliberately does NOT duplicate the site CSS.

## Intro

The brand loader is kept in `index.html` but disabled by `window.__INTRO = false` in the head. Setting it to `true` re-enables the CSS intro (`html.intro-on #loader`); nothing else needs changing.

## Analytics consent

Google Analytics is never loaded until the visitor presses Accept in `#cookie-bar`. `window.__consent` (head script, all three pages) owns the `emmy-consent` key and injects gtag only on `granted`. Footer "Cookie settings" (`[data-cookie-settings]`) clears the key and re-opens the bar.

## Design Aesthetic
- Follows the OS colour scheme: neutral `#0a0a0a` dark (default) or warm paper `#f4f1ea` light, with a manual nav toggle; gold is the single accent
- Gold is ONE token, `#c4a262`, in BOTH palettes — `--gold` / `--gold-rgb: 196,162,98`. There is no `--gold-display` and no per-theme gold; never reintroduce a second value. On the light page that measures 2.1:1, under the WCAG 3:1 non-text floor: a deliberate brand decision, so gold stays decorative in light mode and never carries a run of text under 18.66px. Small mono labels, eyebrows and tiny links use `--fg`/`--fg2` and carry gold as a rule (`.s-label::before`), ring, border or glyph. Gold text is allowed at display sizes (`em` accents in headings, hero title, `.ft-logo`, `.bk-step-n`); icon/star/arrow glyphs keep gold at any size.
- Decorative gold ink carries its alpha in a token, not in `opacity`: `--ghost-ink` (`.sp-ghost`) and `--wm-ink` (`.bk-wm`), because GSAP writes inline `opacity` that outranks CSS.
- Minimal UI — let artwork breathe
- Smooth, deliberate animations — nothing snappy or bouncy
- Monochrome or desaturated palette with one accent color
