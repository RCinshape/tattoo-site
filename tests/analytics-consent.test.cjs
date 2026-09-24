const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const chrome = process.env.CHROME_BIN || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));
const KEY = 'emmy-analytics-choice-v1';
const pages = ['index', 'portfolio', 'legal', 'aftercare', 'gift-cards'];
const html = Object.fromEntries([...pages, 'book'].map(page => [page, fs.readFileSync(path.join(__dirname, '..', page + '.html'), 'utf8')]));

// All website/tag requests are fulfilled locally; no visitor data reaches Google.
const fixture = async (browser, t) => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const requests = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'emmytattoo.com') {
      const page = url.pathname === '/' ? 'index' : url.pathname.slice(1);
      if (html[page]) return route.fulfill({ contentType: 'text/html', body: html[page] });
    }
    if (url.hostname === 'www.googletagmanager.com') {
      requests.push(url.href);
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    return route.abort();
  });
  return { context, requests, page: await context.newPage() };
};

test('analytics requires explicit opt-in across every analytics-enabled page', async t => {
  assert.ok(chrome, 'Install Chromium or set CHROME_BIN');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  for (const name of pages) {
    await t.test(name, async t => {
      const { page, requests } = await fixture(browser, t);
      await page.goto('https://emmytattoo.com/' + (name === 'index' ? '' : name));
      await page.clock.install();
      await page.clock.fastForward(5000);
      await page.keyboard.press('Tab');
      await page.mouse.wheel(0, 300);
      assert.equal(requests.length, 0, 'Time, scrolling and ordinary interaction are not consent');
      assert.equal(await page.locator('#analytics-preferences').isVisible(), true);
      await page.click('[data-analytics-choice="rejected"]');
      await page.reload();
      assert.equal(requests.length, 0, 'Rejection must persist without loading the tag');
      assert.equal(await page.locator('#analytics-preferences').isVisible(), false);
      await page.click('[data-analytics-settings]');
      await page.click('[data-analytics-choice="accepted"]');
      await page.waitForFunction(() => document.querySelector('script[src*="googletagmanager.com/gtag/js"]'));
      await page.waitForLoadState('networkidle');
      assert.equal(requests.length, 1);
      assert.ok(requests[0].includes('id=G-J8X45ECTLH'));
      await page.reload();
      await page.waitForLoadState('networkidle');
      assert.equal(requests.length, 2, 'Accepted preference survives navigation');
      await page.context().addCookies([
        { name: '_ga', value: 'synthetic', domain: '.emmytattoo.com', path: '/', secure: true },
        { name: '_ga_J8X45ECTLH', value: 'synthetic', url: 'https://emmytattoo.com/' },
        { name: 'unrelated', value: 'preserve', url: 'https://emmytattoo.com/' },
      ]);
      await page.click('[data-analytics-settings]');
      await Promise.all([page.waitForEvent('load'), page.click('[data-analytics-choice="rejected"]')]);
      assert.equal(requests.length, 2, 'Withdrawal reload must not reload analytics');
      const cookies = await page.context().cookies();
      assert.equal(cookies.some(cookie => cookie.name.startsWith('_ga')), false);
      assert.equal(cookies.find(cookie => cookie.name === 'unrelated')?.value, 'preserve');
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0, 'Withdrawal unloads the accepted tag');
    });
  }
});

test('consent fails closed with invalid or unavailable storage and synchronizes withdrawal', async t => {
  assert.ok(chrome, 'Install Chromium or set CHROME_BIN');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  for (const [name, saved] of [
    ['expired', JSON.stringify({ choice: 'accepted', expires: Date.now() - 1000 })],
    ['malformed', '{not-json'],
    ['blocked storage', null],
  ]) {
    await t.test(name, async t => {
      const { page, requests } = await fixture(browser, t);
      await page.addInitScript(({ saved, key }) => {
        if (saved === null) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
        else localStorage.setItem(key, saved);
      }, { saved, key: KEY });
      await page.goto('https://emmytattoo.com/legal');
      assert.equal(await page.locator('#analytics-preferences').isVisible(), true);
      assert.equal(requests.length, 0);
      await page.click('[data-analytics-choice="rejected"]');
      assert.equal(await page.locator('#analytics-preferences').isVisible(), false);
      assert.equal(requests.length, 0);
    });
  }
  await t.test('another tab withdrawing consent unloads the already accepted tag', async t => {
    const { context, page, requests } = await fixture(browser, t);
    await page.goto('https://emmytattoo.com/legal');
    await page.click('[data-analytics-choice="accepted"]');
    await page.waitForLoadState('networkidle');
    const other = await context.newPage();
    await other.goto('https://emmytattoo.com/aftercare');
    await other.waitForLoadState('networkidle');
    const acceptedLoads = requests.length;
    await other.click('[data-analytics-settings]');
    await Promise.all([
      page.waitForEvent('load'), other.waitForEvent('load'),
      other.click('[data-analytics-choice="rejected"]'),
    ]);
    assert.equal(requests.length, acceptedLoads);
    assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
    assert.equal(await other.locator('script[src*="googletagmanager.com"]').count(), 0);
  });
  await t.test('booking never loads analytics even after consent elsewhere', async t => {
    const { page, requests } = await fixture(browser, t);
    await page.goto('https://emmytattoo.com/legal');
    await page.click('[data-analytics-choice="accepted"]');
    await page.waitForLoadState('networkidle');
    const beforeBooking = requests.length;
    await page.goto('https://emmytattoo.com/book');
    await page.check('input[name="screen-pregnancy"][value="no"]');
    await page.check('input[name="screen-blood-thinners"][value="no"]');
    await page.fill('#f-name', 'Synthetic consent test');
    assert.equal(requests.length, beforeBooking);
    assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
    assert.equal(await page.locator('#analytics-preferences').count(), 0);
  });
});
