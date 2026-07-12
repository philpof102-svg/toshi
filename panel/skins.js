/* ───────────────────────────────────────────────────────────────────────────
 * toshi — SKINS (panel/skins.js)
 * Re-theme the MASCOT AVATAR itself (coat + aura), not accessories.
 *
 * Where wardrobe.js puts wearables ON Toshi, skins.js re-tints the whole cat:
 * a "based-blue" Toshi, a Ghibli-forest Toshi, a noir-villain Toshi… Each skin
 * is a pure CSS layer over the Rive canvas — a colour filter on the mascot +
 * a matching aura behind it. We never touch the .riv, never scrape art.
 *
 * Same Fable-5 rules as the other packs:
 *   - 0 deps, 0 tokens, 0 network, 0 binaries (all CSS, inline)
 *   - never overrides the original; reads its public state (window.__toshi)
 *   - drives poses ONLY through window.__toshi.setPose (never the Rive enum)
 *   - prefers-reduced-motion: reduce → the skin still applies, the flourish doesn't
 *   - works in Electron and the browser popup; never strands a non-idle pose
 *   - GPL-3.0-only (heritage from toshi-companion)
 *
 * Inspiration (moods, NOT copied art): archive.toshithecat.com — "the cat is
 * blue", the Ghibli fishing scene, the noir villain, warm community gold. The
 * palettes below are ORIGINAL, built on the BASED tokens already on :root.
 *
 * Public API (window.__toshiSkins):
 *   .catalog      → the SKINS array (read-only)
 *   .current      → the active skin id
 *   .apply(id)    → theme the mascot + persist to localStorage "toshi.skin"
 *   .clear()      → back to the default ("based")
 *   .version      → '1.0.0'
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiSkins) return;

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'toshi.skin';

  // Each skin: a filter on the mascot canvas + an aura (radial-gradient) behind it + a picker accent.
  // `filter:''` = the untouched original. Moods drawn from the archive; colours are original.
  const SKINS = [
    { id: 'based',    name: 'Based',    accent: '#0052ff', filter: '',
      aura: 'radial-gradient(60% 50% at 50% 44%, rgba(0,82,255,.28), transparent 70%)',
      note: 'the cat is blue — the canonical Toshi' },
    { id: 'forest',   name: 'Forest',   accent: '#3fa66a', filter: 'hue-rotate(88deg) saturate(1.12)',
      aura: 'radial-gradient(60% 52% at 50% 46%, rgba(63,166,106,.30), rgba(20,60,40,.12) 55%, transparent 72%)',
      note: 'the Ghibli fishing-trip Toshi — warm greens' },
    { id: 'noir',     name: 'Noir',     accent: '#c23a54', filter: 'grayscale(.45) contrast(1.14) sepia(.18)',
      aura: 'radial-gradient(58% 50% at 50% 44%, rgba(194,58,84,.26), rgba(10,6,12,.30) 60%, transparent 74%)',
      note: 'the noir-villain Toshi — dramatic red on black' },
    { id: 'gold',     name: 'Gold',     accent: '#d9a441', filter: 'sepia(.5) saturate(1.7) hue-rotate(-14deg) brightness(1.04)',
      aura: 'radial-gradient(60% 50% at 50% 44%, rgba(217,164,65,.30), transparent 70%)',
      note: 'a warm community-gold Toshi' },
    { id: 'midnight', name: 'Midnight', accent: '#6470ff', filter: 'hue-rotate(34deg) saturate(1.2) brightness(.92)',
      aura: 'radial-gradient(60% 52% at 50% 46%, rgba(100,112,255,.30), rgba(12,14,40,.18) 58%, transparent 74%)',
      note: 'a deep indigo, late-night Toshi' },
    { id: 'sunset',   name: 'Sunset',   accent: '#ff7a59', filter: 'hue-rotate(-26deg) saturate(1.3) brightness(1.03)',
      aura: 'radial-gradient(62% 52% at 50% 46%, rgba(255,122,89,.30), rgba(255,180,120,.14) 55%, transparent 72%)',
      note: 'warm orange-pink, golden-hour Toshi' },
  ];

  const byId = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

  // one injected stylesheet holds the live filter + aura, so we never fight index.html's CSS.
  let styleEl = null;
  function ensureStyle() {
    if (styleEl) return styleEl;
    styleEl = document.createElement('style');
    styleEl.id = 'toshi-skin-style';
    document.head.appendChild(styleEl);
    return styleEl;
  }
  // The aura sits behind the mascot without touching .stage::before/::after (chrome). We add our own layer.
  let auraEl = null;
  function ensureAura() {
    if (auraEl && auraEl.isConnected) return auraEl;
    const stage = document.querySelector('.stage');
    if (!stage) return null;
    auraEl = document.createElement('div');
    auraEl.className = 'toshi-skin-aura';
    auraEl.setAttribute('aria-hidden', 'true');
    Object.assign(auraEl.style, { position: 'absolute', inset: '0', pointerEvents: 'none',
      zIndex: '0', transition: reduce ? 'none' : 'background .45s ease, opacity .45s ease', opacity: '1' });
    stage.insertBefore(auraEl, stage.firstChild); // behind .floaty
    return auraEl;
  }

  function paint(skin) {
    // filter the mascot layer (.floaty holds the Rive canvas). transition so switches feel alive.
    ensureStyle().textContent =
      `.stage .floaty{filter:${skin.filter || 'none'};` +
      (reduce ? '' : 'transition:filter .45s ease;') + '}';
    const aura = ensureAura();
    if (aura) aura.style.background = skin.aura;
    // let the picker + the rest of the panel pick up the active accent if they want it
    try { document.documentElement.style.setProperty('--skin-accent', skin.accent); } catch (_) {}
  }

  function announce(skin) {
    if (reduce || !window.__toshi) return;
    try {
      window.__toshi.setPose && window.__toshi.setPose('hand_wave', '🎨', 1600);
      const f = document.querySelector('.stage .floaty');
      if (f) { f.classList.add('react'); setTimeout(() => f.classList.remove('react'), 700); }
    } catch (_) {}
  }

  let current = 'based';
  function apply(id, opts) {
    const skin = byId(id);
    current = skin.id;
    paint(skin);
    try { localStorage.setItem(STORAGE_KEY, skin.id); } catch (_) {}
    renderPicker();
    if (!(opts && opts.silent)) announce(skin);
    return skin.id;
  }
  function clear() { return apply('based'); }

  // ── picker: a row of colour swatches under the chips (mirrors the wardrobe pill row) ──────────────
  let pickerEl = null;
  function renderPicker() {
    if (!pickerEl || !pickerEl.isConnected) return;
    pickerEl.querySelectorAll('.toshi-skin-dot').forEach((d) => {
      d.classList.toggle('on', d.dataset.id === current);
    });
  }
  function buildPicker() {
    if (pickerEl) return;
    // anchor after the wardrobe row if present, else after the chips, else at the panel end.
    const anchor = document.querySelector('.wardrobe-row') || $('chips') || document.querySelector('.chips') || document.body;
    pickerEl = document.createElement('div');
    pickerEl.className = 'toshi-skin-row';
    Object.assign(pickerEl.style, { display: 'flex', gap: '7px', justifyContent: 'center',
      alignItems: 'center', padding: '6px 0 2px', flexWrap: 'wrap' });
    const s = document.createElement('style');
    s.textContent =
      '.toshi-skin-dot{width:16px;height:16px;border-radius:50%;border:2px solid transparent;cursor:pointer;' +
      'padding:0;outline:none;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .12s ease,border-color .12s ease}' +
      '.toshi-skin-dot:hover{transform:scale(1.18)}' +
      '.toshi-skin-dot.on{border-color:#fff;transform:scale(1.15)}' +
      '.toshi-skin-dot:focus-visible{border-color:#fff}';
    document.head.appendChild(s);
    SKINS.forEach((skin) => {
      const b = document.createElement('button');
      b.className = 'toshi-skin-dot';
      b.dataset.id = skin.id;
      b.style.background = skin.accent;
      b.title = skin.name + ' — ' + skin.note;
      b.setAttribute('aria-label', 'Toshi skin: ' + skin.name);
      b.addEventListener('click', () => apply(skin.id));
      pickerEl.appendChild(b);
    });
    anchor.parentNode ? anchor.parentNode.insertBefore(pickerEl, anchor.nextSibling) : anchor.appendChild(pickerEl);
    renderPicker();
  }

  function boot() {
    let saved = 'based';
    try { saved = localStorage.getItem(STORAGE_KEY) || 'based'; } catch (_) {}
    buildPicker();
    apply(saved, { silent: true }); // restore quietly on load
  }

  // wait for the panel DOM (the .stage) to exist, like the other packs.
  function whenReady(fn) {
    if (document.querySelector('.stage')) return fn();
    if (document.readyState === 'loading') return document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 60));
    setTimeout(fn, 60);
  }

  window.__toshiSkins = {
    version: '1.0.0',
    get catalog() { return SKINS.map((s) => ({ ...s })); },
    get current() { return current; },
    apply, clear,
  };

  whenReady(boot);
})();
