// Smoke-check the inline <script> blocks in panel/index.html
// (node --check can't read .html, and the renderer needs every block valid).
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'panel', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const blocks = [];
const re = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  const tag = m[0];
  const body = m[1];
  const isSrc = /\bsrc=/.test(tag);
  blocks.push({ tag, body, isSrc });
}

console.log('panel/index.html: ' + blocks.length + ' <script> tag(s)');
let bad = 0;
blocks.forEach((b, i) => {
  const label = b.isSrc ? '[external]' : '[inline]';
  if (b.isSrc) {
    console.log('  ' + (i + 1) + '. ' + label + ' skipped (src=)');
    return;
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function(b.body);
    console.log('  ' + (i + 1) + '. ' + label + ' OK (' + b.body.length + ' chars)');
  } catch (e) {
    bad++;
    console.log('  ' + (i + 1) + '. ' + label + ' SYNTAX ERROR: ' + e.message);
  }
});

process.exit(bad ? 1 : 0);
