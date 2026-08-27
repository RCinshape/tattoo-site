/* POST /api/enquiry  —  turns a website enquiry into a WhatsApp thread.
 *
 * Emmy's work number runs Meta Coexistence: it is live in her WhatsApp Business
 * app AND registered to the Cloud API, so a message this function sends to a
 * client appears in her app as a normal outgoing message in a normal chat. That
 * is the whole trick — the site opens the conversation on her behalf, already
 * holding the brief and the reference photos, and she just replies in the app.
 *
 * Bound in Cloudflare Pages -> Settings -> Variables and Secrets:
 *   WA_TOKEN            secret. System User permanent token, whatsapp_business_messaging.
 *   WA_PHONE_ID         business phone number ID for Emmy's work number.
 *   WA_TEMPLATE_PHOTOS  approved template name with an IMAGE header. If this is
 *                       empty the photo is dropped and WA_TEMPLATE_PLAIN is used,
 *                       so a half-finished Meta setup degrades instead of 500ing.
 *   WA_TEMPLATE_PLAIN   approved template name with no header. Required.
 *   WA_LANG             template language code, e.g. en_GB.
 *   TURNSTILE_SECRET    secret. Cloudflare Turnstile secret key. When this is
 *                       empty the Turnstile check is skipped entirely — that is
 *                       what makes `wrangler pages dev` usable, since a widget
 *                       cannot be solved in a headless browser. Set it in
 *                       production and the check becomes mandatory.
 *   ALLOWED_ORIGIN      https://emmytattoo.com
 *   GRAPH_BASE          optional. Defaults to https://graph.facebook.com/v25.0
 *                       (the version in Meta's own current media-upload example).
 *                       Point it at scripts/graph-stub.js to test without Meta.
 *   TURNSTILE_URL       optional. Defaults to
 *                       https://challenges.cloudflare.com/turnstile/v0/siteverify.
 *                       Point it at the stub too, because a Turnstile challenge
 *                       cannot be solved in a headless browser and the endpoint
 *                       must otherwise fail closed.
 */

const GRAPH_DEFAULT = 'https://graph.facebook.com/v25.0';
const TURNSTILE_DEFAULT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_BODY = 6 * 1024 * 1024;

/* Meta returns this when the recipient is not a reachable WhatsApp user. It is
   the one Graph code the visitor can actually act on, so it gets its own reply. */
const UNDELIVERABLE = 131026;

function json(status, body, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (origin) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

function allowed(env) {
  return [
    env.ALLOWED_ORIGIN || 'https://emmytattoo.com',
    'https://tattoo-site.pages.dev',
    'http://localhost:8787',
    'http://127.0.0.1:8787'
  ];
}

/* Template parameters may not contain newlines, tabs or more than four
   consecutive spaces — Meta rejects the send outright — and may not be empty.
   So every value is whitespace-collapsed and em-dashed when blank. */
function p(v) {
  var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 700);
  return { type: 'text', text: s || '\u2014' };
}

/* Hull-local site, so bare digits are assumed UK. A visitor outside the UK types
   a leading + or 00 and that wins. The review card shows the resolved number
   back before sending, which is what catches the rest. */
