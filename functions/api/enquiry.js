/* POST /api/enquiry  —  text-only backup copy of an enquiry.
 *
 * The enquiry itself does not travel through here. The page composes a message
 * locally and hands it to WhatsApp via wa.me; the visitor presses send in their
 * own client, and Emmy's Business-app greeting then asks for reference photos,
 * which they attach natively in the chat. Nothing on this path touches photos,
 * Meta, or a template.
 *
 * This endpoint exists for one case: the visitor submits, the WhatsApp compose
 * screen opens, and they never press send. Without a copy that enquiry is gone.
 * So the page fires this off and ignores the answer — it must never surface an
 * error, because by the time it runs the message is already in WhatsApp.
 *
 * Bound in Cloudflare Pages -> Settings -> Bindings:
 *   ENQUIRIES       KV namespace. Absent = the endpoint answers 200 and stores
 *                   nothing, which is the correct behaviour before the owner
 *                   has created it.
 *   ALLOWED_ORIGIN  optional, comma-separated extra origins on top of the two
 *                   production ones below. Exists so `wrangler pages dev` on
 *                   http://localhost:8787 is allowed.
 */

/* The site serves on both, so both must pass the gate. */
const ALLOWED = ['https://emmytattoo.com', 'https://www.emmytattoo.com'];

/* Text only — a few hundred bytes in practice. */
const MAX_BODY = 16 * 1024;
const TTL = 60 * 60 * 24 * 90;   /* 90 days, then it self-prunes */

/* Same caps the page enforces, re-applied because a public endpoint cannot
   trust the page. Keys not listed here are dropped. */
const FIELDS = {
  name: 40, idea: 300, placement: 50, size: 30, budget: 20,
  when: 50, notes: 150, email: 70, refs: 100, variant: 1
};

function json(status, body, origin) {
  const h = { 'content-type': 'application/json' };
  if (origin) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return new Response(JSON.stringify(body), { status, headers: h });
}

function allowed(env) {
  const extra = String(env.ALLOWED_ORIGIN || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return ALLOWED.concat(extra);
}

function clean(v, cap) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, cap);
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = origin && allowed(env).indexOf(origin) !== -1 ? origin : null;
  if (origin && !cors) return json(403, { ok: false, code: 'origin' }, null);
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': cors || '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-max-age': '86400'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = origin && allowed(env).indexOf(origin) !== -1 ? origin : null;

  /* A missing Origin is allowed: sendBeacon and curl both omit it, and the
     honeypot carries that load. A present but unlisted one is refused. */
  if (origin && !cors) return json(403, { ok: false, code: 'origin' }, null);

  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json(413, { ok: false, code: 'too_big' }, cors);

  let d;
  try {
    d = await request.json();
  } catch (e) {
    return json(400, { ok: false, code: 'bad_json' }, cors);
  }
  if (!d || typeof d !== 'object') return json(400, { ok: false, code: 'bad_json' }, cors);

  /* Honeypot — answer 200 and store nothing, so a bot learns nothing. */
  if (d.botcheck) return json(200, { ok: true, stored: false }, cors);

  /* No binding yet is a normal state, not an error. */
  if (!env.ENQUIRIES) return json(200, { ok: true, stored: false }, cors);

  const rec = { ts: new Date().toISOString() };
  if (request.cf && request.cf.country) rec.country = request.cf.country;
  for (const k of Object.keys(FIELDS)) {
    const v = clean(d[k], FIELDS[k]);
    if (v) rec[k] = v;
  }

  const key = 'enq:' + Date.now() + ':' + crypto.randomUUID().slice(0, 8);
  try {
    await env.ENQUIRIES.put(key, JSON.stringify(rec), {
      expirationTtl: TTL,
      /* Metadata shows in the dashboard list, so it is scannable without
         opening every key. */
      metadata: { name: rec.name || '', ts: rec.ts }
    });
  } catch (e) {
    console.error('kv put failed', String(e));
    return json(200, { ok: true, stored: false }, cors);
  }

  return json(200, { ok: true, stored: true }, cors);
}
