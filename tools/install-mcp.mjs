// Register Toshi's MCP server in an MCP client's config. GPL-3.0.
// Default targets: openclaude's documented config (~/.openclaude.json) AND the Claude-Code-lineage
// runtime config (~/.claude.json global mcpServers) — openclaude 0.19 is a Claude Code fork and, depending
// on the build, reads one or the other, so we register in both. Both use the Claude-Desktop `mcpServers`
// shape ({ command, args, env? }), verified from openclaude's services/mcp/types McpStdioServerConfigSchema.
// Idempotent: re-running updates the "toshi" entry, `--remove` deletes it, `--file <path>` targets ONE
// specific client (Claude Desktop, Cline, …). Preserves every other key in each file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcpEntry = resolve(here, '..', 'mcp', 'toshi-mcp.mjs');
const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const targets = fileArg >= 0
  ? [args[fileArg + 1]]
  : [join(homedir(), '.openclaude.json'), join(homedir(), '.claude.json')];
const removing = args.includes('--remove');
const entry = { type: 'stdio', command: process.execPath, args: [mcpEntry] };

for (const file of targets) {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(file, 'utf8')) || {}; } catch { /* fresh file — only auto-create the openclaude one, never fabricate ~/.claude.json from scratch */
    if (file.endsWith('.claude.json')) { console.log(`⏭  skip ${file} (not present — Claude Code not set up here)`); continue; }
  }
  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};
  if (removing) { delete cfg.mcpServers.toshi; console.log(`🐈  Toshi MCP removed from ${file}`); }
  else { cfg.mcpServers.toshi = entry; console.log(`🐈  Toshi MCP registered in ${file}`); }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

// zero (gitlawb) — the open-source terminal Toshi rides on. zero owns its config (credentials live next to
// it), so we go through its own CLI (`zero mcp add|remove`) instead of editing the file: forward-compatible
// and atomic. Best-effort: no zero installed → skipped honestly. (--file mode targets one client; skip zero.)
if (fileArg < 0) {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const zeroExe = process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'node_modules', '@gitlawb', 'zero', 'zero.exe') : 'zero';
  try {
    if (zeroExe === 'zero' || existsSync(zeroExe)) {
      const zargs = removing ? ['mcp', 'remove', 'toshi']
        : ['mcp', 'add', 'toshi', '--type', 'stdio', '--', process.execPath, mcpEntry];
      execFileSync(zeroExe, zargs, { stdio: 'pipe', timeout: 20000, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } });
      console.log(removing ? '🐈  Toshi MCP removed from zero (gitlawb)' : '🐈  Toshi MCP registered in zero (gitlawb) — try it: zero mcp check toshi');
    } else console.log('⏭  skip zero (not installed — npm i -g @gitlawb/zero to ride the open-source terminal)');
  } catch (e) { console.log('⏭  zero registration skipped (' + String(e.message || e).split('\n')[0].slice(0, 60) + ')'); }
}
if (!removing) console.log('    tools: toshi_ask / toshi_status / toshi_mood / toshi_watch · remove: toshi setup --mcp --remove');
