// Quick tag-balance sanity check for the two pages.
const fs = require('fs');
for (const file of ['index.html', 'portfolio.html']) {
  const h = fs.readFileSync(file, 'utf8');
  console.log('--', file);
  for (const t of ['nav', 'div', 'section', 'main', 'footer', 'style', 'script', 'svg', 'a', 'button', 'ul', 'li']) {
    const open = (h.match(new RegExp('<' + t + '[\\s>]', 'g')) || []).length;
    const close = (h.match(new RegExp('</' + t + '>', 'g')) || []).length;
    if (open !== close) console.log(`  ${t}: ${open} open vs ${close} close  <-- MISMATCH`);
  }
  console.log('  done');
}
