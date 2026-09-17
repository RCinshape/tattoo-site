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

function run(root, script) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
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
