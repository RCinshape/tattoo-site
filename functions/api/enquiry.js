/* POST /api/enquiry: a best-effort, 90-day text backup, not WhatsApp delivery.
 * ENQUIRIES is the Pages KV binding. ALLOWED_ORIGIN may explicitly add protected
 * preview/development origins; production volume protection belongs at the edge.
 * Notes and screening answers are deliberately outside this contract.
 */
const ALLOWED = ['https://emmytattoo.com', 'https://www.emmytattoo.com'];
const MAX_BODY = 16384;
const TTL = 7776000;
const FIELDS = {
  name: 40, email: 70, idea: 300, placement: 40, size: 40,
  budget: 20, when: 50, refs: 100
};
const REQUIRED = new Set(['name', 'idea', 'placement', 'size', 'when']);
const PLACEMENTS = ['Inner forearm', 'Outer forearm', 'Upper arm', 'Shoulder',
  'Full sleeve', 'Wrist', 'Hand', 'Chest', 'Sternum', 'Collarbone', 'Ribs',
  'Stomach', 'Upper back', 'Lower back', 'Spine', 'Hip', 'Thigh', 'Knee',
  'Calf', 'Ankle', 'Foot', 'Neck', 'Behind the ear', 'Somewhere else'];
const SIZES = ['Tiny — under 5 cm', 'Small — 5 to 10 cm', 'Medium — 10 to 15 cm',
  'Large — 15 to 25 cm', 'Extra large — 25 cm and up', 'Full sleeve or large piece'];
const BUDGETS = ['Not sure yet', 'Up to £100', '£100–£200', '£200–£350', '£350–£500', '£500+'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const URL_RE = /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[^\s]*)?$/i;

function json(status, body, origin) {
  const headers = { 'content-type': 'application/json', 'vary': 'Origin' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function allowed(env) {
  return ALLOWED.concat(String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean));
}

function gate(request, env) {
  const origins = allowed(env);
  if (!origins.includes(new URL(request.url).origin)) {
    return { error: json(403, { ok: false, code: 'host' }, null) };
  }
  const origin = request.headers.get('Origin');
  if (origin && !origins.includes(origin)) {
    return { error: json(403, { ok: false, code: 'origin' }, null) };
  }
  return { cors: origin };
}

function wellFormed(value) {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validDays(value) {
  if (value === 'Any day') return true;
  const picked = value.split(', ');
  return value !== '' && DAYS.filter(day => picked.includes(day)).join(', ') === value;
}

export async function onRequestOptions({ request, env }) {
  const { error, cors } = gate(request, env);
  if (error) return error;
  return new Response(null, {
    status: 204,
    headers: {
      'vary': 'Origin',
      'access-control-allow-origin': cors || '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-max-age': '86400'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const { error, cors } = gate(request, env);
  if (error) return error;
  if (!/^application\/json\s*(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return json(415, { ok: false, code: 'unsupported_media_type' }, cors);
  }
  const length = request.headers.get('Content-Length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BODY) {
    return json(413, { ok: false, code: 'too_big' }, cors);
  }

  let data;
  let reader;
  try {
    if (!request.body) throw new Error('Empty body');
    reader = request.body.getReader();
    const bytes = new Uint8Array(MAX_BODY);
    let used = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > MAX_BODY - used) {
        try { await reader.cancel(); } catch (_) { /* Preserve the size rejection. */ }
        return json(413, { ok: false, code: 'too_big' }, cors);
      }
      bytes.set(chunk.value, used);
      used += chunk.value.byteLength;
    }
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used)));
  } catch (_) {
    return json(400, { ok: false, code: 'bad_json' }, cors);
  } finally {
    if (reader) reader.releaseLock();
  }

  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(key => !Object.hasOwn(FIELDS, key) && key !== 'age18' && key !== 'botcheck') ||
      Object.keys(FIELDS).some(key => Object.hasOwn(data, key) && typeof data[key] !== 'string') ||
      typeof data.age18 !== 'boolean' || typeof data.botcheck !== 'boolean') {
    return json(422, { ok: false, code: 'bad_schema' }, cors);
  }

  const values = {};
  for (const [key, cap] of Object.entries(FIELDS)) {
    const value = (data[key] || '').replace(/\s+/g, ' ').trim();
    if (!wellFormed(value) || value.length > cap || (REQUIRED.has(key) && !value) ||
        (key === 'email' && value && !EMAIL_RE.test(value)) ||
        (key === 'refs' && value && !URL_RE.test(value)) ||
        (key === 'placement' && !PLACEMENTS.includes(value)) ||
        (key === 'size' && !SIZES.includes(value)) ||
        (key === 'budget' && value && !BUDGETS.includes(value)) ||
        (key === 'when' && !validDays(value))) {
      return json(422, { ok: false, code: 'invalid_field', field: key }, cors);
    }
    if (value) values[key] = value;
  }
  if (data.age18 !== true) return json(422, { ok: false, code: 'invalid_field', field: 'age18' }, cors);
  if (data.botcheck || !env.ENQUIRIES) return json(200, { ok: true, stored: false }, cors);

  const rec = { ts: new Date().toISOString(), ...values };
  if (request.cf && request.cf.country) rec.country = request.cf.country;
  const key = 'enq:' + Date.now() + ':' + crypto.randomUUID().slice(0, 8);
  try {
    await env.ENQUIRIES.put(key, JSON.stringify(rec), {
      expirationTtl: TTL,
      metadata: { name: rec.name, ts: rec.ts }
    });
  } catch (_) {
    console.error('Enquiry backup KV write failed');
    return json(200, { ok: true, stored: false }, cors);
  }
  return json(200, { ok: true, stored: true }, cors);
}
