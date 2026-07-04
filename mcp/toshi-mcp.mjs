// Toshi MCP — the companion's brain. GPL-3.0 (see ../LICENSE, ../ATTRIBUTION.md).
// Two faces, one process:
//   • an MCP server over stdio (tools: toshi_status / toshi_ask / toshi_mood) so any MCP client can drive Toshi,
//   • an HTTP POST /ask on :4820 that the side-panel (panel/index.html) calls when you type to Toshi.
// Session awareness is delegated to codebase-memory-mcp (MIT) — Toshi asks IT what changed instead of re-reading
// files, which is what keeps turns token-cheap. v0: the bridge is honest — it never fabricates session knowledge.
import http from 'node:http';
import readline from 'node:readline';
import { ask, status, setRepo } from '../lib/session.mjs';
import { speak, hasVoice } from '../lib/llm.mjs';

// grounded voice: keep the structural `answer` intact (agents/tests rely on it) and ADD `spoken` —
// a 1-3 sentence NL reply synthesized by the zero CLI from the retrieved facts only.
async function askSpoken(q) {
  const r = await ask(q);
  if (hasVoice()) {
    const base = status().repo.split(/[\\/]/).filter(Boolean).pop();
    const spoken = await speak(q, r.answer, base);
    if (spoken) r.spoken = spoken;
  }
  return r;
}

const PORT = Number(process.env.TOSHI_PORT || 4820);

const TOOLS = [
  { name: 'toshi_status', description: 'What Toshi currently sees in the session: cwd, the repo it is watching, and whether the codebase-memory backend is connected. Free, read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'toshi_ask', description: 'Ask Toshi about the current session — what changed, why a test is red, what to do next. Delegates to codebase-memory-mcp for cheap repo knowledge; returns an honest "backend not wired" note if it is not connected (never invents).', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'toshi_mood', description: 'Set the mascot expression/pose (idle | look_around | pointing | hand_wave | dancing | celebration). Cosmetic — drives the side-panel mascot.', inputSchema: { type: 'object', properties: { pose: { type: 'string' } }, required: ['pose'] } },
  { name: 'toshi_watch', description: 'Point Toshi at a repo — the terminal/project it should watch and answer about. Returns whether that repo is indexed (grounded).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
];

let mood = 'idle';

// ── MCP over stdio (newline-delimited JSON-RPC) ──────────────────────────────────────────────────
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'toshi', version: '0.1.0' }, instructions: 'Toshi — your terminal companion. Call toshi_status, then toshi_ask about the session. Session memory via codebase-memory-mcp; nothing is invented.' } });
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const n = params && params.name; const a = (params && params.arguments) || {};
    let out;
    if (n === 'toshi_status') out = { ...status(), mood };
    else if (n === 'toshi_ask') out = await askSpoken(String(a.q || ''));
    else if (n === 'toshi_mood') { mood = String(a.pose || 'idle'); out = { mood }; }
    else if (n === 'toshi_watch') out = await setRepo(String(a.path || '.'));
    else return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool: ' + n } });
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } });
  }
  if (method && method.startsWith('notifications/')) return; // no reply
  return send({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: 'method not found: ' + method } });
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const t = line.trim(); if (!t) return;
  try { handle(JSON.parse(t)); } catch { /* ignore non-JSON lines */ }
});

// ── HTTP /ask bridge for the side-panel ──────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') { // who am I watching? (panel poll + `toshi` CLI probe)
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, ...status(), mood }));
  }
  if (req.method === 'POST' && req.url === '/repo') { // connect a terminal: `toshi` in any repo points me there
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
      let p = ''; try { p = (JSON.parse(b || '{}').path || '').toString(); } catch {}
      const out = p ? await setRepo(p) : { error: 'path required' };
      res.writeHead(p ? 200 : 400, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/ask') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
      let q = ''; try { q = (JSON.parse(b || '{}').q || '').toString(); } catch {}
      const out = await askSpoken(q);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"POST /ask | POST /repo | GET /health"}');
}).listen(PORT, () => process.stderr.write(`toshi-mcp: /ask on :${PORT}, MCP on stdio, memory=${status().memoryBin}\n`));
