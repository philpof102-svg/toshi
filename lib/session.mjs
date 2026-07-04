// Toshi session awareness — the token-cheap brain. GPL-3.0.
// Delegates to codebase-memory-mcp (MIT, DeusData) via its one-shot CLI: `codebase-memory-mcp cli <tool> <json>`.
// It routes a plain question to the right graph tool and returns REAL retrieved context — grounded, never
// invented. (Final natural-language synthesis by zero's model is a documented next step; until then Toshi
// returns the graph's own answer rather than guessing.)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
const REPO = process.env.TOSHI_REPO || process.cwd();

// Query tools take `project` (the graph's sanitized name), NOT repo_path (index-time only).
// Resolve it once by matching our repo path against list_projects' root_path (slash/case tolerant).
let projectName = null;
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
async function resolveProject() {
  if (projectName) return projectName;
  const { stdout } = await pexec(BIN, ['cli', 'list_projects', '{}'],
    { timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  const { projects = [] } = JSON.parse(stdout);
  const hit = projects.find((p) => norm(p.root_path) === norm(REPO));
  if (!hit) { const e = new Error('not indexed'); e.notIndexed = true; throw e; }
  return (projectName = hit.name);
}

// pick the cheapest graph tool that answers this kind of question (documented codebase-memory-mcp tools)
const STOP = new Set(['where','what','who','which','when','how','why','is','are','was','the','a','an','in','on','of','to','me','my','our','you','show','find','locate','search','for','function','fn','method','file','files','class','module','calls','call','called','does','do','did','it','this','that','defined','define','definition','give','get','overview','about','recently','recent','changed','change','and','with','trace','impact','depends','dependency']);
function extractTerm(q) {
  const tick = q.match(/`([^`]+)`/); if (tick) return tick[1];
  const tokens = (q.match(/[A-Za-z_][A-Za-z0-9_.]{1,}/g) || []).filter((t) => !STOP.has(t.toLowerCase()));
  // prefer identifier-looking tokens (camelCase / snake_case / dotted) over plain words
  return tokens.find((t) => /[_.]|[a-z][A-Z]/.test(t)) || tokens[0] || '';
}
function route(q) {
  const s = (q || '').toLowerCase();
  const term = extractTerm(q || '');
  if (/(chang|diff|modif|red|fail|break|regress|risk|blast|just did|last)/.test(s)) return { tool: 'detect_changes', params: {} };
  if (/(who calls|caller|callee|calls|invoke|trace|depend|impact)/.test(s)) return { tool: 'trace_call_path', params: { function_name: term, direction: 'both' } };
  if (/(architect|overview|structure|layout|hotspot|route|big picture|how.*organ)/.test(s)) return { tool: 'get_architecture', params: {} };
  if (/(where|find|locate|which file|search|show me)/.test(s)) {
    // RE2 engine (no \b): exact-match first; ask() falls back to a broad pattern on 0 hits
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { tool: 'search_graph', params: { name_pattern: esc ? `(?i)^${esc}$` : '.*', limit: 12 },
             fallbackParams: esc ? { name_pattern: `(?i).*${esc}.*`, limit: 12 } : null };
  }
  return { tool: 'detect_changes', params: {} }; // safe, param-less default
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
  const { tool, params, fallbackParams } = route(q);
  try {
    const project = await resolveProject();
    const run = (p) => pexec(BIN, ['cli', tool, JSON.stringify({ ...p, project })],
      { timeout: 20000, maxBuffer: 6 * 1024 * 1024, cwd: REPO });
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
