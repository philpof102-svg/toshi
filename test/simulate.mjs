// Toshi use-case simulation — exercises the real developer questions end-to-end. GPL-3.0.
//
// Three layers:
//   1. CORE   — ask() against the live indexed graph: routing + backend contract (where the 6 fixes live).
//   2. DEGRADE— subprocess with a bad BIN / unindexed repo: honest non-grounded messages, never a crash.
//   3. PLUGIN — zero invokes `node ./tools/toshi.mjs <cmd>` with JSON on stdin (the zero-plugin surface).
//   4. HTTP   — spawn the brain, POST /ask like the panel does (the :4820 origin path that regressed once).
//   5. PORTABILITY — CLI entrypoints + binary resolution work on Windows/macOS/Linux (always runs).
//
// Run:  node test/simulate.mjs      (or npm test)
// If the codebase-memory backend isn't installed/indexed, CORE+HTTP self-skip with a clear note; DEGRADE
// still runs (it tests exactly the missing-backend path). Nothing here fabricates a pass.
import { ask, status, resolveBin } from '../lib/session.mjs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const pexec = promisify(execFile);

const REPO = resolve(process.env.TOSHI_REPO || process.cwd());
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

let pass = 0, fail = 0, skip = 0;
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${label}`); }
  else { fail++; console.log(`  ${C.r}✗ ${label}${C.x} ${C.d}${detail}${C.x}`); }
}
function skipped(label, why) { skip++; console.log(`  ${C.y}⊘${C.x} ${label} ${C.d}(${why})${C.x}`); }

// ── backend readiness ────────────────────────────────────────────────────────────────────────────
async function backendIndexed() {
  try {
    const { stdout } = await pexec(resolveBin(), ['cli', 'list_projects', '{}'], { timeout: 15000, maxBuffer: 4e6 });
    const { projects = [] } = JSON.parse(stdout);
    return projects.some((p) => norm(p.root_path) === norm(REPO));
  } catch { return false; }
}
async function reindex() {
  // keep the graph in sync with the current tree so symbol assertions are deterministic
  try { await pexec(resolveBin(), ['cli', 'index_repository', JSON.stringify({ repo_path: REPO.replace(/\\/g, '/') })],
    { timeout: 60000, maxBuffer: 8e6 }); return true; } catch { return false; }
}

// ── CORE: the real use cases (routing + grounded content) ──────────────────────────────────────────
// [question, expected tool, answer-predicate, human label]
const CORE = [
  ['what did I just change?',          'detect_changes',  (a) => /clean|changed|impacted/i.test(a), 'change → detect_changes'],
  ['any regressions or failing tests?','detect_changes',  (a) => /clean|changed|impacted/i.test(a), 'regress/fail synonyms → detect_changes'],
  ['where is the `ask` function?',     'search_graph',    (a) => /\bask\b/.test(a) && /session\.mjs/.test(a), 'backtick term → finds ask'],
  ['find summarize',                   'search_graph',    (a) => /summarize/.test(a), 'bare verb+term → finds summarize'],
  ['locate resolveProject',            'search_graph',    (a) => /resolveProject/.test(a), 'camelCase term → finds resolveProject'],
  ['who calls summarize?',             'trace_call_path', (a) => /callers/.test(a) && /\bask\b/.test(a), 'callers of summarize include ask'],
  ['what does ask depend on?',         'trace_call_path', (a) => /callees|callers/.test(a), 'depend → trace_call_path'],
  ['give me an architecture overview', 'get_architecture',(a) => /nodes?\b/i.test(a) && /edges?\b/i.test(a), 'overview → node/edge counts'],
  ['how is this codebase organized?',  'get_architecture',(a) => /nodes?/i.test(a), 'how..organized → architecture'],
  // French (the router is bilingual — an EN-only router looped the same default phrase at FR questions)
  ['quoi de neuf ?',                   'detect_changes',  (a) => /clean|changed|impacted/i.test(a), 'FR: quoi de neuf → detect_changes'],
  ['où est la fonction `ask` ?',       'search_graph',    (a) => /\bask\b/.test(a), 'FR: où est → finds ask'],
  ['qui appelle summarize ?',          'trace_call_path', (a) => /callers/.test(a), 'FR: qui appelle → trace'],
  ['montre-moi la structure du projet','get_architecture',(a) => /nodes?/i.test(a), 'FR: structure → architecture'],
  // robustness — unmatched questions get a HELP answer (what Toshi can do), not a repeated silent default
  ['',                                 'help',            (a) => /demande|what changed/i.test(a), 'empty query → help, no crash'],
  ['where is fooBarDoesNotExist9000?', 'search_graph',    (a) => /nothing/i.test(a), 'unknown symbol → honest "nothing"'],
  ['zzqq random noise words here',     'help',            (a) => /demande|what changed/i.test(a), 'garbage → help (no more looped default)'],
  ['salut toshi',                      'help',            (a) => /où est|where is/i.test(a), 'greeting → help lists abilities'],
];

async function runCore() {
  console.log(`\n${C.d}CORE — ask() against the live graph (${REPO})${C.x}`);
  for (const [q, tool, pred, label] of CORE) {
    let r; try { r = await ask(q); } catch (e) { check(label, false, 'threw: ' + e.message); continue; }
    const wantGrounded = tool !== 'help'; // help is honestly non-grounded (no graph call)
    const ok = r.grounded === wantGrounded && r.tool === tool && pred(r.answer);
    check(label, ok, `got tool=${r.tool} grounded=${r.grounded} · ${JSON.stringify(r.answer).slice(0, 90)}`);
  }
}

// ── DEGRADE: honest non-grounded fallbacks (subprocess so module-load BIN/REPO differ) ─────────────
function isolatedAsk(env, q = 'what changed?') {
  return new Promise((res) => {
    const code = `import('./lib/session.mjs').then(async m => { const r = await m.ask(${JSON.stringify(q)}); process.stdout.write(JSON.stringify(r)); }).catch(e => process.stdout.write(JSON.stringify({ error: e.message })));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code],
      { cwd: REPO, env: { ...process.env, ...env } });
    let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', () => {});
    child.on('close', () => { try { res(JSON.parse(out)); } catch { res({ answer: out, grounded: null }); } });
  });
}
async function runDegrade() {
  console.log(`\n${C.d}DEGRADE — missing backend / unindexed repo (must be honest, never crash)${C.x}`);
  const noBin = await isolatedAsk({ CODEBASE_MEMORY_BIN: 'toshi-no-such-binary-xyz' });
  check('binary absent → grounded:false + "demo mode"',
    noBin.grounded === false && /demo mode/i.test(noBin.answer || ''), JSON.stringify(noBin).slice(0, 120));
  const unindexed = await isolatedAsk({ TOSHI_REPO: join(tmpdir(), 'toshi-unindexed-' + process.pid) });
  const okUnindexed = unindexed.grounded === false && /index/i.test(unindexed.answer || '');
  // if the real binary is missing this collapses to the demo-mode branch — still honest, so accept either
  check('unindexed repo → grounded:false + index hint',
    okUnindexed || /demo mode/i.test(unindexed.answer || ''), JSON.stringify(unindexed).slice(0, 120));
}

