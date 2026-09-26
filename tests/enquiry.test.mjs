import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = await readFile(new URL('../functions/api/enquiry.js', import.meta.url), 'utf8');
const { onRequestPost, onRequestOptions } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const encoder = new TextEncoder();
const HOST = 'https://emmytattoo.com';
const valid = () => ({
  name: 'Example Client', email: 'example@example.com', idea: 'A botanical drawing',
  placement: 'Inner forearm', size: 'Small — 5 to 10 cm', budget: '£100–£200',
  when: 'Tue, Sat', refs: 'https://example.com/reference', age18: true, botcheck: false
});

function stream(chunks, { fail = false, cancelFails = false } = {}) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else if (fail) controller.error(new Error('Synthetic reader failure'));
      else controller.close();
    },
    cancel() { if (cancelFails) throw new Error('Synthetic cancellation failure'); }
  });
}

async function post(payload = valid(), options = {}) {
  const writes = [];
  const env = {
    ENQUIRIES: { async put(key, value, config) { writes.push({ key, record: JSON.parse(value), config }); } },
    ...options.env
  };
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const body = Object.hasOwn(options, 'body') ? options.body : JSON.stringify(payload);
  const request = new Request(options.url || HOST + '/api/enquiry', {
    method: 'POST', headers, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {})
  });
  if (options.country) Object.defineProperty(request, 'cf', { value: { country: options.country } });
  const response = await onRequestPost({ request, env });
  return { response, result: await response.json(), writes };
}

async function rejected(payload, expected, options) {
  const actual = await post(payload, options);
  assert.equal(actual.response.status, expected.status);
  assert.deepEqual(actual.result, { ok: false, code: expected.code, ...(expected.field ? { field: expected.field } : {}) });
  assert.deepEqual(actual.writes, []);
  return actual;
}

test('complete enquiry stores only approved text and server metadata for 90 days', async () => {
  const payload = valid();
  payload.name = '  Example   Client  ';
  payload.idea = ' A botanical\n drawing 🌿 ';
  const { response, result, writes } = await post(payload, { country: 'GB', headers: { Origin: HOST } });
  assert.equal(response.status, 200);
  assert.deepEqual(result, { ok: true, stored: true });
  assert.equal(response.headers.get('access-control-allow-origin'), HOST);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(writes.length, 1);
  const { key, record, config } = writes[0];
  assert.match(key, /^enq:\d+:[\da-f-]{8}$/);
  assert.deepEqual(record, {
    name: 'Example Client', email: payload.email, idea: 'A botanical drawing 🌿',
    placement: payload.placement, size: payload.size, budget: payload.budget,
    when: payload.when, refs: payload.refs, country: 'GB', ts: record.ts
  });
  assert.equal(new Date(record.ts).toISOString(), record.ts);
  assert.deepEqual(config, { expirationTtl: 7776000, metadata: { name: record.name, ts: record.ts } });
});

test('missing or empty optional fields are omitted, while Unicode remains complete', async () => {
  const payload = valid();
  delete payload.email;
  delete payload.budget;
  payload.refs = '';
  payload.name = '界'.repeat(40);
  payload.idea = '🌿'.repeat(150);
  payload.when = 'Any day';
  const { result, writes } = await post(payload);
  assert.equal(result.stored, true);
  assert.equal(writes[0].record.name, payload.name);
  assert.equal(writes[0].record.idea, payload.idea);
  assert.equal(writes[0].record.when, 'Any day');
  for (const key of ['email', 'budget', 'refs', 'notes', 'age18', 'botcheck', 'country']) {
    assert.equal(Object.hasOwn(writes[0].record, key), false);
  }
});

test('strict object schema rejects unknown fields, wrong types and missing flags before storage', async () => {
  const cases = [{}, [], null, 7, 'enquiry'];
  for (const key of ['notes', 'screen-pregnancy', 'screen-blood-thinners', 'unexpected', '__proto__']) {
    cases.push({ ...valid(), [key]: 'not accepted' });
  }
  for (const key of ['name', 'email', 'idea', 'placement', 'size', 'budget', 'when', 'refs']) {
    for (const value of [null, 12, {}, []]) cases.push({ ...valid(), [key]: value });
  }
  for (const key of ['age18', 'botcheck']) {
    for (const value of [null, 0, 1, 'true']) cases.push({ ...valid(), [key]: value });
    const missing = valid();
    delete missing[key];
    cases.push(missing);
  }
  for (const payload of cases) await rejected(payload, { status: 422, code: 'bad_schema' });
});

