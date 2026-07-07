// Verif finale: ask tolerant + mirror ping
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

function pingHttp(host, port, p, body, ms) {
  return new Promise((resolve) => {
    const lib = port === 443 ? https : http;
    const req = lib.request({ host, port, path: p, method: body ? 'POST' : 'GET', timeout: ms || 60000,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(new Error('timeout ' + ms + 'ms')); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== /ask what changed (60s) ===');
  const r1 = await pingHttp('127.0.0.1', 4820, '/ask', JSON.stringify({ q: 'what changed' }), 60000);
  console.log('status:', r1.status);
  if (r1.body) {
    try { const j = JSON.parse(r1.body); console.log('keys:', Object.keys(j)); console.log('grounded:', j.grounded, 'tool:', j.tool, 'lang:', j.lang);
      console.log('answer:', (j.answer || '').slice(0, 500));
      if (j.spoken) console.log('spoken:', j.spoken.slice(0, 200));
    } catch { console.log('raw:', r1.body.slice(0, 600)); }
  } else console.log('err:', r1.error);

  console.log('\n=== /ask architecture ===');
  const r2 = await pingHttp('127.0.0.1', 4820, '/ask', JSON.stringify({ q: 'architecture' }), 60000);
  console.log('status:', r2.status);
  if (r2.body) { try { console.log('answer:', (JSON.parse(r2.body).answer || '').slice(0, 400)); } catch {} }

  console.log('\n=== mirror node.gitlawb.com ===');
  // The P2P mirror is currently blocked on an iCaptcha human gate; a CI smoke should not flap on it.
  // Set TOSHI_VERIFY_MIRROR=1 to opt in to the mirror pings. Default = skip the whole block.
  if (process.env.TOSHI_VERIFY_MIRROR !== '1') {
    console.log('(skipped — set TOSHI_VERIFY_MIRROR=1 to probe node.gitlawb.com)');
  } else {
    const mirrors = [
      'https://node.gitlawb.com/',
      'https://node.gitlawb.com/toshi',
      'https://node.gitlawb.com/health',
      'https://node.gitlawb.com:4820/health',
      'https://node.gitlawb.com:4821/',
    ];
    for (const m of mirrors) {
      const r = await pingHttp(new URL(m).hostname, new URL(m).port || (m.startsWith('https') ? 443 : 80), new URL(m).pathname + (new URL(m).search || ''), null, 8000);
      console.log(m, '→', r.status || r.error, r.body ? '(' + r.body.length + ' bytes)' : '');
    }
  }
})();
