// Toshi desktop — the floating companion (Clippy-energy). GPL-3.0.
// A frameless, transparent, ALWAYS-ON-TOP window you drag over any terminal. It also spawns Toshi's brain
// (mcp/toshi-mcp.mjs → /ask on :4820) so one launch = the face + the brain. Quit closes both.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
let brain = null;

// GPU-crash guard. Toshi is a tiny transparent frameless always-on-top window — it needs ZERO GPU muscle,
// and on real machines (esp. Windows with flaky/virtualised GPU drivers) a transparent overlay is exactly
// what makes Chromium's GPU process die with "GPU process exited unexpectedly", taking the popup with it —
// Phil saw the launch "crash" for this reason. Software compositing still renders the window (and its
// transparency) fine; a visible software-rendered companion beats a crashed GPU process and NO window.
// Opt back into hardware acceleration with TOSHI_GPU=1 if a given machine prefers it.
if (process.env.TOSHI_GPU !== '1') {
  try { app.disableHardwareAcceleration(); } catch {} // the canonical fix; software compositing keeps transparency
  app.commandLine.appendSwitch('disable-gpu');         // stronger guarantee the GPU process never becomes the crasher
}

// ── window size: presets or custom WxH, persisted to ~/.toshi.json, env-overridable ────────────────
const CFG_PATH = path.join(os.homedir(), '.toshi.json');
const PRESETS = { small: [244, 372], normal: [300, 460], large: [372, 568], xl: [456, 700] };
const clamp = (w, h) => [Math.max(180, Math.min(960, Math.round(w))), Math.max(260, Math.min(1280, Math.round(h)))];
function readCfg() { try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) || {}; } catch { return {}; } }
function resolveSize() {
  const c = readCfg(); let w = 300, h = 460;
  if (c.size && PRESETS[c.size]) [w, h] = PRESETS[c.size];
  if (Number(c.width) && Number(c.height)) { w = Number(c.width); h = Number(c.height); }
  if (Number(process.env.TOSHI_W) && Number(process.env.TOSHI_H)) { w = Number(process.env.TOSHI_W); h = Number(process.env.TOSHI_H); }
  return clamp(w, h);
}

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
  let [W, H] = resolveSize(); const GAP = 20;
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
  // Keep a window fully ON-SCREEN. Without this, collapse/expand/resize re-anchor to a corner and can push
  // the window (and its only drag handle — the header) off the top/left edge, stranding it (Phil hit this:
  // minimized near the top → expand computed a negative Y → header above the screen, un-draggable).
  const fitOnScreen = (bx) => {
    const wa = screen.getDisplayMatching(win.getBounds()).workArea;
    return {
      width: bx.width, height: bx.height,
      x: Math.max(wa.x, Math.min(bx.x, wa.x + wa.width - bx.width)),
      y: Math.max(wa.y, Math.min(bx.y, wa.y + wa.height - bx.height)),
    };
  };
  // window verbs from the panel (─ button) and the `toshi show/hide/toggle` CLI (via brain /panel → poll).
  // collapse keeps the mini head anchored where the pod's bottom-right corner was; expand restores.
  const MINI = 116;
  ipcMain.on('toshi:win', (_e, act) => {
    try {
      const b = win.getBounds();
      if (act === 'collapse') win.setBounds(fitOnScreen({ x: b.x + b.width - MINI, y: b.y + b.height - MINI, width: MINI, height: MINI }));
      else if (act === 'expand') win.setBounds(fitOnScreen({ x: b.x + b.width - W, y: b.y + b.height - H, width: W, height: H }));
      else if (act === 'hide') win.hide();
      else if (act === 'show') { win.show(); win.focus(); }
    } catch {}
  });
  // live resize (from `toshi size …` / the panel size buttons) — re-anchor to the bottom-right corner
  ipcMain.on('toshi:resize', (_e, w, h) => {
    try { [W, H] = clamp(w, h); const b = win.getBounds();
      win.setBounds(fitOnScreen({ x: b.x + b.width - W, y: b.y + b.height - H, width: W, height: H })); } catch {}
  });
  // Mini SPEECH BUBBLE. When Toshi speaks while folded, grow the window so a real bubble can sit BESIDE the
  // pod (not over it), with the side chosen by WHERE the pod is on screen: the pod stays at its edge and the
  // bubble+tail grow toward the screen centre (so the bubble never runs off the edge). Shrinks back to the
  // 116 pod when the quip ends. main owns the geometry; the renderer just paints for the `corner` it's told.
  const SPEAK_W = 300, SPEAK_H = 196;
  let miniCorner = null;
  const cornerOf = (r) => { const a = screen.getDisplayMatching(r).workArea;
    return (r.y + r.height / 2 > a.y + a.height / 2 ? 'b' : 't') + (r.x + r.width / 2 > a.x + a.width / 2 ? 'r' : 'l'); };
  ipcMain.on('toshi:mini-speak', () => {
    try {
      const b = win.getBounds();
      if (b.width > MINI || b.height > MINI) return;                 // only from the folded 116 pod
      miniCorner = cornerOf({ x: b.x, y: b.y, width: MINI, height: MINI });
      const nx = miniCorner.includes('r') ? b.x + MINI - SPEAK_W : b.x;   // grow toward screen centre, pod stays put
      const ny = miniCorner.includes('b') ? b.y + MINI - SPEAK_H : b.y;
      win.setBounds(fitOnScreen({ x: nx, y: ny, width: SPEAK_W, height: SPEAK_H }));
      win.webContents.send('toshi:mini-layout', { corner: miniCorner });
    } catch {}
  });
  ipcMain.on('toshi:mini-quiet', () => {
    try {
      if (!miniCorner) return;
      const b = win.getBounds();
      const px = miniCorner.includes('r') ? b.x + b.width - MINI : b.x; // put the pod back in its corner
      const py = miniCorner.includes('b') ? b.y + b.height - MINI : b.y;
      win.setBounds(fitOnScreen({ x: px, y: py, width: MINI, height: MINI }));
      win.webContents.send('toshi:mini-layout', { corner: null });
      miniCorner = null;
    } catch {}
  });
  // Do NOT use the 'screen-saver' always-on-top level — on Windows it makes the window refuse keyboard
  // focus (you couldn't type). Plain alwaysOnTop keeps it above normal windows AND typable.
  win.loadFile(path.join(ROOT, 'panel', 'index.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  // If the renderer ever dies (a one-off GPU/driver blip), reload once instead of leaving a blank ghost
  // window — the companion recovers itself rather than looking "crashed".
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('[toshi] renderer gone:', d && d.reason, '— reloading the panel');
    if (!win.isDestroyed()) { try { win.reload(); } catch {} }
  });

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
          // TOSHI_SHOT_MINI=/path2.png → also capture the folded mini head (shows the mini bubble talking)
          if (process.env.TOSHI_SHOT_MINI) {
            await win.webContents.executeJavaScript('document.getElementById("min").click(), 1');
            await new Promise((r) => setTimeout(r, 900)); // let the fold + canvas resize land
            // show a short clean quip for the portrait (the leftover long answer clips badly at 116px)
            await win.webContents.executeJavaScript('window.__toshi && window.__toshi.say ? (window.__toshi.say("👀 watching toshi", false, 6000), 1) : 1');
            await new Promise((r) => setTimeout(r, 700));
            const img2 = await win.webContents.capturePage();
            require('node:fs').writeFileSync(process.env.TOSHI_SHOT_MINI, img2.toPNG());
            console.log('[shot] saved mini', process.env.TOSHI_SHOT_MINI);
          }
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
  // ── THE WATCHER (opt-in): TOSHI_WATCH=1 → Toshi glances near the cursor and comments. Pure addon —
  // its only output is window.__toshi.say(), so it never touches the animation. Privacy tiers below.
  if (process.env.TOSHI_WATCH === '1') startWatcher(win);
  return win;
}

