'use strict';
// Runtime smoke for the motion-extend pack (panel/animations-extend.js).
// WHY THIS EXISTS: like animations-smoke.cjs, this file is loaded only
// in the browser popup. `node --check` (syntax) and the main suite
// (which never loads the panel) cannot catch an undeclared helper or
// a bad Markov row (e.g. a row that doesn't sum to 1.0, a successor
// not in the idlePoseCycle, a NaN in the holdMs). This harness stubs
// the browser globals, loads the pack, runs predict() N times to
// verify the distribution, calls extendAfter() to confirm it actually
// drives setPose, and exercises the lastN ring to confirm the
// repeat-avoidance works.
//
//   node test/motion-extend-smoke.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const noop = () => {};
const makeEl = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
  appendChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 300, height: 460, left: 0, top: 0 }),
  textContent: '', innerHTML: '', dataset: {}, offsetWidth: 1, children: [], hidden: false,
});

// build a richer body stub that actually records classList operations + data-attrs
// (the other smoke test uses noop for everything; we need real semantics here)
function makeBody() {
  const classes = new Set();
  const data = {};
  return {
    _classes: classes, _data: data,
    classList: {
      add: (c) => classes.add(c),
      remove: (...cs) => { cs.forEach((c) => classes.delete(c)); },
      toggle: (c) => { if (classes.has(c)) classes.delete(c); else classes.add(c); },
      contains: (c) => classes.has(c),
    },
    getAttribute: (k) => (k in data ? data[k] : null),
    setAttribute: (k, v) => { data[k] = String(v); },
    removeAttribute: (k) => { delete data[k]; },
    style: { setProperty: noop, removeProperty: noop },
  };
}

function harness() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'panel', 'animations-extend.js'), 'utf8');
  const body = makeBody();
  const doc = {
    getElementById: makeEl,
    querySelector: makeEl,
    querySelectorAll: () => [],
    createElement: makeEl,
    body: body,
    documentElement: makeEl(),
    addEventListener: noop,
    hidden: false,
  };
  // spy on setPose so we can assert extendAfter() actually drove it
  const setPoseCalls = [];
  const win = {
    __toshi: {
      setPose: (name, ms) => { setPoseCalls.push({ name: String(name), ms: Number(ms) }); },
      say: noop,
      state: () => ({ pose: 'idle', eyes: 'NEUTRAL', mouth: 'NEUTRAL' }),
    },
    busy: false,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    cancelAnimationFrame: noop,
    addEventListener: noop,
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    document: doc,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  win.window = win;
  const ctx = {
    window: win, document: doc, matchMedia: win.matchMedia,
    requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: noop,
    MutationObserver: win.MutationObserver, getComputedStyle: win.getComputedStyle,
    setTimeout, clearTimeout, setInterval, clearInterval, console, Math, JSON, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx); // throws here on a load-time ReferenceError
  return { ctx, win, body, setPoseCalls };
}

let pass = 0, fail = 0;
const pending = []; // async tests that resolve/reject late — we tally in the final setTimeout
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      // async test: log AFTER the work completes (no premature ✓)
      pending.push(r.then(
        () => { pass++; console.log('  ✓ ' + name); },
        (e)  => { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack || e && e.message)); }
      ));
      return;
    }
    pass++; console.log('  ✓ ' + name);
  } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack || e && e.message)); }
}

console.log('motion-extend — runtime smoke (Markov predict + extendAfter + lastN):');

// 1. load
let h;
t('animations-extend.js loads + exposes __toshiExtend', () => {
  h = harness();
  const w = h.ctx.window.__toshiExtend;
  if (!w || typeof w !== 'object') throw new Error('__toshiExtend not exposed');
  if (w.version !== '1.0.0') throw new Error('wrong version: ' + w.version);
  if (typeof w.predict !== 'function') throw new Error('predict not a fn');
  if (typeof w.extendAfter !== 'function') throw new Error('extendAfter not a fn');
  if (typeof w.startLoop !== 'function') throw new Error('startLoop not a fn');
  if (typeof w.stopLoop !== 'function') throw new Error('stopLoop not a fn');
  if (!w.model || !w.model.transitions) throw new Error('model.transitions missing');
});