test('field validation rejects invalid required values, formats, enums, ordering and Unicode', async () => {
  const cases = [];
  for (const key of ['name', 'idea', 'placement', 'size', 'when']) {
    cases.push([key, '   ']);
    const missing = valid();
    delete missing[key];
    await rejected(missing, { status: 422, code: 'invalid_field', field: key });
  }
  cases.push(['email', 'not-an-email'], ['refs', 'javascript:alert(1)'],
    ['placement', 'Unlisted placement'], ['size', 'Unlisted size'], ['budget', '£1'],
    ['when', 'Mon'], ['when', 'Sun'], ['when', 'Tue, Mon'],
    ['when', 'Tue, Tue'], ['when', 'Tue, Holiday'], ['when', 'Tuesday'],
    ['when', 'Tue,Wed'], ['when', 'Any day, Tue'],
    ['age18', false]);
  for (const value of ['\ud800', '\udfff', 'good\ud800text']) cases.push(['idea', value]);
  for (const [field, value] of cases) {
    await rejected({ ...valid(), [field]: value }, { status: 422, code: 'invalid_field', field });
  }
  // Stable visible-field order, not object insertion order, determines the first error.
  await rejected({ ...valid(), idea: '', email: 'invalid', name: '' }, {
    status: 422, code: 'invalid_field', field: 'name'
  });
});

test('caps reject rather than silently truncate, after whitespace normalization', async () => {
  const caps = { name: 40, email: 70, idea: 300, placement: 40, size: 40, budget: 20, when: 50, refs: 100 };
  for (const [field, cap] of Object.entries(caps)) {
    await rejected({ ...valid(), [field]: 'x'.repeat(cap + 1) }, { status: 422, code: 'invalid_field', field });
  }
  const payload = valid();
  payload.name = ' '.repeat(80) + 'x'.repeat(40) + '\n';
  payload.idea = 'x'.repeat(300);
  payload.email = 'a'.repeat(64) + '@ex.co';
  payload.refs = 'https://example.com/' + 'x'.repeat(80);
  payload.when = 'Tue, Wed, Thu, Fri, Sat';
  const { result, writes } = await post(payload);
  assert.equal(result.stored, true);
  assert.equal(writes[0].record.name, 'x'.repeat(40));
  assert.equal(writes[0].record.idea, payload.idea);
  assert.equal(writes[0].record.email, payload.email);
  assert.equal(writes[0].record.refs, payload.refs);
});

test('valid honeypot, absent binding and failed writes remain best-effort non-errors', async () => {
  const honeypot = await post({ ...valid(), botcheck: true });
  assert.deepEqual(honeypot.result, { ok: true, stored: false });
  assert.deepEqual(honeypot.writes, []);
  assert.equal(honeypot.response.status, 200);
  const missing = await post(valid(), { env: { ENQUIRIES: undefined } });
  assert.deepEqual(missing.result, { ok: true, stored: false });
  assert.equal(missing.response.status, 200);
  const failed = await post(valid(), { env: { ENQUIRIES: { async put() { throw new Error('Synthetic KV failure'); } } } });
  assert.equal(failed.response.status, 200);
  assert.deepEqual(failed.result, { ok: true, stored: false });
  await rejected({ ...valid(), botcheck: true, notes: 'not accepted' }, { status: 422, code: 'bad_schema' });
});

test('JSON media type is required, case insensitive and permits parameters', async () => {
  for (const type of ['', 'text/plain', 'application/jsonp', 'text/json']) {
    await rejected(valid(), { status: 415, code: 'unsupported_media_type' }, { headers: { 'Content-Type': type } });
  }
  const accepted = await post(valid(), { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } });
  assert.equal(accepted.result.stored, true);
});

