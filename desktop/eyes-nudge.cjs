'use strict';
// Toshi v2 — THE TACT: decide WHETHER + HOW to surface an ambient suggestion, without being Clippy. GPL-3.0.
// =================================================================================================
// This is the hard part of the whole differentiator: helpful, but NEVER naggy. It sits after the read
// ladder (desktop/eyes-read.cjs → a ScreenContext) and answers one question: given what Toshi just glanced
// at, should it quietly say something — or stay silent? Default is SILENCE. A bubble only surfaces when
// EVERY gate passes: ambient is opted-in, a source is being watched, the read is confident, the user isn't
// typing, there's a genuinely meaningful event (an error appeared — not per-frame narration), and the
// rate-limit / back-off budget allows it. Dismissals cost exponentially more silence. Pure + injected
// clock/state → fully testable offline (see test/eyes-nudge-smoke.cjs).

const DEFAULTS = Object.freeze({
  minConfidence: 0.6,      // a coarse local-VLM read below this = abstain (honest silence, not a guess)
  cooldownMs: 90_000,      // min gap between nudges (base — grows on dismissals)
  windowMs: 30 * 60_000,   // the ambient budget window
  maxPerWindow: 4,         // at most this many nudges per window — the anti-spam ceiling
});

const no = (reason) => ({ surface: false, reason });

// What counts as a MEANINGFUL screen event worth a quiet word. Deliberately narrow — an error on screen
// is the MVP trigger (the red-CI hero demo). Everything else stays a silent glance. Never per-frame chatter.
function meaningfulEvent(ctx = {}) {
  if (ctx.hasError) {
    const body = String(ctx.text || ctx.summary || '');
    const snippet = (body.match(/[^\n]*\b(error|exception|failed|typeerror|referenceerror|traceback|panic)\b[^\n]*/i) || [''])[0]
      .trim().slice(0, 90);
    return { reason: 'error-on-screen', pose: 'pointing',
      line: snippet ? `that looks red 👀 — ${snippet}` : 'something on screen looks red 👀',
      key: 'err:' + snippet.toLowerCase().replace(/\s+/g, ' ') };
  }
  return null; // no meaningful event → the default is silence
}

function createTact(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  // decide(ctx, state, now) → {surface:false, reason} | {surface:true, reason, pose, line, key}
  // state (caller-owned, persisted): { ambientOn, watching, userTyping, lastNudgeAt, windowStart,
  //   nudgesInWindow, dismissedStreak, lastKey }. now = ms clock (injected).
  function decide(ctx = {}, state = {}, now = 0) {
    if (!state.ambientOn) return no('ambient-off');          // opt-in only — silence is the default
    if (!state.watching) return no('not-watching');          // nothing shared to look at
    if (state.userTyping) return no('user-typing');          // NEVER interrupt typing
    if ((ctx.confidence || 0) < cfg.minConfidence) return no('low-confidence'); // abstain, don't guess
    const event = meaningfulEvent(ctx);
    if (!event) return no('no-meaningful-event');            // a silent glance is not a nudge

    // rate-limit + exponential back-off on repeated dismissals (Clippy died of ignoring this)
    const sinceLast = now - (typeof state.lastNudgeAt === 'number' ? state.lastNudgeAt : -Infinity);
    const cooldown = cfg.cooldownMs * Math.pow(2, Math.min(state.dismissedStreak || 0, 4));
    if (sinceLast < cooldown) return no('cooling-down');

    const windowOpen = state.windowStart != null && (now - state.windowStart) < cfg.windowMs;
    if (windowOpen && (state.nudgesInWindow || 0) >= cfg.maxPerWindow) return no('window-budget-spent');

    // don't repeat the exact same nudge back-to-back within a window (de-dupe the same recurring error)
    if (event.key && event.key === state.lastKey && windowOpen) return no('same-as-last');

    return { surface: true, reason: event.reason, pose: event.pose, line: event.line, key: event.key };
  }

  // Fold a surfaced nudge into the state (caller persists the result). Rolls the window when it expires.
  function applied(state = {}, decision = {}, now = 0) {
    const windowOpen = state.windowStart != null && (now - state.windowStart) < cfg.windowMs;
    return {
      ...state,
      lastNudgeAt: now,
      windowStart: windowOpen ? state.windowStart : now,
      nudgesInWindow: (windowOpen ? (state.nudgesInWindow || 0) : 0) + 1,
      lastKey: decision.key || state.lastKey || null,
      dismissedStreak: 0, // surfacing resets the streak; the caller bumps it on an actual dismiss
    };
  }

  // The user waved the bubble away → make the NEXT nudge cost exponentially more silence.
  function dismissed(state = {}) {
    return { ...state, dismissedStreak: (state.dismissedStreak || 0) + 1 };
  }
  // The user engaged (asked / clicked the offer) → we were useful; reset the back-off.
  function engaged(state = {}) {
    return { ...state, dismissedStreak: 0 };
  }

  return { decide, applied, dismissed, engaged, cfg };
}

module.exports = { createTact, meaningfulEvent, DEFAULTS };