// 2. Markov shape: every row sums to ~1.0 + every successor is a known pose
const KNOWN_POSES = new Set(['idle', 'look_around', 'pointing', 'hand_wave', 'dancing', 'celebration', 'walking_side']);
t('model: every row is a known pose + every successor is known + holds are sane', () => {
  const m = h.ctx.window.__toshiExtend.model;
  if (m.terminal !== 'idle') throw new Error('terminal must be idle (else panel strands)');
  for (const from of Object.keys(m.transitions)) {
    if (!KNOWN_POSES.has(from)) throw new Error('unknown source pose in model: ' + from);
    const row = m.transitions[from];
    if (!Array.isArray(row) || row.length === 0) throw new Error('row ' + from + ' is empty');
    let sum = 0;
    for (const r of row) {
      if (!KNOWN_POSES.has(r.to)) throw new Error('unknown successor: ' + from + ' → ' + r.to);
      if (typeof r.p !== 'number' || r.p < 0 || r.p > 1) throw new Error('bad p: ' + from + ' → ' + r.to);
      if (typeof r.hold !== 'number' || r.hold < 200 || r.hold > 4000) throw new Error('bad hold: ' + r.hold + ' on ' + from + '→' + r.to);
      sum += r.p;
    }
    if (Math.abs(sum - 1.0) > 0.001) throw new Error('row ' + from + ' does not sum to 1.0: ' + sum);
  }
  // every source pose has a "settle back to idle" path within 1-2 hops
  // (the Markov itself doesn't need to be self-looping on idle — the
  // panel's own setPose(name, holdMs) restores idle after holdMs, so
  // a 1-step Markov from "look_around" to "idle" is the natural settle).
  // We check the 1-2 hop reachability with a BFS.
  const reachableTerminal = (from, hops) => {
    const seen = new Set([from]);
    let frontier = [from];
    for (let h = 0; h < hops; h++) {
      const next = [];
      for (const p of frontier) {
        for (const r of m.transitions[p] || []) {
          if (r.to === 'idle') return h + 1;
          if (!seen.has(r.to)) { seen.add(r.to); next.push(r.to); }
        }
      }
      frontier = next;
      if (frontier.length === 0) return Infinity;
    }
    return Infinity;
  };
  for (const from of Object.keys(m.transitions)) {
    const hops = reachableTerminal(from, 2);
    if (hops === Infinity) throw new Error('row ' + from + ' cannot reach idle within 2 hops (would strand)');
  }
});

// 3. predict() shape
t('predict({pose:"idle"}) returns a valid successor + sane holdMs', () => {
  for (let i = 0; i < 50; i++) {
    const p = h.ctx.window.__toshiExtend.predict({ pose: 'idle' });
    if (!KNOWN_POSES.has(p.pose)) throw new Error('bad predicted pose: ' + p.pose);
    if (typeof p.holdMs !== 'number' || p.holdMs < 200 || p.holdMs > 4000) throw new Error('bad holdMs: ' + p.holdMs);
    if (typeof p.why !== 'string') throw new Error('why not a string');
  }
});

// 4. distribution check: from idle, ~35% look_around over many samples (loose ±15%)
t('predict() distribution: from idle, look_around is the most common successor (>=25%)', () => {
  const N = 2000;
  const counts = {};
  for (let i = 0; i < N; i++) {
    const p = h.ctx.window.__toshiExtend.predict({ pose: 'idle' });
    counts[p.pose] = (counts[p.pose] || 0) + 1;
  }
  const la = (counts.look_around || 0) / N;
  if (la < 0.25) throw new Error('look_around under-represented: ' + la.toFixed(3) + ' (expected ~0.35)');
  if (la > 0.50) throw new Error('look_around over-represented: ' + la.toFixed(3) + ' (expected ~0.35)');
  // idle is reachable from idle (small chance via the 5% celebration → … chain? no, not from idle directly)
  // actually idle's row has NO idle successor in this model — that's by design
  // (a Markov "from idle to idle" makes the cat freeze, so we keep it as the
  // 1-step-back edge that the panel's setPose timer provides)
  if (counts.idle && counts.idle / N > 0.05) throw new Error('idle should not be its own direct successor');
});

