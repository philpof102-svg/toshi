// Toshi's voice — grounded NL synthesis through the `zero` CLI (gitlawb/zero, MIT). GPL-3.0.
// The canned summaries are honest but stiff; zero's one-shot mode (`zero -p`) lets Toshi SPEAK through
// whatever provider the user configured in zero — including free/local models (ollama, groq, …).
// Hard rule kept: the model answers ONLY from facts Toshi retrieved. No context → it must say so.
// Disable with TOSHI_LLM=off. No zero installed → silently absent (callers fall back to the raw answer).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
function API() {
  const E = process.env;
  if (E.TOSHI_API_URL && E.TOSHI_API_KEY && E.TOSHI_API_MODEL)
    return { url: E.TOSHI_API_URL, key: E.TOSHI_API_KEY, model: E.TOSHI_API_MODEL };
  const model = E.TOSHI_API_MODEL; // optional override of the per-provider default
  if (E.OPENROUTER_API_KEY) return { url: 'https://openrouter.ai/api/v1/chat/completions', key: E.OPENROUTER_API_KEY, model: model || 'meta-llama/llama-3.3-70b-instruct' };
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

async function speakViaApi(prompt) {
  const api = API(); if (!api) return null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch(api.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${api.key}` },
      body: JSON.stringify({ model: api.model, max_tokens: 180, messages: [{ role: 'user', content: prompt }] }),
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || null;
  } catch { return null; }
}

// speak(question, facts, repoBase) → 1-3 sentence grounded reply in the user's language, or null.
export async function speak(question, facts, repoBase) {
  if (!hasVoice()) return null;
  const prompt = [
    `You are Toshi, a small cat companion floating beside a developer's terminal, watching the repo "${repoBase}".`,
    'Answer the QUESTION in AT MOST 2 short sentences (under 200 characters total) — the reply lives in a tiny',
    'speech bubble. Same language as the question (French or English).',
    'Use ONLY the FACTS below — they were retrieved from the real repo. If the FACTS do not contain the answer,',
    'say honestly that you do not have that in view.',
    'Plain text only. No markdown, no code fences, no preamble, no follow-up questions.',
    '', 'FACTS:', facts || '(none)', '', 'QUESTION: ' + question, '', 'ANSWER:',
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
    // strip them, then guard against runaway or empty generations (fall back to the structural answer)
    let out = String(raw).replace(/[　-ヿ一-鿿가-힯]+/g, '').replace(/\s{2,}/g, ' ').trim();
    if (out.length > 240) { // the bubble is tiny — hard-trim at a sentence boundary when the model rambles
      const cut = out.slice(0, 240);
      const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      out = end > 60 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
    }
    return out.length >= 2 && out.length <= 900 ? out : null;
  } catch { return null; }
}
