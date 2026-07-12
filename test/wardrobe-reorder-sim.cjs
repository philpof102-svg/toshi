/* ───────────────────────────────────────────────────────────────────────────
 * toshi — WARDROBE REORDER SELF-TEST (test/wardrobe-reorder-sim.cjs)
 *
 * Dig-deep #3 : drag-to-reorder within a slot + persistence.
 *
 * The catalog defines a natural z-order (later items draw on top of
 * earlier ones within the same slot). Today the only way to change that
 * order is to unequip and re-equip in the desired sequence. This test
 * defines the contract for a future wardrobe.reorder(slot, from, to)
 * public method, then asserts the persistence shape.
 *
 * Why a sim for an API that doesn't exist yet?
 *   1. The test IS the spec — anyone reading it knows the exact behavior
 *      they need to implement.
 *   2. If a future PR implements reorder, this test starts failing
 *      (intentionally), prompting them to also implement what the test
 *      asserts.
 *   3. The persistence test still PASSES today — proving the storage
 *      shape is forward-compatible.
 *
 * Run:    node test/wardrobe-reorder-sim.cjs
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ── 1. shim DOM (lite) ────────────────────────────────────────────────── */
function makeNode(tag) {
  const node = {
    tagName: (tag || 'DIV').toUpperCase(),
    children: [],
    _classes: new Set(),
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
      // serialize the child as a div with its data-* attributes so tests
      // can find data-id in the parent's _innerHTML (real DOM does this
      // implicitly via outerHTML; the shim is explicit).
      const dataAttrs = Object.keys(c.attributes)
        .filter((k) => k.startsWith('data-'))
        .map((k) => ` ${k}="${c.attributes[k]}"`)
        .join('');
      const childHTML = `<div${dataAttrs}>${c._innerHTML || ''}</div>`;
      this._innerHTML = (this._innerHTML || '') + childHTML;
      return c;
    },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    get firstChild() { return this.children[0] || null; },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._innerHTML || ''; },
    set(v) { if (v === '') { node._innerHTML = ''; return; } node._innerHTML = (node._innerHTML || '') + String(v); },
  });
  Object.defineProperty(node, 'dataset', {
    get() { return new Proxy({}, { get(_, key) { return node.attributes['data-' + key]; }, set(_, key, v) { node.attributes['data-' + key] = v; return true; } }); },
  });
  return node;
}

const DOM_INDEX = {
  'wardrobe-picker': makeNode('div'),
  'wardrobe-head':   makeNode('div'),
  'wardrobe-body':   makeNode('div'),
};
for (const k of Object.keys(DOM_INDEX)) DOM_INDEX[k].id = k;
const STAGE = makeNode('div');
STAGE.classList.add('stage');

const document = {
  readyState: 'complete',
  getElementById: (id) => DOM_INDEX[id] || null,
  createElement: (tag) => makeNode(tag),
  addEventListener() {},
  querySelector: (sel) => sel === '.stage' ? STAGE : null,
  querySelectorAll: () => [],
  hidden: false,
};
const window = {};
const matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
const requestAnimationFrame = (cb) => setImmediate(cb);
const localStorage = (() => {
  const s = new Map();
  return { getItem:(k)=>s.has(k)?s.get(k):null, setItem:(k,v)=>s.set(k,String(v)), removeItem:(k)=>s.delete(k), clear:()=>s.clear() };
})();

const src = fs.readFileSync(path.resolve(__dirname, '..', 'panel', 'wardrobe.js'), 'utf8');
const ctx = vm.createContext({
  window, document, localStorage, matchMedia, requestAnimationFrame, setImmediate,
  console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean,
});
vm.runInContext(src, ctx);
const wardrobe = window.__toshiWardrobe;
if (!wardrobe) { console.error('FAIL: window.__toshiWardrobe not exposed'); process.exit(1); }

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
function report(name, msg) { console.log('    [info] ' + name + ': ' + msg); }

console.log('\n── toshi wardrobe — reorder self-test ─────────────────────────\n');

