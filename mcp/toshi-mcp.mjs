// Toshi MCP — the companion's brain. GPL-3.0 (see ../LICENSE, ../ATTRIBUTION.md).
// Two faces, one process:
//   • an MCP server over stdio (tools: toshi_status / toshi_ask / toshi_mood) so any MCP client can drive Toshi,
//   • an HTTP POST /ask on :4820 that the side-panel (panel/index.html) calls when you type to Toshi.
// Session awareness is delegated to codebase-memory-mcp (MIT) — Toshi asks IT what changed instead of re-reading
// files, which is what keeps turns token-cheap. v0: the bridge is honest — it never fabricates session knowledge.
import http from 'node:http';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { ask, status, setRepo, pulse, lastLang } from '../lib/session.mjs';
import { speak, hasVoice, voiceKind, langName } from '../lib/llm.mjs';

// ── Donate x402 Experiment (optional signer endpoints) ──────────────────────────────────────────
// Stockage en mémoire pour l'expérimentation x402 (ne pas utiliser en production)
const donateKeys = new Map(); // key → { credits, expiresAt }
const operatorInterrupts = new Map(); // sessionId → { status, key, pollUrl }

// grounded voice: keep the structural `answer` intact (agents/tests rely on it) and ADD `spoken` —
// a 1-3 sentence NL reply synthesized by the zero CLI from the retrieved facts only.
async function askSpoken(q) {
  const r = await ask(q);
  // Only re-synthesize GROUNDED answers (turn the retrieved facts into a warm NL reply). A chat reply
  // (r.chat) is ALREADY natural language straight from lib/llm.mjs chat() — running it back through the
  // grounded speak() would wrongly re-constrain it to "FACTS" and flatten it to "I don't have that in
  // view". Leave chat/greeting answers exactly as ask() produced them.
  if (r.grounded && hasVoice()) {
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
  { name: 'toshi_see', description: 'Ask the running Toshi window what is CURRENTLY ON SCREEN, through the consent-gated eyes (desktop/eyes.cjs → eyes-read.cjs). Returns an honest ScreenContext — app, window title, kind, text/summary, confidence, and a `label` when screen text left the device. NEVER returns pixels, and NEVER invents: if the window is not running, the source is not granted, or the read finds nothing, it says which — an empty screen and an unavailable eye are different answers.', inputSchema: { type: 'object', properties: { want: { type: 'string', description: "'text' (OCR, default) | 'summary' (VLM) | 'app' (window title only, cheapest)" }, allowCloud: { type: 'boolean', description: 'Permit the T3 cloud tier. OFF by default; when used, the result carries mustLabel + label because screen text leaves the machine.' }, timeoutMs: { type: 'number' } }, required: [] } },
];

/* ── toshi_see: le pont vers les yeux, et pourquoi il est ecrit comme ca ─────────────────────────────
 * Le processus MCP est du Node ordinaire: `desktopCapturer` n'existe QUE dans Electron, donc ce process
 * ne peut pas capturer lui-meme. Il pose une DEMANDE que la fenetre Toshi ramasse en sondant /health —
 * le meme canal que `panelCmd`, livre une seule fois — et la fenetre repond par POST /see-result.
 *
 * ⚠️ CE QUI COMPTE ICI N'EST PAS LE CHEMIN HEUREUX, C'EST LES REFUS. Un oeil indisponible et un ecran
 * vide ne doivent JAMAIS se lire pareil. Une fenetre eteinte, une demande sans reponse, une source non
 * accordee: chacun rend `ok:false` avec sa propre raison, jamais un ScreenContext vide qui se lirait
 * « il n'y a rien a l'ecran ». C'est le motif que ce depot chasse partout ailleurs, applique a une
 * fonctionnalite neuve plutot que rattrape apres coup. */
let seeRequest = null;                 // { id, want, allowCloud } — livre une fois au prochain /health
const seeWaiters = new Map();          // id → resolve

function demanderVue({ want, allowCloud, timeoutMs }) {
  // La fenetre est-elle la ? On le SAIT (heartbeat /health?w=1) — on ne le suppose pas, et on ne fait pas
  // attendre l'appelant 8 secondes pour lui apprendre qu'il n'y avait personne.
  if (Date.now() - lastWindowPing >= 9000) {
    return Promise.resolve({ ok: false, reason: 'no_window',
      note: 'The Toshi window is not running, so nothing could look at the screen. This is NOT "the screen is empty" — nothing was read at all. Launch it with `toshi` and retry.' });
  }
  const id = crypto.randomUUID();
  seeRequest = { id, want, allowCloud };
  return new Promise((resolve) => {
    const fini = setTimeout(() => {
      seeWaiters.delete(id);
      if (seeRequest && seeRequest.id === id) seeRequest = null;
      resolve({ ok: false, reason: 'timeout',
        note: `The window was alive but did not answer within ${timeoutMs}ms. Nothing was read — do not treat this as an empty screen.` });
    }, timeoutMs);
    seeWaiters.set(id, (r) => { clearTimeout(fini); resolve(r); });
  });
}

let mood = 'idle';
let panelCmd = null; // one-shot window verb queued by `toshi show|hide|toggle|resize` (POST /panel)
let panelSize = null; // {w,h} paired with a 'resize' panelCmd
let lastWindowPing = 0; // last time the electron panel polled /health?w=1 — distinguishes a live popup from a headless brain

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
    else if (n === 'toshi_see') out = await demanderVue({
      want: ['text', 'summary', 'app'].includes(a.want) ? a.want : 'text',
      allowCloud: a.allowCloud === true,          // `=== true`: un champ absent n'est pas un consentement
      timeoutMs: Number.isFinite(a.timeoutMs) ? Math.min(Math.max(a.timeoutMs, 500), 20000) : 8000,
    });
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
const httpServer = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  
  // ── Donate x402 Endpoints (experimental) ──────────────────────────────────────────────
  // Helper to parse request body
  const parseBody = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
  
  // Donate endpoints
  if (req.method === 'POST' && req.url === '/donate/start') {
    const body = await parseBody();
    const { amount_usd = 1 } = body;
    const donateKey = `donate_${crypto.randomBytes(16).toString('hex')}`;
    const credits = Math.floor(amount_usd * 10);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    
    donateKeys.set(donateKey, { credits, expiresAt, createdAt: Date.now() });
    
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      donate_key: donateKey,
      credits_remaining: credits,
      expires_at: new Date(expiresAt).toISOString(),
      usage: 'Add header X-Donate-Key: ' + donateKey + ' to signer requests'
    }));
    return;
  }
  
  if (req.method === 'GET' && req.url.startsWith('/donate/balance/')) {
    const key = req.url.split('/').pop();
    const keyData = donateKeys.get(key);
    
    if (!keyData) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Key not found' }));
      return;
    }
    
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      donate_key: key,
      credits_remaining: keyData.credits,
      expires_at: new Date(keyData.expiresAt).toISOString(),
      valid: keyData.expiresAt > Date.now()
    }));
    return;
  }
  
  if (req.method === 'GET' && req.url.startsWith('/api/v1/operator-interrupt/')) {
    const sessionId = req.url.split('/').pop();
    const interrupt = operatorInterrupts.get(sessionId);
    
    if (!interrupt) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      session_id: sessionId,
      status: interrupt.status,
      key: interrupt.key,
      ...(interrupt.status === 'funded' && { 
        message: 'Payment received. Retry request with X-Donate-Key header.' 
      })
    }));
    return;
  }
  
  // Signer endpoints with x402
  if (req.method === 'POST' && req.url === '/signer/remote') {
    // Validate payment
    const apiKey = req.headers['x-donate-key'] || req.headers['x-vibes-key'];
    
    if (!apiKey) {
      const sessionId = crypto.randomUUID();
      const pollUrl = `http://127.0.0.1:${PORT}/api/v1/operator-interrupt/${sessionId}`;
      
      operatorInterrupts.set(sessionId, {
        status: 'pending',
        key: null,
        createdAt: Date.now(),
        endpoint: req.url,
        method: req.method
      });
      
      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Payment Required',
        message: 'x402 payment required for Signer API',
        operator_interrupt: {
          session_id: sessionId,
          fund_url: `http://127.0.0.1:${PORT}/donate/start`,
          poll_url: pollUrl,
          instructions: 'Donate $1 USDC at /donate/start to receive X-Donate-Key'
        }
      }));
      return;
    }
    
    const keyData = donateKeys.get(apiKey);
    if (!keyData) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Donate-Key' }));
      return;
    }
    if (keyData.expiresAt < Date.now()) {
      donateKeys.delete(apiKey);
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expired Donate-Key' }));
      return;
    }
    if (keyData.credits <= 0) {
      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Insufficient credits' }));
      return;
    }
    
    keyData.credits--;
    
    const body = await parseBody();
    const { transaction, wallet } = body;
    // Simuler le signer
    const signature = crypto.randomBytes(64).toString('hex');
    
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      signature,
      credits_remaining: keyData.credits,
      x402_payment: 'applied'
    }));
    return;
  }
  
  if (req.method === 'POST' && req.url === '/signer/endpoint') {
    const apiKey = req.headers['x-donate-key'] || req.headers['x-vibes-key'];
    
    if (!apiKey) {
      const sessionId = crypto.randomUUID();
      const pollUrl = `http://127.0.0.1:${PORT}/api/v1/operator-interrupt/${sessionId}`;
      
      operatorInterrupts.set(sessionId, {
        status: 'pending',
        key: null,
        createdAt: Date.now(),
        endpoint: req.url,
        method: req.method
      });
      
      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Payment Required',
        message: 'x402 payment required for Signer API',
        operator_interrupt: {
          session_id: sessionId,
          fund_url: `http://127.0.0.1:${PORT}/donate/start`,
          poll_url: pollUrl,
          instructions: 'Donate $1 USDC at /donate/start to receive X-Donate-Key'
        }
      }));
      return;
    }
    
    const keyData = donateKeys.get(apiKey);
    if (!keyData) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Donate-Key' }));
      return;
    }
    if (keyData.expiresAt < Date.now()) {
      donateKeys.delete(apiKey);
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expired Donate-Key' }));
      return;
    }
    if (keyData.credits <= 0) {
      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Insufficient credits' }));
      return;
    }
    
    keyData.credits--;
    
    const body = await parseBody();
    const { message } = body;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ signed: true, message, timestamp: Date.now() }));
    return;
  }
  
  // ── Original Toshi endpoints ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/health')) { // who am I watching? (panel poll + `toshi` CLI probe)
    // The panel polls with ?w=1 → that's a live WINDOW heartbeat. The brain (this MCP) can run headless
    // (spawned by zero/openclaude) with NO popup, so `toshi` must tell "brain up" from "window up": if no
    // window pinged in the last ~9s, `toshi` floats the electron popup instead of assuming one exists.
    if (/[?&]w=1/.test(req.url)) lastWindowPing = Date.now();
    const windowAlive = Date.now() - lastWindowPing < 9000;
    /* ⚠️ `seeRequest` N'EST PAS LIVRE ICI, ET C'EST DELIBERE. Il suivrait volontiers la discipline de
     * `panelCmd` — livre une fois, puis efface — sauf que /health a DEJA un sondeur: le panneau (renderer).
     * Or seul le processus principal Electron peut capturer. Le panneau ramasserait la demande, ne saurait
     * qu'en faire, et l'effacerait: l'agent attendrait son delai complet pour un « timeout » qui serait en
     * realite une livraison au mauvais destinataire. Un canal livre-une-fois ne supporte pas deux
     * consommateurs. D'ou `GET /see-pending`, que seul main.cjs interroge. */
    const out = { ok: true, ...status(), mood, panelCmd, panelSize, windowAlive };
    panelCmd = null; panelSize = null; // deliver once
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out));
  }
  if (req.method === 'POST' && req.url === '/panel') { // `toshi show|hide|toggle|resize` → panel picks it up on poll
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      let p = {}; try { p = JSON.parse(b || '{}'); } catch {}
      const a = (p.action || '').toString();
      const ok = ['show', 'hide', 'toggle', 'collapse', 'expand', 'resize'].includes(a);
      if (ok) { panelCmd = a; if (a === 'resize' && Number(p.w) && Number(p.h)) panelSize = { w: Number(p.w), h: Number(p.h) }; }
      res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? { ok: true, action: a } : { error: 'action: show|hide|toggle|collapse|expand|resize' }));
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/see-pending') { // SEUL main.cjs (processus Electron) sonde ici
    // Ce sondage vaut aussi battement de fenetre: le processus qui peut capturer est, par definition, la
    // fenetre. Sans ca, `toshi_see` refuserait « no_window » alors que l'oeil est precisement en ligne.
    lastWindowPing = Date.now();
    const out = seeRequest; seeRequest = null; // deliver once
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ seeRequest: out }));
  }
  if (req.method === 'POST' && req.url === '/see-result') { // la fenetre rend son ScreenContext (jamais de pixels)
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      let p = {}; try { p = JSON.parse(b || '{}'); } catch {}
      const w = seeWaiters.get(p.id);
      // Une reponse sans demandeur (doublon, arrivee apres le delai) est ignoree — mais on le DIT, sinon
      // un 200 muet ferait croire a la fenetre que sa capture a servi a quelque chose.
      if (!w) { res.writeHead(409, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'no waiter for this id — the call already timed out or was answered' })); }
      seeWaiters.delete(p.id);
      /* Ce que la fenetre a echoue a faire remonte tel quel, avec sa raison. `capture()` jette « is not
       * granted » quand l'utilisateur n'a pas choisi la source: ce refus est une INFORMATION, il ne doit
       * pas etre aplati en « rien vu ». */
      if (p.error) w({ ok: false, reason: p.reason || 'window_error', note: String(p.error) });
      else w({ ok: true, sourceName: p.sourceName || null, tier: p.tier || null, context: p.context || null,
        note: 'Read through the consent-gated eyes. No pixels crossed this boundary — only the ScreenContext.' });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/pulse') { // kind, grounded session comments (panel polls this)
    const p = await pulse();
    if (p.comment && hasVoice()) { // let zero phrase the kindness — still ONLY from the real facts
      const base = status().repo.split(/[\\/]/).filter(Boolean).pop();
      // ONE LANGUAGE (2026-07-07): the bubble now renders a single block in the user's language. We pass
      // the detected ISO code (lastLang, set by noteLang on the previous ask) and the prompt tells the
      // model to reply in that language only. The panel no longer splits on a \n---\n divider.
      const spoken = await speak(
        `Give ONE kind, encouraging comment (max 2 sentences) to the developer about their activity. Reply ONLY in ${langName(lastLang)} — no second language, no translation, no separator line.`,
        p.facts, base);
      if (spoken) p.comment = spoken;
    }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(p));
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
});
// The HTTP bridge (:4820, for the panel) and the MCP-over-stdio surface are INDEPENDENT. An MCP client
// (openclaude / Claude Code / Cline) spawns this server while a floating Toshi may already hold :4820 —
// a fatal EADDRINUSE would hand that client a DEAD MCP server. Degrade instead: log, drop the bridge,
// keep serving MCP on stdio (which never needed the port).
httpServer.on('error', (e) => {
  process.stderr.write(`toshi-mcp: HTTP bridge on :${PORT} unavailable (${e.code || e.message}) — serving MCP on stdio only.\n`);
});
httpServer.listen(PORT, () => process.stderr.write(`toshi-mcp: /ask on :${PORT}, MCP on stdio, memory=${status().memoryBin}, voice=${voiceKind()}${voiceKind() === 'none' ? ' (install zero — or set TOSHI_API_URL/KEY/MODEL — for spoken answers)' : ''}\n  Donate x402 endpoints: /donate/start, /signer/remote, /signer/endpoint\n`));
