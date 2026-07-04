// Toshi session awareness — the token-cheap brain. GPL-3.0.
// Delegates to codebase-memory-mcp (MIT, DeusData) via its one-shot CLI: `codebase-memory-mcp cli <tool> <json>`.
// It routes a plain question to the right graph tool and returns REAL retrieved context — grounded, never
// invented. (Final natural-language synthesis by zero's model is a documented next step; until then Toshi
// returns the graph's own answer rather than guessing.)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, dirname, resolve as presolve } from 'node:path';
const pexec = promisify(execFile);

// Resolve the codebase-memory-mcp binary on ANY platform. The npm-global layout differs by OS
// (Windows: <prefix>\node_modules\...; POSIX: <prefix>/lib/node_modules/...) and the prefix varies
// (%APPDATA%\npm, /usr/local, Homebrew /opt/homebrew, nvm, ~/.npm-global, custom npm_config_prefix).
// We scan the real binary across those; on Windows this is REQUIRED (execFile can't run the .cmd shim,
// spawn EINVAL since Node 18). On POSIX the bare PATH name also works (shebang shim), so it's the fallback.
export function resolveBin() {
  if (process.env.CODEBASE_MEMORY_BIN) return process.env.CODEBASE_MEMORY_BIN;
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'codebase-memory-mcp.exe' : 'codebase-memory-mcp';
  const roots = [];
  const add = (p) => { if (p) roots.push(p); };
  add(process.env.npm_config_prefix);
  add(process.env.PREFIX);
  // derive the node prefix from the running binary (POSIX: <prefix>/bin/node → <prefix>); covers
  // toolcache/nvm/system installs that live outside the well-known prefixes below (e.g. CI setup-node).
  if (!isWin) add(dirname(dirname(process.execPath)));
  if (isWin) add(process.env.APPDATA && join(process.env.APPDATA, 'npm'));
  else {
    add('/usr/local'); add('/usr'); add('/opt/homebrew');
    add(process.env.HOME && join(process.env.HOME, '.npm-global'));
    add(process.env.HOME && join(process.env.HOME, '.local'));
  }
  for (const r of roots) {
    for (const rel of [['node_modules'], ['lib', 'node_modules']]) { // Windows- vs POSIX-style prefix
      const p = join(r, ...rel, 'codebase-memory-mcp', 'bin', exe);
      if (existsSync(p)) return p;
    }
  }
  return 'codebase-memory-mcp'; // last resort: PATH (works on POSIX via the shebang shim)
}
const BIN = resolveBin();
let REPO = process.env.TOSHI_REPO || process.cwd();

