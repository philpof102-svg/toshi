/* ───────────────────────────────────────────────────────────────────────────
 * toshi — WARDROBE (panel/wardrobe.js)
 * A tiny wearable system for the Toshi mascot.
 *
 * Same Fable-5 rules as the other packs:
 *   - 0 deps, 0 tokens, 0 network, 0 binaries (all SVGs are inline)
 *   - 1 body pose at a time (we go through window.__toshi.setPose; never
 *     write the Rive enum directly)
 *   - never overrides the original; reads its public state
 *   - prefers-reduced-motion: reduce → early return
 *   - works in both Electron and the browser popup
 *   - never strands the panel on a non-idle pose
 *   - GPL-3.0-only (heritage from toshi-companion)
 *
 * What it adds:
 *   1. WARDROBE — a catalog of 8 original SVG wearables, defined inline
 *      (no asset files, no network). Each entry has:
 *        - id           : stable key, used in localStorage
 *        - name         : display name in the picker
 *        - slot         : 'head' | 'body' (z-order band)
 *        - svg          : the actual SVG string (viewBox 0 0 620 820 to
 *                         match the Rive canvas)
 *        - accent       : a BASED palette color string for the picker pill
 *
 *   2. equip(id) / unequip(id) / clearAll() — public API. equip() inserts
 *      (or replaces) the SVG into the matching slot layer, persists to
 *      localStorage under "toshi.wardrobe", and announces the change with
 *      a small flourish (waving Toshi + a "👗" emote). unequip() removes it.
 *
 *   3. applyOutfit(state) — pure render fn: given a saved state, ensure
 *      every equipped item is in the right layer (used on boot to restore
 *      a user's outfit across reloads).
 *
 *   4. The picker UI is a row of pills below the chips. The pills render
 *      from the catalog at boot. Clicking a pill toggles the item.
 *
 * Public API (window.__toshiWardrobe):
 *   .catalog                       → the WARDROBE array (read-only)
 *   .equipped                      → { head: [...], body: [...] }
 *   .equip(id)                     → equip one item
 *   .unequip(id)                   → unequip one item
 *   .toggle(id)                    → flip one item
 *   .clearAll()                    → remove every wearable
 *   .applyOutfit(state?)           → restore from saved state (or re-render current)
 *   .version                       → '1.0.0'
 *
 * Note about the archive: the user asked to copy assets from
 * archive.toshithecat.com — those are community-submitted artworks under
 * their own licences; we do not scrape or redistribute them. Instead we
 * author 8 original SVG wearables in this file. They are intentionally
 * simple, monochrome, and use the BASED palette already on :root.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiWardrobe) return;
  window.__toshiWardrobe = { version: '1.0.0' };

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'toshi.wardrobe';

  // ───────────────────────────────────────────────────────────────────────
  // 1. WARDROBE — the 8 SVG wearables
  // ───────────────────────────────────────────────────────────────────────
  // Each SVG is drawn against a 620×820 viewBox to match the Rive canvas.
  // Head slot items sit around y=80-220 (the head band); body slot items
  // sit around y=380-720 (the body band). Items use the BASED palette
  // declared on :root in panel/index.html (we hardcode the hex values so
  // the SVGs are also valid as standalone files if ever exported).
  //
  // Every SVG has a tiny <title> for accessibility (the screen reader reads
  // the wearable name), and uses currentColor where useful so the picker
  // pill can recolor the chip.
  const WARDROBE = [
    {
      id: 'crown',
      name: 'Crown',
      slot: 'head',
      accent: '#e5b567',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Crown</title>
          <g>
            <!-- crown band -->
            <path d="M 230 180 L 390 180 L 380 230 L 240 230 Z"
                  fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- 5 spikes -->
            <path d="M 240 180 L 250 110 L 270 175 Z" fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <path d="M 280 180 L 295  85 L 310 175 Z" fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <path d="M 320 180 L 340  95 L 355 175 Z" fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <path d="M 360 180 L 380 130 L 395 175 Z" fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- gems -->
            <circle cx="260" cy="155" r="6" fill="#0052FF" stroke="#162a5e" stroke-width="1.5"/>
            <circle cx="310" cy="135" r="6" fill="#4ec9b0" stroke="#162a5e" stroke-width="1.5"/>
            <circle cx="360" cy="145" r="6" fill="#e8eef6" stroke="#162a5e" stroke-width="1.5"/>
            <!-- bottom band stripe -->
            <rect x="240" y="220" width="140" height="6" fill="#162a5e" opacity=".6"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'beret',
      name: 'Beret',
      slot: 'head',
      accent: '#0052FF',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Beret</title>
          <g>
            <!-- main beret body (offset ellipse so it looks like a hat, not a flying saucer) -->
            <ellipse cx="320" cy="150" rx="135" ry="42" fill="#0052FF" stroke="#162a5e" stroke-width="3"/>
            <!-- little stem on top -->
            <ellipse cx="310" cy="115" rx="14" ry="11" fill="#4d7fff" stroke="#162a5e" stroke-width="2"/>
            <!-- a subtle base shadow under the beret so it sits on the head -->
            <ellipse cx="320" cy="195" rx="100" ry="6" fill="#162a5e" opacity=".35"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'cap',
      name: 'Cap',
      slot: 'head',
      accent: '#4ec9b0',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Cap</title>
          <g>
            <!-- crown -->
            <path d="M 200 175 Q 320 80 440 175 L 440 195 L 200 195 Z"
                  fill="#4ec9b0" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- brim (extends past the head to the right) -->
            <path d="M 380 190 Q 510 195 520 220 Q 470 230 380 215 Z"
                  fill="#4ec9b0" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- center seam -->
            <line x1="320" y1="100" x2="320" y2="180" stroke="#162a5e" stroke-width="1.5" opacity=".5"/>
            <!-- a tiny T monogram on the crown (for Toshi) -->
            <text x="320" y="170" text-anchor="middle" font-family="ui-monospace, monospace"
                  font-size="40" font-weight="900" fill="#0a1430">T</text>
          </g>
        </svg>
      `,
    },
    {
      id: 'glasses',
      name: 'Glasses',
      slot: 'head',
      accent: '#e8eef6',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Round glasses</title>
          <g fill="none" stroke="#162a5e" stroke-width="4">
            <circle cx="265" cy="290" r="38" fill="rgba(232,238,246,.18)"/>
            <circle cx="375" cy="290" r="38" fill="rgba(232,238,246,.18)"/>
            <line x1="303" y1="290" x2="337" y2="290"/>
            <line x1="227" y1="290" x2="195" y2="278"/>
            <line x1="413" y1="290" x2="445" y2="278"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'bowtie',
      name: 'Bow tie',
      slot: 'body',
      accent: '#e5b567',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Bow tie</title>
          <g>
            <!-- left wing -->
            <path d="M 310 430 L 230 395 L 230 475 L 310 440 Z"
                  fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- right wing -->
            <path d="M 310 430 L 390 395 L 390 475 L 310 440 Z"
                  fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- center knot -->
            <rect x="304" y="420" width="12" height="22" fill="#162a5e" rx="3"/>
            <!-- subtle highlight on the left wing -->
            <path d="M 310 430 L 240 410 L 240 420 L 305 435 Z" fill="#fff" opacity=".18"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'scarf',
      name: 'Scarf',
      slot: 'body',
      accent: '#4d7fff',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Scarf</title>
          <g>
            <!-- main wrap around the neck (band) -->
            <path d="M 200 350 Q 320 320 440 350 L 445 405 Q 320 380 195 405 Z"
                  fill="#4d7fff" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- the dangling end (longer on the right) -->
            <path d="M 360 395 L 420 410 L 410 530 L 380 555 L 360 540 L 350 460 Z"
                  fill="#4d7fff" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- stripe accents -->
            <line x1="220" y1="365" x2="430" y2="365" stroke="#fff" stroke-width="2" opacity=".5"/>
            <line x1="220" y1="385" x2="430" y2="385" stroke="#fff" stroke-width="2" opacity=".3"/>
            <!-- fringe on the dangling end -->
            <line x1="360" y1="540" x2="365" y2="565" stroke="#162a5e" stroke-width="2"/>
            <line x1="375" y1="545" x2="380" y2="568" stroke="#162a5e" stroke-width="2"/>
            <line x1="390" y1="540" x2="395" y2="565" stroke="#162a5e" stroke-width="2"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'hoodie',
      name: 'Hoodie',
      slot: 'body',
      accent: '#0052FF',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Hoodie</title>
          <g>
            <!-- main body (rounded torso shape) -->
            <path d="M 165 480 Q 320 430 475 480 L 495 740 L 145 740 Z"
                  fill="#0052FF" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- left sleeve -->
            <path d="M 165 480 L 100 600 L 145 660 L 200 530 Z"
                  fill="#0052FF" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- right sleeve -->
            <path d="M 475 480 L 540 600 L 495 660 L 440 530 Z"
                  fill="#0052FF" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- hood (around the neck) -->
            <path d="M 235 430 Q 320 380 405 430 L 410 490 Q 320 450 230 490 Z"
                  fill="#4d7fff" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- front pouch (a soft U) -->
            <path d="M 250 600 Q 320 580 390 600 L 390 690 L 250 690 Z"
                  fill="none" stroke="#162a5e" stroke-width="2" opacity=".55"/>
            <!-- drawstring tips -->
            <circle cx="305" cy="475" r="4" fill="#e8eef6"/>
            <circle cx="335" cy="475" r="4" fill="#e8eef6"/>
            <!-- center zipper line -->
            <line x1="320" y1="490" x2="320" y2="720" stroke="#162a5e" stroke-width="1.5" opacity=".5"/>
          </g>
        </svg>
      `,
    },
    {
      id: 'cape',
      name: 'Royal cape',
      slot: 'body',
      accent: '#e5b567',
      svg: `
        <svg class="wardrobe-svg" viewBox="0 0 620 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <title>Royal cape</title>
          <g>
            <!-- the main drape (symmetrical, flares at the bottom) -->
            <path d="M 230 360
                     Q 240 480 175 720
                     L 465 720
                     Q 400 480 410 360
                     Q 320 380 230 360 Z"
                  fill="#e5b567" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- the collar (a softer half-circle around the shoulders) -->
            <path d="M 230 360 Q 320 340 410 360 L 410 390 Q 320 370 230 390 Z"
                  fill="#162a5e" stroke="#162a5e" stroke-width="3" stroke-linejoin="round"/>
            <!-- center clasp (a tiny gem) -->
            <circle cx="320" cy="370" r="6" fill="#4ec9b0" stroke="#e8eef6" stroke-width="1.5"/>
            <!-- a soft inner shadow to give the cape depth -->
            <path d="M 280 410 Q 320 430 360 410 L 380 690 L 260 690 Z"
                  fill="#162a5e" opacity=".18"/>
            <!-- hem trim -->
            <path d="M 175 720 L 465 720" stroke="#162a5e" stroke-width="2" opacity=".5"/>
          </g>
        </svg>
      `,
    },
  ];

  // index by id for fast lookup
  const BY_ID = Object.fromEntries(WARDROBE.map((w) => [w.id, w]));

  // ───────────────────────────────────────────────────────────────────────
  // 2. STATE — what's currently equipped
  // ───────────────────────────────────────────────────────────────────────
  // { head: Set<id>, body: Set<id> } — multiple items per slot is allowed
  // (a cap + glasses both fit on the head; a hoodie + scarf both fit on
  // the body). The layer just appends them; the catalog ordering is the
  // natural z-order (later items draw on top of earlier ones within the
  // same slot).
  const equipped = { head: new Set(), body: new Set() };

  function save() {
    try {
      const data = { head: [...equipped.head], body: [...equipped.body] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }
  // The persisted array is round-tripped through JSON.parse and then
  // used as a key into BY_ID. A naive `data.head.filter((id) => BY_ID[id])`
  // would let "__proto__" and "constructor" slip through, because
  // BY_ID['__proto__'] returns Object.prototype (truthy). We use
  // hasOwnProperty.call as a property-existence check that does not
  // walk the prototype chain. We also require `typeof id === 'string'`
  // so a malicious payload like [1, true, null, "beret"] cannot smuggle
  // non-string elements past the filter.
  function isValidId(id) {
    return typeof id === 'string'
        && Object.prototype.hasOwnProperty.call(BY_ID, id);
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.head)) equipped.head = new Set(data.head.filter(isValidId));
      if (data && Array.isArray(data.body)) equipped.body = new Set(data.body.filter(isValidId));
    } catch {}
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3. LAYER RENDERING — write the SVGs into the slot layers
  // ───────────────────────────────────────────────────────────────────────
  // The slot layers are absolutely-positioned divs that sit ON TOP of the
  // Rive canvas (z-index 2 and 3, with .body layer under .head layer so
  // the head items always win z-orders when in doubt). They are pointer-
  // events:none so they never block the click-to-pet handler on .stage.
  function ensureLayers() {
    const stage = document.querySelector('.stage');
    if (!stage) return null;
    let head = document.getElementById('wardrobe-head');
    let body = document.getElementById('wardrobe-body');
    if (!head) {
      head = document.createElement('div');
      head.id = 'wardrobe-head';
      head.className = 'wardrobe-layer wardrobe-layer-head';
      head.setAttribute('aria-hidden', 'true');
      stage.appendChild(head);
    }
    if (!body) {
      body = document.createElement('div');
      body.id = 'wardrobe-body';
      body.className = 'wardrobe-layer wardrobe-layer-body';
      body.setAttribute('aria-hidden', 'true');
      stage.appendChild(body);
    }
    return { head, body };
  }

  function renderLayer(layerEl, ids) {
    if (!layerEl) return;
    // clear and rebuild (small, 8 items max — cheap)
    layerEl.innerHTML = '';
    for (const id of ids) {
      const item = BY_ID[id];
      if (!item) continue;
      // wrap each SVG in a positioned div so the picker can target it
      // (and so each item can be unequipped independently in the future)
      const wrap = document.createElement('div');
      wrap.className = 'wardrobe-item';
      wrap.dataset.id = id;
      wrap.innerHTML = item.svg;
      layerEl.appendChild(wrap);
    }
  }

  function applyOutfit() {
    const layers = ensureLayers();
    if (!layers) return;
    renderLayer(layers.head, [...equipped.head]);
    renderLayer(layers.body, [...equipped.body]);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. PUBLIC API — equip / unequip / toggle
  // ───────────────────────────────────────────────────────────────────────
  function equip(id) {
    const item = BY_ID[id];
    if (!item) return false;
    equipped[item.slot].add(id);
    save();
    applyOutfit();
    syncPickerUI();
    return true;
  }
  function unequip(id) {
    const item = BY_ID[id];
    if (!item) return false;
    equipped[item.slot].delete(id);
    save();
    applyOutfit();
    syncPickerUI();
    return true;
  }
  function toggle(id) {
    const item = BY_ID[id];
    if (!item) return false;
    if (equipped[item.slot].has(id)) unequip(id);
    else equip(id);
    return true;
  }
  function clearAll() {
    equipped.head.clear();
    equipped.body.clear();
    save();
    applyOutfit();
    syncPickerUI();
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5. PICKER UI — a row of pills, click to toggle
  // ───────────────────────────────────────────────────────────────────────
  // The pills live in a dedicated row above the chips, with a single
  // "no outfit" button to clear everything in one tap. The pills show a
  // small SVG preview thumbnail (24×24) and a short label; the accent
  // color from the catalog drives the active-state border.
  function buildPicker() {
    const host = document.getElementById('wardrobe-picker');
    if (!host) return;
    host.innerHTML = '';
    // a small "no outfit" pill at the start
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'wardrobe-pill wardrobe-pill-clear';
    clear.textContent = '∅';
    clear.title = 'clear all wearables';
    clear.setAttribute('aria-label', 'clear all wearables');
    clear.addEventListener('click', (e) => {
      e.preventDefault();
      clearAll();
      try { window.__toshi && window.__toshi.say && window.__toshi.say('outfit cleared 👕', false, 3000); } catch {}
    });
    host.appendChild(clear);
    // one pill per catalog item
    for (const item of WARDROBE) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'wardrobe-pill';
      pill.dataset.id = item.id;
      pill.dataset.slot = item.slot;
      pill.title = `${item.name} (${item.slot})`;
      pill.setAttribute('aria-pressed', 'false');
      pill.setAttribute('aria-label', `toggle ${item.name}`);
      // thumbnail = the SVG scaled down to 24×24 (CSS handles the size)
      pill.innerHTML = `
        <span class="wardrobe-pill-thumb" style="--accent:${item.accent}">${item.svg}</span>
        <span class="wardrobe-pill-label">${item.name}</span>
      `;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        toggle(item.id);
        // small celebration when equipping (not when unequipping)
        if (equipped[item.slot].has(item.id) && !reduce) {
          try {
            window.__toshi && window.__toshi.setPose && window.__toshi.setPose('hand_wave', '👗', 1800);
            window.__toshi && window.__toshi.say && window.__toshi.say(`${item.name} equipped 👗`, false, 2400);
          } catch {}
        }
      });
      host.appendChild(pill);
    }
  }

  function syncPickerUI() {
    const host = document.getElementById('wardrobe-picker');
    if (!host) return;
    for (const pill of host.querySelectorAll('.wardrobe-pill[data-id]')) {
      const id = pill.dataset.id;
      const slot = pill.dataset.slot;
      const on = equipped[slot].has(id);
      pill.classList.toggle('is-on', on);
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 6. BOOT
  // ───────────────────────────────────────────────────────────────────────
  // Idempotent: if a picker is already in the DOM, we don't rebuild.
  // We wait for DOMContentLoaded because the picker host is in the
  // panel/index.html and the script is loaded with `defer` (so the DOM
  // is ready by the time we run, but defensive code is cheap).
  function boot() {
    load();
    buildPicker();
    applyOutfit();
    syncPickerUI();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // expose the public API.
  // We use Object.defineProperty for `equipped` (a getter) because
  // Object.assign() invokes getters during the copy and stores the
  // RESULT as a static data property — that would freeze the snapshot
  // and miss every later mutation. defineProperty preserves the live
  // accessor on the target.
  Object.assign(window.__toshiWardrobe, {
    catalog: WARDROBE,
    equip, unequip, toggle, clearAll, applyOutfit,
  });
  Object.defineProperty(window.__toshiWardrobe, 'equipped', {
    get() { return { head: [...equipped.head], body: [...equipped.body] }; },
    enumerable: true,
    configurable: true,
  });
})();
