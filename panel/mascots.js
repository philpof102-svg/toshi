/* ───────────────────────────────────────────────────────────────────────────
 * toshi — MASCOTS (panel/mascots.js)
 * A small catalog + picker for the 3 Rive mascots shipped with the companion.
 *
 * Background:
 *   The Toshi project ships ONE mascot (community Toshi from tinyhumansai/mascots).
 *   The upstream archive (same repo, tinyhumansai/mascots) actually contains 3
 *   ready-to-use mascots — the Toshi cat, the openhuman "Tiny Mascot", and the
 *   scifi HUD ring "Jarvis". All three are GPL-3.0, all three target the same
 *   OpenHuman driving API (ViewModel enums: pose / eyes / mouthVisemeCode),
 *   which is the same contract our brain + wardrobe already speak.
 *
 *   This file:
 *     1. Defines MASCOTS — the local catalog of 3 .riv files (served from
 *        panel/mascots/ by serve.js, no network needed at runtime). The
 *        runtime bytes are the same as the upstream archive (commit
 *        a4795d1 of tinyhumansai/mascots); the SHA256s are in the panel
 *        README and were verified on copy.
 *     2. MASCOT_PROFILES — per-mascot driving rules. The base Rive API is
 *        the same, but the enum VALUES differ (e.g. Jarvis uses a numeric
 *        animState input, Toshi uses a named 'pose' enum). The profile
 *        tells the brain which enum names + which value vocabulary to use.
 *     3. Picker UI — a row of pills above the wardrobe row, mirroring the
 *        .chips style. One tap = swap the running mascot, re-binding the
 *        pose/eyes/mouth enums to the new artboard's names.
 *     4. Persistence — current mascot saved to localStorage as
 *        "toshi.mascot" (the default is "toshi" — the cat).
 *
 * Fable-5 rules (same as wardrobe):
 *   - 0 deps, 0 tokens, 0 network at runtime (only the .riv bytes the
 *     server already serves; no archive fetch from the panel)
 *   - never overrides the original; reads its public state
 *   - prefers-reduced-motion: reduce → no flip animation, no picker transitions
 *   - works in both Electron and the browser popup
 *   - never strands the panel on a non-idle pose (we always end on 'idle')
 *
 * Public API (window.__toshiMascots):
 *   .catalog                       → MASCOTS (read-only)
 *   .current                       → id of the running mascot
 *   .profile(id)                   → the MASCOT_PROFILES entry for an id
 *   .list()                        → [{ id, name, blurb }, ...]
 *   .select(id, opts?)             → swap the running Rive source to <id>
 *                                     opts: { silent: bool } — suppress the
 *                                     greet flourish & toast (used by boot)
 *   .version                       → '1.0.0'
 *
 * The actual Rive instance + enums are still owned by index.html. This
 * file is the *catalog and picker*; it talks to the existing controller
 * through window.__toshi (the debug/self-portrait hook) and through the
 * boot/load callbacks it registers. See panel/index.html for the
 * controller side — it must call window.__toshiMascots._onRiveReady(rive)
 * once Rive has finished loading so we can re-bind the enums after a
 * mascot swap.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiMascots) return;
  window.__toshiMascots = { version: '1.0.0' };

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'toshi.mascot';

  // ───────────────────────────────────────────────────────────────────────
  // 1. MASCOTS — the local catalog (3 .riv files, served by serve.js)
  // ───────────────────────────────────────────────────────────────────────
  // Local URLs only — at runtime, the panel never reaches the archive
  // again. The bytes were copied once from the upstream archive; the
  // .riv files live in panel/mascots/. The serve.js mime map already
  // knows .riv → application/octet-stream.
  //
  // The "blurb" is the 1-line description from tinyhumans/mascots.json —
  // it is small, factual, and tells the user what each mascot IS (so the
  // picker reads as a real choice, not a random skin swap).
  const MASCOTS = [
    {
      id: 'toshi',
      name: 'Toshi',
      blurb: 'community cat — the default. rich eyes, mouth, 6 flourishes.',
      file: 'mascots/toshi.riv',
      accent: '#0052FF',
    },
    {
      id: 'tiny-mascot',
      name: 'Tiny Mascot',
      blurb: 'the openhuman default — book reading, coffee, dancing, writing…',
      file: 'mascots/tiny-mascot.riv',
      accent: '#4ec9b0',
    },
    {
      id: 'jarvis',
      name: 'Jarvis',
      blurb: 'scifi HUD ring — single animState, listening pulse, talking.',
      file: 'mascots/jarvis.riv',
      accent: '#e5b567',
    },
  ];

  // index by id — used by the picker, the persistence layer, and the
  // swap path. Object.fromEntries is fine: we only have 3 entries and
  // they are static at module load.
  const BY_ID = Object.fromEntries(MASCOTS.map((m) => [m.id, m]));

  // ───────────────────────────────────────────────────────────────────────
  // 2. MASCOT_PROFILES — per-mascot driving rules
  // ───────────────────────────────────────────────────────────────────────
  // The OpenHuman / tinyhumans family shares a *contract* but not a
  // *vocabulary*:
  //
  //   - Toshi & Tiny Mascot expose a ViewModel with THREE named enums
  //     (pose / eyes / mouthVisemeCode) — the same names, the same
  //     mechanical life-loop. The values differ only slightly (Toshi
  //     has 'NEUTRAL' for eyes; Tiny Mascot uses 'idle' — we map
  //     between them through the profile).
  //
  //   - Jarvis is a one-state HUD ring driven by a SINGLE numeric
  //     `animState` input. It has no eyes/mouth enums. The life-loop
  //     on Jarvis is just "rotate when idle, pulse on listen, frame
  //     through visemes on talk". The brain delegates to the simpler
  //     drive path when the active profile is 'jarvis'.
  //
  // The profile tells the rest of the panel:
  //   - which input names to look up on the ViewModel
  //   - which string values to use for the resting eyes (so the
  //     face never lands on a missing enum value)
  //   - whether the mascot supports the flourish life-loop at all
  //     (Jarvis: yes, but mapped to its tiny state set; the others: yes)
  //   - the default "hello" pose to play on switch
  //
  // We keep the profile SHALLOW on purpose: the brain still owns the
  // loop. The profile is just a translation table the brain reads on
  // every drive call.
  const MASCOT_PROFILES = {
    'toshi': {
      // Toshi's ViewModel exposes: pose, eyes, mouthVisemeCode (uppercase enum)
      // — confirmed by the upstream manifest, by direct probing of toshi.riv,
      // and by the current panel/index.html code (which is written for it).
      kind: 'enum-trio',
      enums: { pose: 'pose', eyes: 'eyes', mouth: 'mouthVisemeCode' },
      restingEyes: 'NEUTRAL',
      restingMouth: 'sil',
      greetingPose: { name: 'hand_wave', label: 'hi 👋', holdMs: 1900 },
      // the life-loop flourishes (idle-ish ambient poses) — also the
      // vocabulary the rest of the panel already uses.
      flourishes: ['look_around', 'pointing', 'hand_wave', 'dancing', 'celebration'],
      // the "is the cat holding a prop?" gate (used by sparkle()).
      // Jarvis has no prop poses, so its set is empty.
      objectPoses: new Set(['hand_wave', 'pointing', 'walking', 'walking_side', 'running', 'dancing']),
      // mouth viseme codes (subset of the 15 Oculus ones we drive).
      visemes: ['aa', 'E', 'ih', 'oh', 'ou', 'PP', 'DD'],
    },
    'tiny-mascot': {
      // Tiny Mascot has the SAME enum trio, but the resting eyes
      // value is 'idle' (lowercase, not 'NEUTRAL'). The mouth enum is
      // the same 'mouthVisemeCode' with the same 'sil' resting value.
      // Source: tinyhumans/mascots.json, stateEngine.channels (eyes
      // are driven by a 'eyes' channel; the upstream default pose is
      // 'idle' which doubles as the eye resting state).
      kind: 'enum-trio',
      enums: { pose: 'pose', eyes: 'eyes', mouth: 'mouthVisemeCode' },
      restingEyes: 'idle',
      restingMouth: 'sil',
      greetingPose: { name: 'hand_wave', label: 'hi 👋', holdMs: 1900 },
      flourishes: ['idle', 'bookreading', 'coffeedrink', 'writing', 'bobbateadrink', 'hand_wave', 'dancing'],
      objectPoses: new Set(['coffeedrink', 'bobbateadrink', 'writing', 'bookreading', 'dancing']),
      visemes: ['aa', 'E', 'ih', 'oh', 'ou', 'PP', 'DD'],
    },
    'jarvis': {
      // Jarvis has NO eyes/mouth enums — it's a single-state HUD ring
      // driven by a numeric `animState` ViewModel input. The
      // openhuman manifest lists the values: 0 = idle/rotate, 1 =
      // listening, 2 = talking. The brain falls back to the
      // `animState` path: 0 by default, 1 while submitting, 2 during
      // talk() (we set 0 back when the answer is rendered).
      kind: 'anim-state',
      enums: { anim: 'animState' },
      // the "resting" anim state
      restingAnim: 0,
      // the listening state (set during submitQ before the answer comes back)
      listeningAnim: 1,
      // the talking state (set during talk())
      talkingAnim: 2,
      // Jarvis has no flourish set — it just rotates when idle. The
      // panel's life-loop still fires, but every "flourish" resolves
      // to "do nothing visible" (the ring is already rotating).
      flourishes: [],
      objectPoses: new Set(),
      visemes: [],
    },
  };

  // ───────────────────────────────────────────────────────────────────────
  // 3. STATE — current mascot, persisted across reloads
  // ───────────────────────────────────────────────────────────────────────
  // Same defensive parsing as wardrobe.load() — hasOwnProperty guards
  // against '__proto__' smuggling, and we only accept string ids.
  let currentId = 'toshi'; // sane default — never blank
  function isValidId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && isValidId(raw)) currentId = raw;
    } catch {}
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, currentId); } catch {}
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. SWAP — replace the running Rive source with another mascot
  // ───────────────────────────────────────────────────────────────────────
  // The actual Rive instance is owned by panel/index.html (bootRive()).
  // We don't recreate it here — instead we ask the controller to swap
  // the source. The controller exposes __toshi.swapMascot(file, profile)
  // for us; if it isn't present yet (the panel is still loading the
  // first mascot), we just queue the request and the controller will
  // pick it up after boot.
  //
  // Why a queue? Because the panel does the first Rive boot inline
  // (line 740: `bootRive();`), and the catalog script is loaded
  // *before* bootRive runs (defer order). The first call to select()
  // from boot always goes through the queue.
  let _riveSwapFn = null;          // injected by the controller after boot
  let _pendingSelect = null;        // { id, opts } — played once the swap fn is ready
  let _onReadyCb = null;            // optional: { id, opts } for the FIRST boot
  function _registerSwapFn(fn) {
    _riveSwapFn = fn;
    if (_pendingSelect) {
      const { id, opts } = _pendingSelect; _pendingSelect = null;
      try { fn(BY_ID[id], MASCOT_PROFILES[id], opts); } catch (e) { /* boot-time errors are surfaced by the controller */ }
    }
  }
  function select(id, opts) {
    if (!isValidId(id)) return false;
    const wasFirstBoot = (id !== currentId) && !_riveSwapFn;
    currentId = id; save();
    syncPickerUI();
    const profile = MASCOT_PROFILES[id];
    if (_riveSwapFn) {
      try { _riveSwapFn(BY_ID[id], profile, opts || {}); } catch (e) { /* controller will report */ }
    } else {
      // first boot, or controller not ready — queue
      _pendingSelect = { id, opts: opts || {} };
    }
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5. PICKER UI — a row of pills, click to swap
  // ───────────────────────────────────────────────────────────────────────
  // The row sits just above the wardrobe-picker. Same look (monospace
  // pills, accent color = mascot accent). On click: swap. The mascot
  // does a small "hi 👋" flourish on switch (so you SEE the change),
  // and the pose-tag in the header reflects the new name.
  function buildPicker() {
    const host = $('mascot-picker');
    if (!host) return;
    host.innerHTML = '';
    // a small label on the very left
    const label = document.createElement('span');
    label.className = 'mascot-picker-label';
    label.textContent = 'mascot';
    label.title = 'pick a mascot — the community cat, the openhuman default, or the scifi HUD ring';
    host.appendChild(label);
    for (const m of MASCOTS) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'mascot-pill';
      pill.dataset.id = m.id;
      pill.style.setProperty('--accent', m.accent);
      pill.title = `${m.name} — ${m.blurb}`;
      pill.setAttribute('aria-pressed', 'false');
      pill.setAttribute('aria-label', `use ${m.name}`);
      pill.innerHTML = `
        <span class="mascot-pill-dot" aria-hidden="true"></span>
        <span class="mascot-pill-name">${m.name}</span>
      `;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        if (m.id === currentId) return; // already on it
        // swap, then greet (the controller will play the right pose
        // for the new profile — hand_wave for the cats, idle for
        // jarvis since it has no hand_wave)
        select(m.id, { silent: false });
        // small toast in the bubble so the user gets feedback even if
        // the new mascot doesn't wave (Jarvis never does)
        try { window.__toshi && window.__toshi.say && window.__toshi.say(`now ${m.name} 🐾`, false, 2400); } catch {}
      });
      host.appendChild(pill);
    }
  }
  function syncPickerUI() {
    const host = $('mascot-picker');
    if (!host) return;
    for (const pill of host.querySelectorAll('.mascot-pill[data-id]')) {
      const on = pill.dataset.id === currentId;
      pill.classList.toggle('is-on', on);
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 6. PUBLIC API
  // ───────────────────────────────────────────────────────────────────────
  Object.assign(window.__toshiMascots, {
    catalog: MASCOTS,
    list: () => MASCOTS.map((m) => ({ id: m.id, name: m.name, blurb: m.blurb })),
    profile: (id) => MASCOT_PROFILES[id] || null,
    select,
    _registerSwapFn,                // controller-internal
  });
  Object.defineProperty(window.__toshiMascots, 'current', {
    get() { return currentId; },
    enumerable: true, configurable: true,
  });

  // ───────────────────────────────────────────────────────────────────────
  // 7. BOOT
  // ───────────────────────────────────────────────────────────────────────
  // The controller (panel/index.html) is responsible for asking us which
  // file to load. We just set up the picker and load the persisted
  // currentId here. The controller will see currentId change (or stay
  // on the default 'toshi') and boot Rive with the right file.
  function boot() {
    load();
    buildPicker();
    syncPickerUI();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
