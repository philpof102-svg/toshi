'use strict';
// Toshi v2 — THE EYES: consent-gated, privacy-local screen capture core. GPL-3.0.
// =================================================================================================
// This is the MVP foundation from the v2 design (Toshi-v2-design.md). It runs in the Electron MAIN
// process — the overlay disables the GPU process-wide (main.cjs:19-22), so a renderer getUserMedia
// path risks BLACK FRAMES; capture happens here via desktopCapturer + NativeImage.toPNG().
//
// The load-bearing invariants (this module ENFORCES them, it's not just copy):
//  1. A glance is enumerated with NO pixels first — getSources({thumbnailSize:{width:0,height:0}}) —
//     so the consent picker never leaks a frame. Real pixels are only fetched AFTER a grant.
//  2. Capture REQUIRES a prior, per-source grant. No grant → throw. No implicit "see everything".
//  3. A frame is EPHEMERAL: returned in memory as a PNG Buffer, never written to disk by this module.
//  4. This module never STARTS a capture on its own — the caller (the overlay gesture) does. It exposes
//     no network surface; the HTTP/MCP server must never be able to call capture().
//  5. Honesty gate: if screen-derived text will reach a NON-local answer model, the caller MUST label it
//     ("screen text sent to <model>"). screenTextProvenance() computes that decision; it never hides it.
//
// The desktopCapturer backend + the grant store are INJECTED, so all of this logic is unit-testable
// without a live Electron (see test/eyes-smoke.cjs). In production, wire { capturer: electron.desktopCapturer }.

const TIERS = Object.freeze(['read', 'point', 'full']); // mirrors the computer-use per-app tiers

// A tiny in-memory grant store (the real one persists to ~/.toshi.json via the broker; injectable).
function memoryStore() {
  const grants = new Map(); // sourceId -> { tier, at }
  return {
    get: (id) => grants.get(id) || null,
    set: (id, g) => grants.set(id, g),
    del: (id) => grants.delete(id),
    clear: () => grants.clear(),
    list: () => Array.from(grants.entries()).map(([id, g]) => ({ id, ...g })),
  };
}

// capturer must implement getSources(opts) -> Promise<[{ id, name, appIcon?, thumbnail? }]>
// where thumbnail (when requested) is a NativeImage-like { toPNG(): Buffer }.
function createEyes({ capturer, store = memoryStore(), now = () => 0 } = {}) {
  if (!capturer || typeof capturer.getSources !== 'function')
    throw new Error('createEyes: a capturer with getSources() is required');

  // 1. Enumerate windows/screens for the CONSENT PICKER — explicitly NO pixels.
  async function enumerate() {
    const sources = await capturer.getSources({
      types: ['window', 'screen'],
      fetchWindowIcons: true,
      thumbnailSize: { width: 0, height: 0 }, // ← the no-pixels invariant; changing this leaks a frame
    });
    // hand back only what the picker needs — id + name + icon. Never a thumbnail here.
    return (sources || []).map((s) => ({ id: s.id, name: s.name, appIcon: s.appIcon || null }));
  }

  // 2. Record / revoke consent for one source (persisted by the store).
  function grant(sourceId, tier = 'read') {
    if (!sourceId) throw new Error('grant: sourceId required');
    if (!TIERS.includes(tier)) throw new Error(`grant: tier must be one of ${TIERS.join('|')}`);
    store.set(sourceId, { tier, at: now() });
    return { sourceId, tier };
  }
  function revoke(sourceId) { store.del(sourceId); }
  function revokeAll() { store.clear(); } // the panic path
  function grants() { return store.list(); }
  function isGranted(sourceId) { return !!store.get(sourceId); }

  // 3. Capture ONE ephemeral frame of a GRANTED source. Throws if not granted. Never writes disk.
  async function capture(sourceId, { width = 1280, height = 720 } = {}) {
    const g = store.get(sourceId);
    if (!g) throw new Error(`capture: "${sourceId}" is not granted — the user must pick it first (no implicit capture)`);
    const sources = await capturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width, height } });
    const src = (sources || []).find((s) => s.id === sourceId);
    if (!src) throw new Error(`capture: granted source "${sourceId}" is gone (window closed?)`);
    if (!src.thumbnail || typeof src.thumbnail.toPNG !== 'function')
      throw new Error('capture: backend returned no thumbnail — cannot produce a frame');
    const png = src.thumbnail.toPNG(); // a Buffer, in memory only
    return { sourceId, tier: g.tier, name: src.name, png, bytes: png.length, at: now() };
    // NOTE: intentionally no fs write anywhere in this function — the frame lives and dies in memory.
  }

  return { enumerate, grant, revoke, revokeAll, grants, isGranted, capture };
}

// 5. The honesty gate — decide how screen-derived TEXT may reach the answer model, and label it if it leaves.
// hasScreenSource: is any screen-read fact in this answer? answerModelIsLocal: is the answer LLM on-device?
// Returns { allow, mustLabel, label } — the caller renders `label` as the provenance pill when mustLabel.
function screenTextProvenance({ hasScreenSource, answerModelIsLocal, modelName = 'the cloud model' }) {
  if (!hasScreenSource) return { allow: true, mustLabel: false, label: null };
  if (answerModelIsLocal) return { allow: true, mustLabel: false, label: 'on your machine 🔒' };
  // screen text WILL leave the device → never hide it.
  return { allow: true, mustLabel: true, label: `screen text sent to ${modelName}` };
}

module.exports = { createEyes, screenTextProvenance, memoryStore, TIERS };
