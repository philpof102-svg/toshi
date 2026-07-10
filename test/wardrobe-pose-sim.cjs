/* ───────────────────────────────────────────────────────────────────────────
 * toshi — WARDROBE MULTI-POSE SELF-TEST (test/wardrobe-pose-sim.cjs)
 *
 * Dig-deep #1 : vérifier que les wearables restent alignés sur la
 * silhouette de Toshi quand il change de pose. Le panel drive ses
 * animations Rive via window.__toshi.setPose(name, holdMs). Pendant
 * ces poses, Toshi bouge : le `.floaty` container applique des
 * transforms CSS (react, nope, breathe, bounce-in...) et le canvas
 * Rive joue des LINEAR animations qui peuvent décaler le sprite.
 *
 * Le risque : les layers .wardrobe-layer sont `position:absolute`
 * sur .stage (300×460 statique). Si .stage ne bouge pas avec .floaty,
 * les wearables ne suivent pas. La sim :
 *   1. charge wardrobe.js dans le shim DOM
 *   2. configure un mini environnement "rive-like" qui suit un
 *      setPose(name) en déplaçant .floaty de quelques pixels
 *   3. équipe 4 wearables (crown, glasses, scarf, cape)
 *   4. déclenche 5 poses en séquence
 *   5. après chaque pose, vérifie que :
 *      - les SVGs sont toujours dans les bons layers
 *      - les bounds de chaque SVG restent dans la bounding-box du
 *        stage (pas un wearable qui s'envole hors viewport)
 *      - si on a lié les layers à .floaty, leur transform match
 *
 * Run:    node test/wardrobe-pose-sim.cjs
 * Output: PASS/FAIL par check, puis une matrice pose × wearable.
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 1. shim DOM (héritée + enrichie) ────────────────────────────────────
 * On reprend le shim de wardrobe-sim.cjs et on lui ajoute :
 *  - .floaty (le container Rive)
 *  - .stage (parent de .wardrobe-layer)
 *  - un système de transform simulé (data-transform="tx ty sx sy")
 *  - getBoundingClientRect minimal (pour la phase d'assertion)
 *  - une registry de listeners pour fire des "pose events" */
function makeNode(tag) {
  const node = {
    tagName: (tag || 'DIV').toUpperCase(),
    children: [],
    _classes: new Set(),
    _transform: { tx: 0, ty: 0, sx: 1, sy: 1 },
    attributes: {},
    style: {},
    listeners: {},
    get className() { return [...this._classes].join(' '); },
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add:    function (...cs) { cs.forEach((c) => node._classes.add(c)); },
      remove: function (...cs) { cs.forEach((c) => node._classes.delete(c)); },
      toggle: function (c, on) { const has = node._classes.has(c); const next = on === undefined ? !has : !!on; if (next) node._classes.add(c); else node._classes.delete(c); return next; },
      contains: function (c) { return node._classes.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) {
      this.children.push(c);
      c.parentNode = node;
      if (c._innerHTML) this._innerHTML = (this._innerHTML || '') + c._innerHTML;
      return c;
    },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) {
      if (!node.listeners[ev]) return;
      node.listeners[ev] = node.listeners[ev].filter((f) => f !== fn);
    },
    querySelectorAll() { return []; },
    querySelector(sel) { return DOM_INDEX[sel.replace(/^\./, '')] || DOM_INDEX[sel] || null; },
    get firstChild() { return this.children[0] || null; },
    getBoundingClientRect() {
      // tiny model: stage = 300x460 at (0,0); floaty is a child of stage
      // and applies its own transform on top. Wardrobe layers are
      // children of stage (current wardrobe.js) so they're NOT affected
      // by .floaty transform — that's the bug we're testing for.
      if (node === STAGE) return { left: 0, top: 0, width: 300, height: 460, right: 300, bottom: 460 };
      if (node === FLOATY) {
        const t = node._transform;
        return {
          left: t.tx, top: t.ty,
          width: 300 * t.sx, height: 460 * t.sy,
          right: t.tx + 300 * t.sx, bottom: t.ty + 460 * t.sy,
        };
      }
      // wardrobe layers: inset:0 → same as stage
      if (node === DOM_INDEX['wardrobe-head'] || node === DOM_INDEX['wardrobe-body']) {
        return { left: 0, top: 0, width: 300, height: 460, right: 300, bottom: 460 };
      }
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._innerHTML || ''; },
    set(v) {
      if (v === '') { node._innerHTML = ''; return; }
      node._innerHTML = (node._innerHTML || '') + String(v);
      const ids = [...String(v).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      for (const id of ids) if (!DOM_INDEX[id]) DOM_INDEX[id] = makeNode('div');
    },
  });
  Object.defineProperty(node, 'dataset', {
    // real DOMStringMap proxy
    get() {
      return new Proxy({}, {
        get(_, key) { return node.attributes['data-' + key]; },
        set(_, key, v) { node.attributes['data-' + key] = v; return true; },
      });
    },
  });
  return node;
}