function e164(raw) {
  var s = String(raw || '').replace(/[^\d+]/g, '');
  var plus = s.charAt(0) === '+';
  var d = s.replace(/\+/g, '');
  if (!plus) {
    if (d.slice(0, 2) === '00') d = d.slice(2);
    else if (d.charAt(0) === '0') d = '44' + d.slice(1);
    else if (d.slice(0, 2) !== '44') d = '44' + d;
  }
  return /^[1-9]\d{7,14}$/.test(d) ? d : '';
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get('Origin');
  const ok = origin && allowed(env).indexOf(origin) !== -1;
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': ok ? origin : (env.ALLOWED_ORIGIN || 'https://emmytattoo.com'),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const cors = origin && allowed(env).indexOf(origin) !== -1 ? origin : null;

  /* 1. Origin. A missing Origin is allowed: same-origin form posts and curl
        both omit it, and the honeypot plus Turnstile carry the real load. */
  if (origin && !cors) return json(403, { ok: false, code: 'origin' }, null);

  /* 2. Size, before touching the body. */
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json(413, { ok: false, code: 'too_big' }, cors);

  /* 3. Config. */
  if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_TEMPLATE_PLAIN) {
    return json(503, { ok: false, code: 'unconfigured' }, cors);
  }

  /* 4. Parse. */
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json(400, { ok: false, code: 'bad_form' }, cors);
  }
  const f = (k) => String(form.get(k) || '').trim();

  /* 5. Honeypot — answer 200 and send nothing, so a bot learns nothing. */
  if (form.get('botcheck')) return json(200, { ok: true }, cors);

  /* 6. Turnstile. Mandatory once the secret exists; every call past here spends
        the owner's money. */
  if (env.TURNSTILE_SECRET) {
    const token = f('cf-turnstile-response');
    if (!token) return json(403, { ok: false, code: 'turnstile' }, cors);
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);
    let pass = false;
    try {
      const r = await fetch(env.TURNSTILE_URL || TURNSTILE_DEFAULT, { method: 'POST', body });
      const d = await r.json();
      pass = !!d.success;
    } catch (e) {
      pass = false;
    }
    if (!pass) return json(403, { ok: false, code: 'turnstile' }, cors);
  }

  /* 7. Phone. */
  const phone = e164(f('phone'));
  if (!phone) return json(400, { ok: false, code: 'bad_phone' }, cors);

  /* 8. The two fields Emmy cannot quote without. */
  const name = f('name');
  const idea = f('idea');
  if (!name || !idea) return json(400, { ok: false, code: 'bad_form' }, cors);

  const GRAPH = (env.GRAPH_BASE || GRAPH_DEFAULT).replace(/\/+$/, '');
  const auth = { Authorization: 'Bearer ' + env.WA_TOKEN };

  /* 9. Upload the collage. A failure here costs the photo, never the enquiry. */
  let mediaId = '';
  const photo = form.get('photo');
  if (photo && typeof photo === 'object' && photo.size > 0) {
    try {
      const up = new FormData();
      up.append('messaging_product', 'whatsapp');
      /* No explicit content-type header anywhere: the runtime writes the
         multipart boundary and setting it by hand corrupts the body. */
      up.append('file', photo, 'enquiry.jpg');
      const r = await fetch(GRAPH + '/' + env.WA_PHONE_ID + '/media', {
        method: 'POST', headers: auth, body: up
      });
      const d = await r.json();
      if (d && d.id) mediaId = d.id;
      else console.error('media upload rejected', JSON.stringify(d));
    } catch (e) {
      console.error('media upload threw', String(e));
    }
  }

  /* 10. Send. */
  const useImage = !!(mediaId && env.WA_TEMPLATE_PHOTOS);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: useImage ? env.WA_TEMPLATE_PHOTOS : env.WA_TEMPLATE_PLAIN,
      language: { code: env.WA_LANG || 'en_GB' },
      components: [].concat(
        useImage ? [{ type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] }] : [],
        [{ type: 'body', parameters: [
          p(name), p(idea), p(f('placement')), p(f('size')),
          p(f('budget')), p(f('when')), p(f('email')), p(f('refs'))
        ] }]
      )
    }
  };

  let res, data;
  try {
    res = await fetch(GRAPH + '/' + env.WA_PHONE_ID + '/messages', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, auth),
      body: JSON.stringify(payload)
    });
    data = await res.json();
  } catch (e) {
    console.error('send threw', String(e));
    return json(502, { ok: false, code: 'whatsapp' }, cors);
  }

  /* 11. Map the outcome. The Graph message is logged, never returned. */
  if (res.ok && data && data.messages) return json(200, { ok: true }, cors);

  const code = data && data.error && Number(data.error.code);
  console.error('send rejected', res.status, JSON.stringify(data && data.error));
  if (code === UNDELIVERABLE) return json(422, { ok: false, code: 'not_whatsapp' }, cors);
  return json(502, { ok: false, code: 'whatsapp' }, cors);
}
