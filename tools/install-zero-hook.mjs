// Install the zero sessionStart hook — Toshi floats automatically whenever you launch zero. GPL-3.0.
// zero reads hooks from ~/.config/zero/hooks.json (user) or ./.zero/hooks.json (project); shape:
//   { "enabled": true, "hooks": [ { id, event, matcher?, command, args?, enabled } ] }
// This merges ONE entry (id "toshi-companion", event sessionStart → node bin/toshi.cjs) idempotently:
// re-running updates it, `--remove` deletes it, `--project` targets ./.zero instead of the user config.
// The hook launches Toshi watching zero's cwd — or, if Toshi already floats, connects that repo to it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const toshiCli = resolve(here, '..', 'bin', 'toshi.cjs');
const args = process.argv.slice(2);

// zero's config layout is split on Windows: `zero doctor` reports userConfigPath in %APPDATA%\zero,
// while AGENTS.md documents ~/.config/zero for hooks — write BOTH user locations to cover either reader.
const targets = args.includes('--project')
  ? [join(process.cwd(), '.zero')]
  : [join(homedir(), '.config', 'zero'),
     ...(process.platform === 'win32' && process.env.APPDATA ? [join(process.env.APPDATA, 'zero')] : [])];

for (const scopeDir of targets) {
  const file = join(scopeDir, 'hooks.json');
  let cfg = { enabled: true, hooks: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) cfg.hooks = parsed;             // tolerate a bare-array file
    else if (parsed && typeof parsed === 'object') cfg = { enabled: parsed.enabled !== false, hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [] };
  } catch { /* fresh file */ }

  cfg.hooks = cfg.hooks.filter((h) => h && h.id !== 'toshi-companion');
  if (!args.includes('--remove')) {
    cfg.hooks.push({
      id: 'toshi-companion',
      event: 'sessionStart',
      command: process.execPath,          // absolute node — no PATH surprises inside zero's exec
      args: [toshiCli],
      enabled: true,
    });
  }

  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(args.includes('--remove')
    ? `🐈  Toshi zero-hook removed from ${file}`
    : `🐈  hook written: ${file}`);
}
if (!args.includes('--remove')) console.log('    Toshi will float whenever zero starts · remove anytime: toshi setup --remove');
