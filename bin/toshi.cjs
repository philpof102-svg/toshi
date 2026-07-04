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

// Guard for the zero sessionStart hook: when Toshi itself SPEAKS through `zero -p`, that inner zero
// session fires the same hook — without this early exit it would re-point the watch mid-answer.
if (process.env.TOSHI_HOOK_SKIP) process.exit(0);

const sub = (process.argv[2] || '').toLowerCase();

(async () => {
  // ── subcommands ────────────────────────────────────────────────────────────────────────────────
  if (['help', '--help', '-h'].includes(sub)) {
    console.log(`🐈  toshi — a companion beside your terminal (GPL-3.0)
  toshi              float the companion watching this repo (or connect this repo to it)
  toshi show|hide    summon / hide the floating window     toshi toggle     flip it
  toshi collapse     fold into a small head                toshi expand     unfold
  toshi setup        auto-float whenever zero starts (--remove undoes, --project scopes)
  toshi version      print version
grounded answers: npm i -g codebase-memory-mcp, then codebase-memory-mcp cli index_repository '{"repo_path":"<repo>"}'
voice: install zero (github.com/gitlawb/zero) + zero setup — Toshi speaks through it.
       no zero? set TOSHI_API_URL + TOSHI_API_KEY + TOSHI_API_MODEL (any OpenAI-compatible endpoint). TOSHI_LLM=off disables.
docs: https://github.com/philpof102-svg/toshi`);
    return;
  }
  if (['version', '--version', '-v'].includes(sub)) {
    console.log('toshi-companion ' + require(path.join(ROOT, 'package.json')).version);
    return;
  }
  if (sub === 'setup') {
    // the "auto-float when your agent starts" option, offered to everyone installing the CLI
    const extra = process.argv.slice(3); // pass --remove / --project through
    const r = require('node:child_process').spawnSync(process.execPath,
      [path.join(ROOT, 'tools', 'install-zero-hook.mjs'), ...extra], { stdio: 'inherit' });
    console.log('\nother surfaces: toshi (float/connect) · toshi hide|show|toggle · npm run brain (MCP) · see README');
    process.exit(r.status || 0);
  }
  if (['show', 'hide', 'toggle', 'collapse', 'expand'].includes(sub)) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 700);
      const r = await fetch(`http://127.0.0.1:${PORT}/panel`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: sub }), signal: ctl.signal,
      });
      clearTimeout(t);
      if (r.ok) { console.log(`🐈  Toshi: ${sub} (picked up within ~4s)`); return; }
    } catch {}
    if (sub === 'show' || sub === 'toggle') { /* nothing floating — fall through and launch one */ }
    else { console.log('🐈  Toshi is not running — launch it first by typing: toshi'); return; }
  }

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

  const env = { ...process.env, TOSHI_REPO: repo };
  let electron = null;
  try {
    electron = require('electron');
    // the electron MODULE can exist while its BINARY doesn't (ELECTRON_SKIP_BINARY_DOWNLOAD,
    // failed postinstall, full disk) — claiming "floating" would be a lie; verify the exe is real
    if (typeof electron !== 'string' || !require('node:fs').existsSync(electron)) electron = null;
  } catch { /* optional dep — fall back to the browser panel */ }
  if (electron) {
    const child = spawn(electron, ['.'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
    child.unref(); // don't block the terminal — Toshi floats independently
    console.log('🐈  Toshi is floating — bottom-right, watching this repo. (drag it, or ✕ to hide)');
  } else {
    // Electron is an OPTIONAL dependency — without it Toshi still fully works in a browser tab:
    // start the brain + the tiny static server, then point the user at the panel. Children write
    // stderr to a log and we hold 700ms before declaring victory — a child that dies instantly gets
    // REPORTED (with the log path), never a false "Toshi is up".
    const os = require('node:os'); const fsx = require('node:fs');
    const logPath = path.join(os.tmpdir(), 'toshi-launch.log');
    const errFd = fsx.openSync(logPath, 'a');
    let failed = null;
    for (const script of [path.join(ROOT, 'mcp', 'toshi-mcp.mjs'), path.join(ROOT, 'serve.js')]) {
      const c = spawn(process.execPath, [script], { cwd: ROOT, env, stdio: ['ignore', 'ignore', errFd], detached: true });
      c.on('exit', (code) => { if (code) failed = `${path.basename(script)} exited with code ${code}`; });
      c.on('error', (e) => { failed = `${path.basename(script)}: ${e.message}`; });
      c.unref();
    }
    setTimeout(() => {
      if (failed) { console.error(`🙀 Toshi could not start: ${failed}\n   details: ${logPath}`); process.exit(1); }
      console.log('🐈  Toshi is up (no Electron here — browser mode):\n    open http://127.0.0.1:4821/panel/  ·  brain on :' + PORT);
      process.exit(0);
    }, 700);
  }
})();
