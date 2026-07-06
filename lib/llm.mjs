// Toshi's voice — grounded NL synthesis through the `zero` CLI (gitlawb/zero, MIT). GPL-3.0.
// The canned summaries are honest but stiff; zero's one-shot mode (`zero -p`) lets Toshi SPEAK through
// whatever provider the user configured in zero — including free/local models (ollama, groq, …).
// Hard rule kept: the model answers ONLY from facts Toshi retrieved. No context → it must say so.
// Disable with TOSHI_LLM=off. No zero installed → silently absent (callers fall back to the raw answer).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
const pexec = promisify(execFile);

// Load a .env into THIS process (values never leave the process — same pattern as the keeper). Only
// fills vars that aren't already set; missing files are skipped. Lets Toshi pick up a provider key the
// user already has without anyone pasting it. Public installs have none of these paths → no-op.
(function loadEnv() {
  const paths = [process.env.TOSHI_ENV, join(process.cwd(), '.env')].filter(Boolean);
  if (process.platform === 'win32') paths.push('D:\\Users\\VolKov\\veilleIA\\mainstreet\\.env', 'D:\\Users\\VolKov\\veilleIA\\agent-veille\\.env');
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
})();

// Resolve zero. On Windows we spawn the Go BINARY (zero.exe) DIRECTLY: going through the JS shim
// means the shim spawns zero.exe itself WITHOUT windowsHide — that inner child is the black console
// window users saw flash on every spoken answer. Direct exe + windowsHide = silent. POSIX: JS entry
// or the PATH shim, both console-less.
function zeroEntry() {
  const isWin = process.platform === 'win32';
  const roots = [];
  const add = (p) => { if (p) roots.push(p); };
  add(process.env.npm_config_prefix);
  if (isWin) add(process.env.APPDATA && join(process.env.APPDATA, 'npm'));
  else {
    add(dirname(dirname(process.execPath)));
    add('/usr/local'); add('/opt/homebrew');
    add(process.env.HOME && join(process.env.HOME, '.npm-global'));
  }
  for (const r of roots) {
    for (const rel of [['node_modules'], ['lib', 'node_modules']]) {
      if (isWin) {
        const exe = join(r, ...rel, '@gitlawb', 'zero', 'zero.exe');
        if (existsSync(exe)) return { cmd: exe, pre: [] };
      }
      const js = join(r, ...rel, '@gitlawb', 'zero', 'bin', 'zero.js');
      if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
    }
  }
  if (!isWin) return { cmd: 'zero', pre: [] }; // POSIX shebang shim on PATH
  return null;
}

// Direct-API voice: a plain fetch to any OpenAI-compatible chat endpoint. PREFERRED over the zero CLI
// because it spawns NO subprocess — zero on Windows spawns helper exes (command-runner / sandbox-setup)
// that flash a console window on every call; the API path has none. Explicit config wins; otherwise we
// auto-map a provider key the user already has (read from their .env above). Keys never leave the process.
// The chosen model, in priority order: the TOSHI_API_MODEL env override → the model persisted by
// `toshi model <name>` (~/.toshi.json) → each provider's built-in default below. This is what makes
// `toshi model minimax/minimax-m3` stick for a user who just has OPENROUTER_API_KEY set, no env editing.
function persistedModel() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.toshi.json'), 'utf8'));
    const m = cfg && cfg.model;
    return typeof m === 'string' && m.trim() ? m.trim() : null;
  } catch { return null; }
}
function API() {
  const E = process.env;
  const model = E.TOSHI_API_MODEL || persistedModel(); // env wins, then the persisted CLI choice, then default
  if (E.TOSHI_API_URL && E.TOSHI_API_KEY && model)
    return { url: E.TOSHI_API_URL, key: E.TOSHI_API_KEY, model };
  if (E.OPENROUTER_API_KEY) return { url: 'https://openrouter.ai/api/v1/chat/completions', key: E.OPENROUTER_API_KEY, model: model || 'deepseek/deepseek-r1:free' };
  if (E.XAI_API_KEY || E.GROK_API_KEY) return { url: 'https://api.x.ai/v1/chat/completions', key: E.XAI_API_KEY || E.GROK_API_KEY, model: model || 'grok-2-latest' };
  if (E.GROQ_API_KEY) return { url: 'https://api.groq.com/openai/v1/chat/completions', key: E.GROQ_API_KEY, model: model || 'llama-3.3-70b-versatile' };
  if (E.OPENAI_API_KEY) return { url: 'https://api.openai.com/v1/chat/completions', key: E.OPENAI_API_KEY, model: model || 'gpt-4o-mini' };
  return null;
}

