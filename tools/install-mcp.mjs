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
if (!removing) console.log('    tools: toshi_ask / toshi_status / toshi_mood / toshi_watch · remove: toshi setup --mcp --remove');
