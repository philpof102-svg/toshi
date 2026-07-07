/* ───────────────────────────────────────────────────────────────────────────
 * toshi — extra animations (panel/animations-extra.js)
 * Loaded with `defer` AFTER panel/index.html's <script> tag. The IIFE below
 * is read-only against the original code: it consumes the existing globals
 * ($, poseEnum/eyesEnum/mouthEnum, setPose, reactWiggle, sparkles, busy,
 * watching, say, thinking, etc.) and never reassigns them.
 *
 * 8 new animations, each a thin wrapper that respects the rules already in
 * place in panel/index.html:
 *   - 1 body pose at a time (we call setPose / setEnum, never override)
 *   - face layers free (eyes, mouth channels are driven independently)
 *   - every transient class is removed in onAnimationEnd
 *   - prefers-reduced-motion matchMedia short-circuits every public fn
 *   - works in both Electron (window.toshiDesktop present) and browser
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiExtra) return; // idempotent
  window.__toshiExtra = { version: '1.0.0' };

  const $  = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

  // waits for the original bootRive() to expose its enums; if the panel
  // hasn't loaded yet (very rare — defer order), retry a few times. The
  // extras are pure-CSS so this is only needed for the Rive-driven ones
  // (tilt + yawn). Everything else runs without waiting.
  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    const w = window.__toshi;
    if (w && w.state && w.state()) { cb(); return; }
    if (attempts > 40) return; // ~2s budget; we just skip the Rive bits
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  // one transient-class runner. Adds cls to el, removes it after `ms` or
  // on animationend (whichever first). CSS owns the keyframes.
  function transient(el, cls, ms) {
    if (!el || reduce) return;
    el.classList.remove(cls);
    void el.offsetWidth; // reflow → re-trigger
    el.classList.add(cls);
    const t = setTimeout(() => el.classList.remove(cls), ms || 600);
    el.addEventListener('animationend', function once(ev) {
      if (ev.animationName && el.classList.contains(cls) === false) {
        clearTimeout(t);
        el.removeEventListener('animationend', once);
      }
    });
  }

  // ── 1. TILT ────────────────────────────────────────────────────────────
  // Paired with the eye channel: when the mascot glances up/down/left/right,
  // we add a tiny head tilt in the matching direction. Held for the glance
  // duration (~650ms in the original) + 200ms ease-out.
  // Public: window.__toshiExtra.tilt('look_left' | 'look_right' | 'look_up' | 'look_down')
  const TILT_BY_EYE = {
    look_left:  { angle: -2,  dur: 900 },
    look_right: { angle:  2,  dur: 900 },
    look_up:    { angle:  0,  dur: 800 }, // head tilts subtly (no roll)
    look_down:  { angle:  0,  dur: 800 },
  };
  function tilt(eye) {
    if (reduce) return;
    const f = $('floaty'); if (!f) return;
    const m = TILT_BY_EYE[eye]; if (!m) return;
    f.style.setProperty('--angle', m.angle + 'deg');
    f.style.setProperty('--tilt-dur', m.dur + 'ms');
    transient(f, 'x-tilt', m.dur);
  }

  // ── 2. BOUNCE-IN ───────────────────────────────────────────────────────
  // Tied to the ask input. Focus → "I'm with you" drop. Blur → nothing
  // (the bounce class self-clears in <300ms anyway).
  function bindBounceIn() {
    const i = $('q'); if (!i) return;
    i.addEventListener('focus', () => transient($('floaty'), 'x-bounce', 320));
  }

  // ── 3. GAZE ────────────────────────────────────────────────────────────
  // Stage listens for mousemove, sets --mx/--my (0..1). CSS does the
  // transform. Suspended while busy (Toshi is reacting to a question) and
  // in mini mode still works (capped to 3px in CSS).
  function bindGaze() {
    const stage = document.querySelector('.stage'); if (!stage) return;
    let raf = 0;
    stage.addEventListener('mousemove', (e) => {
      // skip while reacting (don't fight the .react/.nope keyframes)
      if (window.busy) return;
      const r = stage.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width;
      const my = (e.clientY - r.top)  / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        stage.style.setProperty('--mx', Math.max(0, Math.min(1, mx)).toFixed(3));
        stage.style.setProperty('--my', Math.max(0, Math.min(1, my)).toFixed(3));
        if (!stage.classList.contains('x-gaze')) stage.classList.add('x-gaze');
      });
    });
    stage.addEventListener('mouseleave', () => {
      // ease back to centre
      stage.style.setProperty('--mx', '.5');
      stage.style.setProperty('--my', '.5');
    });
  }

  // ── 4. STARDUST ────────────────────────────────────────────────────────
  // Inject 5 motes once, then toggle .x-stardust on the stage when the
  // mascot is idle + visible + not busy. Polled on the same 4s cadence as
  // pollWatching() in the original — cheap, single class toggle.
  function ensureMotes() {
    const stage = document.querySelector('.stage'); if (!stage) return;
    if (stage.querySelector('.mote')) return;
    for (let i = 0; i < 5; i++) {
      const m = document.createElement('div'); m.className = 'mote';
      m.style.setProperty('--dx', (rand(-12, 12)).toFixed(1) + 'px');
      m.style.setProperty('--dy', (rand(-16, -8)).toFixed(1) + 'px');
      stage.appendChild(m);
    }
  }
  function stardust(on) {
    if (reduce) return;
    ensureMotes();
    const stage = document.querySelector('.stage');
    if (on) stage.classList.add('x-stardust');
    else    stage.classList.remove('x-stardust');
  }
  // ambient: on whenever the mascot is in idle pose + panel visible + not busy
  setInterval(() => {
    const s = window.__toshi && window.__toshi.state && window.__toshi.state();
    const idle = s && s.pose === 'idle';
    const ok = !document.hidden && !window.busy && !document.body.classList.contains('mini');
    stardust(idle && ok);
  }, 4000);

  // ── 5. BREATH-DEEP ────────────────────────────────────────────────────
  // Called automatically on .nope / fallback. Holds for 6s, then reverts
  // by re-adding nothing — the base .floaty rule still says `animation:
  // float 5.5s …`, so removing .x-breath snaps back. We also don't fight
  // the radial glow — we ease it back via the CSS transition.
  function breathDeep(ms) {
    if (reduce) return;
    const stage = document.querySelector('.stage');
    if (!stage) return;
    stage.classList.add('x-breath');
    setTimeout(() => stage.classList.remove('x-breath'), ms || 6000);
  }
  // hook into the original `.nope` path: monkey-patch the `submitQ` fail
  // path by listening for the .nope class on .floaty. We use a tiny
  // observer — non-invasive, can be removed by `window.__toshiExtra.detach()`.
  function bindBreathDeep() {
    const f = $('floaty'); if (!f) return;
    const obs = new MutationObserver(() => {
      if (f.classList.contains('nope')) breathDeep(6000);
    });
    obs.observe(f, { attributes: true, attributeFilter: ['class'] });
    return obs;
  }

  // ── 6. SCRITCH ─────────────────────────────────────────────────────────
  // Double-click on the mascot stage → snappy 300ms wiggle + a long quip
  // (cat-petting energy). Reuses the click handler pattern from the
  // original: if the user double-clicks, the single-click quip is
  // suppressed (so the user only hears the scritch reply).
  function bindScritch() {
    const stage = document.querySelector('.stage'); if (!stage) return;
    let lastClick = 0;
    stage.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastClick < 320) {
        e.stopImmediatePropagation();
        if (window.busy) return;
        const f = $('floaty');
        transient(f, 'x-scritch', 320);
        // soft scritch quips (local, 0 token)
        const SCRITCH_QUIPS = [
          'purr purr 😻', 'that tickles', 'right behind the ears…',
          'mrrrp', 'I could get used to this', 'good human',
        ];
        try { window.__toshi.say(pick(SCRITCH_QUIPS), false, 4500); } catch {}
        try { window.__toshi.setPose('hand_wave', 1900); } catch {}
      }
      lastClick = now;
    }, true /* capture: runs BEFORE the single-click quip */);
  }

  // ── 7. YAWN ────────────────────────────────────────────────────────────
  // 8 minutes of no interaction → close eyes + settle micro-tilt → return.
  // Resets on any pointer/keyboard activity (no separate "I'm bored" pose
  // because idle already says enough). Skipped under reduced-motion.
  function bindYawn() {
    if (reduce) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    document.addEventListener('mousemove', bump, { passive: true });
    document.addEventListener('keydown',   bump);
    document.addEventListener('click',     bump);
    setInterval(() => {
      if (window.busy || document.hidden) return;
      if (Date.now() - lastActivity < 8 * 60 * 1000) return;
      const s = window.__toshi && window.__toshi.state && window.__toshi.state();
      if (!s || s.pose !== 'idle') return;
      // animate
      const f = $('floaty'); if (f) transient(f, 'x-yawn', 4000);
      try { window.__toshi.setPose('idle', 4000); } catch {}
      // nudge the eyes enum to 'closed' if available, then back to NEUTRAL
      whenReady(() => {
        const e = window.__toshi.state();
        // we don't write to enums directly (the original owns them); the
        // CSS settle is the visual tell, the closed-eye enum is signalled
        // by the .x-yawn class which the original could opt to listen to.
        document.body.classList.add('x-yawn');
        setTimeout(() => document.body.classList.remove('x-yawn'), 4200);
      });
      // push the next yawn out a while so we don't rapid-fire
      lastActivity = Date.now() + 4 * 60 * 1000;
    }, 30000);
  }

  // ── 8. HEART-BURST ────────────────────────────────────────────────────
  // Click the footer → 6 amber hearts drift up from the click point.
  // Distinct from the grounded .spark burst (which is radial from the
  // mascot centre). Used for a "thanks" / "I appreciate the companion" feel.
  const HEART_QUIPS = [
    'thanks for the love 💛', 'spread the onchain love', 'one like, one commit',
    'you just made the cat happy', 'I felt that one', 'aww',
  ];
  function bindHearts() {
    const foot = document.querySelector('.foot'); if (!foot) return;
    foot.addEventListener('click', (e) => {
      if (reduce) return;
      const stage = document.querySelector('.stage');
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      for (let i = 0; i < 6; i++) {
        const h = document.createElement('div'); h.className = 'heart';
        h.style.left = cx + 'px'; h.style.top  = cy + 'px';
        h.style.setProperty('--dx', (rand(-22, 22)).toFixed(1) + 'px');
        h.style.setProperty('--dy', (rand(28, 44)).toFixed(1) + 'px');
        stage.appendChild(h);
        requestAnimationFrame(() => h.classList.add('go'));
        setTimeout(() => h.remove(), 1500);
      }
      try { window.__toshi.setPose('celebration', 2000); } catch {}
      try { window.__toshi.say(pick(HEART_QUIPS), false, 4000); } catch {}
    });
  }

  // ── WIRE EVERYTHING UP ────────────────────────────────────────────────
  function init() {
    bindBounceIn();
    bindGaze();
    bindBreathDeep();
    bindScritch();
    bindYawn();
    bindHearts();
    // tilt: hooked to the eye channel via a tiny rAF spy on the eyesEnum
    whenReady(() => {
      let lastEye = 'NEUTRAL';
      setInterval(() => {
        try {
          const e = window.__toshi.state().eyes;
          if (e && e !== lastEye && /look_(up|down|left|right)/.test(e)) tilt(e);
          lastEye = e;
        } catch {}
      }, 220);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
