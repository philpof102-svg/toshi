#!/usr/bin/env node
'use strict';
// Offline smoke for see-serve.cjs — no Electron, no network, no VLM. GPL-3.0.
// =================================================================================================
// What this proves, and why each case exists:
//
//   ⚠️ THE WHOLE POINT IS THE REFUSALS. On a screen reader, "I could not look" and "there was nothing
//   to see" are OPPOSITE answers that a lazy implementation renders identically — an empty
//   ScreenContext for both. Every failure below must therefore arrive with its own `reason` and NO
//   context field, so an agent can never read a failure as an empty desk.
//
//   ⚠️ AND THE OPPOSITE BOUND, or the refusals prove nothing: a granted source with a real frame must
//   still come back with its ScreenContext intact, `mustLabel` and `confidence` carried through
//   untouched. A server that only ever refuses would pass every refusal case and be useless.
//
// Run: node desktop/see-serve-smoke.cjs
const assert = require('node:assert');
const { createSeeServer } = require('./see-serve.cjs');

let ko = 0;
const t = (nom, fn) => {
  try { fn(); process.stdout.write('  ok   ' + nom + '\n'); }
  catch (e) { ko++; process.stdout.write('  FAIL ' + nom + '\n       ' + e.message + '\n'); }
};
const attendre = (p) => { let v, e; p.then((x) => (v = x), (x) => (e = x)); return () => { if (e) throw e; return v; }; };

/* Un faux canal de retour: il ENREGISTRE ce que la fenetre renverrait au cerveau. */
const canal = () => { const vus = []; return { vus, post: async (path, body) => { vus.push({ path, body }); return { ok: true }; } }; };

const CONTEXT = { app: 'Code', title: 'trace.js', kind: 'editor', text: 'assert failed',
  summary: '', source: 'ocr', confidence: 0.8, hasError: true, mustLabel: false, label: null };
const readerOk = { read: async () => CONTEXT };
const eyesAvec = (grants, capture) => ({ grants: () => grants, capture });

process.stdout.write('see-serve — un oeil indisponible ne doit jamais se lire « ecran vide »:\n');

/* ── ★ LA BORNE D'ACCEPTATION, en premier: sans elle les refus ne prouvent rien ─────────────────── */
{
  const c = canal();
  const eyes = eyesAvec(['screen:0'], async () => ({ sourceId: 'screen:0', tier: 'read', name: 'Écran 1',
    png: Buffer.from('89504e47', 'hex'), bytes: 4, at: 0 }));
  const lire = attendre(createSeeServer({ eyes, reader: readerOk, postJson: c.post })
    .answerOnce({ id: 'a1', want: 'text' }));
  setImmediate(() => {
    lire();
    t('★ BORNE: une source accordee rend bien un ScreenContext', () => {
      assert.strictEqual(c.vus.length, 1);
      assert.strictEqual(c.vus[0].body.id, 'a1');
      assert.deepStrictEqual(c.vus[0].body.context, CONTEXT);
      assert.strictEqual(c.vus[0].body.reason, undefined, 'un succes ne porte pas de raison d echec');
    });
    t('★ BORNE: le nom de la source et le palier de consentement remontent', () => {
      assert.strictEqual(c.vus[0].body.sourceName, 'Écran 1');
      assert.strictEqual(c.vus[0].body.tier, 'read');
    });
    t('★ AUCUN PIXEL ne franchit la frontiere — seulement la taille du cadre', () => {
      assert.strictEqual(c.vus[0].body.png, undefined, 'le PNG ne doit jamais partir');
      assert.strictEqual(c.vus[0].body.frameBytes, 4);
    });
    t('la confiance et mustLabel traversent intacts (une lecture faible doit se voir)', () => {
      assert.strictEqual(c.vus[0].body.context.confidence, 0.8);
      assert.strictEqual(c.vus[0].body.context.mustLabel, false);
    });
    suite();
  });
}

function suite() {
  /* ── ★ les refus: chacun sa raison, et JAMAIS de contexte ────────────────────────────────────── */
  const cas = [
    ['★ aucune source accordee -> no_grant, pas un ecran vide', [], null, 'no_grant'],
    ['★ source non accordee (le garde de eyes.cjs) -> no_grant', ['s'],
      async () => { throw new Error('capture: "s" is not granted — the user must pick it first'); }, 'no_grant'],
    ['★ fenetre fermee entre l accord et la capture -> source_gone', ['s'],
      async () => { throw new Error('capture: granted source "s" is gone (window closed?)'); }, 'source_gone'],
    ['★ le backend ne rend aucun cadre -> capture_failed', ['s'],
      async () => { throw new Error('capture: backend returned no thumbnail — cannot produce a frame'); }, 'capture_failed'],
  ];
  let reste = cas.length;
  for (const [nom, grants, capture, attendu] of cas) {
    const c = canal();
    const eyes = eyesAvec(grants, capture || (async () => { throw new Error('ne devrait pas capturer'); }));
    createSeeServer({ eyes, reader: readerOk, postJson: c.post }).answerOnce({ id: 'x', want: 'text' }).then(() => {
      t(nom, () => {
        assert.strictEqual(c.vus.length, 1, 'la fenetre doit TOUJOURS repondre, meme pour refuser');
        assert.strictEqual(c.vus[0].body.reason, attendu);
        assert.strictEqual(c.vus[0].body.context, undefined, 'un refus ne porte AUCUN contexte');
        assert.ok(String(c.vus[0].body.error || '').length > 10, 'le refus doit se dire en clair');
      });
      if (--reste === 0) lecteurCasse();
    });
  }
}

function lecteurCasse() {
  const c = canal();
  const eyes = eyesAvec(['s'], async () => ({ name: 'W', tier: 'read', png: Buffer.alloc(2), bytes: 2 }));
  const reader = { read: async () => { throw new Error('vlm exploded'); } };
  createSeeServer({ eyes, reader, postJson: c.post }).answerOnce({ id: 'r', want: 'summary' }).then(() => {
    t('★ une echelle de lecture qui jette -> read_failed, toujours pas un ecran vide', () => {
      assert.strictEqual(c.vus[0].body.reason, 'read_failed');
      assert.strictEqual(c.vus[0].body.context, undefined);
    });
    /* ── les dependances manquantes doivent JETER a la construction, pas rendre un serveur muet ─── */
    t('un eyes absent est refuse a la construction', () => {
      assert.throws(() => createSeeServer({ reader: readerOk, postJson: async () => {} }), /eyes with capture/);
    });
    t('un reader absent est refuse a la construction', () => {
      assert.throws(() => createSeeServer({ eyes: eyesAvec([], async () => ({})), postJson: async () => {} }), /reader with read/);
    });
    t('un canal de retour absent est refuse a la construction', () => {
      assert.throws(() => createSeeServer({ eyes: eyesAvec([], async () => ({})), reader: readerOk }), /postJson/);
    });
    t('une demande sans id ne declenche AUCUNE capture', () => {
      const c2 = canal();
      const e2 = eyesAvec(['s'], async () => { throw new Error('ne devrait pas capturer'); });
      createSeeServer({ eyes: e2, reader: readerOk, postJson: c2.post }).answerOnce({});
      assert.strictEqual(c2.vus.length, 0);
    });
    process.stdout.write('\n' + (ko ? ko + ' cas en echec\n' : 'tous les cas tiennent\n'));
    process.exit(ko ? 1 : 0);
  });
}
