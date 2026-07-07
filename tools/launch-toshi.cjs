// Lance brain + panel en arriere-plan, attend que les ports soient UP, et ping les endpoints
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// Make this script portable: ROOT = repo root (parent of tools/). Was hardcoded to a Windows dev path,
// which broke the launcher on any other machine (and on this one after a folder rename). For an
// absolute override, set TOSHI_LAUNCH_ROOT in the env.
const ROOT = process.env.TOSHI_LAUNCH_ROOT || path.join(__dirname, '..');
const LOG  = path.join(ROOT, 'tools', 'launch.log');
fs.writeFileSync(LOG, '');

function log(line) { fs.appendFileSync(LOG, line + '\n'); console.log(line); }

function spawnN(name, script, extraEnv) {
  const child = spawn(process.execPath, [script], {
    cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, ...extraEnv }, windowsHide: true,
  });
  child.unref();
  log(`spawned ${name} pid=${child.pid}`);
  return child;
}

function ping(port, p, body) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: body ? 'POST' : 'GET', timeout: 1500,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  // 1. tuer tout ancien brain/panel sur 4820/4821 (defense en profondeur)
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4820,4821 } | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }"
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch {}

  // 2. spawn brain + panel
  spawnN('brain', path.join(ROOT, 'mcp', 'toshi-mcp.mjs'), {});
  spawnN('panel', path.join(ROOT, 'serve.js'), {});

  // 3. attendre 2.5s que les serveurs s'attachent
  await new Promise((r) => setTimeout(r, 2500));

  // 4. pings
  log('\n--- /health (brain :4820) ---');
  log(JSON.stringify(await ping(4820, '/health?w=1'), null, 2));

  log('\n--- GET / (panel :4821) ---');
  log(JSON.stringify(await ping(4821, '/'), null, 2).slice(0, 400));

  log('\n--- GET /panel/ (panel :4821) ---');
  log(JSON.stringify(await ping(4821, '/panel/'), null, 2).slice(0, 400));

  log('\n--- POST /repo (brain :4820) ---');
  log(JSON.stringify(await ping(4820, '/repo', JSON.stringify({ path: ROOT })), null, 2));

  log('\n--- POST /ask (brain :4820) ---');
  log(JSON.stringify(await ping(4820, '/ask', JSON.stringify({ q: 'what changed' })), null, 2).slice(0, 1200));

  log('\n--- listeners after launch ---');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4820,4821 } | ForEach-Object { '{0,5}  pid={1,6}  proc={2}' -f $_.LocalPort,$_.OwningProcess,(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }"
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).toString();
    log(out);
  } catch (e) { log('ps-err: ' + e.message); }
})();
