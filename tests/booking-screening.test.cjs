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

const PREGNANT = "Emmy can't tattoo during pregnancy, but she'd love to hear from you afterwards.";
const THINNERS = 'Please discuss this with Emmy before completing a booking enquiry. Do not stop or change medication to get a tattoo.';

// Exercise the actual page: the screening questions sit at the end of the form,
// a Yes disables the hand-off, and the answers never reach the draft or backup.
test('health screening blocks at the end of the form and never becomes enquiry data', async t => {
  assert.ok(chrome, 'Install Chromium or set CHROME_BIN');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const html = fs.readFileSync(path.join(__dirname, '..', 'book.html'), 'utf8');
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/book'
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = url => { window.__opened.push(url); return null; };
    navigator.sendBeacon = (url, blob) => { window.__beacon = blob; return true; };
  });
  await page.goto('http://127.0.0.1/book');

  await page.fill('#f-name', 'Synthetic Visitor');
  await page.fill('#f-idea', 'A small fine-line swallow');
  await page.selectOption('#f-placement', 'Inner forearm');
  await page.selectOption('#f-size', 'Small — 5 to 10 cm');
  await page.click('#f-days-summary');
  await page.check('#f-day-any');
  await page.fill('#f-notes', 'Synthetic note');
  await page.check('#f-age18');

  const state = () => page.evaluate(() => {
    const submit = document.getElementById('f-submit');
    return {
      disabled: submit.disabled,
      ariaDisabled: submit.getAttribute('aria-disabled'),
      describedBy: submit.getAttribute('aria-describedby'),
      pregnant: document.getElementById('screen-pregnancy-msg').textContent,
      thinners: document.getElementById('screen-blood-thinners-msg').textContent,
      discuss: document.getElementById('bk-discuss').hidden ? null : document.getElementById('bk-discuss').href,
    };
  });

  // Unanswered: the hand-off is refused with an error on the question, not a draft.
  await page.click('#f-submit');
  assert.equal(await page.locator('#screen-pregnancy-error').textContent(), 'Please answer this question.');
  assert.equal(await page.evaluate(() => document.activeElement.name), 'screen-pregnancy');
  assert.deepEqual(await page.evaluate(() => window.__opened), []);

  await page.check('input[name="screen-pregnancy"][value="yes"]');
  let s = await state();
  assert.equal(s.disabled, true);
  assert.equal(s.ariaDisabled, 'true');
  assert.equal(s.describedBy, 'screen-pregnancy-msg');
  assert.equal(s.pregnant, PREGNANT);
  assert.equal(await page.locator('#screen-pregnancy-error').isVisible(), false, 'Answering clears the unanswered error');

  await page.check('input[name="screen-pregnancy"][value="no"]');
  s = await state();
  assert.equal(s.disabled, false);
  assert.equal(s.ariaDisabled, null);
  assert.equal(s.describedBy, null);
  assert.equal(s.pregnant, '');

  await page.check('input[name="screen-blood-thinners"][value="yes"]');
  s = await state();
  assert.equal(s.disabled, true);
  assert.equal(s.ariaDisabled, 'true');
  assert.equal(s.describedBy, 'screen-blood-thinners-msg');
  assert.equal(s.thinners, THINNERS);
  assert.match(s.discuss, /^https:\/\/wa\.me\/447405979137\?text=.*blood-thinning/);

  // Implicit (Enter-key) submission must not bypass the disabled button.
  await page.focus('#f-name');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.__opened), []);

  await page.check('input[name="screen-blood-thinners"][value="no"]');
  s = await state();
  assert.equal(s.disabled, false);
  assert.equal(s.describedBy, null);
  assert.equal(s.discuss, null);

  assert.deepEqual(await page.evaluate(() => [...new FormData(document.getElementById('bk-form')).keys()].filter(k => k.startsWith('screen-'))), [],
    'Screening radios must not be #bk-form controls');

  await page.click('#f-submit');
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  const draft = decodeURIComponent(new URL(opened[0]).searchParams.get('text'));
  assert.match(draft, /^Enquiry - Synthetic Visitor/);
  assert.match(draft, /Anything to know: Synthetic note/, 'Notes stay in the WhatsApp draft');
  assert.doesNotMatch(draft, /pregnan|thinn|screen/i);
  const backup = JSON.parse(await page.evaluate(() => window.__beacon.text()));
  assert.deepEqual(Object.keys(backup).sort(),
    ['age18', 'botcheck', 'budget', 'email', 'idea', 'name', 'placement', 'refs', 'size', 'when']);
});
