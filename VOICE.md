# Giving Toshi a voice — open-source, local, credible

Toshi already "speaks" as **text** (the LLM naturalizes grounded facts + chat). This is the recipe for a
real **audio** voice — one that fits the mascot (warm, playful cat companion) and Toshi's ethos: 100%
local, no cloud, no API key, cross-platform, license-clean for a GPL-3.0 project.

## The recipe — a 3-tier ladder with graceful fallback

Same idea as the free-model cascade in `lib/llm.mjs`: pick a tier; if it isn't installed, fall DOWN to
the next working one instead of going silent. Implemented in [`lib/tts.mjs`](lib/tts.mjs).

| engine | what | license | size | when |
|---|---|---|---|---|
| **system** | `window.speechSynthesis` (Web Speech API) — built into Electron/Chromium | OS-provided | 0 (in-app) | **baseline** — works instantly, zero download, everywhere. Quality = the OS voices. |
| **kokoro** | **Kokoro-82M** via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) (Transformers.js; renderer webgpu→wasm, or CPU in Node) | **Apache-2.0** | ~80–330 MB once | **the credible voice** — 54 voices / 8 langs incl. FR, punches way above 82M params. Opt-in model download. |
| **piper** | **Piper** ([OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) — VITS→ONNX + espeak-ng | **GPL-3.0** (same as Toshi) | ~20–60 MB/voice | **ultra-light** — fastest fully-offline (real-time on a Pi 5, no GPU). For low-end machines. |

**Why these three:** all run locally with no key/cloud (on ethos), all cross-platform, all GPL-compatible
(Apache-2.0 + MIT are; piper1-gpl *is* GPL-3.0). We deliberately **skip** XTTS-v2 (Coqui *non-commercial*
model license) and anything needing a GPU or a Python env — they'd break "clone → it just runs."

## Persona (the "credible for a cat companion" part)

A cute companion needs a **bright, friendly** read, never deep/corporate — and a small pitch/rate lift
does most of the work. Defaults in `lib/tts.mjs` (`PERSONA`, all swappable):
- **rate 1.04 · pitch 1.12** — perky + youthful, still natural (not chipmunk).
- **Kokoro voices:** `af_heart` (warm EN female) · `ff_siwis` (native FR female, so "quoi de neuf" isn't
  said with an English accent). Preview + swap by ear from the 54-voice v1.0 pack.
- **Web Speech:** at play-time the panel picks the best OS voice for the language, biased toward
  natural/enhanced/female voices (Samantha/Aria/Amélie…).
- **Short utterances** (pulse lines, one-line answers) keep CPU latency snappy.

## How it plugs into Toshi

Audio playback lives in the **renderer** (`panel/index.html`) — both `speechSynthesis` and `kokoro-js`
run there (webgpu/wasm), so there's no Node→renderer audio piping. Node's job (`lib/tts.mjs`) is only:
*which engine, which voice, what persona.*

1. `lib/tts.mjs` → `planUtterance(text, {lang})` returns `{engine, voiceId, rate, pitch}`.
2. In `panel/index.html`, wherever a **voiced** bubble is shown (the `voiced:true` answers + the pulse
   comments), call `speakAloud(plan)`:
   - `system` → `new SpeechSynthesisUtterance(text)` with the chosen OS voice + rate/pitch.
   - `kokoro` → `KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {device:'webgpu'})`
     then `tts.generate(text, {voice})` → play the WAV.
3. `toshi voice <off|system|kokoro|piper>` persists to `~/.toshi.json {voice}` (next to the brain model);
   a mute toggle in the panel; `toshi voice --list` prints the catalog.

**Default:** `system` (free, instant, no download) so a fresh Toshi can talk immediately; `toshi voice
kokoro` upgrades to the credible voice with a one-time model fetch (consented, like the memory brain).

## Status

- ✅ `lib/tts.mjs` — the engine ladder + persona + offline-tested resolver (`resolveTts`, 8/8).
- ⏳ Renderer wiring (`speakAloud` in the panel) + a mute button + the `toshi voice` CLI command — small,
  best done with live audio testing (a job for the local build, zero 1).

## Picking the brain model

Voice is only the second half — the *text* Toshi speaks comes from whichever LLM `lib/llm.mjs` resolves
(see [docs/providers.md](docs/providers.md) for the OpenRouter / xAI / Groq / OpenAI / custom-endpoint
matrix). The day-to-day is just:

```bash
toshi model                              # show the current brain
toshi model minimax/minimax-m3           # paid, capable, what Phil uses
toshi model --free                       # live-probe the free catalog, save the first one that answers
toshi model --list                       # print the free catalog (no save)
toshi model --clear                      # back to the provider's default
```

Sources: [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) ·
[onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) ·
[kokoro-js](https://www.npmjs.com/package/kokoro-js) · [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)
