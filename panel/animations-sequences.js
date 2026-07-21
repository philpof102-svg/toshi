/* ───────────────────────────────────────────────────────────────────────────
 * toshi — SEQUENCES (panel/animations-sequences.js)
 * Sits next to panel/animations-extra.js (same conventions). This is the
 * "marche du dessus" pack: longer, choreographed animations that chain several
 * body poses over time, instead of a one-shot flourish.
 *
 * Strictly additive. Same Fable-5 rules as the extra pack:
 *   - 1 body pose at a time (we call window.__toshi.setPose(name, ms) only)
 *   - face layers free (eyes/bouche via setEnum, on the Rive enums the
 *     original panel owns — we wait for them via whenReady())
 *   - never overrides the original; reads its public state
 *   - prefers-reduced-motion: reduce → early return, no keyframes (CSS too)
 *   - fits in the popup window (50% of the height is the bubble)
 *   - zero deps, zero tokens, zero network
 *   - exposes window.__toshiSeq.{name}() and a currentSeq registry
 *
 * 5 sequences, each cancellable, only one running at a time:
 *   1. morningStretch (~6s)   — yawn → look_around → breathDeep → hand_wave → idle
 *   2. victoryLap    (~5s)    — jumping → running_side → celebration+sparkle → dancing → idle
 *   3. focusMode     (loop)   — eyes=thinking + breathDeep + micro-tilt, while busy
 *   4. confusedRecovery(~3.5s)— eyes=confused → pointing → look_around → NEUTRAL + hand_wave
 *   5. patrol        (~8s)    — walking_side L→R with gaze follow → idle (ambient, rare)
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiSeq) return; // idempotent
  window.__toshiSeq = { version: '1.0.0' };

  const $  = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

  // ── re-use the extras' transient helper (same contract: reflow + class +
  // timeout-or-animationend cleanup). Re-defined here so this file stays
  // self-contained (the extra may not have loaded yet on first paint).
  function transient(el, cls, ms) {
    if (!el || reduce) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const t = setTimeout(() => el.classList.remove(cls), ms || 600);
    el.addEventListener('animationend', function once(ev) {
      if (ev.animationName && el.classList.contains(cls) === false) {
        clearTimeout(t);
        el.removeEventListener('animationend', once);
      }
    });
  }
  // wrap window.__toshi.setPose with a guard: if it throws or the panel hasn't
  // exposed __toshi yet, fall back to whenReady() (the same retry trick the
  // extras use). All runners MUST go through this — never call setPose raw,
  // because a throw there would strand the panel on a non-idle pose.
  function safeSetPose(name, ms) {
    try {
      if (window.__toshi && typeof window.__toshi.setPose === 'function') {
        return window.__toshi.setPose(name, ms);
      }
    } catch (e) { /* fall through to whenReady */ }
    whenReady(() => { try { window.__toshi.setPose(name, ms); } catch {} });
  }
  // wait until bootRive() exposed its enums (same trick as animations-extra.js)
  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    const w = window.__toshi;
    if (w && w.state && w.state() && w.state().pose) { cb(); return; }
    if (attempts > 40) return; // ~2s budget; we just skip the Rive bits
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }
  // We never write the Rive eyes/mouth enums directly — the panel owns them
  // in its closure (bootRive → vmi.enum('eyes')) and exposes them only via
  // the read-only window.__toshi.state(). Instead, we signal an "eye intent"
  // with a class on <body> that the CSS layer can style. The panel's own
  // 2600ms eye-channel will still glance around; our class is a layer on top
  // (squint band, brow furrow, etc.) and never fights the enum. The classes
  // are removed when the sequence ends. Net: 0 lines touched in index.html.
  function signalEyes(intent) {
    const b = document.body; if (!b) return;
    b.classList.remove('x-eyes-thinking', 'x-eyes-confused', 'x-eyes-closed',
                       'x-eyes-look-left', 'x-eyes-look-right');
    if (intent && intent !== 'NEUTRAL') b.classList.add('x-eyes-' + String(intent).replace(/_/g, '-').toLowerCase());
  }
  function clearEyes() { signalEyes(null); }

  // ── REGISTRY ───────────────────────────────────────────────────────────
  // Only one sequence at a time. We track timers + the cancel fn, and
  // restore idle on cancel/end so the panel never gets stuck.
  const SEQ = {
    name: null,        // 'morningStretch' | 'victoryLap' | ...
    timers: [],        // {id, kind:'timeout'|'interval'} we own
    unsafeTimers: [],  // raw setTimeout ids from tSetSafe() — also cleared on cancel
    cancel: null,      // fn returned by the sequence
    heldBusy: false,   // did WE set window.busy=true at start?
    startedAt: 0,
  };
  function clearAllTimers() {
    SEQ.timers.forEach((t) => { try { t.kind === 'interval' ? clearInterval(t.id) : clearTimeout(t.id); } catch {} });
    SEQ.timers = [];
    SEQ.unsafeTimers.forEach((id) => { try { clearTimeout(id); } catch {} });
    SEQ.unsafeTimers = [];
  }
  // Schedule a timer that we OWN (auto-cleaned on cancel). Returns the id.
  function tSet(fn, ms) {
    const id = setTimeout(() => {
      // remove this id from the list once it fires (keeps cancel cheap)
      const i = SEQ.timers.findIndex((t) => t.id === id); if (i >= 0) SEQ.timers.splice(i, 1);
      try { fn(); } catch {}
    }, ms);
    SEQ.timers.push({ id, kind: 'timeout' });
    return id;
  }
  // Track an externally-created timer (e.g. setInterval in a runner) so
  // cancelSeq() can clean it up too. Returns the id (same shape as setInterval).
  function tInterval(fn, ms) {
    const id = setInterval(() => { try { fn(); } catch {} }, ms);
    SEQ.timers.push({ id, kind: 'interval' });
    return id;
  }
  // Cancel the running sequence (if any). Always safe to call.
  function cancelSeq(reason) {
    if (!SEQ.name) return;
    try { if (SEQ.cancel) SEQ.cancel(); } catch {}
    clearAllTimers();
    // the cancel fn already restores pose/eyes in most cases; belt + suspenders:
    try { window.__toshi && window.__toshi.setPose && window.__toshi.setPose('idle', 600); } catch {}
    if (SEQ.heldBusy) { try { window.busy = false; } catch {} }
    SEQ.name = null; SEQ.cancel = null; SEQ.heldBusy = false; SEQ.startedAt = 0;
    if (reason) { /* hook point for logging */ }
  }
  // Start a sequence. `runner(ctx)` returns cancel(). The runner is free to
  // call ctx.tSet() to register its own timers, ctx.holdBusy() to grab
  // window.busy, ctx.end() to mark a clean end (or just let cancelSeq run).
  function startSeq(name, runner, opts) {
    opts = opts || {};
    cancelSeq('superseded by ' + name);
    SEQ.name = name;
    SEQ.timers = [];
    SEQ.heldBusy = false;
    SEQ.startedAt = Date.now();
    if (reduce) { // skip entirely under reduced-motion — never even register
      SEQ.name = null; return null;
    }
    const ctx = {
      tSet, tInterval, transient, safeSetPose, signalEyes, clearEyes, rand, pick,
      // grab the busy flag (only one place sets it; we release on cancel)
      holdBusy() {
        if (window.busy) { SEQ.heldBusy = false; return false; } // already busy (brain is talking)
        try { window.busy = true; SEQ.heldBusy = true; return true; }
        catch { return false; }
      },
      // release busy (only if we held it)
      releaseBusy() { if (SEQ.heldBusy) { try { window.busy = false; } catch {} SEQ.heldBusy = false; } },
      // mark a clean end (still goes through cancelSeq, but with a reason)
      end() { cancelSeq('end of ' + name); },
    };
    try {
      SEQ.cancel = runner(ctx) || null;
    } catch (e) {
      // a bug in the runner should never strand the panel
      cancelSeq('runner threw: ' + (e && e.message));
    }
    return SEQ.cancel;
  }

  // ── 1. MORNING STRETCH (~6s) ───────────────────────────────────────────
  // Auto-fires on the very first Rive boot. Choreography:
  //   0.0s : setPose('look_around') + eyes=confused (a "waking up" beat)
  //   0.7s : setPose('idle') + transient .x-yawn-settle (CSS keyframe; same
  //          family as the extras' yawn, but a touch livelier) + eyes=closed
  //   2.2s : transient .x-breath (slows the float) + eyes=NEUTRAL
  //   3.4s : setPose('hand_wave', 1500)
  //   5.0s : setPose('idle', 600)
  function morningStretchRunner(ctx) {
    const f = $('floaty');
    ctx.safeSetPose('look_around', 1200);
    ctx.signalEyes('confused');
    ctx.tSet(() => {
      if (f) ctx.transient(f, 'x-yawn-settle', 1600);
      ctx.signalEyes('closed');
      ctx.safeSetPose('idle', 2000); // hold idle while the CSS settle plays
    }, 700);
    ctx.tSet(() => {
      // breath deep: reuse the extra's hook (adds .x-breath for 6s) by
      // adding the class directly — same CSS, no new keyframe needed.
      const stage = document.querySelector('.stage');
      if (stage) {
        stage.classList.add('x-breath');
        // remove via ctx.tSet so cancelSeq cleans it up; we shrink the hold
        // from 6s to 3s because the morning-stretch total is 5s and we
        // want the breath to fade out before the hand_wave
        ctx.tSet(() => stage.classList.remove('x-breath'), 3000);
      }
      ctx.signalEyes('NEUTRAL');
    }, 2200);
    ctx.tSet(() => { ctx.safeSetPose('hand_wave', 1500); }, 3400);
    ctx.tSet(() => { ctx.end(); }, 5000);
    return () => { /* cancelSeq already restores idle + clears timers */ };
  }

  // ── 2. VICTORY LAP (~5s) ──────────────────────────────────────────────
  // Triggered by submitQ() when j.grounded. Variant of celebrate() that
  // chains jumping → running_side → celebration+sparkle → dancing → idle.
  // The sparkle fires only on the celebration beat (poseUsesObject() returns
  // false for 'celebration' in the original — see panel/index.html line 215).
  function victoryLapRunner(ctx) {
    ctx.holdBusy(); // ground everything else while we play
    ctx.safeSetPose('jumping', 900);
    ctx.tSet(() => ctx.safeSetPose('walking_side', 1100), 900);
    ctx.tSet(() => ctx.safeSetPose('celebration', 1400), 2000);
    ctx.tSet(() => {
      // sparkle() lives on the panel's IIFE, not on __toshi. We reach it
      // the same way the panel does: trigger the .stage .spark via a tiny
      // synthetic .react/.nope sibling — actually the cleanest is to fire
      // a custom event the panel COULD listen to, but the panel doesn't.
      // So we replicate the .spark spawn locally (≤10 nodes, 950ms lifetime).
      spawnSparkBurst(12);
    }, 2200);
    ctx.tSet(() => ctx.safeSetPose('dancing', 1100), 3400);
    ctx.tSet(() => ctx.end(), 4800);
    return () => { ctx.releaseBusy(); };
  }
  // minimal local spark burst — mirrors panel/index.html sparkle() but with
  // an explicit { force: true } so the noBurst rule never blocks the
  // celebration beat. 10–12 amber motes, radial 40–100px, 900ms.
  function spawnSparkBurst(n) {
    if (reduce) return;
    const st = document.querySelector('.stage'); if (!st) return;
    const count = n || 10;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div'); s.className = 'spark';
      const a = Math.random() * 6.28, r = 40 + Math.random() * 60;
      s.style.left = '50%'; s.style.top = '42%';
      s.style.setProperty('--dx', Math.cos(a) * r + 'px');
      s.style.setProperty('--dy', Math.sin(a) * r + 'px');
      st.appendChild(s);
      requestAnimationFrame(() => s.classList.add('go'));
      setTimeout(() => s.remove(), 950);
    }
  }

  // ── 3. FOCUS MODE (loop while busy) ───────────────────────────────────
  // We do NOT call holdBusy() here — the brain is what should hold busy.
  // Instead, startFocus() / stopFocus() are called from submitQ around the
  // fetch. The loop itself: eyes=thinking, breath class, micro-tilt every
  // 1.6s. Stops cleanly on stopFocus().
  function focusRunner(ctx) {
    // initial pose + breath
    ctx.safeSetPose('idle', 600);
    ctx.signalEyes('thinking');
    const stage = document.querySelector('.stage');
    if (stage) { stage.classList.add('x-breath'); }
    // micro-tilt cycle (a gentle ±1° settle) — like the extras' tilt but
    // softer, since we're already in a focused state
    const tick = () => {
      const f = $('floaty');
      if (f) ctx.transient(f, 'x-focus-tilt', 1600);
    };
    tick();
    // chain the next tilt via tSet so it lives in the registry (auto-cleaned on cancel)
    const scheduleNextTilt = () => ctx.tSet(() => { tick(); scheduleNextTilt(); }, 1700);
    scheduleNextTilt();
    // re-signal thinking intent every 1.4s in case something else removes it
    ctx.tInterval(() => { try { ctx.signalEyes('thinking'); } catch {} }, 1400);
    return () => { // explicit cancel path
      const s = document.querySelector('.stage');
      if (s) s.classList.remove('x-breath');
      ctx.clearEyes();
    };
  }
  function startFocus() {
    if (reduce) return;
    startSeq('focusMode', focusRunner, {});
  }
  function stopFocus() {
    if (SEQ.name === 'focusMode') cancelSeq('brain answered');
  }

  // ── 4. CONFUSED RECOVERY (~3.5s) ─────────────────────────────────────
  // Triggered by submitQ() in the catch path (brain down / no answer).
  // Choreography: eyes=confused → pointing (hesitant, 700ms) → look_around
  // → eyes=NEUTRAL + hand_wave (a small "I'm ok though" wave).
  function confusedRunner(ctx) {
    ctx.holdBusy();
    ctx.signalEyes('confused');
    ctx.safeSetPose('pointing', 800);
    // gentle head-shake on .floaty for the "pointing hésitant" beat
    const f = $('floaty'); if (f) ctx.transient(f, 'x-confused-shake', 700);
    ctx.tSet(() => ctx.safeSetPose('look_around', 900), 900);
    ctx.tSet(() => {
      ctx.clearEyes();
      ctx.safeSetPose('hand_wave', 1300);
    }, 1900);
    ctx.tSet(() => ctx.end(), 3300);
    return () => { ctx.releaseBusy(); };
  }

  // ── 5. PATROL (~8s, ambient rare) ─────────────────────────────────────
  // Walking_side from left to right with gaze that follows. Returns to
  // idle center. Triggered by the ambient poller we install below. We
  // do NOT touch the panel's startLife() — we just add a 3rd poll loop
  // at a much lower frequency (every 45–75s) so the user sees a patrol
  // maybe twice a minute while idle.
  function patrolRunner(ctx) {
    // simulate a left→right walk by chaining walking_side → idle → walking_side
    // (the Rive enum doesn't have a direction flag, so we use the same pose
    // twice with a brief idle in between to break the "loop forever" feel).
    // The "gaze follows" beat is just a small head tilt pulse on the floaty.
    ctx.safeSetPose('walking_side', 2200);
    const f = $('floaty');
    if (f) ctx.transient(f, 'x-patrol-tilt', 2200);
    // a pair of eye glances mid-walk, to feel like Toshi is looking around
    ctx.tSet(() => ctx.signalEyes('look_left'),  400);
    ctx.tSet(() => ctx.signalEyes('look_right'), 1400);
    ctx.tSet(() => ctx.clearEyes(),              2200);
    ctx.tSet(() => {
      // half a beat of idle before the second lap (the Rive pose reset)
      ctx.safeSetPose('idle', 600);
    }, 4200);
    ctx.tSet(() => {
      ctx.safeSetPose('walking_side', 2200);
      if (f) ctx.transient(f, 'x-patrol-tilt', 2200);
    }, 4800);
    ctx.tSet(() => {
      ctx.safeSetPose('idle', 600);
      ctx.end();
    }, 7200);
    return () => { /* cancelSeq already restores */ };
  }
  function maybePatrol() {
    if (reduce) return;
    if (SEQ.name) return;                 // another sequence is playing
    if (window.busy) return;              // the brain is talking
    if (document.hidden) return;
    if (document.body.classList.contains('mini')) return; // mini = no choreo
    const s = window.__toshi && window.__toshi.state && window.__toshi.state();
    if (!s || s.pose !== 'idle') return;  // only from idle
    startSeq('patrol', patrolRunner, {});
  }
  // very low cadence: every 45–75s, with a 1-in-2 roll to keep it rare
  setInterval(() => { if (Math.random() < 0.5) maybePatrol(); }, rand(45000, 75000));

  // ── PUBLIC API ────────────────────────────────────────────────────────
  // The submitQ() hook in panel/index.html is in a closure we can't reach,
  // so we expose helpers the original COULD call. The cleanest way to wire
  // them up is a tiny monkey-patch via a MutationObserver on the bubble
  // (when it switches OFF, a question just finished; when .dots appears, a
  // question is in flight). That keeps us read-only against the original.
  // `lastVictoryAt` is a small debounce so we don't restart victoryLap on
  // every micro-mutation of the bubble (e.g. the .who pills being rebuilt).
  let lastVictoryAt = 0;
  function bindSubmitQHooks() {
    const body = $('bubble-body'); const b = $('bubble');
    if (!body || !b) return;
    const obs = new MutationObserver(() => {
      const html = body.innerHTML || '';
      if (/class="dots"/.test(html)) {
        // question just started → focus mode
        startFocus();
      } else if (b.classList.contains('on') && SEQ.name === 'focusMode') {
        // a real answer just landed → stop focusing
        stopFocus();
        // if grounded, chain a victory lap (cheaper than reading the JSON;
        // the panel's celebrate() already runs and we layer on top)
        // we read the existing emote text for a hint: "🎉" means grounded
        const em = $('emote'); const txt = em && em.textContent || '';
        if (/🎉|✨|😸/.test(txt) && (Date.now() - lastVictoryAt) > 4000) {
          lastVictoryAt = Date.now();
          // small delay so the panel's own celebrate() pose lands first;
          // victoryLap then supersedes it cleanly
          tSetSafe(() => startSeq('victoryLap', victoryLapRunner, {}), 350);
        }
      }
    });
    obs.observe(body, { childList: true, characterData: true, subtree: true });
    obs.observe(b,   { attributes: true, attributeFilter: ['class'] });
    return obs;
  }
  // helper that registers a setTimeout outside a sequence (e.g. for the small
  // post-answer delay that runs BEFORE the new sequence starts; we need
  // it cleared too if the user closes the panel or a new sequence cancels)
  function tSetSafe(fn, ms) {
    const id = setTimeout(() => { try { fn(); } catch {} }, ms);
    SEQ.unsafeTimers.push(id);
    return id;
  }

  // Heuristic 2: when the brain is DOWN (the .nope path fires), the panel
  // adds the .nope class to .floaty. We listen to that on the .floaty
  // element and chain a confusedRecovery on top of the .nope keyframe.
  function bindNopeHook() {
    const f = $('floaty'); if (!f) return;
    const obs = new MutationObserver(() => {
      if (f.classList.contains('nope')) {
        // the panel's own .nope keyframe lasts 450ms; chain after it
        tSetSafe(() => startSeq('confusedRecovery', confusedRunner, {}), 500);
      }
    });
    obs.observe(f, { attributes: true, attributeFilter: ['class'] });
    return obs;
  }

  // Heuristic 3: the very first Rive onLoad is the "morning" of the panel
  // session. We piggyback on the existing onLoad by overriding the .loading
  // .gone transition (it adds a class once bootRive is done).
  function bindMorningHook() {
    const l = $('loading'); if (!l) return;
    const obs = new MutationObserver(() => {
      if (l.classList.contains('gone')) {
        obs.disconnect();
        // first boot — wait a beat so the panel's greet (hand_wave) plays
        // out, then stretch
        tSetSafe(() => startSeq('morningStretch', morningStretchRunner, {}), 2200);
      }
    });
    obs.observe(l, { attributes: true, attributeFilter: ['class'] });
  }

  // Expose: panel authors (or the brain) can call these directly.
  window.__toshiSeq.morningStretch   = () => startSeq('morningStretch',   morningStretchRunner, {});
  window.__toshiSeq.victoryLap      = () => startSeq('victoryLap',      victoryLapRunner,      {});
  window.__toshiSeq.startFocus      = startFocus;
  window.__toshiSeq.stopFocus       = stopFocus;
  window.__toshiSeq.confusedRecovery= () => startSeq('confusedRecovery',confusedRunner,        {});
  window.__toshiSeq.patrol          = maybePatrol;
  window.__toshiSeq.cancel          = () => cancelSeq('manual');
  window.__toshiSeq.current         = () => ({ name: SEQ.name, ms: SEQ.startedAt ? Date.now() - SEQ.startedAt : 0 });
  window.__toshiSeq.detatch         = () => { cancelSeq('detatch'); }; // typo-tolerant alias for safety
  window.__toshiSeq.detach          = () => { cancelSeq('detach'); };

  // ── WIRE EVERYTHING UP ────────────────────────────────────────────────
  function init() {
    bindSubmitQHooks();
    bindNopeHook();
    bindMorningHook();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
