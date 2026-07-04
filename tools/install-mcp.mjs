// Register Toshi's MCP server in an MCP client's config. GPL-3.0.
// Default target: openclaude (~/.openclaude.json) — it reads the Claude-Desktop `mcpServers` shape
// ({ command, args, env? }), verified from its source (services/mcp/types McpStdioServerConfigSchema).
// Idempotent: re-running updates the "toshi" entry, `--remove` deletes it, `--file <path>` targets any
// other client that uses the same shape (Claude Desktop, Cline, …). Preserves every other key in the file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcpEntry = resolve(here, '..', 'mcp', 'toshi-mcp.mjs');
const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const file = fileArg >= 0 ? args[fileArg + 1] : join(homedir(), '.openclaude.json');

let cfg = {};
try { cfg = JSON.parse(readFileSync(file, 'utf8')) || {}; } catch { /* fresh file */ }
if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};

if (args.includes('--remove')) {
  delete cfg.mcpServers.toshi;
  console.log(`🐈  Toshi MCP removed from ${file}`);
} else {
  cfg.mcpServers.toshi = { type: 'stdio', command: process.execPath, args: [mcpEntry] };
  console.log(`🐈  Toshi MCP registered in ${file} (toshi_ask / toshi_status / toshi_mood / toshi_watch)\n    remove anytime: toshi setup --mcp --remove`);
}

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
