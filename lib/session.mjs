// Toshi session awareness — the token-cheap brain. GPL-3.0.
// Delegates to codebase-memory-mcp (MIT, DeusData) via its one-shot CLI: `codebase-memory-mcp cli <tool> <json>`.
// It routes a plain question to the right graph tool and returns REAL retrieved context — grounded, never
// invented. (Final natural-language synthesis by zero's model is a documented next step; until then Toshi
// returns the graph's own answer rather than guessing.)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

const BIN = process.env.CODEBASE_MEMORY_BIN || 'codebase-memory-mcp';
const REPO = process.env.TOSHI_REPO || process.cwd();

// pick the cheapest graph tool that answers this kind of question (documented codebase-memory-mcp tools)
function route(q) {
  const s = (q || '').toLowerCase();
  const term = (q.match(/`([^`]+)`/) || q.match(/\b([A-Za-z_][A-Za-z0-9_]{2,})\b\s*(?:\(|function|fn|method)?/) || [])[1] || '';
  if (/(chang|diff|modif|red|fail|break|regress|risk|blast|just did|last)/.test(s)) return { tool: 'detect_changes', params: {} };
  if (/(who calls|caller|callee|calls|invoke|trace|depend|impact)/.test(s)) return { tool: 'trace_call_path', params: { function_name: term, direction: 'both' } };
  if (/(architect|overview|structure|layout|hotspot|route|big picture|how.*organ)/.test(s)) return { tool: 'get_architecture', params: {} };
  if (/(where|find|locate|which file|search|show me)/.test(s)) return { tool: 'search_graph', params: { name_pattern: term ? `.*${term}.*` : '.*', limit: 12 } };
  return { tool: 'detect_changes', params: {} }; // safe, param-less default
}

function summarize(tool, out) {
  let data; try { data = JSON.parse(out); } catch { return out.slice(0, 1200); }
  const j = (o) => JSON.stringify(o, null, 1);
  if (tool === 'detect_changes') {
    const syms = data.affected || data.symbols || data.changes || data;
    return 'what changed (git diff → affected symbols + blast radius):\n' + j(syms).slice(0, 1400);
  }
  return j(data).slice(0, 1400);
}

export async function ask(q) {
  const { tool, params } = route(q);
  try {
    const { stdout } = await pexec(BIN, ['cli', tool, JSON.stringify({ ...params, repo_path: REPO })],
      { timeout: 20000, maxBuffer: 6 * 1024 * 1024, cwd: REPO });
    return { answer: summarize(tool, stdout), grounded: true, tool };
  } catch (e) {
    if (e && e.code === 'ENOENT')
      return { answer: `demo mode — codebase-memory-mcp isn't installed. Get it (MIT), index this repo, then I answer "${q}" from the real graph:\n  codebase-memory-mcp cli index_repository '{"repo_path":"${REPO}"}'`, grounded: false, tool };
    // the binary exists but errored (often: repo not indexed yet)
    const msg = (e && (e.stderr || e.message) || '').toString().slice(0, 300);
    return { answer: `I asked the graph (${tool}) but it errored — likely this repo isn't indexed yet:\n  codebase-memory-mcp cli index_repository '{"repo_path":"${REPO}"}'\n(${msg})`, grounded: false, tool };
  }
}

export function status() {
  return { cwd: process.cwd(), repo: REPO, memoryBin: BIN };
}
