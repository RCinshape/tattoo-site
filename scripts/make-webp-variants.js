#!/usr/bin/env node
// Generates responsive WebP variants for every JPG/PNG in /pictures into /pictures/web/.
// Originals are untouched (they remain the lightbox full-size sources).
// Run: node scripts/make-webp-variants.js
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const PICS   = path.join(__dirname, '..', 'pictures');
const OUT    = path.join(PICS, 'web');
const WIDTHS = [480, 960, 1440];
// The hero photo is rendered through `filter: grayscale(1)` in both themes, so a
// grayscale-encoded source is pixel-identical on screen and materially smaller.
const GRAYSCALE = new Set(['Emmy-Tattoo-Artist-Working-Black-and-Grey']);

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

(async () => {
  const files = fs.readdirSync(PICS).filter(f => /\.(jpe?g|png)$/i.test(f));
  for (const file of files) {
    const input = path.join(PICS, file);
    const base  = file.replace(/\.(jpe?g|png)$/i, '');
    for (const w of WIDTHS) {
      const out = path.join(OUT, `${base}-${w}.webp`);
      if (fs.existsSync(out)) continue;
      let pipe = sharp(input).resize({ width: w, withoutEnlargement: true });
      if (GRAYSCALE.has(base)) pipe = pipe.grayscale();
      await pipe.webp({ quality: 78 }).toFile(out);
      const kb = n => (n / 1024).toFixed(0) + 'KB';
      console.log(`${path.basename(out).padEnd(58)} ${kb(fs.statSync(out).size).padStart(7)}`);
    }
  }
})();
