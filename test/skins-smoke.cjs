'use strict';
// Runtime smoke for panel/skins.js — the mascot skin engine. Catches ReferenceErrors + proves every skin
// applies headless (no Electron, no Rive, no browser). Mirrors test/animations-smoke.cjs. GPL-3.0.
//   node test/skins-smoke.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');

const noop = () => {};
const el = () => ({
  style: { setProperty: noop, removeProperty: noop }, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop, insertBefore: noop, setAttribute: noop, addEventListener: noop, removeEventListener: noop,
  querySelector: () => el(), querySelectorAll: () => [], dataset: {}, isConnected: true, firstChild: null,
  get parentNode() { return el(); }, get nextSibling() { return el(); }, textContent: '', title: '',
});
function harness() {
  const store = {};
  const doc = {
    readyState: 'complete',
    querySelector: (sel) => el(),          // '.stage' exists → boot runs
    querySelectorAll: () => [],
    getElementById: () => el(),
    createElement: () => el(),
    addEventListener: noop,
    head: el(), body: el(), documentElement: el(),
  };
  let poses = 0;
  const win = {
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    __toshi: { setPose: () => { poses++; } },
    document: doc, setTimeout, clearTimeout,
  };
  win.window = win;
  const ctx = { window: win, document: doc, matchMedia: win.matchMedia, localStorage: win.localStorage, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'panel', 'skins.js'), 'utf8'), ctx);
  return { win, store, poses: () => poses };
}

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); } };

console.log('panel skins — runtime smoke (mascot skin engine, headless):');

let H;
t('skins.js loads + exposes __toshiSkins with a 6-skin catalog', () => {
  H = harness();
  const S = H.win.__toshiSkins;
  if (!S || typeof S.apply !== 'function') throw new Error('__toshiSkins.apply missing');
  const cat = S.catalog;
  if (!Array.isArray(cat) || cat.length !== 6) throw new Error('expected 6 skins, got ' + (cat && cat.length));
  if (!cat.every((s) => s.id && s.name && s.accent && 'filter' in s && s.aura)) throw new Error('a skin is missing a field');
});
t('default skin after boot is "based" (canonical Toshi)', () => {
  if (H.win.__toshiSkins.current !== 'based') throw new Error('current=' + H.win.__toshiSkins.current);
});
t('apply(each skin) never throws + updates .current + persists', () => {
  const S = H.win.__toshiSkins;
  for (const s of S.catalog) {
    S.apply(s.id);
    if (S.current !== s.id) throw new Error('current not updated for ' + s.id);
  }
  if (H.store['toshi.skin'] !== 'sunset') throw new Error('last apply not persisted: ' + H.store['toshi.skin']);
});
t('unknown skin id falls back to the default (no crash)', () => {
  const S = H.win.__toshiSkins; S.apply('does-not-exist');
  if (S.current !== 'based') throw new Error('bad id should fall back to based, got ' + S.current);
});
t('clear() returns to based', () => {
  const S = H.win.__toshiSkins; S.apply('noir'); S.clear();
  if (S.current !== 'based') throw new Error('clear did not reset');
});
t('a saved skin is restored on boot (persistence round-trip)', () => {
  const H2 = harness();
  H2.store['toshi.skin'] = 'midnight';
  const H3 = harness(); H3.store['toshi.skin'] = 'midnight';
  // fresh harness reads its own store; simulate by seeding then re-loading
  const store = { 'toshi.skin': 'gold' };
  const doc = { readyState: 'complete', querySelector: () => el(), querySelectorAll: () => [], getElementById: () => el(), createElement: () => el(), addEventListener: noop, head: el(), body: el(), documentElement: el() };
  const win = { matchMedia: () => ({ matches: false, addEventListener: noop }), localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: noop }, __toshi: { setPose: noop }, document: doc, setTimeout, clearTimeout };
  win.window = win;
  const ctx = { window: win, document: doc, matchMedia: win.matchMedia, localStorage: win.localStorage, setTimeout, clearTimeout, console };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'panel', 'skins.js'), 'utf8'), ctx);
  if (win.__toshiSkins.current !== 'gold') throw new Error('saved skin not restored, got ' + win.__toshiSkins.current);
});

console.log('\n' + pass + ' passed · ' + fail + ' failed');
process.exit(fail ? 1 : 0);
