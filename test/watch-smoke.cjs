'use strict';
// Toshi watcher — offline unit test (no Electron). Mocks eyes/reader/say/clock. GPL-3.0.
const { makeWatcher, templateQuip, QUIPS } = require('../desktop/watch.cjs');

let n = 0, ok = 0;
const t = (name, cond) => { n++; if (cond) ok++; else console.error('  FAIL:', name); };

// ── pure quip mapping ──
t('editor+error → an error quip', QUIPS['editor:error'].includes(templateQuip({ kind: 'editor', hasError: true }, 0)));
t('terminal (no error) → a terminal quip', QUIPS['terminal'].includes(templateQuip({ kind: 'terminal', hasError: false }, 0)));
t('unknown kind → other pool', QUIPS['other'].includes(templateQuip({ kind: 'weird', hasError: false }, 0)));
t('rotates picks by tick', templateQuip({ kind: 'terminal', hasError: false }, 0) !== templateQuip({ kind: 'terminal', hasError: false }, 1));

// ── harness: mock deps + a controllable clock ──
function harness(readerReturn, { grants = [], llm = null, allowCloud = false } = {}) {
  let clock = 1_000_000;
  const said = [];
  const calls = { capture: 0, enumerate: 0, read: 0 };
  const eyes = {
    grants: () => grants,
    enumerate: async () => { calls.enumerate++; return [{ id: 'window:42', name: 'Visual Studio Code' }]; },
    capture: async (id) => { calls.capture++; return { png: Buffer.from('x'), name: 'Visual Studio Code' }; },
  };
  const reader = { read: async (frame, opts) => { calls.read++; return typeof readerReturn === 'function' ? readerReturn(frame, opts) : readerReturn; } };
  const say = (text, ms) => said.push({ text, ms });
  const w = makeWatcher({ eyes, reader, say, llm, cursor: () => ({ x: 5, y: 9 }), now: () => clock }, { minGapMs: 45000, idleHelloMs: 210000, allowCloud, modelName: 'MiMo' });
  return { w, said, calls, adv: (ms) => { clock += ms; }, at: () => clock };
}

(async () => {
  // ── granted path: capture + read + say ──
  {
    const h = harness({ kind: 'terminal', text: 'Error: boom', hasError: true, mustLabel: false }, { grants: [{ id: 'screen:1' }] });
    await h.w.tick();
    t('granted → captured a frame', h.calls.capture === 1);
    t('granted+error → said a terminal error quip', h.said.length === 1 && QUIPS['terminal:error'].includes(h.said[0].text));

    // cooldown: a tick within minGap says nothing more
    h.adv(10000); await h.w.tick();
    t('cooldown blocks a second quip', h.said.length === 1);

    // after cooldown, SAME kind/error (not idle) → no repeat
    h.adv(40000); await h.w.tick();
    t('same context after cooldown → stays quiet', h.said.length === 1);
  }

  // ── change of context → a fresh quip ──
  {
    let ret = { kind: 'terminal', hasError: false };
    const h = harness(() => ret, { grants: [{ id: 'screen:1' }] });
    await h.w.tick();
    t('first quip fires', h.said.length === 1);
    ret = { kind: 'browser', hasError: false }; // context changed
    h.adv(46000); await h.w.tick();
    t('context change → new quip', h.said.length === 2 && QUIPS['browser'].includes(h.said[1].text));
  }

  // ── no grant → title-only, NEVER captures pixels ──
  {
    const h = harness({ kind: 'editor', hasError: false }, { grants: [] });
    await h.w.tick();
    t('no grant → enumerate used', h.calls.enumerate === 1);
    t('no grant → capture NEVER called', h.calls.capture === 0);
    t('no grant → still said something (title-only)', h.said.length === 1);
  }

  // ── cloud: instant template FIRST (zero silence), then the agent line upgrades it (+ provenance label) ──
  {
    const h = harness(
      { kind: 'editor', text: 'const x = 1', hasError: false, mustLabel: true, label: 'screen text sent to MiMo' },
      { grants: [{ id: 'screen:1' }], allowCloud: true, llm: async () => 'sharp code, human ✨' },
    );
    await h.w.tick();
    t('instant template shown first (zero silence)', h.said.length === 2 && QUIPS['editor'].includes(h.said[0].text));
    t('llm line upgrades it', h.said[1].text.startsWith('sharp code'));
    t('provenance label appended (never hidden)', /screen text sent to MiMo/.test(h.said[1].text));
  }

  // ── language: the wrapper returns '' for a wrong-language reply → the instant template stays (no upgrade) ──
  {
    const h = harness(
      { kind: 'terminal', hasError: false },
      { grants: [{ id: 's' }], allowCloud: true, llm: async () => '' }, // wrapper dropped a wrong-lang reply
    );
    await h.w.tick();
    t('empty llm result → template kept, no upgrade', h.said.length === 1 && QUIPS['terminal'].includes(h.said[0].text));
  }

  // ── re-entrancy: while a SLOW (llm) glance is in flight, overlapping ticks must NOT burst ──
  {
    let release; const slow = new Promise((r) => { release = r; });
    const h = harness({ kind: 'terminal', hasError: false }, { grants: [{ id: 's' }], allowCloud: true, llm: () => slow.then(() => 'ship it 🚀') });
    const p1 = h.w.tick();                          // says the instant template, then awaits the slow llm → busy=true
    await new Promise((r) => setTimeout(r, 0));     // let tick 1 reach the slow-llm await
    await h.w.tick();                               // overlapping tick — busy → skipped
    t('instant template shown, overlap skipped (no burst)', h.said.length === 1 && QUIPS['terminal'].includes(h.said[0].text));
    release(); await p1;
    t('llm upgrade lands as the second line', h.said.length === 2 && h.said[1].text.startsWith('ship it'));
  }

  console.log(`\n[watch-smoke] ${ok}/${n} checks passed`);
  process.exit(ok === n ? 0 : 1);
})();
