#!/usr/bin/env node
// Order /portfolio by the authored scores in pictures/Tattoos 2026/catalog.json:
// complexity + colour (highest first), then complexity, then catalog position.
// Rewrites the #pw-grid cards, the ImageGallery JSON-LD, the sitemap
// /portfolio images and the home #work preview (the first 8 cards) in that
// one order; --check validates without writing.
//   node scripts/order-portfolio.js          (npm run order:portfolio)
//   node scripts/order-portfolio.js --check  (part of npm run check)
//
// Every publish: true row needs integer scores 1-5 on this scale:
// complexity 1 single small linework motif or lettering
//            2 small motif with light shading or a few elements
//            3 medium piece, several elements or realistic shading on one small subject
//            4 detailed composition or realistic subject with dense shading
//            5 large multi-element scene/portrait with dense realism
// colour     1 black / black-and-grey only
//            2 black-and-grey with small colour accents
//            3 one or two colours carrying the design
//            4 multi-colour on part of the design
//            5 full-colour painting
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const catalogFile = path.join(root, 'pictures', 'Tattoos 2026', 'catalog.json');
const pageFile = path.join(root, 'portfolio.html');
const sitemapFile = path.join(root, 'sitemap.xml');
const indexFile = path.join(root, 'index.html');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const LAZY = ' loading="lazy" decoding="async">';
const EAGER = ' fetchpriority="high" decoding="async">';
const imageUrl = base => `https://emmytattoo.com/pictures/web/${base}-1440.webp`;
// Home #work shows /portfolio's first row as cards and its second row as the peek.
const HOME_ROW = 4;
const VIEW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="7.5" y1="10" x2="12.5" y2="10"/><line x1="10" y1="7.5" x2="10" y2="12.5"/></svg>';

const rank = rows => {
  if (!Array.isArray(rows)) throw new Error('Catalog must be an array');
  const score = v => Number.isInteger(v) && v >= 1 && v <= 5;
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row && row.publish === true)
    .map(({ row, index }) => {
      if (!score(row.complexity) || !score(row.colour)) {
        throw new Error(`Missing or invalid portfolio score (complexity/colour 1-5): ${row.assetBase}`);
      }
      return { base: row.assetBase, complexity: row.complexity, colour: row.colour, index };
    })
    .sort((a, b) => (b.complexity + b.colour) - (a.complexity + a.colour)
      || b.complexity - a.complexity
      || a.index - b.index)
    .map(item => item.base);
};

const sameSet = (surface, found, order) => {
  const wanted = new Set(order);
  const seen = new Set();
  const extra = [];
  for (const base of found) {
    if (seen.has(base) || !wanted.has(base)) extra.push(base);
    seen.add(base);
  }
  const missing = order.filter(base => !seen.has(base));
  if (missing.length || extra.length) {
    throw new Error(`${surface} does not match published catalog rows: missing [${missing}], unexpected [${extra}]`);
  }
};

const gridCards = html => {
  const start = html.indexOf('<main id="pw-grid" aria-label="Portfolio">');
  const end = start === -1 ? -1 : html.indexOf('<div id="pw-gate"', start);
  if (start === -1 || end === -1) throw new Error('Portfolio grid markers not found');
  const grid = html.slice(start, end);
  const matches = [...grid.matchAll(/^  <div class="pw-item"[\s\S]*?^  <\/div>$/gm)];
  if (!matches.length) throw new Error('Portfolio cards not found');
  return { start, end, grid, matches };
};

const orderCards = (html, order) => {
  const { start, end, grid, matches } = gridCards(html);
  for (let i = 1; i < matches.length; i++) {
    const gap = grid.slice(matches[i - 1].index + matches[i - 1][0].length, matches[i].index);
    if (gap !== '\n\n') throw new Error('Unexpected content between portfolio cards');
  }
  const cards = new Map();
  const found = matches.map(match => {
    const key = match[0].match(/data-src="pictures\/web\/([^"]+)-1440\.webp"/);
    if (!key) throw new Error('Portfolio card without data-src');
    const base = key[1];
    const loads = match[0].split(LAZY).length + match[0].split(EAGER).length - 2;
    if (loads !== 1) throw new Error(`Portfolio card image needs loading="lazy" or fetchpriority="high": ${base}`);
    cards.set(base, match[0].replace(EAGER, LAZY));
    return base;
  });
  sameSet('Portfolio cards', found, order);
  cards.set(order[0], cards.get(order[0]).replace(LAZY, EAGER));
  const first = matches[0];
  const last = matches[matches.length - 1];
  const rebuilt = grid.slice(0, first.index)
    + order.map(base => cards.get(base)).join('\n\n')
    + grid.slice(last.index + last[0].length);
  return html.slice(0, start) + rebuilt + html.slice(end);
};

// The home preview copies each card's own label, alt and intrinsic size, so the
// same photograph carries the same accessible name on both pages.
const homeFields = card => {
  const get = (pattern, what) => {
    const match = card.match(pattern);
    if (!match) throw new Error(`Portfolio card without ${what}: ${card.slice(0, 120)}`);
    return match[1];
  };
  return {
    base: get(/data-src="pictures\/web\/([^"]+)-1440\.webp"/, 'data-src'),
    label: get(/aria-label="([^"]+)"/, 'aria-label'),
    width: get(/<img\b[^>]*\swidth="(\d+)"/, 'image width'),
    height: get(/<img\b[^>]*\sheight="(\d+)"/, 'image height'),
    alt: get(/<img\b[^>]*\salt="([^"]*)"/, 'image alt'),
    style: get(/<span class="pw-tag">([^<]+)<\/span>/, 'style tag').split(' · ')[0],
  };
};

