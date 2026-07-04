// Toshi MCP — the companion's brain. GPL-3.0 (see ../LICENSE, ../ATTRIBUTION.md).
// Two faces, one process:
//   • an MCP server over stdio (tools: toshi_status / toshi_ask / toshi_mood) so any MCP client can drive Toshi,
//   • an HTTP POST /ask on :4820 that the side-panel (panel/index.html) calls when you type to Toshi.
// Session awareness is delegated to codebase-memory-mcp (MIT) — Toshi asks IT what changed instead of re-reading
// files, which is what keeps turns token-cheap. v0: the bridge is honest — it never fabricates session knowledge.
import http from 'node:http';
import readline from 'node:readline';

const PORT = Number(process.env.TOSHI_PORT || 4820);
const MEMORY_URL = process.env.CODEBASE_MEMORY_URL || ''; // e.g. http://127.0.0.1:7000 (a running codebase-memory-mcp)

const TOOLS = [
  { name: 'toshi_status', description: 'What Toshi currently sees in the session: cwd, the repo it is watching, and whether the codebase-memory backend is connected. Free, read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'toshi_ask', description: 'Ask Toshi about the current session — what changed, why a test is red, what to do next. Delegates to codebase-memory-mcp for cheap repo knowledge; returns an honest "backend not wired" note if it is not connected (never invents).', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'toshi_mood', description: 'Set the mascot expression/pose (idle | look_around | pointing | hand_wave | dancing | celebration). Cosmetic — drives the side-panel mascot.', inputSchema: { type: 'object', properties: { pose: { type: 'string' } }, required: ['pose'] } },
];

let mood = 'idle';

async function ask(q) {
  if (!MEMORY_URL) {
    return { answer: `demo mode — no session backend wired. Start codebase-memory-mcp and set CODEBASE_MEMORY_URL, then I'll answer "${q}" from the real repo graph instead of guessing.`, grounded: false };
  }
  // Bridge to codebase-memory-mcp: fetch relevant graph context cheaply, then (in a full build) hand it + q to
  // the model behind zero for synthesis. v0 returns the retrieved context honestly rather than a fabricated answer.
  try {
    const r = await fetch(MEMORY_URL.replace(/\/$/, '') + '/health', { method: 'GET' }).catch(() => null);
    const up = r && r.ok;
    return { answer: up
        ? `codebase-memory is connected. (v0) I'd retrieve graph context for "${q}" and let zero's model synthesize the answer — wire the model call to finish this path. I won't guess before then.`
        : `codebase-memory-mcp set to ${MEMORY_URL} but it's not answering. Start it, then ask again.`,
      grounded: false };
  } catch (e) {
    return { answer: `couldn't reach the session backend (${(e && e.message) || e}).`, grounded: false };
  }
}

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
    if (n === 'toshi_status') out = { cwd: process.cwd(), memoryBackend: MEMORY_URL || null, connected: !!MEMORY_URL, mood };
    else if (n === 'toshi_ask') out = await ask(String(a.q || ''));
    else if (n === 'toshi_mood') { mood = String(a.pose || 'idle'); out = { mood }; }
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
  if (req.method === 'POST' && req.url === '/ask') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
      let q = ''; try { q = (JSON.parse(b || '{}').q || '').toString(); } catch {}
      const out = await ask(q);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"POST /ask"}');
}).listen(PORT, () => process.stderr.write(`toshi-mcp: /ask on :${PORT}, MCP on stdio, memory=${MEMORY_URL || 'none'}\n`));
