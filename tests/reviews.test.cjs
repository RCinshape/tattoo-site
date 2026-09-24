const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

// Run the actual inline renderer in installed Chromium, not a copied function or
// mocked DOM. Set CHROME_BIN when it is not in a standard location.
const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));

async function exerciseRenderer() {
  const stage = document.getElementById('tr-stage');
  const seeded = stage.children.length;
  const validPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>');
  const brokenPhoto = 'data:image/png;base64,broken';
  const names = [
    'Ordinary Reviewer', 'O\'Brien "Jo" & Sons', '李小龍 · أمينة',
    '" onerror="window.__reviewXss=1" x="',
    '\"><img src=x onerror="window.__reviewXss=1"><svg onload="window.__reviewXss=1">',
    '<script>window.__reviewXss=1</script>', '< & " \'',
  ];
  const quote = '<img src=x onerror="window.__reviewXss=1"> "Lovely" & thoughtful';
  const results = [];
  for (const name of names) {
    for (const photo of [validPhoto, brokenPhoto, '', brokenPhoto + '" onerror="window.__reviewXss=1']) {
      window.__reviewXss = 0;
      window.__refreshReviews([{ name, photo, quote, rating: 4 }]);
      const card = stage.firstElementChild;
      const image = card.querySelector('.trv-pic img');
      let imageState = 'missing';
      if (image) {
        image.loading = 'eager';
        imageState = await new Promise(resolve => {
          const timeout = setTimeout(() => resolve('timeout'), 1000);
          const finish = state => { clearTimeout(timeout); resolve(state); };
          image.addEventListener('load', () => finish('loaded'), { once: true });
          image.addEventListener('error', () => finish('broken'), { once: true });
          if (image.complete) finish(image.naturalWidth ? 'loaded' : 'broken');
        });
        // Also exercise a later error on an originally valid avatar.
        image.dispatchEvent(new Event('error'));
      }
      results.push({
        name, photo, imageState,
        executed: window.__reviewXss,
        handlers: [...stage.querySelectorAll('*')].flatMap(el => [...el.attributes]
          .filter(attr => /^on/i.test(attr.name)).map(attr => attr.name)),
        injected: card.querySelectorAll('script, svg, iframe, object, embed').length,
        images: card.querySelectorAll('img').length,
        alt: image?.alt,
        src: image?.getAttribute('src'),
        displayedName: card.querySelector('.trv-name').firstChild.textContent,
        displayedQuote: card.querySelector('.trv-q').textContent,
        initial: card.querySelector('.trv-pic-ph')?.textContent,
        stars: card.querySelector('.trv-stars').textContent,
        ratingLabel: card.querySelector('.trv-stars').getAttribute('aria-label'),
        count: stage.children.length,
      });
    }
  }
  // Quotes in the rating label used to share the HTML attribute sink too.
  window.__refreshReviews([{ name: 'Rating', photo: '', quote, rating: '" onmouseover="window.__reviewXss=1' }]);
  const ratingHandlers = [...stage.querySelectorAll('*')].flatMap(el => [...el.attributes]
    .filter(attr => /^on/i.test(attr.name)).map(attr => attr.name));
  return { seeded, quote, results, ratingHandlers };
}

test('actual review renderer keeps untrusted fields inert, including avatar errors', async t => {
  assert.ok(chrome, 'Install Chrome/Chromium/Edge or set CHROME_BIN; this security test must not silently skip');
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const renderer = scripts.find(([, body]) => body.includes('window.__refreshReviews = function'))?.[1];
  assert.ok(renderer, 'Actual application review renderer not found');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // No Worker, analytics, or other network; data avatars still load/fail normally.
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><div id="tr-stage"></div>');
  await page.addScriptTag({ content: renderer });
  const result = await page.evaluate(exerciseRenderer);
  assert.equal(result.seeded, 7, 'Fallback reviews still render without a feed');
  for (const row of result.results) {
    await t.test(`${JSON.stringify(row.name)} / ${row.photo ? row.imageState : 'no avatar'}`, () => {
      assert.equal(row.executed, 0, 'Untrusted reviewer content executed');
      assert.deepEqual(row.handlers, [], 'Untrusted content created an executable attribute');
      assert.equal(row.injected, 0, 'Untrusted content created markup');
      assert.equal(row.images, row.photo ? 1 : 0);
      assert.equal(row.displayedName, row.name);
      assert.equal(row.displayedQuote, '“' + result.quote + '”');
      assert.equal(row.stars, '★★★★☆');
      assert.equal(row.ratingLabel, '4 out of 5');
      assert.equal(row.count, 7, 'Live review still tops up with fallback reviews');
      if (row.photo) {
        assert.equal(row.alt, row.name);
        assert.equal(row.src, row.photo);
        assert.equal(row.imageState, row.photo.startsWith('data:image/svg') ? 'loaded' : 'broken');
      } else assert.equal(row.initial, row.name.trim().charAt(0).toUpperCase());
    });
  }
  assert.deepEqual(result.ratingHandlers, [], 'Rating labels cannot create attributes');
});
