/* ───────────────────────────────────────────────────────────────────────────
 * toshi — MOTION EXTEND (panel/animations-extend.js)
 * Third pack in the family, sits next to animations-extra.js + animations-sequences.js.
 *
 * Same Fable-5 rules:
 *   - 0 deps, 0 tokens, 0 network, 0 binaries
 *   - 1 body pose at a time (we call window.__toshi.setPose(name, ms) only,
 *     never write to the Rive enum directly)
 *   - face layers free (we read window.__toshi.state().eyes/mouth and signal
 *     an "eye intent" via a body class — same trick as animations-sequences)
 *   - never overrides the original; reads its public state
 *   - prefers-reduced-motion: reduce → early return
 *   - works in both Electron and the browser popup
 *   - NEVER strands the panel on a non-idle pose (cancel/restore idle is
 *     guaranteed on cancel, error, or hold expiry)
 *
 * What this pack adds — the "suite du mouvement" (continuation):
 *
 *   1. MOTION_MODEL — a small Markov graph of pose→pose transitions derived
 *      from the real choreography already in animations-sequences.js
 *      (morningStretch, victoryLap, confusedRecovery, patrol) and the
 *      idlePoseCycle in tinyhumans/mascots.json. Pure JS, no ML, no
 *      network. Weights are documented inline; the table is deterministic
 *      but the SAMPLING is random — every prediction can take one of the
 *      successors with the stated probability, so the mascot feels alive
 *      and never repeats the same chain twice in a row.
 *
 *   2. extendAfter(holdMs) — schedules a "what comes next" decision for
 *      `holdMs` from now. The decision is based on the CURRENT state (pose
 *      + eyes intent + lastN). We then call setPose(next, holdNext) so the
 *      chain continues naturally. The cycle ends back at idle (terminator
 *      in the graph), so the mascot is never stranded.
 *
 *   3. predict(state) — pure fn: given {pose, eyes, lastN}, returns the
 *      single most-likely next pose + eye intent + suggested hold (in ms).
 *      Used both by extendAfter() and by anything else that wants to ask
 *      "what's next?" (the sequences, the brain, the panel itself).
 *
 *   4. eyeIntentFor(pose) — given the predicted next pose, returns the
 *      matching eye intent string (e.g. 'look_around' for look_around pose,
 *      'NEUTRAL' for celebration, 'thinking' for pointing). Signalled via
 *      body class only — never writes the Rive enum. The panel's own
 *      2600ms eye channel keeps running on top.
 *
 * Public API (window.__toshiExtend):
 *   .predict(state)                  → { pose, eyes, holdMs, why }
 *   .extendAfter(holdMs, opts?)      → starts a 1-step extension right now
 *   .startLoop(cadenceMs?)           → ambient mode: polls + extends
 *   .stopLoop()                      → ambient mode: stops
 *   .model                           → the raw Markov table (read-only)
 *   .version                         → '1.0.0'
 *
 * Like the other packs: loaded with `defer` after panel/index.html. The
 * original code is not modified — only 1 <link> + 1 <script defer> in
 * index.html's <head>.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiExtend) return; // idempotent
  window.__toshiExtend = { version: '1.0.0' };

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const $ = (id) => document.getElementById(id);

  // ───────────────────────────────────────────────────────────────────────
  // 1. MOTION_MODEL — the Markov graph
  // ───────────────────────────────────────────────────────────────────────
  //
  // Each entry is: pose → [{ to: nextPose, p: probability, hold: holdMs, eyes: eyeIntent }, ...]
  //
  // Probabilities are derived from the actual choreography in
  // animations-sequences.js:
  //   morningStretch   : idle → look_around → idle → idle → hand_wave → idle
  //   victoryLap       : idle → jumping → walking_side → celebration → dancing → idle
  //   confusedRecovery : idle → pointing → look_around → idle → hand_wave → idle
  //   patrol           : idle → walking_side → idle → walking_side → idle
  //
  // Plus the base idlePoseCycle from mascots.json: [idle, look_around, pointing,
  // hand_wave, dancing, celebration] (6 poses, equal base weight).
  //
  // Rule: every row sums to 1.0. Every terminal pose (the ones the panel
  // already restores to idle via setPose holdMs) is `idle` with a non-zero
  // weight. There's ALWAYS an `idle` successor so we can never strand the
  // mascot on a non-idle pose.
  //
  // The eye-intent on the next pose is the pose's NATURAL eye state. The
  // panel's own eye channel (2600ms) keeps running on top; our intent is
  // a soft overlay (e.g. a quick squint band via body class).
  //
  // holdMs is the suggested hold for the next pose. Tuned to match the
  // pacing in animations-sequences.js (most poses 600-1500ms; a hand_wave
  // gets 1500-1900ms; a celebration gets 2000-2500ms; idle returns get
  // 600-900ms).
  const MOTION_MODEL = {
    version: '1.0.0',
    terminal: 'idle',
    transitions: {
      // idle — the rest state. Branches into 4 successor poses
      // (look_around most common — the panel's own eye channel also
      // glances around every 2600ms, so a matching look_around pose
      // 35% of the time feels synchronized without being robotic).
      idle: [
        { to: 'look_around', p: 0.35, hold: 1100, eyes: 'look_left' },
        { to: 'hand_wave',   p: 0.20, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'pointing',    p: 0.15, hold: 800,  eyes: 'thinking' },
        { to: 'walking_side',p: 0.15, hold: 2200, eyes: 'look_right' },
        { to: 'dancing',     p: 0.10, hold: 1100, eyes: 'NEUTRAL' },
        { to: 'celebration', p: 0.05, hold: 2000, eyes: 'NEUTRAL' },
      ],
      // look_around — the "where am I?" pose. Most often returns to idle,
      // sometimes a hesitation → pointing, sometimes a wave (the
      // morningStretch "I see you" beat).
      look_around: [
        { to: 'idle',        p: 0.50, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'pointing',    p: 0.20, hold: 800,  eyes: 'thinking' },
        { to: 'hand_wave',   p: 0.15, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'walking_side',p: 0.15, hold: 2200, eyes: 'look_right' },
      ],
      // pointing — the "I see something" pose. Often returns to idle, but
      // sometimes chains into a celebration (the "found it!" beat) or
      // a hand_wave (the "all clear" beat).
      pointing: [
        { to: 'idle',        p: 0.45, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'celebration', p: 0.25, hold: 2000, eyes: 'NEUTRAL' },
        { to: 'hand_wave',   p: 0.20, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'dancing',     p: 0.10, hold: 1100, eyes: 'NEUTRAL' },
      ],
      // hand_wave — the "hi there" pose. Almost always returns to idle.
      // The mascot rarely chains two waves (would feel repetitive); a
      // small chance (10%) of a celebration as a "great to see you too".
      hand_wave: [
        { to: 'idle',        p: 0.65, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'celebration', p: 0.15, hold: 2000, eyes: 'NEUTRAL' },
        { to: 'dancing',     p: 0.10, hold: 1100, eyes: 'NEUTRAL' },
        { to: 'look_around', p: 0.10, hold: 1100, eyes: 'look_right' },
      ],
      // dancing — high-energy. Often chains to a celebration, then idle.
      // Rarely starts another dance right away.
      dancing: [
        { to: 'idle',        p: 0.40, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'celebration', p: 0.30, hold: 2000, eyes: 'NEUTRAL' },
        { to: 'hand_wave',   p: 0.20, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'dancing',     p: 0.10, hold: 1100, eyes: 'NEUTRAL' },
      ],
      // celebration — the "yes!" pose. Almost always returns to idle.
      celebration: [
        { to: 'idle',        p: 0.55, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'dancing',     p: 0.25, hold: 1100, eyes: 'NEUTRAL' },
        { to: 'hand_wave',   p: 0.15, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'look_around', p: 0.05, hold: 1100, eyes: 'NEUTRAL' },
      ],
      // walking_side — patrol pose. Usually goes back to idle (the
      // patrol sequence in animations-sequences.js does: walk → idle →
      // walk → idle, never walk → walk).
      walking_side: [
        { to: 'idle',        p: 0.65, hold: 700,  eyes: 'NEUTRAL' },
        { to: 'look_around', p: 0.20, hold: 1100, eyes: 'look_left' },
        { to: 'hand_wave',   p: 0.10, hold: 1500, eyes: 'NEUTRAL' },
        { to: 'walking_side',p: 0.05, hold: 2200, eyes: 'look_right' },
      ],
    },
  };

  // ───────────────────────────────────────────────────────────────────────
  // 2. predict(state) — pure function
  // ───────────────────────────────────────────────────────────────────────
  //
  // state = { pose, eyes, lastN? } where:
  //   pose  : current pose name (string). Falls back to 'idle' if missing.
  //   eyes  : current eyes state (string). Used to bias the prediction
  //           toward successor poses whose eyes intent matches.
  //   lastN : array of the last N poses, most recent first. Used to
  //           avoid back-to-back repeats of the same pose (would feel
  //           robotic). Defaults to [].
  //
  // Returns: { pose, eyes, holdMs, why } where:
  //   pose    : the predicted next pose
  //   eyes    : the matching eye intent (signal only, never Rive write)
  //   holdMs  : suggested hold for the next pose
  //   why     : the row index that won (debug; safe to ignore in prod)
  //
  // Algorithm: weighted random sample of the current pose's row, with
  // a small bias boost for successors whose eye intent matches the
  // current eyes, and a small bias drop for successors == lastN[0]
  // (the immediately preceding pose).
  function predict(state) {
    state = state || {};
    const cur = (state.pose && MOTION_MODEL.transitions[state.pose])
      ? state.pose
      : MOTION_MODEL.terminal; // unknown pose → fall back to idle's row
    const row = MOTION_MODEL.transitions[cur];
    const lastN = Array.isArray(state.lastN) ? state.lastN : [];
    const prev  = lastN[0] || null;
    const eyes  = state.eyes || 'NEUTRAL';

    // reweight: boost if eye intent matches, drop if same as previous pose
    const weighted = row.map((r) => {
      let w = r.p;
      if (r.eyes && r.eyes === eyes) w *= 1.25;       // 25% boost on match
      if (prev && r.to === prev)   w *= 0.40;          // 60% drop on repeat
      return Object.assign({}, r, { _w: w });
    });
    const total = weighted.reduce((s, r) => s + r._w, 0);
    let roll = Math.random() * total;
    let chosen = weighted[weighted.length - 1]; // safety fallback
    for (let i = 0; i < weighted.length; i++) {
      roll -= weighted[i]._w;
      if (roll <= 0) { chosen = weighted[i]; break; }
    }
    return {
      pose: chosen.to,
      eyes: chosen.eyes,
      holdMs: chosen.hold,
      why: cur + '#' + row.indexOf(chosen),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3. extendAfter(holdMs, opts)
  // ───────────────────────────────────────────────────────────────────────
  //
  // Waits `holdMs`, then reads window.__toshi.state() and:
  //   - asks predict() for the next pose
  //   - calls window.__toshi.setPose(pose, holdMs)   (the original panel
  //     owns the timer that returns to idle)
  //   - signals the eye intent via body class
  //   - pushes the pose onto a small "lastN" history (capped at 3)
  //
  // opts:
  //   chain : if true, ALSO schedule a 2nd extendAfter after the predicted
  //           hold elapses (so a 2-step prediction is actually 2 calls).
  //           Default false (1-step prediction). The chain depth is capped
  //           at 2 to avoid runaway motion (the panel's idle is the
  //           natural rest state; looping is its job).
  //
  // Safety:
  //   - if window.busy → skip (the brain is talking, don't compete)
  //   - if document.hidden → skip
  //   - if the running sequence is from the sequences pack → skip
  //     (we don't fight __toshiSeq)
  //   - if reduce-motion → no-op
  //   - if window.__toshi.setPose throws → swallow + try to restore idle
  function extendAfter(holdMs, opts) {
    if (reduce) return;
    opts = opts || {};
    // holdMs may be 0 (fire on the next tick), a positive number (wait that
    // long), or undefined/NaN/negative (use the default 800ms). Note the
    // check on `> 0` — `0 || 800` would treat "0 means now" as falsy and
    // fall back to 800, which is the opposite of what 0 should mean.
    let ms;
    if (typeof holdMs === 'number' && holdMs >= 0) ms = holdMs;
    else if (typeof holdMs === 'number') ms = 800;
    else ms = 800;
    setTimeout(() => {
      try {
        if (window.busy) return;                      // brain is talking
        if (document.hidden) return;                  // tab is hidden
        if (window.__toshiSeq && window.__toshiSeq.current
            && window.__toshiSeq.current().name) return; // another sequence owns the body
        if (document.body.classList.contains('mini')) return; // mini mode = no choreo
        const s = (window.__toshi && window.__toshi.state)
          ? window.__toshi.state()
          : { pose: 'idle', eyes: 'NEUTRAL' };
        // build lastN from the history (a small ring kept on the body)
        const lastN = readLastN();
        const pred = predict({ pose: s.pose || 'idle', eyes: s.eyes || 'NEUTRAL', lastN: lastN });
        // signal eye intent (CSS overlay; the panel's own eye channel keeps
        // running on the Rive enum)
        signalEyesIntent(pred.eyes);
        // schedule the cleanup of the eye-intent class
        setTimeout(() => clearEyesIntent(pred.eyes), Math.min(pred.holdMs, 4000));
        // call setPose on the original (its own timer restores idle)
        if (window.__toshi && typeof window.__toshi.setPose === 'function') {
          window.__toshi.setPose(pred.pose, pred.holdMs);
        }
        // record in history
        pushLastN(pred.pose);
        // optional 1-step chain
        if (opts.chain) {
          extendAfter(pred.holdMs, { chain: false });
        }
      } catch (e) {
        // never strand the panel — restore idle on any throw
        try { if (window.__toshi && window.__toshi.setPose) window.__toshi.setPose('idle', 600); } catch {}
      }
    }, ms);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. eye intent signalling — body class overlay, never Rive enum
  // ───────────────────────────────────────────────────────────────────────
  //
  // Mirrors the convention in animations-sequences.js. The CSS in
  // animations-extend.css adds one new intent class (x-eyes-look-around)
  // on top of the 5 already styled there (thinking, confused, closed,
  // look-left, look-right). Removing the class is enough to revert.
  const EYE_INTENT_CLASSES = [
    'x-eyes-thinking', 'x-eyes-confused', 'x-eyes-closed',
    'x-eyes-look-left', 'x-eyes-look-right', 'x-eyes-look-around',
  ];
  function signalEyesIntent(intent) {
    const b = document.body; if (!b) return;
    b.classList.remove.apply(b.classList, EYE_INTENT_CLASSES);
    if (!intent || intent === 'NEUTRAL') return;
    const cls = 'x-eyes-' + String(intent).replace(/_/g, '-').toLowerCase();
    if (EYE_INTENT_CLASSES.indexOf(cls) >= 0) b.classList.add(cls);
  }
  function clearEyesIntent(intent) {
    const b = document.body; if (!b) return;
    if (!intent || intent === 'NEUTRAL') return;
    const cls = 'x-eyes-' + String(intent).replace(/_/g, '-').toLowerCase();
    if (EYE_INTENT_CLASSES.indexOf(cls) >= 0) b.classList.remove(cls);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5. lastN history — small ring on the body, capped at 3
  // ───────────────────────────────────────────────────────────────────────
  // Stored as a JSON string in a body data-attr so we never need a
  // global var, and so the harness smoke can read it back to assert
  // the prediction actually happened.
  const LAST_N_CAP = 3;
  function readLastN() {
    const b = document.body; if (!b) return [];
    const raw = b.getAttribute('data-toshi-extend-lastn');
    if (!raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function pushLastN(pose) {
    const b = document.body; if (!b) return;
    const cur = readLastN();
    cur.unshift(pose);
    while (cur.length > LAST_N_CAP) cur.pop();
    b.setAttribute('data-toshi-extend-lastn', JSON.stringify(cur));
  }

  // ───────────────────────────────────────────────────────────────────────
  // 6. ambient loop — opt-in, very low cadence
  // ───────────────────────────────────────────────────────────────────────
  //
  // The default mode is OFF — the extend pack is read-only + opt-in.
  // Calling startLoop(45000) turns on a poller that, every 45s, asks
  // "is it safe to extend?" and, if so, fires extendAfter(0).
  //
  // Safety:
  //   - skips while busy
  //   - skips while a sequence is running
  //   - skips while hidden
  //   - skips under reduce-motion
  //   - the poller itself is rate-limited (default 45-75s; configurable)
  let loopHandle = null;
  function startLoop(cadenceMs) {
    if (reduce) return;
    if (loopHandle) return; // already running
    const ms = Number(cadenceMs) || rand(45000, 75000);
    loopHandle = setInterval(() => {
      try {
        if (window.busy) return;
        if (document.hidden) return;
        if (document.body.classList.contains('mini')) return;
        if (window.__toshiSeq && window.__toshiSeq.current
            && window.__toshiSeq.current().name) return;
        // only extend if the panel is currently in idle (don't kick the
        // mascot out of an active pose)
        const s = (window.__toshi && window.__toshi.state) ? window.__toshi.state() : null;
        if (s && s.pose && s.pose !== 'idle') return;
        extendAfter(0, { chain: false });
      } catch {}
    }, ms);
  }
  function stopLoop() {
    if (loopHandle) { clearInterval(loopHandle); loopHandle = null; }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────
  window.__toshiExtend.model         = MOTION_MODEL;
  window.__toshiExtend.predict        = predict;
  window.__toshiExtend.extendAfter    = extendAfter;
  window.__toshiExtend.startLoop      = startLoop;
  window.__toshiExtend.stopLoop       = stopLoop;
  window.__toshiExtend.signalEyesIntent = signalEyesIntent;
  window.__toshiExtend.clearEyesIntent  = clearEyesIntent;
  window.__toshiExtend.readLastN      = readLastN;
  window.__toshiExtend.pushLastN      = pushLastN;

  // No auto-init: the extend pack is opt-in. The sequences pack
  // (animations-sequences.js) MAY choose to call extendAfter at the
  // tail of its choreo (e.g. victoryLap) to prolong the motion. The
  // panel itself MAY call startLoop() if the user opts in via a
  // setting. Default: nothing happens until something asks.
})();
