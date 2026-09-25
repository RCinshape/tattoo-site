const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const project = path.resolve(__dirname, '..');
const pages = ['index.html', 'book.html', 'portfolio.html', 'legal.html', 'aftercare.html', 'gift-cards.html'];
const document = body => `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body>\n${body}\n</body></html>`;

function fixture(t, script) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emmy-tooling-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.join(project, 'scripts', script), path.join(root, 'scripts', script));
  return root;
}

function run(root, script, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    // Deliberately not the fixture root: scripts must resolve their own inputs.
    cwd: os.tmpdir(),
    env: { ...process.env, NODE_PATH: path.join(project, 'node_modules') },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function htmlFixture(t, html = document('<main><p>Valid page</p></main>')) {
  const root = fixture(t, 'check-balance.js');
  for (const page of pages) fs.writeFileSync(path.join(root, page), html);
  return root;
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function solid(file, width, height, background) {
  await sharp({ create: { width, height, channels: 3, background } }).toFile(file);
}

async function decoded(file) {
  // Decode an isolated in-memory snapshot. On Windows, passing the path to
  // libvips can retain a cached file handle and prevent the child generator
  // from atomically replacing that output on its next run.
  const encoded = fs.readFileSync(file);
  return sharp(encoded).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
}

function pixel(image, x, y) {
  const offset = (y * image.info.width + x) * image.info.channels;
  return [...image.data.subarray(offset, offset + 3)];
}

function dominant(rgb, channel) {
  assert.ok(rgb[channel] > 180, `Expected dominant channel ${channel}, got ${rgb}`);
  for (let i = 0; i < 3; i++) {
    if (i !== channel) assert.ok(rgb[i] < 60, `Unexpected colour channel: ${rgb}`);
  }
}

test('HTML CLI accepts raw text, foreign content, void elements and legal optional end tags', t => {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><title>Structural fixture</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><path d='M0 0h1v1z'/></svg>">
<style>/* <button> is documentation, not markup. */ body { color: white; }</style>
<script>const template = '<div><button>Template</button></div>'; const comment = '<li>';</script>
</head><body>
<main><button type="button"><span>Answer</span></button>
<ul><li>One<li>Two</ul><p>Optional paragraph ending<p>Another paragraph</p>
<img src="sample.png" alt="Sample"><br><input type="text">
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"><stop offset="0" /></linearGradient></defs><path d="M0 0h10v10z" /><foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">Foreign content</div></foreignObject></svg>
</main></body></html>`;
  const root = htmlFixture(t, html);
  // Filesystem configuration must not override the CLI's structural policy.
  fs.writeFileSync(path.join(root, '.htmlvalidate.json'), '{"extends":["not-a-real-preset"]}');
  const result = run(root, 'check-balance.js');
  assert.equal(result.status, 0, result.stderr);
});

test('HTML CLI rejects structural defects with file locations and rule names', async t => {
  const cases = [
    ['crossed nesting with equal counts', '<div><span>Crossed</div></span>', 'close-order'],
    ['stray closing tag', '<p>Text</p></div>', 'close-order'],
    ['duplicate IDs', '<div id="same"></div><span id="same"></span>', 'no-dup-id'],
    ['duplicate attributes', '<div class="one" class="two"></div>', 'no-dup-attr'],
    ['block inside button', '<button type="button"><div>Invalid</div></button>', 'element-permitted-content'],
    ['attributes on end tag', '<div>Text</div class="bad">', 'close-attr'],
    ['missing attribute spacing', '<div id="one"class="two"></div>', 'attr-spacing'],
    ['void closing tag', '<img src="sample.png" alt="Sample"></img>', 'void-content'],
    ['self-closed script', '<script src="sample.js"/>', 'script-element'],
  ];
  for (const [name, markup, rule] of cases) {
    await t.test(name, t => {
      const root = htmlFixture(t);
      fs.writeFileSync(path.join(root, 'index.html'), document(markup));
      const result = run(root, 'check-balance.js');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /index\.html:\d+:\d+:/);
      assert.ok(result.stderr.includes(`[${rule}]`), result.stderr);
      assert.ok(result.stdout.includes('gift-cards.html'), 'Later valid pages must still be checked');
    });
  }
});

test('HTML CLI rejects missing doctype and reports missing files without stopping later pages', t => {
  const root = htmlFixture(t);
  fs.writeFileSync(path.join(root, 'index.html'), document('<main>Text</main>').replace('<!DOCTYPE html>\n', ''));
  fs.unlinkSync(path.join(root, 'book.html'));
  const result = run(root, 'check-balance.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index\.html:\d+:\d+:[^\n]*\[missing-doctype\]/);
  assert.match(result.stderr, /book\.html:1:1:/);
  assert.ok(result.stdout.includes('gift-cards.html'), 'A missing file must not prevent later validation');
});

test('responsive generator replaces stale variants, preserves originals and grayscales only the hero', async t => {
  const script = 'make-webp-variants.js';
  const root = fixture(t, script);
  const sourceDir = path.join(root, 'pictures');
  const out = path.join(sourceDir, 'web');
  fs.mkdirSync(out, { recursive: true });
  const source = path.join(sourceDir, 'Colour.png');
  const heroBase = 'Emmy-Tattoo-Artist-Working-Black-and-Grey';
  const hero = path.join(sourceDir, `${heroBase}.JPG`);
  const small = path.join(sourceDir, 'Small.JPEG');
  await solid(source, 600, 300, '#ff0000');
  await solid(hero, 60, 30, '#ff0000');
  await solid(small, 40, 20, '#0000ff');
  for (const width of [480, 960, 1440]) {
    await solid(path.join(out, `Colour-${width}.webp`), 4, 4, '#0000ff');
  }
  const mask = path.join(out, 'Emmy-Tattoo-Gift-Card-Voucher-Ink.webp');
  const authored = path.join(out, 'Authored.webp');
  fs.writeFileSync(mask, 'authored mask must remain untouched');
  fs.writeFileSync(authored, 'unrelated authored image');
  const nestedDir = path.join(sourceDir, 'nested');
  fs.mkdirSync(nestedDir);
  const nested = path.join(nestedDir, 'Nested.png');
  await solid(nested, 10, 10, '#00ff00');
  const protectedFiles = [source, hero, small, mask, authored, nested];
  const before = protectedFiles.map(hash);

  const first = run(root, script);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(protectedFiles.map(hash), before);
  for (const width of [480, 960, 1440]) {
    const colour = await decoded(path.join(out, `Colour-${width}.webp`));
    assert.equal(colour.info.width, Math.min(600, width));
    assert.equal(colour.info.height, Math.min(600, width) / 2);
    dominant(pixel(colour, 10, 10), 0);
    const gray = await decoded(path.join(out, `${heroBase}-${width}.webp`));
    assert.equal(gray.info.width, 60);
    assert.equal(gray.info.height, 30);
    const rgb = pixel(gray, 10, 10);
    assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 3, `Hero is not grayscale: ${rgb}`);
    const tiny = await decoded(path.join(out, `Small-${width}.webp`));
    assert.equal(tiny.info.width, 40);
    assert.equal(tiny.info.height, 20);
    dominant(pixel(tiny, 10, 10), 2);
    assert.equal(fs.existsSync(path.join(out, `Nested-${width}.webp`)), false);
  }

  await solid(source, 600, 300, '#00ff00');
  const changed = protectedFiles.map(hash);
  const second = run(root, script);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(protectedFiles.map(hash), changed);
  for (const width of [480, 960, 1440]) {
    dominant(pixel(await decoded(path.join(out, `Colour-${width}.webp`)), 10, 10), 1);
  }
});

test('catalog selects the curated source, preserves alternates and applies EXIF orientation', async t => {
  const script = 'make-webp-variants.js';
  const root = fixture(t, script);
  const pictures = path.join(root, 'pictures');
  const intake = path.join(pictures, 'Tattoos 2026');
  fs.mkdirSync(intake, { recursive: true });
  const base = 'Fine-Line-Abstract-Continuous-Flower-Tattoo';
  const flat = path.join(pictures, `${base}.png`);
  const selected = path.join(intake, 'Selected.jpg');
  const alternate = path.join(intake, 'Alternate.png');
  await solid(flat, 80, 40, '#0000ff');
  const red = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer();
  await sharp({ create: { width: 80, height: 40, channels: 3, background: '#00ff00' } })
    .composite([{ input: red, left: 0, top: 0 }]).withMetadata({ orientation: 6 }).jpeg().toFile(selected);
  await solid(alternate, 20, 20, '#0000ff');
  const row = { original: 'Old.jpg', file: 'Selected.jpg', styles: ['fine-line'], healing: 'uncertain', publish: true, assetBase: base, alt: 'Selected photograph.' };
  fs.writeFileSync(path.join(intake, 'catalog.json'), JSON.stringify([
    row, { ...row, file: 'Alternate.png', publish: false, assetBase: null }
  ]));
  const before = [flat, selected, alternate].map(hash);
  const result = run(root, script);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual([flat, selected, alternate].map(hash), before);
  for (const width of [480, 960, 1440]) {
    const output = path.join(pictures, 'web', `${base}-${width}.webp`);
    const image = await decoded(output);
    assert.equal(image.info.width, 40);
    assert.equal(image.info.height, 80);
    dominant(pixel(image, 20, 10), 0);
    dominant(pixel(image, 20, 70), 1);
    assert.equal((await sharp(fs.readFileSync(output)).metadata()).exif, undefined);
    assert.equal(fs.existsSync(path.join(pictures, 'web', `Alternate-${width}.webp`)), false);
  }
});

test('catalog rejects missing selected sources and ambiguous output bases before writing', async t => {
  for (const kind of ['missing', 'duplicate', 'collision']) {
    await t.test(kind, async t => {
      const script = 'make-webp-variants.js';
      const root = fixture(t, script);
      const pictures = path.join(root, 'pictures');
      const intake = path.join(pictures, 'Tattoos 2026');
      fs.mkdirSync(intake, { recursive: true });
      const row = { original: 'Old.png', file: 'Selected.png', styles: ['realism'], healing: 'uncertain', publish: true, assetBase: 'Selected', alt: 'Selected photograph.' };
      if (kind !== 'missing') await solid(path.join(intake, row.file), 20, 20, '#ff0000');
      if (kind === 'collision') await solid(path.join(pictures, 'Selected.png'), 20, 20, '#0000ff');
      const rows = kind === 'duplicate' ? [row, { ...row, assetBase: 'SELECTED' }] : [row];
      fs.writeFileSync(path.join(intake, 'catalog.json'), JSON.stringify(rows));
      assert.notEqual(run(root, script).status, 0);
      assert.equal(fs.existsSync(path.join(pictures, 'web')), false);
    });
  }
});

test('avatar generator regenerates a centred cover crop without modifying sources or unrelated files', async t => {
  const script = 'make-avatar-thumbs.js';
  const root = fixture(t, script);
  const sourceDir = path.join(root, 'google.reviews');
  const out = path.join(sourceDir, 'web');
  fs.mkdirSync(out, { recursive: true });
  const source = path.join(sourceDir, 'Reviewer.png');
  const target = path.join(out, 'Reviewer-96.webp');
  const authored = path.join(out, 'Unrelated.webp');
  fs.writeFileSync(authored, 'authored file');
  const authoredHash = hash(authored);
  await solid(target, 4, 4, '#ff0000');

  async function cropSource(colour) {
    const centre = await sharp({ create: { width: 96, height: 96, channels: 3, background: colour } }).png().toBuffer();
    await sharp({ create: { width: 192, height: 96, channels: 3, background: '#ff0000' } })
      .composite([{ input: centre, left: 48, top: 0 }]).png().toFile(source);
  }

  for (const [colour, channel] of [['#00ff00', 1], ['#0000ff', 2]]) {
    await cropSource(colour);
    const sourceHash = hash(source);
    const result = run(root, script);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(hash(source), sourceHash);
    assert.equal(hash(authored), authoredHash);
    const image = await decoded(target);
    assert.equal(image.info.width, 96);
    assert.equal(image.info.height, 96);
    // A contain/stretch resize would leave red at these edges instead of the central crop.
    for (const [x, y] of [[2, 2], [93, 93], [48, 48]]) dominant(pixel(image, x, y), channel);
  }
});

test('image generators fail on bad input and inaccessible output instead of reporting success', async t => {
  for (const [script, directory] of [
    ['make-webp-variants.js', 'pictures'],
    ['make-avatar-thumbs.js', 'google.reviews'],
  ]) {
    await t.test(`${script}: corrupt input`, t => {
      const root = fixture(t, script);
      const sourceDir = path.join(root, directory);
      fs.mkdirSync(sourceDir);
      const source = path.join(sourceDir, 'Broken.png');
      fs.writeFileSync(source, 'not an image');
      const before = hash(source);
      const result = run(root, script);
      assert.notEqual(result.status, 0);
      assert.equal(hash(source), before);
    });
    await t.test(`${script}: missing input directory`, t => {
      const root = fixture(t, script);
      assert.notEqual(run(root, script).status, 0);
    });
    await t.test(`${script}: output directory is a file`, async t => {
      const root = fixture(t, script);
      const sourceDir = path.join(root, directory);
      fs.mkdirSync(sourceDir);
      const source = path.join(sourceDir, 'Source.png');
      await solid(source, 10, 10, '#ff0000');
      fs.writeFileSync(path.join(sourceDir, 'web'), 'not a directory');
      const before = hash(source);
      assert.notEqual(run(root, script).status, 0);
      assert.equal(hash(source), before);
      assert.equal(fs.readFileSync(path.join(sourceDir, 'web'), 'utf8'), 'not a directory');
    });
  }
});

const scored = (assetBase, complexity, colour, extra = {}) => ({
  file: 'x.jpg', styles: ['realism'], healing: 'uncertain', complexity, colour, publish: true, assetBase, alt: 'x', ...extra,
});

function portfolioFixture(t, rows, cardBases, mediaBases = cardBases) {
  const root = fixture(t, 'order-portfolio.js');
  fs.mkdirSync(path.join(root, 'pictures', 'Tattoos 2026'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pictures', 'Tattoos 2026', 'catalog.json'), JSON.stringify(rows));
  const url = b => `https://emmytattoo.com/pictures/web/${b}-1440.webp`;
  const gallery = { '@context': 'https://schema.org', '@type': 'ImageGallery', associatedMedia: mediaBases.map(b => ({ '@type': 'ImageObject', contentUrl: url(b) })) };
  const cards = cardBases.map((b, i) => `  <div class="pw-item" data-src="pictures/web/${b}-1440.webp">\n    <img alt="${b}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">\n  </div>`);
  fs.writeFileSync(path.join(root, 'portfolio.html'), '<head>\n  <script type="application/ld+json">\n'
    + JSON.stringify(gallery, null, 2).split('\n').map(l => '  ' + l).join('\n')
    + '\n  </script>\n</head>\n<main id="pw-grid" aria-label="Portfolio">\n\n  <!-- prefix -->\n'
    + cards.join('\n\n') + '\n\n  <div id="pw-gate" hidden></div>\n</main>\n');
  fs.writeFileSync(path.join(root, 'sitemap.xml'), '<urlset>\n  <url>\n    <loc>https://emmytattoo.com/portfolio</loc>\n    <priority>0.8</priority>\n'
    + mediaBases.map(b => `    <image:image>\n      <image:loc>${url(b)}</image:loc>\n    </image:image>\n`).join('')
    + '  </url>\n</urlset>\n');
  return root;
}

function portfolioOrder(root) {
  const html = fs.readFileSync(path.join(root, 'portfolio.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const gallery = JSON.parse(html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n  <\/script>/)[1]);
  return {
    html,
    cards: [...html.matchAll(/data-src="pictures\/web\/([^"]+)-1440\.webp"/g)].map(m => m[1]),
    media: gallery.associatedMedia.map(item => item.contentUrl.match(/web\/(.+)-1440\.webp$/)[1]),
    sitemap: [...sitemap.matchAll(/<image:loc>[^<]*\/web\/([^<]+)-1440\.webp<\/image:loc>/g)].map(m => m[1]),
  };
}

test('portfolio order ranks by complexity plus colour, then complexity, then catalog position', t => {
  const rows = [scored('A', 2, 2), scored('B', 1, 3), { file: 'y.jpg', publish: false, assetBase: 'Hidden' }, scored('C', 3, 1), scored('D', 4, 4)];
  const root = portfolioFixture(t, rows, ['A', 'B', 'C', 'D']);
  assert.notEqual(run(root, 'order-portfolio.js', '--check').status, 0);
  const result = run(root, 'order-portfolio.js');
  assert.equal(result.status, 0, result.stderr);
  const ordered = portfolioOrder(root);
  const expected = ['D', 'C', 'A', 'B'];
  assert.deepEqual(ordered.cards, expected);
  assert.deepEqual(ordered.media, expected);
  assert.deepEqual(ordered.sitemap, expected);
  assert.equal(ordered.html.split('fetchpriority="high"').length, 2);
  assert.match(ordered.html, /D-1440\.webp">\n    <img alt="D" fetchpriority="high" decoding="async">/);
  assert.match(ordered.html, /A-1440\.webp">\n    <img alt="A" loading="lazy" decoding="async">/);
  const check = run(root, 'order-portfolio.js', '--check');
  assert.equal(check.status, 0, check.stderr);
  const before = [hash(path.join(root, 'portfolio.html')), hash(path.join(root, 'sitemap.xml'))];
  assert.equal(run(root, 'order-portfolio.js').status, 0);
  assert.deepEqual([hash(path.join(root, 'portfolio.html')), hash(path.join(root, 'sitemap.xml'))], before);
});

test('portfolio order rejects unscored or mismatched pieces without writing', async t => {
  for (const [name, rows, cards, reason] of [
    ['published row missing colour', [scored('A', 2, 2), scored('B', 3, undefined)], ['A', 'B'], /invalid portfolio score.*: B/],
    ['complexity above 5', [scored('A', 2, 2), scored('B', 6, 1)], ['A', 'B'], /invalid portfolio score.*: B/],
    ['card without a published row', [scored('A', 2, 2), scored('B', 3, 1, { publish: false })], ['A', 'B'], /Portfolio cards .*unexpected \[B\]/],
    ['published row without a card', [scored('A', 2, 2), scored('B', 3, 1)], ['A'], /Portfolio cards .*missing \[B\]/],
  ]) {
    await t.test(name, t => {
      const root = portfolioFixture(t, rows, cards, ['A', 'B']);
      const files = ['portfolio.html', 'sitemap.xml'].map(f => path.join(root, f));
      const before = files.map(hash);
      const result = run(root, 'order-portfolio.js');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, reason);
      assert.deepEqual(files.map(hash), before);
    });
  }
});
