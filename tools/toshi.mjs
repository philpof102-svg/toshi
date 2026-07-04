// Toshi zero-plugin tool dispatcher (one-shot CLI). GPL-3.0.
// Zero runs `node ./tools/toshi.mjs <status|ask|mood>` with the plugin dir as cwd. Tool arguments arrive as
// JSON on stdin (e.g. {"q":"what changed?"} or {"pose":"dancing"}). Output goes to stdout for the agent.
// Session awareness is delegated to codebase-memory-mcp (MIT) via lib/session.mjs — grounded, never fabricated.
import { ask, status } from '../lib/session.mjs';

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
  if (cmd === 'status') out = status();
  else if (cmd === 'ask') out = await ask(String(a.q || ''));
  else if (cmd === 'mood') out = { mood: String(a.pose || 'idle') };
  else out = { error: 'unknown tool: ' + cmd };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();
