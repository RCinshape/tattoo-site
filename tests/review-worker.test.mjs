import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/reviews/index.mjs';

const request = new Request('https://reviews.example/');
const env = { GOOGLE_KEY: 'synthetic-test-key' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('review Worker returns five provider reviews and the listing total, not the sample size', async t => {
  const reviews = Array.from({ length: 5 }, (_, i) => ({ authorAttribution: { displayName: `Reviewer ${i}` }, rating: 5, text: { text: `Review ${i}` } }));
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('places:searchText')
    ? reply({ places: [{ id: 'synthetic-place' }] })
    : reply({ rating: 4.9, userRatingCount: 23, reviews }));
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { rating: 4.9, userRatingCount: 23, reviews });
});

test('provider permission failures are non-200 and never publish upstream internals', async t => {
  t.mock.method(console, 'error', () => {});
  for (const failureAt of ['search', 'detail']) {
    await t.test(failureAt, async t => {
      t.mock.method(globalThis, 'fetch', async url => failureAt === 'detail' && url.endsWith('places:searchText')
        ? reply({ places: [{ id: 'synthetic-place' }] })
        : reply({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Private provider diagnostics', details: [{ key: env.GOOGLE_KEY }] } }, 403));
      const response = await worker.fetch(request, env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'Reviews temporarily unavailable' });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    });
  }
});

test('missing configuration, unavailable places, invalid summaries and network errors cannot look healthy', async t => {
  t.mock.method(console, 'error', () => {});
  await t.test('missing secret', async t => {
    t.mock.method(globalThis, 'fetch', () => { assert.fail('Must not send an unauthenticated provider request'); });
    assert.equal((await worker.fetch(request, {})).status, 503);
  });
  for (const [name, response] of [
    ['no matching place', {}],
    ['provider error inside HTTP 200', { error: { status: 'PERMISSION_DENIED' } }],
    ['invalid summary', { rating: 5, userRatingCount: 23, reviews: [] }],
  ]) {
    await t.test(name, async t => {
      t.mock.method(globalThis, 'fetch', async url => name === 'invalid summary' && url.endsWith('places:searchText')
        ? reply({ places: [{ id: 'synthetic-place' }] }) : reply(response));
      const result = await worker.fetch(request, env);
      assert.equal(result.status, 502);
      assert.deepEqual(await result.json(), { error: 'Reviews temporarily unavailable' });
    });
  }
  await t.test('network failure', async t => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Private network detail'); });
    assert.equal((await worker.fetch(request, env)).status, 502);
  });
});
