'use strict';
// Runtime smoke for the panel animation add-ons (animations-extra.js + animations-sequences.js). GPL-3.0.
// WHY THIS EXISTS: those files run ONLY in the browser popup, so `node --check` (syntax) + the main suite
// (which never loads the panel) can't catch a runtime ReferenceError — e.g. a helper called but never
// declared (`safeSetPose` slipped through once, would crash at the first startFocus/morningStretch on a live
// popup). This harness stubs the browser globals, loads each pack, and CALLS every exposed animation so an
// undeclared reference / bad timer throws HERE, in CI, instead of on a user's screen.
//   node test/animations-smoke.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const makeEl = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
  appendChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 300, height: 460, left: 0, top: 0 }),
  textContent: '', innerHTML: '', dataset: {}, offsetWidth: 1, children: [], hidden: false,
});

function harness(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'panel', file), 'utf8');
  const doc = { getElementById: makeEl, querySelector: makeEl, querySelectorAll: () => [], createElement: makeEl, body: makeEl(), documentElement: makeEl(), addEventListener: noop, hidden: false };
  const win = {
    __toshi: { setPose: noop, say: noop, setEyes: noop, pause: noop, resume: noop, state: () => ({}) },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: noop,
    addEventListener: noop, MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }), document: doc,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  win.window = win;
  const ctx = { window: win, document: doc, matchMedia: win.matchMedia, requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: noop, MutationObserver: win.MutationObserver, getComputedStyle: win.getComputedStyle, setTimeout, clearTimeout, setInterval, clearInterval, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx); // throws here if the IIFE references an undeclared global at load
  return ctx.window;
}

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); } };

console.log('panel animation packs — runtime smoke (catches ReferenceErrors node --check cannot):');

// animations-extra pack (bind* helpers auto-run on init; loading it clean is the test)
t('animations-extra.js loads without a runtime throw', () => { harness('animations-extra.js'); });

// animations-sequences pack: load + CALL every exposed sequence (where safeSetPose would have crashed)
let seqWin;
t('animations-sequences.js loads + exposes __toshiSeq', () => {
  seqWin = harness('animations-sequences.js');
  if (!seqWin.__toshiSeq || typeof seqWin.__toshiSeq !== 'object') throw new Error('__toshiSeq not exposed');
});
for (const fn of ['morningStretch', 'victoryLap', 'startFocus', 'confusedRecovery', 'patrol']) {
  t(`__toshiSeq.${fn}() runs without throw`, () => {
    const s = seqWin && seqWin.__toshiSeq;
    if (!s || typeof s[fn] !== 'function') throw new Error(fn + ' is not a function');
    s[fn]();
  });
}
t('__toshiSeq.cancel() / stopFocus() clean up without throw', () => {
  const s = seqWin.__toshiSeq;
  if (typeof s.stopFocus === 'function') s.stopFocus();
  if (typeof s.cancel === 'function') s.cancel();
});

/* ── repertoire pack: WHEN Toshi moves on his own ───────────────────────────────────────────────────
 * Loading it is not enough. The whole value of this pack is in the cases where it does NOT move, so the
 * cases below assert the REFUSALS: a repertoire that plays regardless of context is exactly the
 * interrupting companion the anti-Clippy gate exists to prevent. And `last().skipped` must name the
 * reason — otherwise "Toshi is calm" and "the repertoire is broken" are the same observation, which is
 * the defect this project hunts everywhere else. */
let repWin;
t('animations-repertoire.js loads + exposes __toshiRep', () => {
  repWin = harness('animations-repertoire.js');
  if (!repWin.__toshiRep || typeof repWin.__toshiRep !== 'object') throw new Error('__toshiRep not exposed');
});
t('the catalogue is non-empty and every entry is well-formed', () => {
  const c = repWin.__toshiRep.catalogue();
  if (!Array.isArray(c) || !c.length) throw new Error('empty catalogue');
  for (const m of c) if (!m.name || !(m.weight > 0) || !(m.cost > 0)) throw new Error('bad entry: ' + JSON.stringify(m));
});
t('every move in the catalogue runs without throw', () => {
  for (const m of repWin.__toshiRep.catalogue()) {
    const played = repWin.__toshiRep.play(m.name);
    if (played !== m.name) throw new Error(m.name + ' did not report itself as played (got ' + played + ')');
  }
});
t('an unknown move is REFUSED and says so, instead of silently doing nothing', () => {
  const r = repWin.__toshiRep.play('pas-une-pose');
  if (r !== null) throw new Error('an unknown move must return null');
  if (!/unknown move/.test(repWin.__toshiRep.last().skipped || '')) throw new Error('last().skipped must name it');
});
t('★ a tick too soon after a move is skipped WITH A REASON, not silently', () => {
  repWin.__toshiRep.play('glance');            // sets lastAt = now
  const r = repWin.__toshiRep.tick(false);
  if (r !== null) throw new Error('it must not play twice in a row without the gap');
  if (!/too soon/.test(repWin.__toshiRep.last().skipped || '')) throw new Error('the reason must say "too soon", got: ' + repWin.__toshiRep.last().skipped);
});
t('★ forcing a tick bypasses the gap and reports a move actually played', () => {
  const r = repWin.__toshiRep.tick(true);
  if (!r) throw new Error('a forced tick must play something');
  if (repWin.__toshiRep.last().played !== r) throw new Error('last().played must match');
  if (repWin.__toshiRep.last().skipped !== null) throw new Error('a played tick carries no skip reason');
});
t('★ never the same move twice in a row', () => {
  const a = repWin.__toshiRep.tick(true), b = repWin.__toshiRep.tick(true);
  if (a && b && a === b) throw new Error('picked ' + a + ' twice in a row');
});
t('★ start/stop are idempotent and stop leaves no timer behind', () => {
  repWin.__toshiRep.start(5000); repWin.__toshiRep.start(5000);   // second start must be a no-op
  repWin.__toshiRep.stop(); repWin.__toshiRep.stop();
  if (repWin.__toshiRep.last().running !== false) throw new Error('running must be false after stop');
});

// let the internal timers fire once (that's where a bad interval/undeclared ref hides), then report
setTimeout(() => {
  try { repWin && repWin.__toshiRep && repWin.__toshiRep.stop(); } catch (e) { fail++; console.log('  ✗ repertoire stop threw\n      ' + e.message); }
  try { seqWin && seqWin.__toshiSeq && seqWin.__toshiSeq.cancel && seqWin.__toshiSeq.cancel(); } catch (e) { fail++; console.log('  ✗ post-timer cancel threw\n      ' + e.message); }
  console.log(`\n${pass} passed · ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 300);