test('actual streamed byte limit is inclusive and independent of Content-Length', async () => {
  const json = encoder.encode(JSON.stringify(valid()));
  function padded(length) {
    const bytes = new Uint8Array(length).fill(32);
    bytes.set(json);
    return bytes;
  }
  const atLimit = padded(16384);
  const accepted = await post(undefined, { body: stream([atLimit.subarray(0, 7000), atLimit.subarray(7000)]) });
  assert.equal(accepted.result.stored, true);
  await rejected(undefined, { status: 413, code: 'too_big' }, { body: stream([padded(16385)]) });
  await rejected(undefined, { status: 413, code: 'too_big' }, {
    body: stream([atLimit, new Uint8Array([32])]), headers: { 'Content-Length': '1' }
  });
  await rejected(undefined, { status: 413, code: 'too_big' }, {
    body: stream([padded(20000)], { cancelFails: true })
  });
  await rejected(undefined, { status: 413, code: 'too_big' }, { headers: { 'Content-Length': '16385' } });
});

test('UTF-8 is decoded across chunk boundaries and malformed or unreadable bodies never write', async () => {
  const payload = { ...valid(), idea: '界🌿' };
  const bytes = encoder.encode(JSON.stringify(payload));
  const chunks = Array.from(bytes, byte => new Uint8Array([byte]));
  const accepted = await post(undefined, { body: stream(chunks) });
  assert.equal(accepted.result.stored, true);
  assert.equal(accepted.writes[0].record.idea, payload.idea);
  for (const body of [null, '', '{', '   ', stream([new Uint8Array([0xff])]),
    stream([new Uint8Array([0xe7, 0x95])]), stream([encoder.encode('{')], { fail: true })]) {
    await rejected(undefined, { status: 400, code: 'bad_json' }, { body });
  }
});

test('request host and Origin have independent exact allowlists', async () => {
  for (const host of [HOST, 'https://www.emmytattoo.com']) {
    for (const origin of [undefined, HOST, 'https://www.emmytattoo.com']) {
      const { result, response } = await post(valid(), { url: host + '/api/enquiry', headers: origin ? { Origin: origin } : {} });
      assert.equal(result.stored, true);
      assert.equal(response.headers.get('access-control-allow-origin'), origin || null);
      assert.equal(response.headers.get('vary'), 'Origin');
    }
  }
  await rejected(valid(), { status: 403, code: 'origin' }, { headers: { Origin: 'https://unlisted.example' } });
  for (const url of ['https://preview.pages.dev/api/enquiry', 'https://emmytattoo.com.evil.example/api/enquiry', 'http://emmytattoo.com/api/enquiry']) {
    await rejected(valid(), { status: 403, code: 'host' }, { url, headers: { Origin: HOST, 'X-Forwarded-Host': 'emmytattoo.com' } });
  }
  const local = 'http://localhost:8787';
  const accepted = await post(valid(), {
    url: local + '/api/enquiry', headers: { Origin: local }, env: { ALLOWED_ORIGIN: ' ' + local + ' ' }
  });
  assert.equal(accepted.result.stored, true);
  assert.equal(accepted.response.headers.get('access-control-allow-origin'), local);
});

test('OPTIONS enforces the same host and origin gates', async () => {
  for (const [url, origin, env, status, code] of [
    [HOST, HOST, {}, 204],
    ['https://www.emmytattoo.com', undefined, {}, 204],
    [HOST, 'https://unlisted.example', {}, 403, 'origin'],
    ['https://preview.pages.dev', HOST, {}, 403, 'host'],
    ['http://localhost:8787', 'http://localhost:8787', { ALLOWED_ORIGIN: 'http://localhost:8787' }, 204]
  ]) {
    const response = await onRequestOptions({
      request: new Request(url + '/api/enquiry', { method: 'OPTIONS', headers: origin ? { Origin: origin } : {} }), env
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('vary'), 'Origin');
    if (code) assert.deepEqual(await response.json(), { ok: false, code });
    else {
      assert.equal(await response.text(), '');
      assert.equal(response.headers.get('access-control-allow-origin'), origin || null);
      assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    }
  }
});
