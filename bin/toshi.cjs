#!/usr/bin/env node
// `toshi` — launch the floating companion from anywhere. GPL-3.0.
// After `npm install -g .` (in the toshi repo), just type `toshi` in any terminal.
// It resolves this package's own Electron + app root, so the mascot pops up over your current terminal.
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
let electron;
try { electron = require('electron'); } catch { console.error("Toshi needs Electron. Run `npm install` in", ROOT); process.exit(1); }
// TOSHI_REPO lets Toshi read the repo you launched it from (for grounded answers via codebase-memory-mcp)
const env = { ...process.env, TOSHI_REPO: process.env.TOSHI_REPO || process.cwd() };
const child = spawn(electron, ['.'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
child.unref(); // don't block the terminal — Toshi floats independently
console.log('🐈  Toshi is floating — bottom-right. (drag it, or ✕ to hide)');
