'use strict';
// Toshi v2 — SEE-SERVE: the window answers `toshi_see` for an agent. GPL-3.0.
// =================================================================================================
// The last link of the EYES chain, and the one that was missing. eyes.cjs captures a frame,
// eyes-read.cjs turns it into an honest ScreenContext — and until now both only ever spoke to the
// bubble. An MCP client (Claude Code, openclaude, Cline) could ask Toshi about the REPO but never
// about the SCREEN, because `desktopCapturer` exists only inside Electron and the MCP brain is plain
// Node. So the brain queues a request on /health, and this module — running in the Electron main
// process, where the eyes already live — picks it up, reads, and POSTs back a ScreenContext.
//
// ⚠️ WHAT CROSSES THE BOUNDARY: never pixels. The PNG stays in the main process and dies there; only
// the ScreenContext (app, title, kind, text/summary, confidence, mustLabel/label) is sent.
//
// ⚠️ WHY THE FAILURE PATHS ARE THE POINT. On a screen reader, "I could not look" and "there was
// nothing to see" are opposite answers that a lazy implementation renders identically. Every failure
// here therefore carries its OWN reason and never degrades into an empty ScreenContext:
//     no_grant       — the user has not picked a source. A refusal, not an empty screen.
//     source_gone    — the granted window was closed between the grant and the capture.
//     capture_failed — the backend returned no frame.
//     read_failed    — the read ladder threw (it is written not to, so this is a real surprise).
// The consent gate is NOT re-implemented here: `eyes.capture()` throws on an ungranted source, and
// that throw is carried up as an answer instead of being swallowed. Re-checking it here would create
// a second place for the rule to live, and two copies of a rule is how one of them drifts.
//
// Decision-agnostic, like the rest of the v2 chain: `eyes`, `reader` and the HTTP verbs are injected,
// so this file runs — and is proved — with no Electron and no network. See see-serve-smoke.cjs.

/**
 * @param {object} deps
 *   eyes      — from createEyes(): needs grants() and capture()
 *   reader    — from createReader(): needs read(frame, opts)
 *   postJson  — async (path, body) => any        (the window → brain reply channel)
 *   sourceId  — optional: pin one source. Default: the first GRANTED one.
 */
function createSeeServer({ eyes, reader, postJson, sourceId = null } = {}) {
  if (!eyes || typeof eyes.capture !== 'function') throw new Error('createSeeServer: eyes with capture() required');
  if (!reader || typeof reader.read !== 'function') throw new Error('createSeeServer: reader with read() required');
  if (typeof postJson !== 'function') throw new Error('createSeeServer: postJson(path, body) required');

  /** Which source do we look at? The pinned one, else the first the user actually granted. */
  function cible() {
    if (sourceId) return sourceId;
    const g = (typeof eyes.grants === 'function' ? eyes.grants() : []) || [];
    // grants() may hand back ids or {sourceId,...} records depending on the store — accept both rather
    // than assume, because guessing the shape here would fail silently as "no source granted".
    const premier = g[0];
    if (!premier) return null;
    return typeof premier === 'string' ? premier : (premier.sourceId || premier.id || null);
  }

  /** Answer ONE queued request. Always resolves — the reply itself carries success or the reason. */
  async function answerOnce(request) {
    if (!request || !request.id) return null;
    const { id, want = 'text', allowCloud = false } = request;

    const src = cible();
    if (!src) {
      return postJson('/see-result', { id, reason: 'no_grant',
        error: 'No screen source has been granted. Toshi never captures implicitly — pick a window or '
          + 'screen in Toshi first. Nothing was read, which is not the same as an empty screen.' });
    }

    let frame;
    try {
      frame = await eyes.capture(src);
    } catch (e) {
      // eyes.capture() distinguishes these itself; keep its wording and just classify it for the caller.
      const m = String((e && e.message) || e);
      const reason = /not granted/i.test(m) ? 'no_grant' : /is gone/i.test(m) ? 'source_gone' : 'capture_failed';
      return postJson('/see-result', { id, reason, error: m });
    }

    let context;
    try {
      context = await reader.read(
        { png: frame.png, app: frame.app || null, title: frame.name || null },
        { want, allowCloud });
    } catch (e) {
      return postJson('/see-result', { id, reason: 'read_failed', error: String((e && e.message) || e) });
    }

    // The frame is deliberately NOT returned. `bytes` travels so a caller can see a frame really existed
    // — a ScreenContext with an empty text and no frame is a different story from one with a 200 KB frame
    // behind it, and only the second means "we looked and there was nothing readable".
    return postJson('/see-result', { id, sourceName: frame.name || null, tier: frame.tier || null,
      frameBytes: frame.bytes || 0, context });
  }

  return { answerOnce, cible };
}

module.exports = { createSeeServer };
