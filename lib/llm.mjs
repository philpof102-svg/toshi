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
    'Answer the QUESTION in 1-3 short, warm sentences, in the same language the question uses (French or English).',
    'Use ONLY the FACTS below — they were retrieved from the real repo. If the FACTS do not contain the answer,',
    'say honestly that you do not have that in view (and suggest one of: what changed / where is X / who calls X / architecture).',
    'Plain text only. No markdown, no code fences, no preamble.',
    '', 'FACTS:', facts || '(none)', '', 'QUESTION: ' + question, '', 'ANSWER:',
  ].join('\n');
  try {
    const { stdout } = await pexec(entry.cmd, [...entry.pre, '-p', prompt],
      { timeout: 40000, maxBuffer: 1024 * 1024 });
    const out = String(stdout).trim();
    // guard against runaway or empty generations — fall back to the structural answer
    return out.length >= 2 && out.length <= 900 ? out : null;
  } catch { return null; }
}
