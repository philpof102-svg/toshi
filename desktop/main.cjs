// Toshi desktop — the floating companion (Clippy-energy). GPL-3.0.
// A frameless, transparent, ALWAYS-ON-TOP window you drag over any terminal. It also spawns Toshi's brain
// (mcp/toshi-mcp.mjs → /ask on :4820) so one launch = the face + the brain. Quit closes both.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
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
    // backgroundThrottling:false — a hidden window must keep polling /health so `toshi show` answers in ~4s
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  // window verbs from the panel (─ button) and the `toshi show/hide/toggle` CLI (via brain /panel → poll).
  // collapse keeps the mini head anchored where the pod's bottom-right corner was; expand restores.
  const MINI = 116;
  ipcMain.on('toshi:win', (_e, act) => {
    try {
      const b = win.getBounds();
      if (act === 'collapse') win.setBounds({ x: b.x + b.width - MINI, y: b.y + b.height - MINI, width: MINI, height: MINI });
      else if (act === 'expand') win.setBounds({ x: b.x + b.width - W, y: b.y + b.height - H, width: W, height: H });
      else if (act === 'hide') win.hide();
      else if (act === 'show') { win.show(); win.focus(); }
    } catch {}
  });
  // Do NOT use the 'screen-saver' always-on-top level — on Windows it makes the window refuse keyboard
  // focus (you couldn't type). Plain alwaysOnTop keeps it above normal windows AND typable.
  win.loadFile(path.join(ROOT, 'panel', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });

  // TOSHI_SHOT=/path/out.png → self-portrait mode: wait for Rive + greet, ask one real question,
  // capture the actual window (the honest render, not a mockup), write the PNG, quit.
  if (process.env.TOSHI_SHOT) {
    const out = process.env.TOSHI_SHOT;
    const q = process.env.TOSHI_SHOT_Q || 'qui appelle summarize ?';
    setTimeout(async () => {
      try {
        await win.webContents.executeJavaScript(`(() => { const i=document.getElementById('q'); i.value=${JSON.stringify(q)}; document.getElementById('ask').dispatchEvent(new Event('submit',{cancelable:true})); return 1; })()`);
      } catch (e) { console.error('[shot] ask failed:', e.message); }
      // capture the moment the grounded answer is actually ON SCREEN (voice latency varies), with a
      // hard deadline fallback so the shot never hangs
      const deadline = Date.now() + Number(process.env.TOSHI_SHOT_WAIT || 30000);
      const snap = async () => {
        try {
          const img = await win.webContents.capturePage();
          require('node:fs').writeFileSync(out, img.toPNG());
          console.log('[shot] saved', out);
        } catch (e) { console.error('[shot] capture failed:', e.message); }
        app.quit();
      };
      const tick = async () => {
        let on = false;
        try { on = await win.webContents.executeJavaScript("!document.getElementById('grounded').hidden && document.getElementById('bubble').classList.contains('on')"); } catch {}
        if (on) return setTimeout(snap, 600); // let the celebration land
        if (Date.now() > deadline) return snap();
        setTimeout(tick, 700);
      };
      setTimeout(tick, 1500);
    }, 7000);
  }
  return win;
}

app.whenReady().then(() => {
  startBrain();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { brain && brain.kill(); } catch {} });
