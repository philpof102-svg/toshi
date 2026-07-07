// One-shot syntax check: pulls the <script>…</script> block out of panel/index.html
// and parses it with the Function constructor. No runtime, no DOM — just the JS.
// Useful before committing panel changes; run with:  node tools/check-panel-syntax.cjs
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'panel', 'index.html'), 'utf8');
// the panel has two <script> tags: the Rive CDN <script src=…> and the inline one. The inline one
// is the one without a src= attribute and contains a `<script>` (no attrs) on its own line.
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.error('no inline <script> block found'); process.exit(2); }
const code = m[1];
try { new Function(code); console.log('panel/index.html inline script: syntax OK (' + code.split(/\n/).length + ' lines)'); }
catch (e) { console.error('SYNTAX ERROR:', e.message); process.exit(1); }
