// Offline smoke for the open-source voice ladder (lib/tts.mjs). GPL-3.0.
// WHY: the audio voice degrades kokoro→piper→system→off like the free-model cascade — if that resolver
// regresses, a fresh Toshi could go silent (or pick the wrong tier) with no error. This asserts the ladder
// + the cat-companion persona fully offline (no model download, no audio device). See VOICE.md.
//   node test/tts-smoke.mjs
import { resolveTts, planUtterance, TTS_ENGINES, PERSONA } from '../lib/tts.mjs';

let pass = 0, fail = 0;
const t = (name, got, want) => { const ok = got === want; ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}` + (ok ? '' : `\n      expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)); };

console.log('voice ladder — offline smoke (graceful kokoro→piper→system→off, + persona):');

// the ladder: configured tier wins when available, else fall DOWN, never dead-end silently
t('configured kokoro + installed → kokoro', resolveTts({ configured: 'kokoro', avail: { kokoro: true } }).engine, 'kokoro');
t('kokoro wanted, only piper installed → piper', resolveTts({ configured: 'kokoro', avail: { piper: true } }).engine, 'piper');
t('kokoro wanted, nothing extra → system baseline', resolveTts({ configured: 'kokoro', avail: {} }).engine, 'system');
t('piper wanted, only kokoro → falls to kokoro (higher) then system order', resolveTts({ configured: 'piper', avail: { kokoro: true } }).engine, 'kokoro');
t('off stays off', resolveTts({ configured: 'off' }).engine, 'off');
t('env TOSHI_TTS=off overrides a configured engine', resolveTts({ configured: 'kokoro', env: { TOSHI_TTS: 'off' }, avail: { kokoro: true } }).engine, 'off');
t('system explicitly unavailable + nothing else → off', resolveTts({ configured: 'system', avail: { system: false } }).engine, 'off');
t('default (unconfigured) → system', resolveTts({}).engine, 'system');

// persona: a bright cat companion + a NATIVE French voice so "quoi de neuf" isn't said with an EN accent
const fr = planUtterance('quoi de neuf', { lang: 'fr', configured: 'kokoro', avail: { kokoro: true } });
const en = planUtterance('hey there', { lang: 'en', configured: 'kokoro', avail: { kokoro: true } });
t('FR utterance → native FR Kokoro voice', fr.kokoroVoice, 'ff_siwis');
t('EN utterance → warm EN Kokoro voice', en.kokoroVoice, 'af_heart');
t('persona lifts pitch (cute, not corporate)', PERSONA.pitch > 1, true);
t('persona lifts rate (perky)', PERSONA.rate > 1, true);
t('utterance is length-bounded (short = snappy)', planUtterance('x'.repeat(5000), {}).text.length <= 600, true);
t('catalog is the 3 documented engines', TTS_ENGINES.map((e) => e.id).join(','), 'system,kokoro,piper');
t('every engine states a license (GPL-project honesty)', TTS_ENGINES.every((e) => !!e.license), true);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
