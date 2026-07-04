// Toshi zero-plugin tool dispatcher (one-shot CLI). GPL-3.0.
// Zero runs `node ./tools/toshi.mjs <status|ask|mood>` with the plugin dir as cwd. Tool arguments arrive as
// JSON on stdin (e.g. {"q":"what changed?"} or {"pose":"dancing"}). Output goes to stdout for the agent.
// Session awareness is delegated to codebase-memory-mcp (MIT) — never fabricates; honest when not wired.
const MEMORY_URL = process.env.CODEBASE_MEMORY_URL || '';

async function ask(q) {
  if (!MEMORY_URL) return { answer: `demo mode — no session backend. Run codebase-memory-mcp + set CODEBASE_MEMORY_URL, then I'll answer "${q}" from the real repo graph instead of guessing.`, grounded: false };
  try {
    const r = await fetch(MEMORY_URL.replace(/\/$/, '') + '/health').catch(() => null);
    return { answer: (r && r.ok)
      ? `codebase-memory connected. (v0) I'd retrieve graph context for "${q}" and let zero's model synthesize — wire the model call to finish. I won't guess before then.`
      : `codebase-memory set to ${MEMORY_URL} but not answering; start it and ask again.`, grounded: false };
  } catch (e) { return { answer: `couldn't reach the backend (${(e && e.message) || e}).`, grounded: false }; }
}

const readStdin = () => new Promise((res) => {
  let b = ''; if (process.stdin.isTTY) return res({});
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (b += c)).on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } });
  setTimeout(() => res({}), 300); // don't hang if nothing is piped
});

(async () => {
  const cmd = process.argv[2] || 'status';
  const a = await readStdin();
  let out;
  if (cmd === 'status') out = { cwd: process.cwd(), memoryBackend: MEMORY_URL || null, connected: !!MEMORY_URL };
  else if (cmd === 'ask') out = await ask(String(a.q || ''));
  else if (cmd === 'mood') out = { mood: String(a.pose || 'idle') };
  else out = { error: 'unknown tool: ' + cmd };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();