let entry; // zero resolved once
export function hasVoice() {
  if ((process.env.TOSHI_LLM || 'auto') === 'off') return false;
  if (API()) return true;
  if (entry === undefined) entry = zeroEntry();
  return !!entry;
}
// tells honest UIs what to suggest: 'api' (preferred, no flash) | 'zero' | 'none'
export function voiceKind() {
  if ((process.env.TOSHI_LLM || 'auto') === 'off') return 'none';
  if (API()) return 'api';
  if (entry === undefined) entry = zeroEntry();
  return entry ? 'zero' : 'none';
}

// One OpenAI-compatible chat completion over `messages`. Shared by the grounded speak() (single user
// prompt) and the free-conversation chat() (system + history + user). Returns the reply string, or null.
async function apiComplete(messages) {
  const api = API(); if (!api) return null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    // OpenRouter accepts a normalized 'reasoning' field; it lets reasoning models (DeepSeek R1,
    // o-series, ...) self-allocate budget. Non-OpenRouter endpoints just ignore the unknown field.
    const useOpenRouter = api.url.includes('openrouter.ai');
    const reasoning = useOpenRouter ? { effort: 'medium' } : undefined;
    const r = await fetch(api.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },
      body: JSON.stringify({
        model: api.model,
        max_tokens: 1200,
        ...(reasoning ? { reasoning } : {}),
        messages,
      }),
    });
    clearTimeout(t);
    if (!r.ok) {
      if (process.env.TOSHI_DEBUG) console.error('[toshi-llm] http', r.status, await r.text().catch(() => ''));
      return null;
    }
    const j = await r.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    // Reasoning models (DeepSeek R1) often leave 'content' empty and put the answer in
    // 'reasoning' or 'reasoning_content'. Prefer content; fall back to the thought channel.
    const content = (msg && (msg.content || msg.reasoning || msg.reasoning_content)) || null;
    if (process.env.TOSHI_DEBUG && (!content || content.length < 2)) {
      console.error('[toshi-llm] empty content. raw:', JSON.stringify(j).slice(0, 400));
    }
    return content;
  } catch { return null; }
}
const speakViaApi = (prompt) => apiComplete([{ role: 'user', content: prompt }]);

// Normalize a raw model completion into a chat-panel-ready reply (or null when it's empty/garbage).
// Strips the stray CJK tokens small models leak, drops a leading "ANSWER:"/"REPLY:", and trims a very
// long reply at a sentence boundary. Shared by the grounded speak() and the free-chat chat().
function tidy(raw) {
  if (raw == null) return null;
  let out = String(raw).replace(/[　-ヿ一-鿿가-힯]+/g, '').replace(/\s{2,}/g, ' ').trim();
  out = out.replace(/^(answer|reply|réponse|reponse)\s*:\s*/i, '').trim();
  if (out.length > 1400) { // the panel is roomy but not infinite — trim at the last sentence boundary past 60 chars
    const cut = out.slice(0, 1400);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    out = end > 80 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
  }
  return out.length >= 2 && out.length <= 1800 ? out : null;
}

