#!/usr/bin/env node
// Generates 96px square WebP thumbnails for every seeded review avatar into
// /google.reviews/web/. Originals are untouched. The cards render these at
// 32 CSS px, so 96 covers DPR 3; the sources are 146-165px JPEG/PNG and cost
// 97.1KB across the seven actually used.
// Run: node scripts/make-avatar-thumbs.js
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SRC = path.join(__dirname, '..', 'google.reviews');
const OUT = path.join(SRC, 'web');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

(async () => {
  for (const file of fs.readdirSync(SRC).filter(f => /\.(jpe?g|png)$/i.test(f))) {
    const out = path.join(OUT, file.replace(/\.(jpe?g|png)$/i, '') + '-96.webp');
    if (fs.existsSync(out)) continue;
    await sharp(path.join(SRC, file))
      .resize({ width: 96, height: 96, fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(out);
    console.log(`${path.basename(out).padEnd(40)} ${(fs.statSync(out).size / 1024).toFixed(1)}KB`);
  }
})();
