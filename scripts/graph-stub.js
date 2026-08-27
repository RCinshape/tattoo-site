#!/usr/bin/env node
// Stands in for graph.facebook.com so functions/api/enquiry.js is testable
// before a Meta account, a template approval and Coexistence onboarding land.
// Records every request to ./_stub-out/ so assertions can read the real payload.
//
// Run: node scripts/graph-stub.js            (listens on 127.0.0.1:8788)
// Then point the function at it: GRAPH_BASE=http://127.0.0.1:8788/v25.0
//
// Routes, version segment wildcarded so bumping GRAPH_BASE never 404s the stub:
//   POST /:version/:id/media     -> {"id":"STUB_MEDIA_<n>"}, body to media-<n>.bin
//   POST /:version/:id/messages  -> {"messages":[{"id":"wamid.STUB"}]}, JSON to message-<n>.json
//   POST /turnstile/v0/siteverify-> {"success":true}
//
// Magic recipient: a message whose `to` is 447000000000 answers 400 with Graph
// error 131026 (Message undeliverable), which is how the not_whatsapp branch is
// exercised from the browser — the function builds the Graph URL itself, so a
// query-string switch would never be reachable from the form.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(process.cwd(), '_stub-out');
const MAGIC = '447000000000';
let media = 0;
let message = 0;

fs.mkdirSync(OUT, { recursive: true });

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(s);
}

/* Minimal multipart/form-data splitter — enough to prove the function forwarded
   a real file part with the right name, filename and bytes. Node ships no
   multipart parser and this stub stays dependency-free. */
function parts(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return [];
  const dash = Buffer.from('--' + (m[1] || m[2]).trim());
  const out = [];
  let i = buf.indexOf(dash);
  while (i !== -1) {
    const start = i + dash.length;
    if (buf.slice(start, start + 2).toString() === '--') break;   // closing delimiter
    const next = buf.indexOf(dash, start);
    const chunk = buf.slice(start, next === -1 ? buf.length : next);
    const split = chunk.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = chunk.slice(0, split).toString('utf8');
      // strip the CRLF that precedes the next boundary
      let bodyBuf = chunk.slice(split + 4);
      if (bodyBuf.slice(-2).toString() === '\r\n') bodyBuf = bodyBuf.slice(0, -2);
      out.push({
        name: (/name="([^"]*)"/i.exec(head) || [])[1] || null,
        filename: (/filename="([^"]*)"/i.exec(head) || [])[1] || null,
        contentType: (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || null,
        body: bodyBuf
      });
    }
    if (next === -1) break;
    i = next;
  }
  return out;
}

function filePart(buf, contentType) {
  return parts(buf, contentType).find((p) => p.name === 'file') || null;
}

/* Every non-file field, so assertions can confirm messaging_product=whatsapp. */
function fieldsOf(buf, contentType) {
  const o = {};
  for (const p of parts(buf, contentType)) {
    if (p.name && !p.filename) o[p.name] = p.body.toString('utf8');
  }
  return o;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8788');
  const p = url.pathname;

  if (req.method !== 'POST') return send(res, 405, { error: { message: 'POST only' } });

  if (/\/turnstile\/v0\/siteverify$/.test(p)) {
    await body(req);
    console.log('turnstile  -> success');
    return send(res, 200, { success: true });
  }

  if (/^\/[^/]+\/[^/]+\/media$/.test(p)) {
    const buf = await body(req);
    const n = ++media;
    const ct = req.headers['content-type'] || '';
    // Write the decoded `file` part, not the multipart envelope, so assertions
    // can check real JPEG bytes rather than a boundary marker.
    const part = filePart(buf, ct);
    fs.writeFileSync(path.join(OUT, 'media-' + n + '.bin'), part ? part.body : buf);
    fs.writeFileSync(path.join(OUT, 'media-' + n + '.meta.json'), JSON.stringify({
      requestContentType: ct,
      envelopeBytes: buf.length,
      partFound: !!part,
      partName: part ? part.name : null,
      partFilename: part ? part.filename : null,
      partContentType: part ? part.contentType : null,
      partBytes: part ? part.body.length : null,
      fields: fieldsOf(buf, ct)
    }, null, 2));
    console.log('media  #' + n + '  envelope ' + buf.length +
                '  file ' + (part ? part.body.length : '?') + ' bytes' +
                (part && part.filename ? '  "' + part.filename + '"' : ''));
    return send(res, 200, { id: 'STUB_MEDIA_' + n });
  }

  if (/^\/[^/]+\/[^/]+\/messages$/.test(p)) {
    const buf = await body(req);
    const n = ++message;
    let parsed = null;
    try { parsed = JSON.parse(buf.toString('utf8')); } catch (e) { parsed = { unparseable: buf.toString('utf8') }; }
    // Written for every send, including the failure case: the recorded payload
    // is what the assertions inspect.
    fs.writeFileSync(path.join(OUT, 'message-' + n + '.json'), JSON.stringify(parsed, null, 2));
    const to = parsed && parsed.to;
    const tpl = parsed && parsed.template && parsed.template.name;
    console.log('message #' + n + '  to=' + to + '  template=' + tpl);
    if (to === MAGIC) {
      console.log('           -> forcing 131026 Message undeliverable');
      return send(res, 400, { error: { code: 131026, message: 'Message undeliverable' } });
    }
    return send(res, 200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.STUB' }] });
  }

  console.log('unrouted ' + req.method + ' ' + p);
  return send(res, 404, { error: { message: 'no stub route for ' + p } });
});

server.listen(8788, '127.0.0.1', () => {
  console.log('graph stub on http://127.0.0.1:8788  ->  ' + OUT);
});
