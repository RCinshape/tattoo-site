#!/usr/bin/env node
// Syntax-checks every inline <script> block in the given HTML files.
// Run: node scripts/check-inline-js.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = false;
for (const file of ['index.html', 'portfolio.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html)) !== null) {
    if (/application\/ld\+json/i.test(m[1])) continue; // JSON-LD, not JS
    n++;
    try {
      new vm.Script(m[2], { filename: `${file}#script${n}` });
      console.log(`OK   ${file} script #${n} (${m[2].length} chars)`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${file} script #${n}: ${e.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