const homeCard = c => `      <article class="wc" tabindex="0" role="button" aria-label="${c.label}" data-full="pictures/web/${c.base}-1440.webp">
        <img class="wc-img" src="pictures/web/${c.base}-960.webp" width="${c.width}" height="${c.height}"
             srcset="pictures/web/${c.base}-480.webp 480w, pictures/web/${c.base}-960.webp 960w"
             sizes="(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 25vw"
             alt="${c.alt}" loading="lazy" decoding="async">
        <div class="wc-view">${VIEW_ICON}</div>
        <div class="wc-lbl"><div class="wc-sub">${c.style}</div></div>
      </article>`;

// The peek shows at most a 96px strip of each photo under a fade, so it only
// ever needs the 480 variant, whatever the viewport or pixel density.
const homePeek = c => `      <img src="pictures/web/${c.base}-480.webp"
           alt="${c.alt}" loading="lazy" decoding="async">`;

const between = (html, open, close, body, what) => {
  const start = html.indexOf(open);
  const end = start === -1 ? -1 : html.indexOf(close, start + open.length);
  if (start === -1 || end === -1) throw new Error(`Home ${what} markers not found`);
  return html.slice(0, start + open.length) + body + html.slice(end);
};

const orderHome = (home, portfolio) => {
  const cards = gridCards(portfolio).matches.slice(0, HOME_ROW * 2).map(match => homeFields(match[0]));
  const row = cards.slice(0, HOME_ROW), peek = cards.slice(HOME_ROW);
  const grid = '\n\n' + row.map(homeCard).join('\n\n') + '\n\n';
  const strip = '\n' + peek.map(homePeek).join('\n') + '\n';
  return between(
    between(home, '<div class="w-grid">', '  </div>\n  <div class="w-peek-wrap">', grid, 'card row'),
    '<div class="w-peek">', '    </div>\n    <a class="w-more"', strip, 'peek');
};

const orderSchema = (html, order) => {
  const block = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/);
  const data = block && JSON.parse(block[1]);
  if (!data || data['@type'] !== 'ImageGallery' || !Array.isArray(data.associatedMedia)) {
    throw new Error('ImageGallery JSON-LD not found');
  }
  const media = new Map();
  const found = data.associatedMedia.map(item => {
    const key = String(item && item.contentUrl).match(/^https:\/\/emmytattoo\.com\/pictures\/web\/(.+)-1440\.webp$/);
    const base = key ? key[1] : String(item && item.contentUrl);
    media.set(base, item);
    return base;
  });
  sameSet('ImageGallery associatedMedia', found, order);
  data.associatedMedia = order.map(base => media.get(base));
  const body = JSON.stringify(data, null, 2).split('\n').map(line => '  ' + line).join('\n');
  const at = block.index + block[0].indexOf(block[1]);
  return html.slice(0, at) + body + html.slice(at + block[1].length);
};

const orderSitemap = (sitemap, order) => {
  const start = sitemap.indexOf('<loc>https://emmytattoo.com/portfolio</loc>');
  const end = start === -1 ? -1 : sitemap.indexOf('  </url>', start);
  if (start === -1 || end === -1) throw new Error('Sitemap /portfolio entry not found');
  const entry = sitemap.slice(start, end);
  const run = entry.match(/(    <image:image>\n      <image:loc>https:\/\/emmytattoo\.com\/pictures\/web\/[^<]+-1440\.webp<\/image:loc>\n    <\/image:image>\n)+/);
  if (!run) throw new Error('Sitemap /portfolio images not found');
  const found = [...run[0].matchAll(/<image:loc>https:\/\/emmytattoo\.com\/pictures\/web\/([^<]+)-1440\.webp<\/image:loc>/g)].map(m => m[1]);
  sameSet('Sitemap /portfolio images', found, order);
  const blocks = order.map(base => `    <image:image>\n      <image:loc>${imageUrl(base)}</image:loc>\n    </image:image>\n`).join('');
  const updated = entry.slice(0, run.index) + blocks + entry.slice(run.index + run[0].length);
  return sitemap.slice(0, start) + updated + sitemap.slice(end);
};

try {
  const order = rank(JSON.parse(fs.readFileSync(catalogFile, 'utf8')));
  if (!order.length) throw new Error('No published catalog rows');
  const html = read(pageFile);
  const home = read(indexFile);
  const sitemap = read(sitemapFile);
  const nextHtml = orderSchema(orderCards(html, order), order);
  const nextHome = orderHome(home, nextHtml);
  const nextSitemap = orderSitemap(sitemap, order);
  if (process.argv.includes('--check')) {
    if (nextHtml !== html || nextHome !== home || nextSitemap !== sitemap) {
      console.error('Portfolio order is stale. Run node scripts/order-portfolio.js and commit portfolio.html, index.html and sitemap.xml.');
      process.exitCode = 1;
    } else console.log(`Portfolio order and home preview match catalog scores (${order.length} pieces).`);
  } else {
    if (nextHtml !== html) fs.writeFileSync(pageFile, nextHtml);
    if (nextHome !== home) fs.writeFileSync(indexFile, nextHome);
    if (nextSitemap !== sitemap) fs.writeFileSync(sitemapFile, nextSitemap);
    console.log(`Ordered ${order.length} portfolio pieces by complexity + colour; home shows the first ${HOME_ROW * 2}.`);
  }
} catch (error) {
  console.error(`Portfolio ordering failed: ${error.message}`);
  process.exitCode = 1;
}
