#!/usr/bin/env node
// Run: node scripts/compress-images.js
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const PICS = path.join(__dirname, '..', 'pictures');

const jobs = [
  // Hero banner — target ~400KB, max 1440px wide
  { src: 'BANNER.jpg',      maxW: 1440, quality: 76 },
  // Portfolio images — max 1200px, kept sharp for lightbox
  { src: '2cropped..jpg',   maxW: 1200, quality: 80 },
  { src: '4cropped.jpg',    maxW: 1200, quality: 80 },
  { src: '5cropped.jpg',    maxW: 1200, quality: 80 },
  { src: '7cropped.jpg',    maxW: 1200, quality: 80 },
  { src: '9cropped.jpg',    maxW: 1200, quality: 80 },
];

(async () => {
  for (const { src, maxW, quality } of jobs) {
    const input  = path.join(PICS, src);
    const before = fs.statSync(input).size;

    const tmp = input + '.tmp';
    await sharp(input)
      .resize({ width: maxW, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toFile(tmp);

    const after = fs.statSync(tmp).size;
    fs.renameSync(tmp, input);

    const kb = n => (n / 1024).toFixed(0) + 'KB';
    const arrow = after < before ? '↓' : '→';
    console.log(`${src.padEnd(20)} ${kb(before).padStart(7)} ${arrow} ${kb(after).padStart(7)}`);
  }
})();
