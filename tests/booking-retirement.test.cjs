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

// Exercise the actual supported page; no production requests or submissions.
test('supported booking removes only retired drafts without persisting a replacement', async t => {
  assert.ok(chrome, 'Install Chromium or set CHROME_BIN');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const html = fs.readFileSync(path.join(__dirname, '..', 'book.html'), 'utf8');
  for (const blockedStorage of [false, true]) {
    await t.test(blockedStorage ? 'storage denied does not break the form' : 'old draft is erased, unrelated storage survives', async t => {
      const page = await browser.newPage();
      t.after(() => page.close());
      await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/book'
        ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
      await page.addInitScript(blocked => {
        if (blocked) {
          Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
        } else if (!sessionStorage.getItem('fixture-seeded')) {
          localStorage.setItem('emmy-book2-progress', JSON.stringify({ name: 'Synthetic previous visitor', idea: 'Synthetic old draft' }));
          localStorage.setItem('unrelated-fixture', 'preserve');
          sessionStorage.setItem('fixture-seeded', 'yes');
        }
      }, blockedStorage);
      await page.goto('http://127.0.0.1/book');
      // The form opens at once; the screening questions sit at its end, unanswered.
      assert.equal(await page.locator('#bk-form').isVisible(), true);
      assert.equal(await page.isChecked('input[name="screen-pregnancy"][value="no"]'), false);
      await page.check('input[name="screen-pregnancy"][value="no"]');
      await page.check('input[name="screen-blood-thinners"][value="no"]');
      assert.equal(await page.isEnabled('#f-submit'), true);
      assert.equal(await page.inputValue('#f-name'), '');
      await page.fill('#f-name', 'Synthetic current visitor');
      if (!blockedStorage) {
        assert.deepEqual(await page.evaluate(() => Object.entries(localStorage)), [['unrelated-fixture', 'preserve']]);
      }
      await page.reload();
      for (const name of ['screen-pregnancy', 'screen-blood-thinners']) {
        assert.equal(await page.locator(`input[name="${name}"]:checked`).count(), 0, 'Screening must reset on a fresh visit');
      }
      assert.equal(await page.inputValue('#f-name'), '', 'The replacement form must not restore a draft');
      if (!blockedStorage) assert.deepEqual(await page.evaluate(() => Object.entries(localStorage)), [['unrelated-fixture', 'preserve']]);
    });
  }
});