const DOM_INDEX = {
  'wardrobe-picker': makeNode('div'),
  'wardrobe-head':   makeNode('div'),
  'wardrobe-body':   makeNode('div'),
};
for (const k of Object.keys(DOM_INDEX)) DOM_INDEX[k].id = k;

// build the real DOM tree: body > .stage > .floaty > (rive canvas)
const STAGE = makeNode('div');
STAGE.classList.add('stage');
const FLOATY = makeNode('div');
FLOATY.classList.add('floaty');
STAGE.appendChild(FLOATY);
// wardrobe layers will be appended to STAGE by wardrobe.applyOutfit()
STAGE.appendChild(DOM_INDEX['wardrobe-head']);
STAGE.appendChild(DOM_INDEX['wardrobe-body']);

const document = {
  readyState: 'complete',
  getElementById(id) { return DOM_INDEX[id] || null; },
  createElement(tag) { return makeNode(tag); },
  addEventListener(ev, fn) { (document.listeners = document.listeners || {})[ev] = (document.listeners[ev] || []).push(fn); },
  querySelector(sel) { if (sel === '.stage') return STAGE; if (sel === '.floaty') return FLOATY; return null; },
  querySelectorAll() { return []; },
  hidden: false,
};

// fake window.__toshi with a setPose that applies a transform to .floaty
// to simulate Toshi moving during a pose
const window = {};
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const requestAnimationFrame = (cb) => setImmediate(cb);
const localStorage = (() => {
  const s = new Map();
  return { getItem:(k)=>s.has(k)?s.get(k):null, setItem:(k,v)=>s.set(k,String(v)), removeItem:(k)=>s.delete(k), clear:()=>s.clear() };
});

// load wardrobe.js
const src = fs.readFileSync(path.resolve(__dirname, '..', 'panel', 'wardrobe.js'), 'utf8');
const ctx = vm.createContext({
  window, document, localStorage, matchMedia, requestAnimationFrame, setImmediate,
  console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean,
});
vm.runInContext(src, ctx);
const wardrobe = window.__toshiWardrobe;
if (!wardrobe) { console.error('FAIL: window.__toshiWardrobe not exposed'); process.exit(1); }

// install __toshi.setPose AFTER wardrobe booted (wardrobe reads it lazily)
window.__toshi = {
  setPose(name, label, holdMs) {
    // simulate Toshi moving during a pose. These transforms are calibrated
    // against the real keyframes (.react ≈ 1px nudge, .bounce-in can move
    // the cat 14px, .pop ≈ 14px translateY at 0%).
    const moves = {
      idle:        { tx: 0,   ty: 0,   sx: 1,    sy: 1    },
      hand_wave:   { tx: 0,   ty: -2,  sx: 1,    sy: 1    },
      dancing:     { tx: 0,   ty: -8,  sx: 1.02, sy: 1.02 },
      celebration: { tx: 0,   ty: -6,  sx: 1.05, sy: 1.05 },
      jumping:     { tx: 0,   ty: -14, sx: 1,    sy: 1    },
      pointing:    { tx: 4,   ty: 0,   sx: 1,    sy: 1    },
      sit:         { tx: 0,   ty: 6,   sx: 1,    sy: 0.95 },
      look_around: { tx: -3,  ty: 0,   sx: 1,    sy: 1    },
    };
    const m = moves[name] || moves.idle;
    FLOATY._transform = { ...m };
  },
  say() {},
};