// ── PORTABILITY: the CLI must work on every support (Windows / macOS / Linux) ───────────────────────
async function runPortability() {
  console.log(`\n${C.d}PORTABILITY — CLI entrypoints resolve on any platform${C.x}`);
  // every cross-platform entrypoint the CLI exposes must exist as a file (no OS-specific launcher required)
  for (const f of ['bin/toshi.cjs', 'tools/toshi.mjs', 'mcp/toshi-mcp.mjs', 'desktop/main.cjs']) {
    check(`entrypoint ${f} present`, existsSync(join(REPO, f)));
  }
  // shebang so POSIX can exec `toshi` directly after `npm i -g` (chmod +x by npm)
  const { readFileSync } = await import('node:fs');
  check('bin/toshi.cjs has #!/usr/bin/env node shebang',
    readFileSync(join(REPO, 'bin', 'toshi.cjs'), 'utf8').startsWith('#!/usr/bin/env node'));
  // the binary resolver returns a usable target on THIS platform (either a real file or the PATH name)
  const bin = resolveBin();
  check('resolveBin() → existing file or bare PATH name',
    typeof bin === 'string' && (existsSync(bin) || bin === 'codebase-memory-mcp'), `got ${bin}`);
  // env override must always win (lets any platform / custom install point at its own binary)
  const prev = process.env.CODEBASE_MEMORY_BIN;
  process.env.CODEBASE_MEMORY_BIN = '/custom/path/cbm';
  check('CODEBASE_MEMORY_BIN override honored', resolveBin() === '/custom/path/cbm');
  if (prev === undefined) delete process.env.CODEBASE_MEMORY_BIN; else process.env.CODEBASE_MEMORY_BIN = prev;
  // plugin.json command must be node (portable), not an OS-specific shell/exe
  const pj = JSON.parse(readFileSync(join(REPO, 'plugin.json'), 'utf8'));
  check('plugin.json tools use portable `node ...` commands',
    pj.tools.every((t) => /^node\s/.test(t.command)), JSON.stringify(pj.tools.map((t) => t.command)));
}

