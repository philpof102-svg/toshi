'use strict';
// Toshi v2 — THE WATCHER: glance near the cursor, drop an in-character quip. GPL-3.0.
// =================================================================================================
// Wires the dormant EYES (eyes.cjs capture + eyes-read.cjs read-ladder) into a gentle, opt-in loop:
// see what the user is doing (which app / kind / on-screen error) and let Toshi comment on it.
//
// Design invariants (this module ENFORCES the same discipline as eyes.cjs — it doesn't loosen it):
//  1. OPT-IN. Nothing watches unless the caller starts it (main starts it only if TOSHI_WATCH=1).
//  2. CONSENT-GATED pixels. Contents (OCR/VLM) need a per-source grant (eyes.cjs enforces). With NO grant
//     we stay at T0 — the window TITLE/app only, no pixels — so an unconsented desktop still gets a light
//     "ah, VS Code again" without ever reading a frame. No grant, no contents. Ever.
//  3. HONESTY LABEL. The default quip is a LOCAL template — nothing leaves the machine, no label needed.
//     Only the optional LLM quip (allowCloud) sends screen-derived text off-device, and then the comment
//     CARRIES the provenance label from the read (ctx.label) — never hidden.
//  4. NOT ANNOYING. A hard cooldown between quips + it only speaks on a MEANINGFUL change (new app/kind, a
//     fresh on-screen error) or a rare idle hello — not every tick. Dedupe against the last thing said.
//  5. NEVER touches the animation. Its only output is window.__toshi.say(text) — the existing bubble path.
//
// Everything is INJECTED (eyes, reader, cursor, say, llm, now) so the whole loop is unit-testable with no
// live Electron (see test/watch-smoke.cjs). In production main.cjs wires the real electron/eyes/panel.

const { classifyKind } = require('./eyes-read.cjs'); // pure title→kind classifier (reused, no injection needed)

// ── in-character quip pool: a ScreenContext → a short Toshi line, LOCAL (no data leaves) ──────────
// Keyed by kind (+ error). Playful cat-mascot / Clippy energy, matches panel QUIPS. Deterministic pick
// by a rotating counter so repeats are spread out.
const QUIPS = {
  'editor:error':   ['that red squiggle again? 😼', 'the linter looks grumpy 🔧', 'bug o\'clock 🐛'],
  'editor':         ['deep in the code 👀', 'that function\'s shaping up ✍️', 'clean lines, nice 🐾'],
  'terminal:error': ['the terminal\'s yelling 🔥', 'red output… spicy 🌶️', 'exit 1 again? 😹'],
  'terminal':       ['shipping something? 🚀', 'npm doing its thing ⚙️', 'terminal wizardry 🧙'],
  'browser:error':  ['that page looks unhappy 😿', 'a 404 in the wild 🔎'],
  'browser':        ['lost in the tabs? 🗂️', 'researching hard 🔍', 'one more tab, sure 😹'],
  'chat':           ['chatting away 💬', 'someone\'s popular 😺'],
  'other':          ['👀', 'still here 😺', 'prr prr 🐾'],
};
function templateQuip(ctx, tick = 0) {
  const key = ctx.hasError && QUIPS[`${ctx.kind}:error`] ? `${ctx.kind}:error` : (QUIPS[ctx.kind] ? ctx.kind : 'other');
  const pool = QUIPS[key];
  return pool[tick % pool.length];
}

