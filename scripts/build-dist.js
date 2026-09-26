#!/usr/bin/env node
// Cloudflare Pages build: copy only the public site into dist/ so repository
// files (docs, tests, scripts, workflows, catalog, originals) are never served.
// Fails the build when any page or sitemap references a file missing from dist/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const PAGES = ['index.html', 'book.html', 'portfolio.html', 'legal.html', 'aftercare.html', 'gift-cards.html'];
const FILES = [...PAGES, 'sitemap.xml', 'robots.txt', '_headers', '_redirects'];
const DIRS = ['fonts', 'js', 'pictures/web', 'google.reviews/web'];
const FLAT = ['pictures']; // top-level files only, no subfolders

fs.rmSync(out, { recursive: true, force: true });
const copy = rel => {
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.copyFileSync(path.join(root, rel), path.join(out, rel));
};
FILES.forEach(copy);
for (const dir of DIRS) fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
for (const dir of FLAT) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.isFile()) copy(path.posix.join(dir, entry.name));
  }
}

const missing = new Set();
const check = (ref, from) => {
  let p = ref.replace(/^https:\/\/emmytattoo\.com/, '').split(/[?#]/)[0];
  if (!p || /^(?:[a-z]+:|\/\/|#)/i.test(p) || p.startsWith('data:')) return;
  p = decodeURIComponent(p.startsWith('/') ? p.slice(1) : p);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = path.join(out, p);
  if (!fs.existsSync(file) && !fs.existsSync(file + '.html')) missing.add(`${from}: ${ref}`);
};
for (const file of [...PAGES, 'sitemap.xml']) {
  const text = fs.readFileSync(path.join(out, file), 'utf8');
  for (const m of text.matchAll(/\b(?:src|href|content|poster)="([^"]+)"/g)) {
    if (/^(?:\/|pictures\/|fonts\/|js\/|google\.reviews\/|https:\/\/emmytattoo\.com\/)/.test(m[1])) check(m[1], file);
  }
  for (const m of text.matchAll(/\bsrcset="([^"]+)"/g)) m[1].split(',').forEach(s => check(s.trim().split(/\s+/)[0], file));
  for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) check(m[1], file);
  for (const m of text.matchAll(/<(?:loc|image:loc)>([^<]+)</g)) check(m[1], file);
  for (const m of text.matchAll(/['"]((?:google\.reviews|pictures)\/[^'"]+\.(?:webp|jpe?g|png))['"]/g)) check(m[1], file);
}
if (missing.size) {
  console.error('dist/ is missing referenced files:\n' + [...missing].join('\n'));
  process.exit(1);
}
console.log(`Built dist/ (${PAGES.length} pages; referenced assets all present).`);