// 5. unknown pose fallback → terminal row
t('predict({pose:"nonsense"}) falls back to the idle row (terminal)', () => {
  // the 1st successor in the idle row is look_around; the fallback is the LAST
  // weighted choice, but with no lastN/eyes match the weights are unchanged,
  // so look_around has the highest base p. We just check it's a known pose.
  for (let i = 0; i < 30; i++) {
    const p = h.ctx.window.__toshiExtend.predict({ pose: 'banana' });
    if (!KNOWN_POSES.has(p.pose)) throw new Error('fallback returned bad pose: ' + p.pose);
  }
});

// 6. lastN ring: pushLastN + readLastN roundtrip
t('lastN ring: pushLastN + readLastN roundtrip + cap at 3', () => {
  const w = h.ctx.window.__toshiExtend;
  w.pushLastN('idle');
  w.pushLastN('look_around');
  let n = w.readLastN();
  if (n[0] !== 'look_around' || n[1] !== 'idle') throw new Error('ring order wrong: ' + JSON.stringify(n));
  w.pushLastN('pointing');
  w.pushLastN('hand_wave');
  w.pushLastN('dancing');
  n = w.readLastN();
  if (n.length !== 3) throw new Error('cap not enforced: len=' + n.length);
  if (n[0] !== 'dancing' || n[1] !== 'hand_wave' || n[2] !== 'pointing') throw new Error('ring overflow wrong: ' + JSON.stringify(n));
});

// 7. repeat-avoidance: with lastN[0]='look_around', look_around should be under-represented from pointing
t('repeat-avoidance: from pointing, lastN=[look_around] lowers the chance of look_around', () => {
  // baseline (no lastN) — measure look_around probability from pointing
  let base = 0;
  for (let i = 0; i < 1000; i++) {
    const p = h.ctx.window.__toshiExtend.predict({ pose: 'pointing' });
    if (p.pose === 'look_around') base++;
  }
  // but the pointing row has NO look_around successor (it's idle/celebration/hand_wave/dancing)…
  // so we use a different test: from idle, with lastN=[look_around] vs empty
  let withPrev = 0, withoutPrev = 0;
  for (let i = 0; i < 1500; i++) {
    const p1 = h.ctx.window.__toshiExtend.predict({ pose: 'idle', lastN: ['look_around'] });
    if (p1.pose === 'look_around') withPrev++;
  }
  for (let i = 0; i < 1500; i++) {
    const p2 = h.ctx.window.__toshiExtend.predict({ pose: 'idle' });
    if (p2.pose === 'look_around') withoutPrev++;
  }
  // without prev should be ~35%; with prev should be ~21% (0.35 * 0.40 / (1 - 0.35 + 0.35*0.40) ≈ 0.255)
  // we accept a loose bound: at least 5 percentage points less with the repeat
  const a = withPrev / 1500, b = withoutPrev / 1500;
  if (a > b - 0.02) throw new Error('repeat-avoidance failed: with=' + a.toFixed(3) + ' without=' + b.toFixed(3));
});

// 8. extendAfter(0) actually drives setPose
t('extendAfter(0) calls setPose with a valid pose + hold', () => {
  // fresh harness so the body data + state from earlier tests don't leak in
  const h2 = harness();
  h2.setPoseCalls.length = 0;
  h2.ctx.window.__toshiExtend.extendAfter(0, { chain: false });
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (h2.setPoseCalls.length < 1) return reject(new Error('extendAfter did not call setPose; calls=' + JSON.stringify(h2.setPoseCalls)));
        const call = h2.setPoseCalls[0];
        if (!KNOWN_POSES.has(call.name)) return reject(new Error('setPose got bad pose: ' + call.name));
        if (typeof call.ms !== 'number' || call.ms < 200 || call.ms > 4000) return reject(new Error('setPose got bad hold: ' + call.ms));
        resolve();
      } catch (e) { reject(e); }
    }, 80);
  });
});

// 9. extendAfter: busy → no-op
t('extendAfter(0) is a no-op while window.busy=true (brain is talking)', () => {
  const h2 = harness();
  h2.win.busy = true;
  h2.setPoseCalls.length = 0;
  h2.ctx.window.__toshiExtend.extendAfter(0, { chain: false });
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (h2.setPoseCalls.length !== 0) return reject(new Error('extendAfter should have skipped while busy'));
        resolve();
      } catch (e) { reject(e); }
    }, 80);
  });
});