// ── the watcher ───────────────────────────────────────────────────────────────────────────────────
// deps:
//   eyes    : createEyes() instance (enumerate/grants/isGranted/capture)
//   reader  : createReader() instance (read(frame,opts) -> ScreenContext)
//   cursor  : () => ({x,y}) screen point (Electron screen.getCursorScreenPoint) — recorded, for future crop
//   say     : (text, holdMs) => void  — pushes to window.__toshi.say
//   llm     : optional async ({ctx}) => string  — richer quip; only used when allowCloud + granted
//   now     : () => ms
// opts: { minGapMs=45000, idleHelloMs=210000, allowCloud=false, modelName='the cloud model' }
function makeWatcher(deps = {}, opts = {}) {
  const { eyes, reader, cursor = () => ({ x: 0, y: 0 }), say, llm = null, now = () => Date.now() } = deps;
  if (!eyes || !reader || typeof say !== 'function') throw new Error('makeWatcher: eyes, reader and say are required');
  const minGapMs = opts.minGapMs ?? 45000;
  const idleHelloMs = opts.idleHelloMs ?? 210000;
  const allowCloud = !!opts.allowCloud;
  const modelName = opts.modelName || 'the cloud model';

  let lastAt = 0, lastLine = '', lastKey = '', tickN = 0, timer = null, running = false, busy = false;

  // pick the source Toshi may look at: the FIRST granted source (the user chose what to share).
  // If none granted, we can still enumerate titles (no pixels) and comment on the app only.
  async function pickTarget() {
    const granted = eyes.grants();
    if (granted.length) return { id: granted[0].id, granted: true };
    // no grant → T0 only: enumerate (NO pixels) and pick the MOST INTERESTING open window (an editor /
    // terminal / browser beats a random one) so the line is relevant. Still just a title — never a pixel.
    const list = await eyes.enumerate().catch(() => []);
    const windows = list.filter((s) => /window/i.test(s.id));
    const RANK = { editor: 4, terminal: 3, browser: 2, chat: 1, other: 0 };
    let win = null, best = -1;
    for (const s of windows) { const r = RANK[classifyKind(s.name)] ?? 0; if (r > best) { best = r; win = s; } }
    win = win || windows[0] || list[0];
    return win ? { id: win.id, name: win.name, granted: false } : null;
  }

  // build the ScreenContext for the current moment (consent-aware).
  async function glance() {
    const target = await pickTarget();
    if (!target) return null;
    const at = cursor();
    if (target.granted) {
      // contents allowed → capture one ephemeral frame + run the read ladder.
      let frame;
      try { const cap = await eyes.capture(target.id); frame = { png: cap.png, app: cap.name, title: cap.name }; }
      catch { frame = { app: target.name, title: target.name }; } // capture failed → fall to title-only
      const ctx = await reader.read(frame, { want: allowCloud ? 'text' : 'app', allowCloud, modelName });
      return { ...ctx, cursor: at, granted: true };
    }
    // no grant → title-only read (T0), never a pixel.
    const ctx = await reader.read({ app: target.name, title: target.name }, { want: 'app' });
    return { ...ctx, cursor: at, granted: false };
  }

  function meaningful(ctx) {
    const key = `${ctx.kind}:${ctx.hasError ? 'err' : 'ok'}`;
    const changed = key !== lastKey;
    const idleHello = now() - lastAt >= idleHelloMs;
    return { go: changed || idleHello, key };
  }

  async function tick() {
    if (busy) return;                                   // no overlap: a slow (LLM) glance in flight must not
    busy = true;                                        // let the next ticks fire before lastAt is updated (burst bug)
    try {
      if (now() - lastAt < minGapMs) return;            // cooldown — not annoying
      const ctx = await glance();
      if (!ctx) return;
      const { go, key } = meaningful(ctx);
      if (!go) return;

      // 1) INSTANT local template — zero silence even when the LLM is slow (free models can take 15–45s).
      //    Start the cooldown NOW so a slow LLM cannot let the next ticks burst (belt-and-suspenders with busy).
      const tmpl = templateQuip(ctx, tickN++);
      if (tmpl !== lastLine) say(tmpl, 4500);
      lastAt = now(); lastKey = key; lastLine = tmpl;

      // 2) UPGRADE it in place with a fresh agent line when it arrives (cloud opt-in). The llm wrapper is
      //    responsible for LANGUAGE — it returns '' if the reply isn't in the user's language (see main.cjs:
      //    detect from OS locale, English by default). So here we just take a non-empty upgrade. The
      //    provenance label is appended only when real screen CONTENTS were sent off-device (ctx.mustLabel).
      if (llm && allowCloud) {
        let up = '';
        try { up = String((await llm({ ctx })) || '').trim().slice(0, 120); } catch {}
        if (up) {
          if (ctx.mustLabel && ctx.label) up += ` · ${ctx.label}`;
          if (up !== lastLine) { say(up, 5000); lastLine = up; }
        }
      }
    } catch { /* a glance must never crash the companion */ }
    finally { busy = false; }
  }

  function start(pollMs = 6000) { if (running) return; running = true; timer = setInterval(() => { tick(); }, pollMs); if (timer.unref) timer.unref(); }
  function stop() { running = false; if (timer) clearInterval(timer); timer = null; }

  return { tick, glance, start, stop, get running() { return running; } };
}

module.exports = { makeWatcher, templateQuip, QUIPS };