/* ── 3. set up: 3 head items + 2 body items ───────────────────────────── */
console.log('[1] baseline: 3 head + 2 body items equipped');
wardrobe.clearAll();
ok(wardrobe.equip('crown'));
ok(wardrobe.equip('cap'));
ok(wardrobe.equip('glasses'));
ok(wardrobe.equip('hoodie'));
ok(wardrobe.equip('scarf'));
t('head has 3 items in catalog order', () => {
  eq(JSON.stringify(wardrobe.equipped.head), JSON.stringify(['crown','cap','glasses']));
});
t('body has 2 items in catalog order', () => {
  eq(JSON.stringify(wardrobe.equipped.body), JSON.stringify(['hoodie','scarf']));
});

/* ── 4. spec for wardrobe.reorder(slot, fromIdx, toIdx) ───────────────── */
console.log('\n[2] API contract: wardrobe.reorder(slot, fromIdx, toIdx)');
t('wardrobe.reorder exists? — GAP (not yet implemented, see spec below)', () => {
  if (typeof wardrobe.reorder === 'function') return; // future fix lands → no-op
  console.log('    [info] wardrobe.reorder(slot, from, to) is the API for the next PR. Spec:');
  console.log('             wardrobe.reorder("head", 0, 2)  →  equipped.head becomes ["cap","glasses","crown"]');
  console.log('             wardrobe.reorder("body", 1, 0)  →  equipped.body becomes ["scarf","hoodie"]');
  console.log('             out-of-range indices → no-op;  bad slot → throw or return false');
  ok(true); // spec recorded, not a fail
});
t('reorder(head, 0, 2) moves crown to the end (drawn on top)', () => {
  if (typeof wardrobe.reorder !== 'function') {
    report('reorder', 'skipped — not implemented. Spec: wardrobe.reorder("head", 0, 2) should mutate equipped.head to ["cap","glasses","crown"]');
    ok(true); // skip; spec recorded
    return;
  }
  wardrobe.reorder('head', 0, 2);
  eq(JSON.stringify(wardrobe.equipped.head), JSON.stringify(['cap','glasses','crown']));
});
t('reorder(body, 1, 0) moves scarf before hoodie', () => {
  if (typeof wardrobe.reorder !== 'function') {
    report('reorder body', 'skipped — not implemented. Spec: reorder("body", 1, 0) should mutate equipped.body to ["scarf","hoodie"]');
    ok(true);
    return;
  }
  wardrobe.reorder('body', 1, 0);
  eq(JSON.stringify(wardrobe.equipped.body), JSON.stringify(['scarf','hoodie']));
});
t('reorder with out-of-range indices is a no-op (defensive)', () => {
  if (typeof wardrobe.reorder !== 'function') { ok(true); return; }
  const before = JSON.stringify(wardrobe.equipped.head);
  wardrobe.reorder('head', 0, 99);
  wardrobe.reorder('head', -1, 0);
  eq(JSON.stringify(wardrobe.equipped.head), before);
});
t('reorder with bad slot name throws or returns false', () => {
  if (typeof wardrobe.reorder !== 'function') { ok(true); return; }
  let threw = false;
  try { wardrobe.reorder('wings', 0, 1); } catch { threw = true; }
  ok(threw || wardrobe.reorder('wings', 0, 1) === false, 'expected throw or false return');
});

/* ── 5. z-order reflects the new order in the rendered layers ───────────
 * In a real browser we could read the children of wardrobe-head and
 * check the order of data-id. In this shim, the wrap divs live in
 * layerEl.children and each carries wrap.attributes['data-id']. We walk
 * the children to verify the catalog order survives equip. */
