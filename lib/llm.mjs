// Toshi's voice — grounded NL synthesis through the `zero` CLI (gitlawb/zero, MIT). GPL-3.0.
// The canned summaries are honest but stiff; zero's one-shot mode (`zero -p`) lets Toshi SPEAK through
// whatever provider the user configured in zero — including free/local models (ollama, groq, …).
// Hard rule kept: the model answers ONLY from facts Toshi retrieved. No context → it must say so.
// Disable with TOSHI_LLM=off. No zero installed → silently absent (callers fall back to the raw answer).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
const pexec = promisify(execFile);

// zero's npm shim is a .cmd on Windows (execFile can't run those since Node 18) — resolve the real JS
// entry and run it with our own node, same pattern as the codebase-memory binary resolution.
function zeroEntry() {
  const roots = [];
  const add = (p) => { if (p) roots.push(p); };
  add(process.env.npm_config_prefix);
  if (process.platform === 'win32') add(process.env.APPDATA && join(process.env.APPDATA, 'npm'));
  else {
    add(dirname(dirname(process.execPath)));
    add('/usr/local'); add('/opt/homebrew');
    add(process.env.HOME && join(process.env.HOME, '.npm-global'));
  }
  for (const r of roots) {
    for (const rel of [['node_modules'], ['lib', 'node_modules']]) {
      const p = join(r, ...rel, '@gitlawb', 'zero', 'bin', 'zero.js');
      if (existsSync(p)) return { cmd: process.execPath, pre: [p] };
    }
  }
  if (process.platform !== 'win32') return { cmd: 'zero', pre: [] }; // POSIX shebang shim on PATH
  return null;
}

let entry; // resolved once
export function hasVoice() {
  if ((process.env.TOSHI_LLM || 'auto') === 'off') return false;
  if (entry === undefined) entry = zeroEntry();
  return !!entry;
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
    // TOSHI_HOOK_SKIP: zero fires sessionStart hooks — without this, Toshi SPEAKING (a zero one-shot)
    // would re-trigger its own launch hook and re-point the watch. The CLI exits early when it's set.
    const { stdout } = await pexec(entry.cmd, [...entry.pre, '-p', prompt],
      { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } });
    // free/small models sometimes leak CJK tokens mid-sentence (seen live: "…quelle énergie,继续保持 !") —
    // strip them, then guard against runaway or empty generations (fall back to the structural answer)
    let out = String(stdout).replace(/[　-ヿ一-鿿가-힯]+/g, '').replace(/\s{2,}/g, ' ').trim();
    if (out.length > 240) { // the bubble is tiny — hard-trim at a sentence boundary when the model rambles
      const cut = out.slice(0, 240);
      const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      out = end > 60 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
    }
    return out.length >= 2 && out.length <= 900 ? out : null;
  } catch { return null; }
}
