'use strict';
// Offline smoke for the v2 TACT (desktop/eyes-nudge.cjs) — proves the anti-Clippy gates + back-off. GPL-3.0.
//   node test/eyes-nudge-smoke.cjs
const assert = require('node:assert');
const { createTact } = require('../desktop/eyes-nudge.cjs');

// a confident read WITH an on-screen error = the one thing worth a quiet word
const ERR = { confidence: 0.75, hasError: true, text: 'FAIL: test_auth — TypeError in session.mjs:172', kind: 'editor' };
// a confident read with nothing notable = a silent glance
const CALM = { confidence: 0.8, hasError: false, text: 'all tests pass ✨', kind: 'terminal' };
// the "ready" state where a nudge WOULD be allowed
const READY = { ambientOn: true, watching: true, userTyping: false };

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); } };
const T = createTact();

console.log('v2 tact — offline smoke (silence by default, anti-Clippy gates + back-off):');

// the gates — each must independently keep Toshi silent
t('ambient OFF → silent (opt-in only)', () => assert.equal(T.decide(ERR, { ...READY, ambientOn: false }, 0).surface, false));
t('not watching a source → silent', () => assert.equal(T.decide(ERR, { ...READY, watching: false }, 0).surface, false));
t('user is typing → NEVER interrupt', () => {
  const d = T.decide(ERR, { ...READY, userTyping: true }, 0); assert.equal(d.surface, false); assert.equal(d.reason, 'user-typing');
});
t('low-confidence read → abstain, do not guess', () => {
  const d = T.decide({ ...ERR, confidence: 0.3 }, READY, 0); assert.equal(d.surface, false); assert.equal(d.reason, 'low-confidence');
});
t('confident but NOTHING meaningful → silent glance (not a nudge)', () => {
  const d = T.decide(CALM, READY, 0); assert.equal(d.surface, false); assert.equal(d.reason, 'no-meaningful-event');
});

// the one case that DOES surface — confident + a real error + all gates clear
t('confident error + all gates clear → surfaces a quiet pointing bubble', () => {
  const d = T.decide(ERR, READY, 1_000_000);
  assert.equal(d.surface, true); assert.equal(d.pose, 'pointing');
  assert.match(d.line, /looks red/); assert.match(d.line, /session\.mjs:172/);
  assert.ok(d.key && d.key.startsWith('err:'));
});

// rate-limit: a second nudge inside the cooldown is suppressed
t('cooldown: a 2nd nudge right after the 1st is suppressed', () => {
  const now = 1_000_000;
  const first = T.decide(ERR, READY, now); assert.equal(first.surface, true);
  const st = T.applied(READY, first, now);
  const soon = T.decide({ ...ERR, text: 'ReferenceError in x.js:9', hasError: true }, st, now + 10_000); // < 90s
  assert.equal(soon.surface, false); assert.equal(soon.reason, 'cooling-down');
});

// window budget: after maxPerWindow, silent for the rest of the window
t('window budget: the 5th nudge in a 4-max window is suppressed', () => {
  let st = { ...READY, windowStart: 0, nudgesInWindow: 4, lastNudgeAt: 0 };
  const d = T.decide(ERR, st, 20 * 60_000); // in-window, past cooldown, but budget spent
  assert.equal(d.surface, false); assert.equal(d.reason, 'window-budget-spent');
});

// exponential back-off: dismissals make the next nudge cost more silence
t('back-off: after dismissals the cooldown grows (a gap that passed at streak 0 fails at streak 3)', () => {
  const base = { ...READY, lastNudgeAt: 0 };
  const gap = 100_000; // > 90s base cooldown, so it passes at streak 0…
  assert.equal(T.decide(ERR, { ...base, dismissedStreak: 0 }, gap).surface, true);
  // …but at streak 3 the cooldown is 90s * 2^3 = 720s → 100s is not enough → still cooling down
  const d = T.decide(ERR, { ...base, dismissedStreak: 3 }, gap);
  assert.equal(d.surface, false); assert.equal(d.reason, 'cooling-down');
});

// de-dupe: the same recurring error doesn't nag twice in a window
t('de-dupe: same nudge key back-to-back in a window is suppressed', () => {
  const now = 1_000_000;
  const first = T.decide(ERR, READY, now);
  const st = T.applied(READY, first, now);
  // past cooldown, same error key, still in window → suppressed as same-as-last
  const again = T.decide(ERR, st, now + 200_000);
  assert.equal(again.surface, false); assert.equal(again.reason, 'same-as-last');
});

// state transitions: applied bumps counters, dismissed/engaged move the streak
t('applied() rolls the window + counters; dismissed()/engaged() move the streak', () => {
  const now = 5_000_000;
  const d = T.decide(ERR, READY, now);
  const s1 = T.applied(READY, d, now);
  assert.equal(s1.nudgesInWindow, 1); assert.equal(s1.lastNudgeAt, now); assert.equal(s1.dismissedStreak, 0);
  assert.equal(T.dismissed(s1).dismissedStreak, 1);
  assert.equal(T.engaged(T.dismissed(s1)).dismissedStreak, 0);
});

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