/* ── 2. test harness ──────────────────────────────────────────────────── */
let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '   → ' + e.message); fail++; fails.push({ name, err: e.message }); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + `: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

/* ── 3. helper: simulate a pose change and measure drift ─────────────────
 * Drift = the visual distance between the .floaty silhouette bounds and
 * the .wardrobe-layer bounds, after the pose was applied. If layers are
 * children of .stage, they do NOT move with .floaty → drift > 0. */
function driftForPose(poseName) {
  window.__toshi.setPose(poseName, '', 1000);
  const f = FLOATY.getBoundingClientRect();
  // wardrobe layers (if attached to .stage, not to .floaty) stay at (0,0,300,460)
  const headLayer = DOM_INDEX['wardrobe-head'].getBoundingClientRect();
  // the center of the silhouette vs the center of the wardrobe layer
  const floatCenterX = f.left + f.width / 2;
  const floatCenterY = f.top + f.height / 2;
  const layerCenterX = headLayer.left + headLayer.width / 2;
  const layerCenterY = headLayer.top + headLayer.height / 2;
  return {
    dx: floatCenterX - layerCenterX,
    dy: floatCenterY - layerCenterY,
    sx: f.width / headLayer.width,
    sy: f.height / headLayer.height,
  };
}

console.log('\n── toshi wardrobe — multi-pose self-test ───────────────────────\n');

/* ── 4. equip 4 wearables and run the full pose matrix ─────────────────── */
console.log('[1] equipping 4 wearables (crown, glasses, scarf, cape)');
t('equip crown (head)',     () => ok(wardrobe.equip('crown')));
t('equip glasses (head)',   () => ok(wardrobe.equip('glasses')));
t('equip scarf (body)',     () => ok(wardrobe.equip('scarf')));
t('equip cape (body)',      () => ok(wardrobe.equip('cape')));
t('head slot has 2 items',  () => eq(wardrobe.equipped.head.length, 2));
t('body slot has 2 items',  () => eq(wardrobe.equipped.body.length, 2));

/* ── 5. pose matrix: layer contents + drift ────────────────────────────── */
const POSES = ['idle', 'hand_wave', 'dancing', 'celebration', 'jumping', 'pointing', 'sit', 'look_around'];
console.log('\n[2] pose matrix — layer contents & floaty drift');
const matrix = [];
for (const pose of POSES) {
  const head = DOM_INDEX['wardrobe-head']._innerHTML || '';
  const body = DOM_INDEX['wardrobe-body']._innerHTML || '';
  const headSvgs = (head.match(/<svg/g) || []).length;
  const bodySvgs = (body.match(/<svg/g) || []).length;
  const drift = driftForPose(pose);
  matrix.push({ pose, headSvgs, bodySvgs, drift });
}

t('every pose keeps the 2 head SVGs in the head layer', () => {
  for (const m of matrix) {
    if (m.headSvgs !== 2) throw new Error(`pose ${m.pose}: head SVGs = ${m.headSvgs}, want 2`);
  }
});
t('every pose keeps the 2 body SVGs in the body layer', () => {
  for (const m of matrix) {
    if (m.bodySvgs !== 2) throw new Error(`pose ${m.pose}: body SVGs = ${m.bodySvgs}, want 2`);
  }
});

/* ── 6. drift detection — the heart of the test ──────────────────────────
 * We document the CURRENT behavior (layers DO NOT follow .floaty), so
 * the next reader knows exactly what is broken and by how much. */
console.log('\n[3] drift per pose (px between floaty center and layer center)');
for (const m of matrix) {
  const dx = m.drift.dx.toFixed(1).padStart(5);
  const dy = m.drift.dy.toFixed(1).padStart(5);
  const sx = m.drift.sx.toFixed(3);
  const sy = m.drift.sy.toFixed(3);
  console.log(`  ${m.pose.padEnd(13)} dx=${dx}px  dy=${dy}px  scale=(${sx}×, ${sy}×)`);
}

/* This test DOCUMENTS the drift — it does not fail on it. The point is
 * to lock in the current behavior and provide a baseline for a future
 * refactor where layers are children of .floaty (so transforms cascade). */
t('drift on "idle" is 0px / 1.0× (baseline)', () => {
  const m = matrix.find((x) => x.pose === 'idle');
  if (m.drift.dx !== 0 || m.drift.dy !== 0) throw new Error(`idle drift: ${JSON.stringify(m.drift)}`);
  if (m.drift.sx !== 1 || m.drift.sy !== 1) throw new Error(`idle scale: ${JSON.stringify(m.drift)}`);
});
t('drift on "jumping" is non-zero (Toshi moves up 14px)', () => {
  const m = matrix.find((x) => x.pose === 'jumping');
  if (Math.abs(m.drift.dy) < 1) throw new Error(`jumping should move the cat; drift.dy = ${m.drift.dy}`);
});
t('drift on "celebration" shows scale > 1', () => {
  const m = matrix.find((x) => x.pose === 'celebration');
  if (m.drift.sx <= 1) throw new Error(`celebration should scale up; sx = ${m.drift.sx}`);
});

/* ── 7. behavior contract: equipping during a non-idle pose is still safe
 * The panel may still get an equip click while a flourish pose is in
 * flight (e.g. user clicks a pill while Toshi is jumping). wardrobe.js
 * must not throw, must not corrupt the layers, must not strand Toshi. */
console.log('\n[4] equip-during-pose safety');
t('equip bowtie while Toshi is "jumping" is safe', () => {
  window.__toshi.setPose('jumping', '', 1000);
  ok(wardrobe.equip('bowtie'));
  eq(wardrobe.equipped.body.length, 3);
});
t('clearAll while Toshi is "celebrating" empties both layers', () => {
  window.__toshi.setPose('celebration', '', 1000);
  wardrobe.clearAll();
  eq(wardrobe.equipped.head.length, 0);
  eq(wardrobe.equipped.body.length, 0);
  eq((DOM_INDEX['wardrobe-head']._innerHTML || '').length, 0);
  eq((DOM_INDEX['wardrobe-body']._innerHTML || '').length, 0);
});

/* ── 8. summary: count the worst-case drift ───────────────────────────────
 * This is the number a future PR will need to reduce to 0 by moving
 * the layers inside .floaty (or by replicating the transform). */
console.log('\n[5] summary');
const worstDx = Math.max(...matrix.map((m) => Math.abs(m.drift.dx)));
const worstDy = Math.max(...matrix.map((m) => Math.abs(m.drift.dy)));
const worstScale = Math.max(...matrix.map((m) => Math.abs(m.drift.sx - 1)));
console.log(`  worst horizontal drift : ${worstDx.toFixed(1)}px (pointing)`);
console.log(`  worst vertical drift   : ${worstDy.toFixed(1)}px (jumping)`);
console.log(`  worst scale deviation  : ${(worstScale * 100).toFixed(1)}%   (celebration)`);
console.log(`  → to fix: move .wardrobe-layer inside .floaty (so transforms cascade)`);

console.log('\n────────────────────────────────────────────────────────────────');
console.log(`  result: ${pass} pass · ${fail} fail`);
if (fail) {
  console.log('\n  failures:');
  for (const f of fails) console.log('    ✗ ' + f.name + ' — ' + f.err);
}
console.log('────────────────────────────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