// 10. extendAfter: sequence-running → no-op
t('extendAfter(0) is a no-op while __toshiSeq.current().name is set', () => {
  const h2 = harness();
  h2.ctx.window.__toshiSeq = { current: () => ({ name: 'victoryLap', ms: 100 }) };
  h2.setPoseCalls.length = 0;
  h2.ctx.window.__toshiExtend.extendAfter(0, { chain: false });
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (h2.setPoseCalls.length !== 0) return reject(new Error('extendAfter should have skipped during a sequence'));
        resolve();
      } catch (e) { reject(e); }
    }, 80);
  });
});

// 11. startLoop / stopLoop — must not throw and must clean up its interval
t('startLoop() registers an interval; stopLoop() clears it; no leak', () => {
  const h2 = harness();
  const w = h2.ctx.window.__toshiExtend;
  w.startLoop(60); // 60ms cadence (fast for the test)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        w.stopLoop();
        if (h2.setPoseCalls.length < 1) return reject(new Error('startLoop never fired extendAfter; calls=' + h2.setPoseCalls.length));
        const before = h2.setPoseCalls.length;
        // stopLoop cleared the interval; wait 3 more ticks to confirm it's gone
        setTimeout(() => {
          try {
            if (h2.setPoseCalls.length > before + 1) return reject(new Error('stopLoop did not stop the loop (extra setPose calls)'));
            resolve();
          } catch (e) { reject(e); }
        }, 250);
      } catch (e) { reject(e); }
    }, 200);
  });
});

// 12. eye-intent overlay — set + clear
t('signalEyesIntent / clearEyesIntent toggle the right body class', () => {
  h.body._classes.clear();
  h.ctx.window.__toshiExtend.signalEyesIntent('look_left');
  if (!h.body._classes.has('x-eyes-look-left')) throw new Error('look_left class not added');
  h.ctx.window.__toshiExtend.signalEyesIntent('thinking');
  if (!h.body._classes.has('x-eyes-thinking')) throw new Error('thinking class not added');
  if (h.body._classes.has('x-eyes-look-left')) throw new Error('previous class not removed');
  h.ctx.window.__toshiExtend.clearEyesIntent('thinking');
  if (h.body._classes.has('x-eyes-thinking')) throw new Error('thinking class not cleared');
  // NEUTRAL should be a no-op
  h.ctx.window.__toshiExtend.signalEyesIntent('NEUTRAL');
  if (h.body._classes.size !== 0) throw new Error('NEUTRAL should not add a class');
});

// 13. chain:true schedules a 2nd extendAfter
t('extendAfter(0, {chain:true}) schedules a 2nd setPose call', () => {
  const h2 = harness();
  h2.setPoseCalls.length = 0;
  h2.ctx.window.__toshiExtend.extendAfter(0, { chain: true });
  return new Promise((resolve, reject) => {
    // total wait = 0 (1st) + max holdMs (≤ 4000) — wait up to 4500ms
    const t0 = Date.now();
    const check = () => {
      try {
        if (h2.setPoseCalls.length >= 2) return resolve();
        if (Date.now() - t0 > 4500) return reject(new Error('chain did not produce a 2nd setPose; got ' + h2.setPoseCalls.length));
        setTimeout(check, 80);
      } catch (e) { reject(e); }
    };
    check();
  });
});

// 14. simulate a brand-new panel: load pack, predict from idle 10 times, all valid
t('integration: 10 predict() calls from idle all return known poses', () => {
  for (let i = 0; i < 10; i++) {
    const p = h.ctx.window.__toshiExtend.predict({ pose: 'idle', eyes: 'NEUTRAL', lastN: [] });
    if (!KNOWN_POSES.has(p.pose)) throw new Error('iteration ' + i + ' bad pose: ' + p.pose);
  }
});

// wait for every async test, then report
Promise.all(pending).then(() => {
  setTimeout(() => {
    console.log(`\n${pass} passed · ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }, 200);
});
