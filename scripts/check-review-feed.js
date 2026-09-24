#!/usr/bin/env node
// Read-only provider check, separate from deterministic local tests.
const url = 'https://emmy-reviews.emmalenetattoo.workers.dev/';
(async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Review feed HTTP ${response.status}`);
  const data = await response.json();
  if (data.error || !Number.isFinite(data.rating) || data.rating < 1 || data.rating > 5 ||
      !Number.isInteger(data.userRatingCount) || data.userRatingCount < 1 ||
      !Array.isArray(data.reviews) || data.reviews.length < 1 || data.reviews.length > 5) {
    throw new Error('Review feed does not contain a valid live rating, total and review sample');
  }
  console.log(`Review feed healthy: ${data.reviews.length} live reviews; listing total ${data.userRatingCount}.`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
