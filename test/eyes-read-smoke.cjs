'use strict';
// Offline smoke for the v2 READ LADDER (desktop/eyes-read.cjs) — proves the graceful fallback + the
// honest-abstention + the cloud-labelling rule, with STUB backends (no OCR/VLM/Electron). GPL-3.0.
//   node test/eyes-read-smoke.cjs
const assert = require('node:assert');
const { createReader, classifyKind, looksLikeError } = require('../desktop/eyes-read.cjs');

const PNG = Buffer.from('frame');
let pass = 0, fail = 0;
const ta = (name, fn) => fn().then(() => { pass++; console.log('  ✓ ' + name); },
  (e) => { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); });
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); } };

console.log('v2 read ladder — offline smoke (graceful fallback + honest abstention):');

(async () => {
  // T0: no backends + no frame → title-only, LOW confidence, contents empty (honest "I know the app, not more")
  await ta('title-only read → source=title, low confidence, empty contents, no throw', async () => {
    const r = await createReader({}).read({ app: 'Chrome', title: 'red CI — GitHub' }, { want: 'text' });
    assert.equal(r.source, 'title');
    assert.ok(r.confidence <= 0.4, 'title-only must stay low-confidence');
    assert.equal(r.text, ''); assert.equal(r.summary, '');
    assert.equal(r.kind, 'browser');
  });

  // T1: OCR present → uses it, text set, higher confidence, source=ocr
  await ta('OCR backend → source=ocr with the exact text', async () => {
    const ocr = async () => 'FAIL: test_auth — TypeError in session.mjs:172';
    const r = await createReader({ ocr }).read({ png: PNG, app: 'VS Code', title: 'session.mjs' }, { want: 'text' });
    assert.equal(r.source, 'ocr');
    assert.ok(r.confidence >= 0.7);
    assert.match(r.text, /TypeError in session\.mjs:172/);
    assert.equal(r.kind, 'editor');
    assert.equal(r.hasError, true); // drives the ambient "that looks red" nudge
  });

  // T1→T2: OCR empty → falls to the local VLM summary
  await ta('OCR empty → falls to local VLM summary (source=vlm)', async () => {
    const ocr = async () => '';            // OCR found nothing crisp
    const vlm = async () => 'a bar chart trending up';
    const r = await createReader({ ocr, vlm }).read({ png: PNG, title: 'Dashboard' }, { want: 'text' });
    assert.equal(r.source, 'vlm');
    assert.match(r.summary, /bar chart/);
    assert.equal(r.mustLabel, false); // local VLM stays on-device, no label needed
  });

  // T3: cloud is used ONLY with allowCloud, and it MUST be labelled (screen text leaves the device)
  await ta('cloud tier requires allowCloud AND is labelled', async () => {
    const cloud = async () => 'some screenshot summary';
    // allowCloud false → cloud NOT used, falls back to title-only
    const off = await createReader({ cloud }).read({ png: PNG, title: 'X' }, { want: 'text', allowCloud: false });
    assert.equal(off.source, 'title');
    // allowCloud true → cloud used + mustLabel true + label present
    const on = await createReader({ cloud }).read({ png: PNG, title: 'X' }, { want: 'text', allowCloud: true, modelName: 'gpt-4o' });
    assert.equal(on.source, 'cloud');
    assert.equal(on.mustLabel, true);
    assert.match(on.label, /screen text sent to gpt-4o/);
  });

  // graceful: a backend that THROWS must not crash the read — it falls through
  await ta('a throwing OCR backend does not crash — falls through to abstain/VLM', async () => {
    const ocr = async () => { throw new Error('ocr backend died'); };
    const r = await createReader({ ocr }).read({ png: PNG, title: 'thing' }, { want: 'text' });
    assert.equal(r.source, 'title'); // fell through cleanly, honest low-confidence
  });

  // want:'app' short-circuits to the cheapest tier even if a frame + OCR exist
  await ta('want:app short-circuits to title (no OCR/VLM spend)', async () => {
    let ocrCalls = 0; const ocr = async () => { ocrCalls++; return 'text'; };
    const r = await createReader({ ocr }).read({ png: PNG, app: 'Terminal', title: 'zsh' }, { want: 'app' });
    assert.equal(r.source, 'title'); assert.equal(ocrCalls, 0);
    assert.equal(r.kind, 'terminal');
  });

  // pure heuristics
  t('classifyKind: editor / terminal / browser / chat / other', () => {
    assert.equal(classifyKind('main.py'), 'editor');
    assert.equal(classifyKind('zsh — bash'), 'terminal');
    assert.equal(classifyKind('GitHub', 'https://github.com'), 'browser');
    assert.equal(classifyKind('Discord'), 'chat');
    assert.equal(classifyKind('Some Window'), 'other');
  });
  t('looksLikeError spots failures for the ambient nudge', () => {
    assert.equal(looksLikeError('TypeError: x is not a function'), true);
    assert.equal(looksLikeError('all good ✨'), false);
  });

  console.log(`\n${pass} passed · ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
