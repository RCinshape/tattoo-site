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
  const names = [...stage.querySelectorAll('.trv-name')].map(el => el.firstChild.textContent);
  const photos = [...stage.querySelectorAll('.trv-pic img')].map(img => img.getAttribute('src'));
  const rating = '<img src=x onerror="window.__reviewXss=1">';
  const count = '<svg onload="window.__reviewXss=1">';
  window.__reviewXss = 0;
  window.__refreshReviewMeta({ rating, count });
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    names, photos, rating, count,
    score: document.querySelector('.tr-score-val').textContent,
    allN: document.querySelector('.tr-all-n').textContent,
    injected: document.querySelectorAll('img:not(.trv-pic img), svg').length,
    handlers: [...document.querySelectorAll('*')].flatMap(el => [...el.attributes]
      .filter(attr => /^on/i.test(attr.name)).map(attr => attr.name)),
    xss: window.__reviewXss,
  };
}

test('review renderer shows the three saved reviews and keeps live figures inert', async t => {
  assert.ok(chrome, 'Install Chrome/Chromium/Edge or set CHROME_BIN; this security test must not silently skip');
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const renderer = scripts.find(([, body]) => body.includes('window.__refreshReviewMeta = function'))?.[1];
  assert.ok(renderer, 'Actual application review renderer not found');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // No Worker, analytics, or other network.
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><span class="tr-score-val">5.0</span><span class="tr-score-meta">20 Google reviews</span><span class="tr-all-n">20</span><div id="tr-stage"></div>');
  await page.addScriptTag({ content: renderer });
  const result = await page.evaluate(exerciseRenderer);
  assert.deepEqual(result.names, ['Jess Dan', 'Ruby Taylor', 'Jaime Dale']);
  assert.deepEqual(result.photos, [
    'google.reviews/web/Jess Dunn-96.webp',
    'google.reviews/web/Ruby Taylor-96.webp',
    'google.reviews/web/James Dale-96.webp',
  ]);
  assert.equal(result.score, result.rating, 'Live score is text, not markup');
  assert.equal(result.allN, result.count, 'Live total is text, not markup');
  assert.equal(result.injected, 0, 'Live figures cannot create elements');
  assert.deepEqual(result.handlers, [], 'Live figures cannot create event-handler attributes');
  assert.equal(result.xss, 0);
});

test('live feed refreshes only the figures; cards stay the three saved reviews', async t => {
  assert.ok(chrome, 'Install Chromium or set CHROME_BIN');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const liveNames = ['JESS DAN', 'Live Reviewer Two', 'Live Reviewer Three', 'Live Reviewer Four', 'Live Reviewer Five'];
  const live = {
    rating: 4.8, userRatingCount: 23,
    reviews: liveNames.map(name => ({
      authorAttribution: { displayName: name },
      rating: 5, text: { text: 'Synthetic live review.' },
    })),
  };
  for (const [name, status, payload, healthy] of [
    ['live figures', 200, live, true],
    ['provider outage', 502, { error: 'Reviews temporarily unavailable' }, false],
    ['legacy HTTP 200 error', 200, { error: 'Place not found' }, false],
    ['incomplete live summary', 200, { ...live, userRatingCount: null }, false],
  ]) {
    await t.test(name, async t => {
      const page = await browser.newPage();
      t.after(() => page.close());
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.fulfill({ contentType: 'text/html', body: html });
        if (url.hostname === 'emmy-reviews.emmalenetattoo.workers.dev') {
          return route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(payload) });
        }
        return route.abort();
      });
      const outcome = healthy
        ? null
        : page.waitForEvent('console', { predicate: message => message.text().includes('[Reviews] Fetch failed'), timeout: 10000 });
      await page.goto('http://127.0.0.1/review-fixture');
      if (healthy) await page.waitForFunction(() => document.querySelector('.tr-score-meta').textContent === '23 Google reviews');
      else await outcome;
      const result = await page.evaluate(() => ({
        names: [...document.querySelectorAll('.trv-name')].map(el => el.firstChild.textContent),
        score: document.querySelector('.tr-score-val').textContent,
        meta: document.querySelector('.tr-score-meta').textContent,
        readAll: document.querySelector('.tr-review-btn').textContent.trim(),
        aggregate: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).aggregateRating,
      }));
      assert.deepEqual(result.names, ['Jess Dan', 'Ruby Taylor', 'Jaime Dale'], 'The live feed never replaces or adds a card');
      assert.equal(result.aggregate, undefined, 'No unverified listing total in static structured data');
      if (healthy) {
        assert.equal(result.score, '4.8');
        assert.equal(result.meta, '23 Google reviews', 'Listing total is not the five-review sample size');
        assert.equal(result.readAll, 'Read all 23 reviews →');
      } else {
        assert.equal(result.score, '5.0', 'Hand-maintained fallback score');
        assert.equal(result.meta, '20 Google reviews', 'Hand-maintained fallback total');
        assert.equal(result.readAll, 'Read all 20 reviews →');
      }
    });
  }
});