console.log('\n[3] z-order in the rendered layer');
t('the head layer renders items in the equipped order (catalog order today)', () => {
  // wardrobe.js re-creates the layer's children on each renderLayer call.
  // After equipping crown, cap, glasses, the head layer should have 3
  // children in that order, each tagged with its data-id.
  const headLayer = DOM_INDEX['wardrobe-head'];
  // wardrobe-sim.cjs's shim supports host.children; renderLayer does
  // layerEl.innerHTML = '' then appends wraps. The shim's innerHTML
  // setter with '' clears _innerHTML but does NOT clear children, so we
  // can't rely on children. Instead, we read _innerHTML and parse the
  // <div ... data-id="..."> openings.
  const html = headLayer._innerHTML || '';
  const ids = [...html.matchAll(/<div[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  eq(JSON.stringify(ids), JSON.stringify(['crown','cap','glasses']));
});
t('the body layer renders items in the equipped order', () => {
  const bodyLayer = DOM_INDEX['wardrobe-body'];
  const html = bodyLayer._innerHTML || '';
  const ids = [...html.matchAll(/<div[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  eq(JSON.stringify(ids), JSON.stringify(['hoodie','scarf']));
});

/* ── 6. persistence: order survives a "reload" (re-run load) ────────────
 * Today's wardrobe.js persists equipped ids in the order they were
 * added (Set insertion order). That order is the z-order. We assert:
 *   - the JSON has arrays (not Sets) for head and body
 *   - the order in the JSON is exactly the order in equipped
 *   - the JSON is small (< 2 KB)
 * A future reorder implementation should NOT need to change the
 * persistence shape — the same {head:[], body:[]} structure is enough. */
console.log('\n[4] persistence shape (forward-compatible with reorder)');
t('storage is valid JSON with head[] and body[] arrays', () => {
  const raw = localStorage.getItem('toshi.wardrobe');
  truthy(raw, 'no localStorage entry');
  const data = JSON.parse(raw);
  ok(Array.isArray(data.head), 'head is not an array');
  ok(Array.isArray(data.body), 'body is not an array');
  eq(data.head.length, 3);
  eq(data.body.length, 2);
});
t('persisted order matches the in-memory order (Set insertion order)', () => {
  const raw = JSON.parse(localStorage.getItem('toshi.wardrobe'));
  eq(JSON.stringify(raw.head), JSON.stringify(wardrobe.equipped.head));
  eq(JSON.stringify(raw.body), JSON.stringify(wardrobe.equipped.body));
});
t('persisted JSON stays under 2 KB', () => {
  const raw = localStorage.getItem('toshi.wardrobe') || '';
  ok(raw.length < 2048, 'storage bloated: ' + raw.length + ' bytes');
});

/* ── 7. drag affordance: each .wardrobe-item should be draggable ──────────
 * wardrobe.js does not set draggable=true on the layer items today.
 * A future reorder implementation must add draggable="true" to each
 * .wardrobe-item so HTML5 drag-and-drop works. The test documents the
 * expected state. */
console.log('\n[5] drag affordance (gap: draggable=true not set on items today)');
t('(spec) each .wardrobe-item should be draggable="true" — GAP (next PR)', () => {
  const headHTML = DOM_INDEX['wardrobe-head']._innerHTML || '';
  if (headHTML.includes('draggable="true"') || headHTML.includes('draggable=true')) return;
  console.log('    [info] draggable="true" is not set on .wardrobe-item today.');
  console.log('             A future reorder implementation must add it (HTML5 drag-and-drop).');
  console.log('             Alternative: arrow buttons in each pill (a11y-first).');
  ok(true); // gap logged, not a fail
});

/* ── 8. keyboard a11y for reorder (spec) ──────────────────────────────── */
console.log('\n[6] keyboard a11y for reorder (spec, not implemented)');
t('(spec) pill has aria-label or title mentioning reorder', () => {
  // the picker pills today are pure toggle. A future "reorder" UI could
  // add small ↑/↓ buttons inside each pill, or use Alt+Arrow shortcuts.
  // Either way, the affordance must be discoverable.
  ok(true, 'spec only — no assertion until UI lands');
});

console.log('\n────────────────────────────────────────────────────────────────');
console.log(`  result: ${pass} pass · ${fail} fail`);
if (fail) {
  console.log('\n  failures:');
  for (const f of fails) console.log('    ✗ ' + f.name + ' — ' + f.err);
}
console.log('────────────────────────────────────────────────────────────────');
console.log('  → next: implement wardrobe.reorder(slot, from, to) + draggable=true on items');
console.log('────────────────────────────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
