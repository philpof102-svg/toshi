#!/usr/bin/env node
// `toshi` — launch the floating companion from anywhere, CONNECTED to this terminal. GPL-3.0.
// After `npm install -g .` (in the toshi repo), just type `toshi` in any repo:
//   • no Toshi floating yet → launches it, watching this terminal's repo (TOSHI_REPO=cwd);
//   • one already floating  → no second window: tells it to watch THIS repo (POST /repo on its brain).
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const repo = path.resolve(process.env.TOSHI_REPO || process.cwd());
const PORT = Number(process.env.TOSHI_PORT || 4820);

(async () => {
  // Is a Toshi brain already alive? Then just point it at this terminal's repo.
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 700);
    const r = await fetch(`http://127.0.0.1:${PORT}/repo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: repo }), signal: ctl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      console.log(`🐈  Toshi is now watching ${j.repo}` + (j.indexed
        ? ' — grounded ✨'
        : `\n    (not indexed yet — for grounded answers run: codebase-memory-mcp cli index_repository '{"repo_path":"${repo.replace(/\\/g, '/')}"}')`));
      return;
    }
  } catch { /* no companion running — launch one */ }

  let electron;
  try { electron = require('electron'); } catch { console.error('Toshi needs Electron. Run `npm install` in', ROOT); process.exit(1); }
  const env = { ...process.env, TOSHI_REPO: repo };
  const child = spawn(electron, ['.'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
  child.unref(); // don't block the terminal — Toshi floats independently
  console.log('🐈  Toshi is floating — bottom-right, watching this repo. (drag it, or ✕ to hide)');
})();