// speak(question, facts, repoBase) → a natural-language grounded reply in the user's language, or null.
// The previous version crammed everything into a "tiny speech bubble" and forbade markdown — that's what made
// Toshi read like a CLI command (stiff, clipped, no warmth). The chatbox lives in a regular text panel now,
// so we let the model breathe: 2-4 short lines, conversational, same language as the question. Facts are still
// the only allowed source; if they don't cover the question, Toshi says so honestly.
export async function speak(question, facts, repoBase) {
  if (!hasVoice()) return null;
  const prompt = [
    `You are Toshi, a small cat companion sitting beside a developer's terminal in the repo "${repoBase}".`,
    'You are chatting with the developer in a normal text panel — speak like a friendly colleague, NOT a CLI.',
    'Answer the QUESTION in 2-5 short lines, warmly and conversationally (about 120-700 characters total). Use the SAME LANGUAGE as the question (French or English).',
    'You may use light markdown for clarity (a short bullet list, a code span like `likeThis` for a symbol), but keep it natural and chatty — no headings, no tables, no "ANSWER:" prefix, no follow-up question at the end.',
    'GROUNDING — this is the only hard rule: answer ONLY from the FACTS below (they were just retrieved from the real repo). If the FACTS do not contain the answer, say so honestly in one warm sentence ("je n\'ai pas ça sous les yeux" / "I don\'t have that in view"). Do not invent files, functions, or counts.',
    '', 'FACTS:', facts || '(none)', '', 'QUESTION: ' + question, '', 'REPLY:',
  ].join('\n');
  try {
    let raw;
    if (API()) {
      raw = await speakViaApi(prompt); // PREFERRED: a fetch, no subprocess → no console flash, ever
      if (raw == null) return null;
    } else {
      if (entry === undefined) entry = zeroEntry();
      // TOSHI_HOOK_SKIP: zero fires sessionStart hooks — without this, Toshi SPEAKING (a zero one-shot)
      // would re-trigger its own launch hook and re-point the watch. The CLI exits early when it's set.
      ({ stdout: raw } = await pexec(entry.cmd, [...entry.pre, '-p', prompt],
        { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } }));
    }
    // free/small models sometimes leak CJK tokens mid-sentence (seen live: "…quelle énergie,继续保持 !") —
    // tidy() strips them + guards against runaway/empty generations (caller falls back to the structural answer)
    return tidy(raw);
  } catch { return null; }
}

// chat(question, history?) → a plain, free-conversation reply (a classic chatbot turn), through the SAME
// provider/voice as speak(). This is Toshi's fallback when a question ISN'T a grounded repo question (a
// greeting, small talk, a general "what is X" not about this codebase). It is NOT grounded: the prompt
// forbids inventing repo specifics — for real code facts the grounded path (session.ask → the graph) runs
// instead. Returns a string, or null when there's no voice / the query is empty / the call fails. Never
// throws. `history` is an optional array of { role:'user'|'assistant', content } for multi-turn context.
export async function chat(question, history = []) {
  const q = String(question || '').trim();
  if (!q || !hasVoice()) return null;
  const system = [
    "You are Toshi, a small, warm cat companion who sits beside a developer's terminal.",
    'Right now you are just CHATTING — this is ordinary conversation, not a question about their code repository.',
    'Reply like a friendly colleague in 1-5 short lines (about 40-700 characters), in the SAME LANGUAGE as the user (French or English).',
    'Light markdown is fine (a short list, a `code span`) but stay natural and chatty — no headings, no tables, no "ANSWER:" prefix, no needless follow-up question.',
    "Be honest and down to earth: you're a coding companion having a friendly chat. Do NOT invent specifics about their particular repo, files, functions, commits, or history — if they want those, tell them (briefly) they can just ask about the code and you'll look it up for real.",
  ].join('\n');
  const hist = (Array.isArray(history) ? history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content).slice(-8);
  try {
    let raw;
    if (API()) {
      raw = await apiComplete([
        { role: 'system', content: system },
        ...hist.map((h) => ({ role: h.role, content: String(h.content) })),
        { role: 'user', content: q },
      ]);
    } else {
      if (entry === undefined) entry = zeroEntry();
      if (!entry) return null;
      const hx = hist.map((h) => (h.role === 'assistant' ? 'Toshi: ' : 'User: ') + String(h.content)).join('\n');
      const prompt = system + '\n\n' + (hx ? hx + '\n' : '') + 'User: ' + q + '\nToshi:';
      // TOSHI_HOOK_SKIP: same guard as speak() — zero's one-shot fires sessionStart hooks; without this it
      // would re-trigger Toshi's own launch hook and re-point the watch mid-answer.
      ({ stdout: raw } = await pexec(entry.cmd, [...entry.pre, '-p', prompt],
        { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } }));
    }
    return tidy(raw);
  } catch { return null; }
}