// Glance near the cursor → an in-character line. Reuses the dormant EYES (eyes.cjs/eyes-read.cjs).
// Privacy is layered + opt-in:
//   default            → TITLE-ONLY (no pixels): Toshi reacts to WHICH app/kind you're in. Local template lines.
//   TOSHI_WATCH_GRANT=1 + TOSHI_OCR/TOSHI_VLM (module → async(png)=>text) → reads on-screen contents.
//   TOSHI_WATCH_CLOUD=1 → agent-written lines via Toshi's own free LLM; if screen CONTENTS are sent, the
//                         line carries a provenance label ("screen read → …") — never hidden.
function startWatcher(win) {
  try {
    const { desktopCapturer } = require('electron');
    const { createEyes } = require('./eyes.cjs');
    const { createReader } = require('./eyes-read.cjs');
    const { makeWatcher } = require('./watch.cjs');
    const load = (p) => { try { return p ? require(p) : null; } catch { return null; } };

    const eyes = createEyes({ capturer: desktopCapturer, now: () => Date.now() });
    const reader = createReader({ ocr: load(process.env.TOSHI_OCR), vlm: load(process.env.TOSHI_VLM) });
    if (process.env.TOSHI_WATCH_GRANT === '1') {
      eyes.enumerate().then((list) => { const s = list.find((x) => /screen/i.test(x.id)); if (s) eyes.grant(s.id, 'read'); }).catch(() => {});
    }

    const say = (text, ms) => {
      console.log('[toshi] 💬', text); // echo the quip to the console (a light verbose trail)
      try { win.webContents.executeJavaScript(`window.__toshi && window.__toshi.say ? window.__toshi.say(${JSON.stringify(text)}, false, ${Number(ms) || 4500}) : 0`); } catch {}
    };

    const MODEL = process.env.TOSHI_WATCH_MODEL || "Toshi's cloud model";
    const allowCloud = process.env.TOSHI_WATCH_CLOUD === '1';
    // Toshi speaks the USER's language: the OS locale first (e.g. fr-FR → 'fr'), English as the default
    // fallback. Override with TOSHI_LANG. EN-first = 'en' is what we land on when the locale is unknown.
    const LANG = String(process.env.TOSHI_LANG || (app.getLocale() || 'en').split('-')[0] || 'en').toLowerCase();
    const llm = allowCloud ? async ({ ctx }) => {
      const { chat, detectLang, langName } = await import('../lib/llm.mjs');
      const body = (ctx.text || ctx.summary || '').trim();
      const what = body
        ? `On screen: ${body.slice(0, 500)}`
        : `The user is in a ${ctx.kind} (${ctx.app || 'an app'})${ctx.hasError ? ', an error is showing' : ''}.`;
      const line = String(await chat(`You are Toshi, a playful cat desktop companion. Reply in ${langName(LANG)} only — no other language. React to what the user is doing with ONE punchy line of 8 words or fewer, in character, a single emoji, no preamble, no quotes. ${what}`) || '').trim();
      // language consistency: a free model sometimes drifts to another language — drop it (the instant
      // template already covered the moment). detectLang is Toshi's own detector.
      if (line && detectLang(line) !== LANG) return '';
      if (body) { ctx.mustLabel = true; ctx.label = `screen read → ${MODEL}`; } // contents left the device — never hidden
      return line;
    } : null;

    const watcher = makeWatcher(
      { eyes, reader, say, llm, cursor: () => screen.getCursorScreenPoint(), now: () => Date.now() },
      { allowCloud, modelName: MODEL, minGapMs: Number(process.env.TOSHI_WATCH_GAP_MS) || 45000 },
    );
    win.webContents.once('did-finish-load', () => watcher.start(Number(process.env.TOSHI_WATCH_POLL_MS) || 6000));
    win.on('closed', () => watcher.stop());
    console.log(`[toshi] 👀 watcher ON — ${process.env.TOSHI_WATCH_GRANT === '1' ? 'contents' : 'title-only'} tier, ${allowCloud ? `agent lines (${LANG}, cloud, labeled)` : 'local template lines'}`);
  } catch (e) { console.error('[toshi] watcher failed:', e.message); }
}

app.whenReady().then(() => {
  startBrain();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { brain && brain.kill(); } catch {} });
