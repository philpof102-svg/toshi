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

// let the internal timers fire once (that's where a bad interval/undeclared ref hides), then report
setTimeout(() => {
  try { seqWin && seqWin.__toshiSeq && seqWin.__toshiSeq.cancel && seqWin.__toshiSeq.cancel(); } catch (e) { fail++; console.log('  ✗ post-timer cancel threw\n      ' + e.message); }
  console.log(`\n${pass} passed · ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 300);
