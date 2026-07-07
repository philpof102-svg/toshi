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
  toshi ask "q"      answer about THIS repo right in the terminal (no window needed)
  toshi show|hide    summon / hide the floating window     toshi toggle     flip it
  toshi collapse     fold into a small head                toshi expand     unfold
  toshi size <s>     resize: small | normal | large | xl | 340x520 (live if running)
  toshi model <id>   pick Toshi's brain model, persisted to ~/.toshi.json (e.g. minimax/minimax-m3). No arg = show current · --clear = provider default
  toshi voice <e>    spoken voice (audio TTS): off | system | kokoro | piper. No arg = show current · --list = the open-source ladder (VOICE.md)
  toshi setup        ONE-COMMAND onboarding: install the brain + index THIS repo + wire zero/openclaude/Claude Code + float the popup (--no-float to skip · --remove to undo)
                     (--mcp only · --hook only · --file <path> for Claude Desktop/Cline · --remove undoes)
  toshi version      print version
grounded answers: npm i -g codebase-memory-mcp, then codebase-memory-mcp cli index_repository '{"repo_path":"<repo>"}'
voice + chat: install zero (github.com/gitlawb/zero) + zero setup — Toshi speaks AND free-chats through it.
       no zero? set a provider key (OPENROUTER_API_KEY / XAI / GROQ / OPENAI) or TOSHI_API_URL + TOSHI_API_KEY (any OpenAI-compatible endpoint).
       pick the model with:  toshi model <id>  (e.g. minimax/minimax-m3). TOSHI_LLM=off disables voice + chat.