// ── PLUGIN: zero calls the tool via `node ./tools/toshi.mjs <cmd>` with JSON on stdin ──────────────
function pluginCall(cmd, stdinObj) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [join('tools', 'toshi.mjs'), cmd], { cwd: REPO, env: process.env });
    let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', () => {});
    child.on('close', () => { try { res(JSON.parse(out)); } catch { res({ raw: out }); } });
    child.stdin.write(JSON.stringify(stdinObj || {})); child.stdin.end();
  });
}
async function runPlugin() {
  console.log(`\n${C.d}PLUGIN — zero invokes node ./tools/toshi.mjs <cmd> (JSON on stdin)${C.x}`);
  const asked = await pluginCall('ask', { q: 'who calls summarize?' });
  check('tool "toshi_ask" → grounded trace', asked.grounded === true && /callers/.test(asked.answer || ''), JSON.stringify(asked).slice(0, 120));
  const st = await pluginCall('status', {});
  check('tool "toshi_status" → repo + memoryBin', !!st.repo && !!st.memoryBin, JSON.stringify(st).slice(0, 120));
  const mood = await pluginCall('mood', { pose: 'dancing' });
  check('tool "toshi_mood" → echoes pose', mood.mood === 'dancing', JSON.stringify(mood).slice(0, 120));
  const unknown = await pluginCall('bogus_tool', {});
  check('unknown tool → honest error, no crash', /unknown tool/.test(unknown.error || ''), JSON.stringify(unknown).slice(0, 120));
}

