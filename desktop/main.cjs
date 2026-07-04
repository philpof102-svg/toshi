// Toshi desktop — the floating companion (Clippy-energy). GPL-3.0.
// A frameless, transparent, ALWAYS-ON-TOP window you drag over any terminal. It also spawns Toshi's brain
// (mcp/toshi-mcp.mjs → /ask on :4820) so one launch = the face + the brain. Quit closes both.
const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
let brain = null;

function startBrain() {
  try {
    brain = spawn(process.execPath, [path.join(ROOT, 'mcp', 'toshi-mcp.mjs')], {
      cwd: process.env.TOSHI_REPO || ROOT,
      env: process.env,
      stdio: ['ignore', 'ignore', 'inherit'], // its /ask HTTP bridge is what the panel talks to
    });
    brain.on('error', (e) => console.error('[toshi] brain failed:', e.message));
  } catch (e) { console.error('[toshi] could not start brain:', e.message); }
}

function createWindow() {
  const W = 300, H = 460, GAP = 20;
  const wa = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: W, height: H,
    x: wa.x + wa.width - W - GAP,
    y: wa.y + wa.height - H - GAP,   // bottom-right, over the terminal
    frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true,               // floats over the terminal — but stays focusable so you can TYPE
    focusable: true, skipTaskbar: true, hasShadow: false, fullscreenable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // Do NOT use the 'screen-saver' always-on-top level — on Windows it makes the window refuse keyboard
  // focus (you couldn't type). Plain alwaysOnTop keeps it above normal windows AND typable.
  win.loadFile(path.join(ROOT, 'panel', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  return win;
}

app.whenReady().then(() => {
  startBrain();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { brain && brain.kill(); } catch {} });
