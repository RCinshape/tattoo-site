#!/usr/bin/env node
// Generates responsive WebPs from flat originals and the curated Tattoos 2026 catalog.
// Authored originals are never modified; browser galleries use the WebP variants.
// Run: node scripts/make-webp-variants.js
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const convert = require('heic-convert');

const PICS   = path.join(__dirname, '..', 'pictures');
const OUT    = path.join(PICS, 'web');
const WIDTHS = [480, 960, 1440];
// The hero photo is rendered through `filter: grayscale(1)`, so a
// grayscale-encoded source is pixel-identical on screen and materially smaller.
const GRAYSCALE = new Set(['Emmy-Tattoo-Artist-Working-Black-and-Grey']);
const INTAKE = path.join(PICS, 'Tattoos 2026');
const STYLES = new Set(['fine-line', 'fine-art', 'realism', 'illustrative', 'ornamental', 'lettering']);
const HEALING = new Set(['fresh-looking', 'healed-looking', 'uncertain']);
const REPLACEMENTS = new Set([
  'Fine-Line-Abstract-Continuous-Flower-Tattoo',
  'fine-line-spotted-shark-arm-tattoo-emmy-tattoo',
  'surreal-face-snake-hand-tattoo-emmy-tattoo',
  'Pug-Dog-Portrait-Floral-Thigh-Tattoo',
  'Classical-Mythology-Hermes-Fine-Art-Tattoo',
  'Wolf-Portrait-Clock-Forest-Forearm-Tattoo',
  'Realistic-Cat-Portrait-Tattoos-Emmy-Tattoo',
  'Black-Pug-Portrait-Tattoo-With-Daisies',
  'Realistic-Thresher-Shark-Tattoo-Marine-Life',
  'Flying-Barn-Owl-Black-and-Grey-Tattoo'
].map(base => base.toLowerCase()));
const safeName = name => typeof name === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(name);

const inputs = () => {
  const sources = new Map();
  for (const file of fs.readdirSync(PICS).filter(f => /\.(jpe?g|png)$/i.test(f))) {
    const base = file.replace(/\.[^.]+$/, '');
    const key = base.toLowerCase();
    if (sources.has(key)) throw new Error(`Duplicate flat image base: ${base}`);
    sources.set(key, { input: path.join(PICS, file), base });
  }
  if (!fs.existsSync(INTAKE)) return sources.values();
  const catalog = JSON.parse(fs.readFileSync(path.join(INTAKE, 'catalog.json'), 'utf8'));
  if (!Array.isArray(catalog)) throw new Error('Image catalog must be an array');
  const published = new Set();
  for (const row of catalog) {
    if (!row || !safeName(row.file) || !Array.isArray(row.styles) || !row.styles.length ||
        row.styles.some(style => !STYLES.has(style)) || !HEALING.has(row.healing) ||
        typeof row.publish !== 'boolean' || typeof row.alt !== 'string' || !row.alt.trim()) {
      throw new Error('Invalid image catalog entry');
    }
    if (!row.publish) continue;
    if (!safeName(row.assetBase) || !/^[a-z0-9-]+$/i.test(row.assetBase) ||
        !/\.(jpe?g|png|heic)$/i.test(row.file)) throw new Error(`Invalid published image: ${row.file}`);
    const key = row.assetBase.toLowerCase();
    if (published.has(key)) throw new Error(`Duplicate published asset base: ${row.assetBase}`);
    if (sources.has(key) && !REPLACEMENTS.has(key)) throw new Error(`Unexpected flat image replacement: ${row.assetBase}`);
    const input = path.join(INTAKE, row.file);
    if (!fs.statSync(input).isFile()) throw new Error(`Missing selected image: ${row.file}`);
    published.add(key);
    sources.set(key, { input, base: row.assetBase });
  }
  return sources.values();
};

(async () => {
  const sources = inputs();
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  for (const { input, base } of sources) {
    const bytes = fs.readFileSync(input);
    const decoded = bytes.subarray(4, 8).toString() === 'ftyp'
      ? Buffer.from(await convert({ buffer: bytes, format: 'PNG' }))
      : bytes;
    const image = sharp(decoded).rotate();
    for (const w of WIDTHS) {
      const out = path.join(OUT, `${base}-${w}.webp`);
      let pipe = image.clone().resize({ width: w, withoutEnlargement: true });
      if (GRAYSCALE.has(base)) pipe = pipe.grayscale();
      await pipe.webp({ quality: 78 }).toFile(out);
      const kb = n => (n / 1024).toFixed(0) + 'KB';
      console.log(`${path.basename(out).padEnd(58)} ${kb(fs.statSync(out).size).padStart(7)}`);
    }
  }
})().catch(error => {
  console.error(`Failed generating responsive images (${PICS} -> ${OUT}):`, error);
  process.exitCode = 1;
});
