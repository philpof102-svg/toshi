'use strict';
// Offline smoke for the v2 EYES core (desktop/eyes.cjs) — proves the consent/privacy invariants WITHOUT
// a live Electron (the capturer backend is stubbed). GPL-3.0. See Toshi-v2-design.md.
//   node test/eyes-smoke.cjs
const assert = require('node:assert');
const { createEyes, screenTextProvenance, TIERS } = require('../desktop/eyes.cjs');

// A stub desktopCapturer that RECORDS the opts it was called with, so we can assert the no-pixels rule.
function stubCapturer() {
  const calls = [];
  return {
    calls,
    async getSources(opts) {
      calls.push(opts);
      const pixels = opts.thumbnailSize && (opts.thumbnailSize.width > 0 || opts.thumbnailSize.height > 0);
      return [
        { id: 'window:42', name: 'Chrome — red CI', appIcon: null,
          thumbnail: pixels ? { toPNG: () => Buffer.from('PNGDATA') } : null },
        { id: 'screen:1', name: 'Entire screen', appIcon: null,
          thumbnail: pixels ? { toPNG: () => Buffer.from('PNG2') } : null },
      ];
    },
  };
}

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); } };
const ta = (name, fn) => fn().then(() => { pass++; console.log('  ✓ ' + name); },
  (e) => { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); });

console.log('v2 eyes core — offline smoke (consent + privacy invariants):');

(async () => {
  // 1. enumerate() must request ZERO pixels (the consent picker never leaks a frame)
  await ta('enumerate() asks getSources with thumbnailSize {0,0} — no pixels at the picker', async () => {
    const cap = stubCapturer();
    const eyes = createEyes({ capturer: cap });
    const list = await eyes.enumerate();
    assert.equal(cap.calls[0].thumbnailSize.width, 0, 'width must be 0');
    assert.equal(cap.calls[0].thumbnailSize.height, 0, 'height must be 0');
    assert.ok(list.length === 2 && list[0].id === 'window:42', 'returns id+name only');
    assert.ok(!('thumbnail' in list[0]), 'picker output must not carry a thumbnail');
  });

  // 2. capture() on an UNGRANTED source must throw (no implicit "see everything")
  await ta('capture() throws without a prior grant', async () => {
    const eyes = createEyes({ capturer: stubCapturer() });
    await assert.rejects(() => eyes.capture('window:42'), /not granted/);
  });

  // 3. after grant, capture() returns an in-memory PNG buffer (a real frame)
  await ta('grant → capture() returns an in-memory PNG buffer', async () => {
    const eyes = createEyes({ capturer: stubCapturer() });
    eyes.grant('window:42', 'read');
    const frame = await eyes.capture('window:42');
    assert.ok(Buffer.isBuffer(frame.png) && frame.bytes > 0, 'png must be a non-empty Buffer');
    assert.equal(frame.name, 'Chrome — red CI');
    assert.equal(frame.tier, 'read');
  });

  // 4. revoke() (and the panic revokeAll) re-locks — capture throws again
  await ta('revoke() re-locks the source (capture throws again)', async () => {
    const eyes = createEyes({ capturer: stubCapturer() });
    eyes.grant('window:42'); eyes.revoke('window:42');
    await assert.rejects(() => eyes.capture('window:42'), /not granted/);
  });
  await ta('revokeAll() is the panic path — clears every grant', async () => {
    const eyes = createEyes({ capturer: stubCapturer() });
    eyes.grant('window:42'); eyes.grant('screen:1', 'full');
    assert.equal(eyes.grants().length, 2);
    eyes.revokeAll();
    assert.equal(eyes.grants().length, 0);
  });

  // 5. an invalid tier is rejected (only read|point|full)
  t('grant() rejects an unknown tier', () => {
    const eyes = createEyes({ capturer: stubCapturer() });
    assert.throws(() => eyes.grant('window:42', 'god-mode'), /read\|point\|full/);
    assert.deepEqual(TIERS, ['read', 'point', 'full']);
  });

  // 6. the honesty gate — screen text to a CLOUD model MUST be labelled; local stays silent-safe
  t('screenTextProvenance labels screen→cloud, not screen→local, not no-screen', () => {
    const cloud = screenTextProvenance({ hasScreenSource: true, answerModelIsLocal: false, modelName: 'minimax-m3' });
    assert.equal(cloud.mustLabel, true);
    assert.match(cloud.label, /screen text sent to minimax-m3/);
    const local = screenTextProvenance({ hasScreenSource: true, answerModelIsLocal: true });
    assert.equal(local.mustLabel, false);
    const none = screenTextProvenance({ hasScreenSource: false, answerModelIsLocal: false });
    assert.equal(none.mustLabel, false);
  });

  // 7. createEyes without a capturer is a hard error (no silent no-op)
  t('createEyes() requires a capturer backend', () => {
    assert.throws(() => createEyes({}), /capturer with getSources/);
  });

  console.log(`\n${pass} passed · ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
