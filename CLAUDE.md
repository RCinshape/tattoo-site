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

## Design Aesthetic
- Dark background (near-black), high contrast
- Minimal UI — let artwork breathe
- Smooth, deliberate animations — nothing snappy or bouncy
- Monochrome or desaturated palette with one accent color