// ── HTTP: the panel → brain path (:4820) ───────────────────────────────────────────────────────────
async function runHttp() {
  console.log(`\n${C.d}HTTP — spawn the brain, POST /ask like the panel${C.x}`);
  // TOSHI_LLM=off keeps this layer deterministic + fast (VOICE tests the LLM path separately);
  // TOSHI_AUTOINDEX=off so the tmpdir watch-switch below stays honestly indexed:false
  const TP = 47311; // dedicated port — the user's live companion may hold :4820, and a silently-unbound test brain would make us assert against THEIR brain
  const brain = spawn(process.execPath, [join('mcp', 'toshi-mcp.mjs')], { cwd: REPO, env: { ...process.env, TOSHI_LLM: 'off', TOSHI_AUTOINDEX: 'off', TOSHI_PORT: String(TP) }, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 1800));
    const res = await fetch(`http://127.0.0.1:${TP}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'who calls summarize?' }),
    });
    const j = await res.json();
    check('POST /ask → grounded trace answer', j.grounded === true && /callers/.test(j.answer || ''), JSON.stringify(j).slice(0, 120));

    // terminal connection: the `toshi` CLI POSTs /repo so the floating companion watches THAT terminal
    const h1 = await (await fetch(`http://127.0.0.1:${TP}/health`)).json();
    check('GET /health → reports watched repo', h1.ok === true && norm(h1.repo) === norm(REPO), JSON.stringify(h1).slice(0, 120));
    // a UNIQUE fresh dir = "another terminal's repo" — never pre-indexed (tmpdir root once leaked into
    // the graph via auto-index and made indexed:true honest-but-unexpected here)
    const { mkdtempSync } = await import('node:fs');
    const other = mkdtempSync(join(tmpdir(), 'toshi-watch-'));
    const sw = await (await fetch(`http://127.0.0.1:${TP}/repo`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: other }),
    })).json();
    check('POST /repo → switches watch (honest indexed flag)', norm(sw.repo) === norm(other) && sw.indexed === false, JSON.stringify(sw).slice(0, 120));
    const back = await (await fetch(`http://127.0.0.1:${TP}/repo`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: REPO }),
    })).json();
    check('POST /repo back → grounded again', norm(back.repo) === norm(REPO) && back.indexed === true, JSON.stringify(back).slice(0, 120));

    // companion pulse: kind grounded comments about the session (comment may be null when nothing new)
    const pu = await (await fetch(`http://127.0.0.1:${TP}/pulse`)).json();
    check('GET /pulse → event + honest comment shape',
      typeof pu.event === 'string' && (pu.comment === null || typeof pu.comment === 'string'),
      JSON.stringify(pu).slice(0, 140));

    // summon protocol: `toshi show|hide|toggle` queues a verb; /health delivers it exactly ONCE
    const pc = await (await fetch(`http://127.0.0.1:${TP}/panel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }),
    })).json();
    check('POST /panel toggle → accepted', pc.ok === true && pc.action === 'toggle', JSON.stringify(pc).slice(0, 100));
    const d1 = await (await fetch(`http://127.0.0.1:${TP}/health`)).json();
    const d2 = await (await fetch(`http://127.0.0.1:${TP}/health`)).json();
    check('panelCmd delivered exactly once', d1.panelCmd === 'toggle' && d2.panelCmd === null,
      `first=${d1.panelCmd} second=${d2.panelCmd}`);
    const bad = await fetch(`http://127.0.0.1:${TP}/panel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'explode' }),
    });
    check('POST /panel invalid action → 400', bad.status === 400, `status=${bad.status}`);
  } catch (e) { check('POST /ask', false, e.message); }
  finally { try { brain.kill(); } catch {} }
}

// ── VOICE: NL synthesis through the zero CLI (optional — skips when zero isn't installed) ──────────
async function runVoice() {
  console.log(`\n${C.d}VOICE — grounded NL synthesis via the zero CLI${C.x}`);
  const { hasVoice, speak } = await import('../lib/llm.mjs');
  if (!hasVoice()) { skipped('VOICE (1 case)', 'zero CLI not installed or TOSHI_LLM=off'); return; }
  const out = await speak('qui appelle summarize ?',
    'summarize:\ncallers →\n• ask (hop 1)\ncallees →\n• j (hop 1)', 'toshi');
  check('speak() → short grounded reply (or honest null fallback)',
    out === null || (typeof out === 'string' && out.length > 2 && /ask/i.test(out)),
    JSON.stringify(out).slice(0, 140));
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Toshi use-case simulation\n${C.d}status: ${JSON.stringify(status())}${C.x}`);
  const ready = (await reindex()) && (await backendIndexed());
  await runPortability(); // platform-only checks — always run, no backend needed
  if (ready) { await runCore(); await runPlugin(); await runHttp(); }
  else {
    skipped('CORE (12 cases)', 'backend not installed/indexed');
    skipped('PLUGIN (4 cases)', 'backend not installed/indexed');
    skipped('HTTP', 'backend not installed/indexed');
    console.log(`  ${C.d}→ install: npm i -g codebase-memory-mcp && codebase-memory-mcp cli index_repository '{"repo_path":"${REPO.replace(/\\/g, '/')}"}'${C.x}`);
  }
  await runVoice();   // optional layer — self-skips without the zero CLI
  await runDegrade(); // always runnable — it tests the no-backend path itself

  console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped`);
  process.exit(fail > 0 ? 1 : 0);
})();
