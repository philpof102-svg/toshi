// Toshi TTS — an OPEN-SOURCE, LOCAL voice for the mascot. GPL-3.0.
// ==================================================================================================
// THE RECIPE (verified 2026-07). Three layers, graceful fallback, NO cloud, NO API key — the same
// local/token-cheap ethos as Toshi's free-model cascade in lib/llm.mjs. You pick a tier with
// `toshi voice <engine>`; if it isn't installed, Toshi falls DOWN the ladder instead of going silent.
//
//   ┌─ engine ─┬─ what it is ───────────────────────────────────────────────┬─ license ─┬─ size ────┐
//   │ system   │ window.speechSynthesis (Web Speech API) — built into        │ (OS)      │ 0 (baked  │
//   │          │ Electron/Chromium. Instant, cross-platform, zero download.  │           │ into app) │
//   │          │ Quality = the OS voices (varies). The always-there baseline.│           │           │
//   │ kokoro   │ Kokoro-82M via `kokoro-js` (Transformers.js). Runs in the   │ Apache-2.0│ ~80–330MB │
//   │          │ renderer on webgpu→wasm, or CPU in Node. 54 voices / 8 langs│ (weights  │ one-time  │
//   │          │ incl. FR. Punches way above its weight — the CREDIBLE voice.│  + code)  │           │
//   │ piper    │ Piper (OHF-Voice/piper1-gpl). VITS→ONNX + espeak-ng.        │ GPL-3.0   │ ~20–60MB  │
//   │          │ Fastest fully-offline (real-time on a Pi 5, no GPU). The    │ (SAME as  │ per voice │
//   │          │ ultra-light option for low-end machines.                    │  Toshi)   │           │
//   └──────────┴─────────────────────────────────────────────────────────────┴───────────┴───────────┘
//
// WHY these three: all run 100% locally (no key, no cloud — on ethos), all cross-platform, all
// license-clean for a GPL-3.0 project (Apache-2.0 and MIT are GPL-compatible; piper1-gpl is literally
// GPL-3.0). We deliberately AVOID XTTS-v2 (Coqui non-commercial model license) and anything needing a
// GPU or a Python env. Sources: hf.co/hexgrad/Kokoro-82M, npm `kokoro-js`, github.com/OHF-Voice/piper1-gpl.
//
// PERSONA — Toshi is a warm, playful cat companion, so the voice should read bright + friendly, never
// deep/corporate: a small pitch + rate lift does most of the work, and short utterances (pulse lines,
// grounded one-liners) keep CPU latency snappy. Voice IDs below are the credible defaults, swappable.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The catalog, as data (also what `toshi voice --list` prints and docs/VOICE.md documents).
export const TTS_ENGINES = Object.freeze([
  { id: 'system', label: 'Web Speech API (OS voices)', license: 'OS-provided', size: '0 (in Electron)', quality: 'ok', install: 'none — works out of the box' },
  { id: 'kokoro', label: 'Kokoro-82M (kokoro-js)',     license: 'Apache-2.0',  size: '~80–330MB once',   quality: 'great', install: 'npm i kokoro-js  (downloads the ONNX model on first use)' },
  { id: 'piper',  label: 'Piper (piper1-gpl)',         license: 'GPL-3.0',     size: '~20–60MB/voice',   quality: 'good',  install: 'bundle the piper binary + a .onnx voice, or piper-wasm' },
]);

// Persona defaults — a bright, friendly companion. `voice` is a Kokoro voice id (v1.0 pack).
// NOTE: Current kokoro-js (v1.0) only ships EN/GB voices. FR falls back to a warm EN voice for now;
// when a FR voice arrives in a future kokoro-js release, just update the `fr` key below.
export const PERSONA = Object.freeze({
  rate: 1.04,          // a touch quicker than neutral = perky, not sluggish
  pitch: 1.12,         // a small lift = youthful/cute, still natural (not chipmunk)
  kokoro: { en: 'af_heart', fr: 'af_heart' },   // warm EN female · EN voice for FR (until kokoro-js ships FR)
  // Web Speech: no explicit id (we pick the best OS voice for the lang at play-time in the panel),
  // but bias toward a female/'natural'/'enhanced' voice for the same warm-companion read.
  systemHints: ['natural', 'enhanced', 'female', 'aria', 'samantha', 'zoe', 'amelie'],
});

// Resolve the ACTIVE engine. Pure + offline-testable: caller passes what's configured + what's available,
// we apply the ladder (chosen → fall DOWN kokoro→piper→system → off). Mirrors llm.mjs' free-model cascade:
// never dead-end silently, always degrade to the next working tier.
export function resolveTts({ configured = 'system', env = {}, avail = {} } = {}) {
  if ((env.TOSHI_TTS || configured) === 'off') return { engine: 'off', reason: 'disabled' };
  const want = env.TOSHI_TTS || configured || 'system';
  const can = (e) => e === 'system' ? avail.system !== false : !!avail[e]; // system assumed present in Electron
  if (can(want)) return { engine: want, reason: 'configured' };
  for (const e of ['kokoro', 'piper', 'system']) {          // graceful fall-DOWN the quality ladder
    if (e !== want && can(e)) return { engine: e, reason: `${want} unavailable → ${e}` };
  }
  return { engine: 'off', reason: 'no engine available' };
}

// The per-utterance plan the PANEL consumes. It keeps audio playback in the renderer (speechSynthesis and
// kokoro-js both run there — webgpu/wasm — so no Node→renderer audio piping). Node's job is just: which
// engine, which voice, what persona. lang is 'fr' | 'en' (from session.lastLang).
export function planUtterance(text, { lang = 'en', configured, env = {}, avail = {} } = {}) {
  const { engine, reason } = resolveTts({ configured: configured ?? persistedVoice() ?? 'system', env, avail });
  const l = lang === 'fr' ? 'fr' : 'en';
  return {
    engine, reason, text: String(text || '').slice(0, 600), lang: l,
    rate: PERSONA.rate, pitch: PERSONA.pitch,
    kokoroVoice: PERSONA.kokoro[l] || PERSONA.kokoro.en,
    systemHints: PERSONA.systemHints,
  };
}

// `toshi voice <engine>` persists the choice next to the model (~/.toshi.json {voice}). Same store as
// persistedModel() in llm.mjs, so one file holds both brain + voice.
export function persistedVoice() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.toshi.json'), 'utf8'));
    const v = cfg && cfg.voice;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch { return null; }
}

// Node-side Kokoro synth (optional — only when the renderer can't, e.g. a headless `toshi say`). Guarded:
// returns null if kokoro-js isn't installed, so the base package stays lean (opt-in download, like the
// codebase-memory brain). The renderer path (kokoro-js on webgpu) is preferred for the live popup.
export async function kokoroAvailable() {
  try { await import('kokoro-js'); return true; } catch { return false; }
}
export async function synthKokoroNode(text, { lang = 'en' } = {}) {
  let mod; try { mod = await import('kokoro-js'); } catch { return null; }
  const KokoroTTS = mod.KokoroTTS || (mod.default && mod.default.KokoroTTS);
  if (!KokoroTTS) return null;
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  const voice = PERSONA.kokoro[lang === 'fr' ? 'fr' : 'en'] || PERSONA.kokoro.en;
  const audio = await tts.generate(String(text).slice(0, 600), { voice });
  return audio; // has .toWav() / .save(path); caller decides what to do
}
