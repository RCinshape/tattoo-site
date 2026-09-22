// Structural HTML validation for every page; independent of the caller's cwd.
const fs = require('fs');
const path = require('path');
const { HtmlValidate, StaticConfigLoader } = require('html-validate');

const pages = ['index.html', 'book.html', 'book2.html', 'portfolio.html', 'legal.html', 'aftercare.html', 'gift-cards.html'];
const rules = [
  'close-order',
  'close-attr',
  'attr-spacing',
  'no-dup-attr',
  'no-dup-id',
  'void-content',
  'script-element',
  'element-permitted-content',
  'element-permitted-parent',
  'element-permitted-occurrences',
  'element-permitted-order',
  'element-required-ancestor',
  'element-required-content',
  'doctype-html',
  'missing-doctype',
];

let validator;
try {
  validator = new HtmlValidate(new StaticConfigLoader({
    root: true,
    extends: [],
    elements: ['html5'],
    rules: Object.fromEntries(rules.map(rule => [rule, 'error'])),
  }));
} catch (error) {
  console.error(`${__filename}:1:1: ${error.message} [config]`);
  process.exitCode = 1;
}

if (validator) {
  for (const file of pages) {
    const filename = path.resolve(__dirname, '..', file);
    try {
      const html = fs.readFileSync(filename, 'utf8');
      const report = validator.validateStringSync(html, filename);
      if (report.valid) {
        console.log(`${file}: valid`);
        continue;
      }
      process.exitCode = 1;
      for (const result of report.results) {
        for (const message of result.messages) {
          console.error(`${result.filePath || filename}:${message.line}:${message.column}: ${message.message} [${message.ruleId || 'parser'}]`);
        }
      }
    } catch (error) {
      console.error(`${filename}:1:1: ${error.message} [read/config/parser]`);
      process.exitCode = 1;
    }
  }
}