// Query tools take `project` (the graph's sanitized name), NOT repo_path (index-time only).
// Resolve it once by matching our repo path against list_projects' root_path (slash/case tolerant).
let projectName = null;
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
async function resolveProject() {
  if (projectName) return projectName;
  const { stdout } = await pexec(BIN, ['cli', 'list_projects', '{}'],
    { timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const { projects = [] } = JSON.parse(stdout);
  const hit = projects.find((p) => norm(p.root_path) === norm(REPO));
  if (!hit) { const e = new Error('not indexed'); e.notIndexed = true; throw e; }
  return (projectName = hit.name);
}

// Connect Toshi to a terminal: `toshi` run in any repo tells the floating companion to watch THAT repo.
// If the repo isn't in the graph yet, index it on the spot (a few seconds) so the very first question is
// already grounded — TOSHI_AUTOINDEX=off disables. Returns {indexed, autoIndexed} so UIs stay honest.
export async function setRepo(p) {
  REPO = presolve(String(p || '.'));
  projectName = null; // re-resolve against the new repo
  try { await resolveProject(); return { repo: REPO, indexed: true }; }
  catch (e) {
    if (e && e.notIndexed && (process.env.TOSHI_AUTOINDEX || 'on') !== 'off') {
      try {
        await pexec(BIN, ['cli', 'index_repository', JSON.stringify({ repo_path: REPO.replace(/\\/g, '/') })],
          { timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
        await resolveProject();
        return { repo: REPO, indexed: true, autoIndexed: true };
      } catch { /* fall through — honest false */ }
    }
    return { repo: REPO, indexed: false };
  }
}

// pick the cheapest graph tool that answers this kind of question (documented codebase-memory-mcp tools).
// Bilingual (EN + FR) — Phil types French; an English-only router made every French question fall through
// to the same default answer, which read as "it repeats the same phrase in a loop".
const STOP = new Set([
  // EN
  'where','what','who','which','when','how','why','is','are','was','the','a','an','in','on','of','to','me','my','our','you','show','find','locate','search','for','function','fn','method','file','files','class','module','calls','call','called','does','do','did','it','this','that','defined','define','definition','give','get','overview','about','recently','recent','changed','change','and','with','trace','impact','depends','dependency',
  // FR (accented words fragment at tokenization; list the ASCII fragments too)
  'est','la','le','les','un','une','des','du','de','dans','sur','pour','avec','moi','qui','que','quoi','ou','et','fonction','fichier','fichiers','classe','appelle','appel','appels','cherche','trouve','montre','localise','donne','recemment','cemment','changement','changements','structure','projet','code','depend','pendances','utilise',
]);
function extractTerm(q) {
  const tick = q.match(/`([^`]+)`/); if (tick) return tick[1];
  const tokens = (q.match(/[A-Za-z_][A-Za-z0-9_.]{1,}/g) || []).filter((t) => !STOP.has(t.toLowerCase()));
  // prefer identifier-looking tokens (camelCase / snake_case / dotted) over plain words
  return tokens.find((t) => /[_.]|[a-z][A-Z]/.test(t)) || tokens[0] || '';
}
function route(q) {
  const s = (q || '').toLowerCase();
  const term = extractTerm(q || '');
  if (/(chang|diff|modif|red\b|fail|break|regress|risk|blast|just did|last|quoi de neuf|casse|recent|récent)/.test(s)) return { tool: 'detect_changes', params: {} };
  if (/(who calls|caller|callee|calls|invoke|trace|depend|impact|appelle|appel\b|dépend|utilise)/.test(s)) return { tool: 'trace_call_path', params: { function_name: term, direction: 'both' } };
  if (/(architect|overview|structure|layout|hotspot|big picture|how.*organ|organis|aperçu|vue d.ensemble)/.test(s)) return { tool: 'get_architecture', params: {} };
  if (/(where|find\b|locate|which file|search|show me|où|\bou est\b|trouve|cherche|localise|montre)/.test(s)) {
    // RE2, CROSS-PLATFORM: do NOT use the (?i) inline flag — a Linux binary build matched 0 on
    // `(?i)^term$` where the Windows build matched 1 (same v0.8.1). Plain anchored exact first, then an
    // unanchored substring fallback. Case-sensitive, which is right for identifiers (users type real case).
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { tool: 'search_graph', params: { name_pattern: esc ? `^${esc}$` : '.*', limit: 12 },
             fallbackParams: esc ? { name_pattern: esc, limit: 12 } : null };
  }
  // nothing matched: say what Toshi CAN answer instead of silently re-running detect_changes —
  // that silent default is what looped the same "nothing changed" phrase at the user.
  return { tool: 'help', params: {} };
}

function summarize(tool, out) {
  let data; try { data = JSON.parse(out); } catch { return out.slice(0, 1200); }
  const j = (o) => JSON.stringify(o, null, 1);
  if (tool === 'detect_changes') {
    if (data.changed_count === 0) return 'nothing changed since the last index — working tree is clean ✨';
    const syms = (data.impacted_symbols || []).map((x) => `• ${x.name} (${x.label}) — ${x.file}`);
    return `${data.changed_count} file(s) changed → impacted symbols:\n` + syms.join('\n').slice(0, 1400);
  }
  if (tool === 'search_graph') {
    if (!data.total) return "nothing in the graph by that name — try the exact symbol name (backticks help: `likeThis`)";
    return `found ${data.total}:\n` + data.results.slice(0, 8)
      .map((r) => `• ${r.name} (${r.label}) — ${r.file_path}${r.signature ? ' ' + r.signature : ''}`).join('\n').slice(0, 1400);
  }
  if (tool === 'trace_call_path') {
    const fmt = (xs) => (xs || []).slice(0, 6).map((c) => `• ${c.name} (hop ${c.hop})`).join('\n') || '• none';
    return `${data.function}:\ncallers →\n${fmt(data.callers)}\ncallees →\n${fmt(data.callees)}`.slice(0, 1400);
  }
  if (tool === 'get_architecture') {
    const labels = (data.node_labels || []).map((l) => `${l.count} ${l.label}`).join(' · ');
    return `${data.project}: ${data.total_nodes} nodes / ${data.total_edges} edges\n${labels}`.slice(0, 1400);
  }
  return j(data).slice(0, 1400);
}

export async function ask(q) {
  noteLang(q); // pulse comments follow the user's language
  const { tool, params, fallbackParams } = route(q);
  if (tool === 'help') {
    const base = REPO.split(/[\\/]/).filter(Boolean).pop();
    return { answer: `watching ${base} 👀 — ask me:\n• what changed\n• where is X\n• who calls X\n• architecture\n(je parle français aussi — "quoi de neuf", "où est X", "qui appelle X")`, grounded: false, tool };
  }
  try {
    const project = await resolveProject();
    const run = (p) => pexec(BIN, ['cli', tool, JSON.stringify({ ...p, project })],
      { timeout: 20000, maxBuffer: 6 * 1024 * 1024, cwd: REPO, windowsHide: true });
    let { stdout } = await run(params);
    if (fallbackParams) { // exact search missed → retry broad (RE2: no \b, so this two-step keeps results clean)
      try { if (JSON.parse(stdout).total === 0) ({ stdout } = await run(fallbackParams)); } catch {}
    }
    return { answer: summarize(tool, stdout), grounded: true, tool };
  } catch (e) {
    if (e && e.code === 'ENOENT')
      return { answer: `demo mode — codebase-memory-mcp isn't installed. Get it (MIT), index this repo, then I answer "${q}" from the real graph:\n  codebase-memory-mcp cli index_repository '{"repo_path":"${REPO}"}'`, grounded: false, tool };
    if (e && e.notIndexed)
      return { answer: `this repo isn't indexed yet — one command and I'm grounded:\n  codebase-memory-mcp cli index_repository '{"repo_path":"${REPO}"}'`, grounded: false, tool };
    const msg = (e && (e.stderr || e.message) || '').toString().slice(0, 300);
    return { answer: `I asked the graph (${tool}) but it errored:\n(${msg})`, grounded: false, tool };
  }
}

export function status() {
  return { cwd: process.cwd(), repo: REPO, memoryBin: BIN };
}

// ── companion pulse — kind, grounded comments about the LIVE session ──────────────────────────────
// Watches for NEW events only (a fresh commit, files starting to move) so Toshi encourages without
// spamming. Facts come from git + the graph; nothing is invented. lastLang follows the user's questions.
export let lastLang = 'en';
export function noteLang(q) { if (/[àâéèêëîïôùûç]|\b(quoi|qui|est|où|trouve|cherche|montre|neuf)\b/i.test(q || '')) lastLang = 'fr'; else if (/[a-z]/i.test(q || '')) lastLang = 'en'; }
let seenCommit = null, wasChanging = false, lastKindAt = 0;
export async function pulse() {
  const facts = [];
  let event = 'idle';
  try { // newest commit (cheap, local git)
    const { stdout } = await pexec('git', ['log', '-1', '--format=%h|%s|%cr'], { timeout: 8000, cwd: REPO, windowsHide: true });
    const [h, msg, when] = stdout.trim().split('|');
    if (seenCommit && h !== seenCommit) { event = 'commit'; facts.push(`new commit "${msg}" (${when})`); }
    if (!seenCommit) facts.push(`last commit "${msg}" (${when})`);
    seenCommit = h;
  } catch {}
  try { // files in motion since the last index (graph, grounded)
    const project = await resolveProject();
    const { stdout } = await pexec(BIN, ['cli', 'detect_changes', JSON.stringify({ project })],
      { timeout: 20000, maxBuffer: 6 * 1024 * 1024, cwd: REPO, windowsHide: true });
    const d = JSON.parse(stdout);
    const n = d.changed_count || 0;
    if (n > 0) { facts.push(`${n} file(s) being edited right now (${(d.changed_files || []).slice(0, 3).map((f) => f.name || f).join(', ')})`); if (event === 'idle' && !wasChanging) event = 'changes'; wasChanging = true; }
    else wasChanging = false;
  } catch {}
  // an occasional gentle hello when nothing happened for a while (never more than one per 20 min)
  if (event === 'idle' && Date.now() - lastKindAt > 20 * 60 * 1000 && lastKindAt !== 0) event = 'hello';
  if (event !== 'idle') lastKindAt = Date.now() || lastKindAt;
  if (lastKindAt === 0) lastKindAt = Date.now(); // first pulse arms the timer, stays quiet
  const base = REPO.split(/[\\/]/).filter(Boolean).pop();
  const CANNED = {
    fr: { commit: (f) => `joli — ${f} 😽 ça avance !`, changes: (f) => `je te vois coder (${f}) — bon rythme 💪`, hello: () => `toujours là si besoin 😺 (je regarde ${base})` },
    en: { commit: (f) => `nice — ${f} 😽 keep going!`, changes: (f) => `I see you coding (${f}) — good pace 💪`, hello: () => `still here if you need me 😺 (watching ${base})` },
  };
  const comment = event === 'idle' ? null : CANNED[lastLang][event](facts.join(' · '));
  return { event, facts: facts.join(' · '), comment, lang: lastLang, repo: REPO };
}