docs: https://github.com/philpof102-svg/toshi`);
    return;
  }
  if (['version', '--version', '-v'].includes(sub)) {
    console.log('toshi-companion ' + require(path.join(ROOT, 'package.json')).version);
    return;
  }
  if (sub === 'size') {
    // toshi size small|normal|large|xl  |  toshi size 340x520  — persists to ~/.toshi.json + resizes live
    const PRESETS = { small: [244, 372], normal: [300, 460], large: [372, 568], xl: [456, 700] };
    const arg = (process.argv[3] || '').toLowerCase();
    let w, h, out = {};
    if (PRESETS[arg]) { [w, h] = PRESETS[arg]; out = { size: arg }; }
    else { const m = arg.match(/^(\d{2,4})[x×](\d{2,4})$/); if (m) { w = +m[1]; h = +m[2]; out = { width: w, height: h }; } }
    if (!w) { console.log('usage: toshi size small|normal|large|xl  |  toshi size 340x520'); process.exit(1); }
    const cfgPath = path.join(require('node:os').homedir(), '.toshi.json');
    let cur = {}; try { cur = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')) || {}; } catch {}
    delete cur.size; delete cur.width; delete cur.height; // one size source wins
    require('node:fs').writeFileSync(cfgPath, JSON.stringify({ ...cur, ...out }, null, 2));
    // resize the running companion now (else it applies on next launch)
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 700);
      const r = await fetch(`http://127.0.0.1:${PORT}/panel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resize', w, h }), signal: ctl.signal });
      clearTimeout(t);
      console.log(`🐈  Toshi size → ${w}×${h}` + (r.ok ? ' (applied live)' : ' (saved — applies next launch)'));
    } catch { console.log(`🐈  Toshi size → ${w}×${h} (saved — applies next launch)`); }
    return;
  }
  if (sub === 'model') {
    // toshi model <id>  — persist the brain model to ~/.toshi.json (read by lib/llm.mjs when TOSHI_API_MODEL
    // isn't set). Works with any provider key (OPENROUTER_API_KEY, …) or a full TOSHI_API_URL+KEY config.
    //   toshi model                 → show the current model (or that none is set)
    //   toshi model minimax/minimax-m3   → use MiniMax M3 (via OpenRouter, the exact id from openrouter.ai/models)
    //   toshi model --clear         → back to each provider's built-in default
    const cfgPath = path.join(require('node:os').homedir(), '.toshi.json');
    let cur = {}; try { cur = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')) || {}; } catch {}
    const arg = (process.argv[3] || '').trim();
    if (!arg) {
      console.log(cur.model
        ? `🐈  Toshi brain model: ${cur.model}  (from ~/.toshi.json)`
        : '🐈  no model set — using the TOSHI_API_MODEL env or the provider default.\n    set one:  toshi model minimax/minimax-m3');
      return;
    }
    if (['--clear', 'clear', 'none', 'default', 'reset'].includes(arg.toLowerCase())) {
      delete cur.model;
      require('node:fs').writeFileSync(cfgPath, JSON.stringify(cur, null, 2));
      console.log('🐈  Toshi model cleared — back to the env / provider default.');
      return;
    }
    cur.model = arg;
    require('node:fs').writeFileSync(cfgPath, JSON.stringify(cur, null, 2));
    console.log(`🐈  Toshi brain model → ${arg}  (saved to ~/.toshi.json)`);
    console.log('    make sure a provider key is set — e.g. OPENROUTER_API_KEY, or TOSHI_API_URL + TOSHI_API_KEY.');
    console.log('    (TOSHI_API_MODEL in the environment still overrides this if set.)');
    return;
  }
  if (sub === 'voice') {
    // toshi voice <off|system|kokoro|piper>  — persist the SPOKEN (audio TTS) voice to ~/.toshi.json {voice},
    // read by lib/tts.mjs. Open-source + local, graceful fallback (kokoro→piper→system→off). See VOICE.md.
    //   toshi voice                → show current + the default
    //   toshi voice --list         → the engine ladder (license + size + install)
    //   toshi voice kokoro         → the credible local voice (Kokoro-82M, Apache-2.0, one-time download)
    //   toshi voice off | --clear  → mute / back to the default (system = Web Speech, 0 download)
    const { TTS_ENGINES, PERSONA } = await import('../lib/tts.mjs');
    const cfgPath = path.join(require('node:os').homedir(), '.toshi.json');
    let cur = {}; try { cur = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf8')) || {}; } catch {}
    const arg = (process.argv[3] || '').trim().toLowerCase();
    const ids = TTS_ENGINES.map((e) => e.id); // system | kokoro | piper
    if (['--list', 'list'].includes(arg)) {
      console.log('🐈  Toshi voices — open-source, local, no cloud (see VOICE.md):');
      for (const e of TTS_ENGINES) console.log(`    ${e.id.padEnd(7)} ${e.label}  ·  ${e.license}  ·  ${e.size}  ·  ${e.install}`);
      console.log(`    off     mute (text bubbles still work)`);
      console.log(`    persona: rate ${PERSONA.rate} · pitch ${PERSONA.pitch} · FR voice ${PERSONA.kokoro.fr} · EN voice ${PERSONA.kokoro.en}`);
      return;
    }
    if (!arg) {
      console.log(cur.voice
        ? `🐈  Toshi voice: ${cur.voice}  (from ~/.toshi.json)`
        : '🐈  no voice set — default is "system" (Web Speech, 0 download).\n    upgrade:  toshi voice kokoro   ·   see all:  toshi voice --list');
      return;
    }
    if (['--clear', 'clear', 'default', 'reset'].includes(arg)) {
      delete cur.voice;
      require('node:fs').writeFileSync(cfgPath, JSON.stringify(cur, null, 2));
      console.log('🐈  Toshi voice cleared — back to the default (system = Web Speech).');
      return;
    }
    if (arg !== 'off' && !ids.includes(arg)) {
      console.log(`🙀  unknown voice "${arg}". Choose: off | ${ids.join(' | ')}   (toshi voice --list for details)`);
      return;
    }
    cur.voice = arg;
    require('node:fs').writeFileSync(cfgPath, JSON.stringify(cur, null, 2));
    console.log(`🐈  Toshi voice → ${arg}  (saved to ~/.toshi.json)`);
    if (arg === 'kokoro') console.log('    first use downloads the Kokoro-82M ONNX model once (~80–330MB), then 100% local.');
    if (arg === 'piper') console.log('    needs the piper binary + a .onnx voice on PATH (see VOICE.md).');
    if (arg === 'off') console.log('    Toshi is muted — text bubbles still work.');
    return;
  }
  if (sub === 'ask') {
    // ask from ANY terminal — no window needed. Uses the floating companion's brain when it's up
    // (same repo-watching state), else answers one-shot right here (auto-indexes this repo if needed).
    const q = process.argv.slice(3).join(' ').trim();
    if (!q) { console.log('usage: toshi ask "what changed?"'); process.exit(1); }
    let out = null;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 800);
      const r0 = await fetch(`http://127.0.0.1:${PORT}/repo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }), signal: ctl.signal });
      clearTimeout(t);
      if (r0.ok) {
        const r = await fetch(`http://127.0.0.1:${PORT}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }) });
        if (r.ok) out = await r.json();
      }
    } catch { /* no companion — answer locally */ }
    if (!out) {
      process.env.TOSHI_REPO = repo;
      const { ask, setRepo } = await import(require('node:url').pathToFileURL(path.join(ROOT, 'lib', 'session.mjs')).href);
      const w = await setRepo(repo);
      if (w.autoIndexed) console.log(`(indexed ${repo} on the fly)`);
      out = await ask(q);
      if (out.grounded) {
        try {
          const { speak, hasVoice } = await import(require('node:url').pathToFileURL(path.join(ROOT, 'lib', 'llm.mjs')).href);
          if (hasVoice()) { const s = await speak(q, out.answer, path.basename(repo)); if (s) out.spoken = s; }
        } catch {}
      }
    }
    console.log((out.spoken || out.answer || '(no answer)') + (out.grounded ? '\n— from your repo ✅' : ''));
    return;
  }
  if (sub === 'setup') {
    // THE one-command onboarding for a brand-new user (any terminal, any model):
    //   toshi setup          → install the grounded brain + index THIS repo + wire zero/openclaude/Claude Code
    //                          + FLOAT the popup so you see it working immediately ("setup → working").
    //   toshi setup --mcp    → MCP registration only (--file <path> targets Claude Desktop / Cline / etc.)
    //   toshi setup --hook   → zero sessionStart hook only
    //   toshi setup --no-float → wire everything but don't launch the popup (headless/CI)
    //   add --remove to undo the hook + MCP
    const cp = require('node:child_process');
    const extra = process.argv.slice(3).filter((a) => !['--mcp', '--hook', '--no-float'].includes(a));
    const onlyMcp = process.argv.includes('--mcp'), onlyHook = process.argv.includes('--hook');
    const removing = process.argv.includes('--remove');
    const noFloat = process.argv.includes('--no-float') || removing;
    const run = (script) => cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...extra], { stdio: 'inherit' }).status || 0;
    let code = 0;
    // 1. the grounded brain: install codebase-memory-mcp if missing (best-effort), then index THIS repo so
    //    Toshi answers from real code on the very first question — the difference between grounded and guessing.
    if (!removing && !onlyMcp && !onlyHook) {
      const have = cp.spawnSync(process.execPath, ['-e', "require.resolve('codebase-memory-mcp')"], { stdio: 'ignore' }).status === 0
        || cp.spawnSync('codebase-memory-mcp', ['--version'], { stdio: 'ignore', shell: true }).status === 0;
      if (!have) { console.log('🐈  installing the grounded brain (codebase-memory-mcp)…'); cp.spawnSync('npm', ['i', '-g', 'codebase-memory-mcp'], { stdio: 'inherit', shell: true }); }
      // resolve the real binary (execFile can't run the .cmd shim on Windows; PATH shim works on POSIX) and
      // pass the JSON as ONE arg with a forward-slash path — no shell, or Windows cmd mangles the quotes.
      const isWin = process.platform === 'win32';
      const exeName = isWin ? 'codebase-memory-mcp.exe' : 'codebase-memory-mcp';
      const roots = [process.env.npm_config_prefix, isWin && process.env.APPDATA && path.join(process.env.APPDATA, 'npm'), '/usr/local', '/opt/homebrew', process.env.HOME && path.join(process.env.HOME, '.npm-global')].filter(Boolean);
      let bin = 'codebase-memory-mcp';
      for (const r of roots) for (const rel of [['node_modules'], ['lib', 'node_modules']]) { const p = path.join(r, ...rel, 'codebase-memory-mcp', 'bin', exeName); if (require('node:fs').existsSync(p)) { bin = p; break; } }
      console.log(`🐈  indexing ${repo} for grounded answers…`);
      try { cp.spawnSync(bin, ['cli', 'index_repository', JSON.stringify({ repo_path: repo.replace(/\\/g, '/') })], { stdio: 'inherit', timeout: 120000 }); } catch {}
    }
    // 2. wire the surfaces: zero auto-float hook + MCP in openclaude/Claude Code/zero
    if (!onlyMcp) code = run('install-zero-hook.mjs') || code;   // zero (github.com/gitlawb/zero)
    if (!onlyHook) code = run('install-mcp.mjs') || code;         // openclaude + Claude Code + zero (via its CLI)
    if (removing) { console.log('🐈  Toshi unwired (zero hook + MCP removed).'); process.exit(code); }
    console.log(`\n🐈  SETUP DONE — Toshi is wired into zero + openclaude + Claude Code, grounded on ${repo}.`);
    console.log('    ask from anywhere: toshi ask "what changed?"  ·  in zero it auto-floats on session start');
    if (noFloat) { console.log('    (skipped the popup — run `toshi` to float it)'); process.exit(code); }
    console.log('    launching the floating companion now…\n');
    // fall through → the launch flow below floats the popup on THIS repo (the "working" state)
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
      // brain up AND a popup window is alive → done. But the brain can run HEADLESS (spawned by
      // zero/openclaude as an MCP) with no window — then still float the electron popup so the user sees it.
      if (j.windowAlive) return;
      console.log('    (brain was headless — floating the popup window now…)');
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
