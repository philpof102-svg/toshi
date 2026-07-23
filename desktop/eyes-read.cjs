'use strict';
// Toshi v2 — THE READ LADDER: turn a captured frame + window meta into an HONEST ScreenContext. GPL-3.0.
// =================================================================================================
// Second stage of the v2 EYES pipeline (desktop/eyes.cjs captures one frame → this reads it). It mirrors
// the fallback discipline of lib/tts.mjs and eyes.cjs: try the best AVAILABLE tier, fall DOWN when a
// backend is missing or empty, never dead-end, and ABSTAIN honestly (low confidence) rather than invent
// what it cannot read. Nothing here fabricates screen contents — an empty read stays empty.
//
// Tiers — every backend is INJECTED, so this is DECISION-AGNOSTIC: the Moondream-vs-Qwen call only
// decides which function is passed as `vlm`. The orchestration + honesty rules are settled here.
//   T0 title — the window's app + title (from the capture meta). Free, near-ground-truth for WHICH app,
//              says nothing about contents. Always available; the floor of the ladder.
//   T1 ocr   — local OCR (Tesseract/Florence). Best for on-screen TEXT: code, stack traces, forms.
//   T2 vlm   — local vision-language model. A coarse "what's on screen" summary, on-device.
//   T3 cloud — a cloud VLM. OFF by default; opt-in per call (allowCloud); screen text LEAVES the device,
//              so the result is flagged mustLabel:true — the caller MUST show "screen text sent to …".

// Cheap window-kind heuristic (title first, then any text we read). Never throws.
function classifyKind(title = '', text = '') {
  const s = (String(title) + ' \n ' + String(text)).toLowerCase();
  if (/\bvs ?code\b|\bvscodium?\b|\bvisual studio\b|\bcursor\b|\bwebstorm\b|\brider\b|\bnotepad\+\+\b|\bvim\b|\bnvim\b|\bsublime\b|\bintellij\b|\bpycharm\b|\.(js|ts|tsx|py|rs|go|java|rb|c|cpp|cs|sol)\b/.test(s)) return 'editor';
  if (/\bwindows terminal\b|\bterminal\b|\bgit bash\b|\bbash\b|\bzsh\b|\bpwsh\b|\bpowershell\b|\bwsl\b|\bubuntu\b|\bcmd\.exe\b|\biterm\b|\bconsole\b|\$\s|\bnpm (run|test|install)\b/.test(s)) return 'terminal';
  if (/\bchrome\b|\bchromium\b|\bfirefox\b|\bsafari\b|\bedge\b|\bbrave\b|\bopera\b|\bvivaldi\b|\barc\b|https?:\/\//.test(s)) return 'browser';
  if (/\bslack\b|\bdiscord\b|\bwhatsapp\b|\btelegram\b|\bteams\b|\bsignal\b|\bmessages\b/.test(s)) return 'chat';
  return 'other';
}

// Detect a likely error/failure on screen (drives the ambient "that looks red" nudge — cheap, text-only).
function looksLikeError(text = '') {
  return /\b(error|exception|failed|fail\b|traceback|typeerror|referenceerror|panic|✗|❌)\b/i.test(String(text));
}

function createReader({ ocr = null, vlm = null, cloud = null } = {}) {
  const has = (fn) => typeof fn === 'function';

  // Run a tier, swallowing any backend error into a clean "no result" so the ladder falls through
  // instead of throwing. A backend that dies must never crash the read — it just isn't available.
  async function tryTier(fn, ...args) {
    if (!has(fn)) return null;
    try { const r = await fn(...args); return (typeof r === 'string' ? r.trim() : r) || null; }
    catch { return null; }
  }

  // frame = { png?, app?, title? } (png optional — a title-only read is valid). want: 'text' | 'summary' | 'app'.
  async function read(frame = {}, { want = 'text', allowCloud = false, modelName = 'the cloud model' } = {}) {
    const app = String(frame.app || '').trim();
    const title = String(frame.title || '').trim();
    const meta = (app + ' ' + title).trim(); // classify from BOTH the app name and the window title
    const ctx = {
      app, title, kind: classifyKind(meta), text: '', summary: '',
      source: 'title', confidence: app || title ? 0.35 : 0.1, // title alone: we know the app, not the contents
      hasError: false, mustLabel: false, label: null,
    };

    // T0 already captured above. If the caller only wants the app/title, stop here (cheapest, honest).
    if (want === 'app' || !frame.png) { ctx.kind = classifyKind(meta); return ctx; }

    // T1 OCR — the preferred content read (text is exact + local).
    let text = await tryTier(ocr, frame.png);
    if (text) {
      ctx.text = text.slice(0, 4000);
      ctx.source = 'ocr'; ctx.confidence = 0.7;
    } else {
      // T2 local VLM — coarse summary when there's no crisp text (or OCR unavailable/failed).
      const sum = await tryTier(vlm, frame.png, 'Briefly describe what is on this screen. Do not guess.');
      if (sum) { ctx.summary = sum.slice(0, 1000); ctx.source = 'vlm'; ctx.confidence = 0.6; }
      else if (allowCloud) {
        // T3 cloud — opt-in only; screen text leaves the device → NEVER hide it.
        const csum = await tryTier(cloud, frame.png, 'Briefly describe what is on this screen. Do not guess.');
        if (csum) {
          ctx.summary = csum.slice(0, 1000); ctx.source = 'cloud'; ctx.confidence = 0.6;
          ctx.mustLabel = true; ctx.label = `screen text sent to ${modelName}`;
        }
      }
    }

    // Re-classify with whatever we actually read; flag a probable on-screen error for the ambient nudge.
    const body = ctx.text || ctx.summary;
    ctx.kind = classifyKind(meta, body);
    ctx.hasError = looksLikeError(body);
    // Honest abstention: read nothing but a title → stays low-confidence, contents empty. Caller must
    // treat low confidence as "I can't really see the contents", not as a fact.
    return ctx;
  }

  return { read };
}

module.exports = { createReader, classifyKind, looksLikeError };
