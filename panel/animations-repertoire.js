/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * toshi — REPERTOIRE (panel/animations-repertoire.js)
 * The third pack, on top of animations-extra.js (flourishes) and animations-sequences.js (choreographies).
 * Those two answer "play THIS". This one answers a different question: WHEN does Toshi move on his own?
 *
 * Same conventions as its two neighbours, deliberately: additive, idempotent, zero deps, zero network,
 * one body pose at a time (only via window.__toshi.setPose), prefers-reduced-motion honoured, and it
 * never overrides the original panel — it reads its public state and yields to it.
 *
 * ⚠️ THE THREE RULES THAT MAKE THIS TASTEFUL INSTEAD OF ANNOYING. This repo already paid for the lesson
 * in desktop/eyes-nudge.cjs (the anti-Clippy gate): a companion that moves while you are reading is not
 * charming, it is an interruption, and an interrupting companion gets closed. So:
 *
 *   1. NEVER INTERRUPT. If a sequence is running (__toshiSeq.current()), if Toshi is speaking, or if the
 *      window is hidden, the tick does nothing — and says so. Yielding is the default, not the exception.
 *   2. ALWAYS COME BACK FACING THE USER. Every move ends by returning to `idle`, which is the front-facing
 *      pose. A companion left in profile reads as broken, and the user cannot tell "mid-animation" from
 *      "stuck". The return is scheduled by the repertoire itself, never assumed from the pose's own end.
 *   3. NEVER TWICE IN A ROW. A repertoire that repeats stops being a repertoire. The last two picks are
 *      remembered and excluded, so a small catalogue still feels varied.
 *
 * ⚠️ AND ONE HONESTY RULE, the same one the rest of this codebase is built on: A MOVE THAT COULD NOT PLAY
 * MUST NOT LOOK LIKE A MOVE THAT PLAYED. `last()` reports the reason a tick did nothing (busy, hidden,
 * reduced-motion, too soon, no pose engine) rather than silently returning. Without it, "Toshi is calm"
 * and "the repertoire is broken" are the same observation — and that is exactly the defect this project
 * hunts everywhere else.
 *
 * Adding a move is one entry in CATALOGUE. Nothing else changes.
 *
 * Exposes window.__toshiRep.{start,stop,play,tick,last,catalogue,version}.
 * ───────────────────────────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__toshiRep) return;                       // idempotent, like its neighbours

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  /* Le catalogue. `weight` = frequence relative; `cost` = duree approximative avant le retour de face.
   * `run` n'utilise QUE des surfaces publiques (setPose / __toshiSeq), donc ajouter une entree ne demande
   * aucune connaissance interne — c'est le point du fichier. */
  var CATALOGUE = [
    { name: 'glance',      weight: 5, cost: 1600, run: function (p) { p.pose('look_around', 1400); } },
    { name: 'stretchSide', weight: 3, cost: 2600, run: function (p) { p.pose('walking_side', 1200); p.after(1300, function () { p.pose('look_around', 900); }); } },
    { name: 'wave',        weight: 2, cost: 1800, run: function (p) { p.pose('hand_wave', 1500); } },
    { name: 'point',       weight: 2, cost: 1600, run: function (p) { p.pose('pointing', 1300); } },
    { name: 'hop',         weight: 2, cost: 1500, run: function (p) { p.pose('jumping', 1200); } },
    { name: 'patrol',      weight: 1, cost: 4000, run: function (p) { p.seq('patrol'); } },
    { name: 'stretch',     weight: 1, cost: 6500, run: function (p) { p.seq('morningStretch'); } },
    { name: 'dance',       weight: 1, cost: 2600, run: function (p) { p.pose('dancing', 2200); } },
  ];

  var MIN_GAP_MS = 45000;      // meme respiration que le watcher: assez rare pour ne pas deranger
  var recent = [];             // les 2 derniers noms joues — jamais deux fois de suite
  var timer = null, running = false, lastAt = 0;
  var lastReport = { at: 0, played: null, skipped: 'never ticked' };

  function pose(name, ms) {
    try { if (window.__toshi && typeof window.__toshi.setPose === 'function') window.__toshi.setPose(name, ms); } catch (e) {}
  }
  function faceUser() { pose('idle', 0); }             // regle 2: on revient TOUJOURS de face

  var owned = [];
  function after(ms, fn) { var id = setTimeout(function () { fn(); }, ms); owned.push(id); return id; }
  function clearOwned() { for (var i = 0; i < owned.length; i++) clearTimeout(owned[i]); owned = []; }

  /** Pourquoi ce tick ne jouera rien — ou null s'il peut jouer. Un seul endroit, pour qu'il n'y ait pas
   *  deux definitions du mot « occupe » qui divergent. */
  function blockedBecause(now, force) {
    if (REDUCED) return 'prefers-reduced-motion';
    if (!window.__toshi || typeof window.__toshi.setPose !== 'function') return 'no pose engine on the panel';
    try { if (document && document.hidden) return 'window hidden'; } catch (e) {}
    try {
      var cur = window.__toshiSeq && window.__toshiSeq.current && window.__toshiSeq.current();
      if (cur && cur.name) return 'a sequence is running (' + cur.name + ')';
    } catch (e) {}
    try { if (document && document.body && document.body.dataset && document.body.dataset.speaking === '1') return 'Toshi is speaking'; } catch (e) {}
    if (!force && now - lastAt < MIN_GAP_MS) return 'too soon (' + Math.round((MIN_GAP_MS - (now - lastAt)) / 1000) + 's to go)';
    return null;
  }

  /** Tirage pondere, en excluant les 2 derniers. Si l'exclusion vide le catalogue (catalogue minuscule),
   *  on retombe sur le catalogue entier plutot que de ne rien jouer — mieux vaut repeter que se figer. */
  function pick() {
    var pool = CATALOGUE.filter(function (m) { return recent.indexOf(m.name) < 0; });
    if (!pool.length) pool = CATALOGUE.slice();
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].weight;
    var r = Math.random() * total;
    for (i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  function play(name) {
    var move = null, i;
    for (i = 0; i < CATALOGUE.length; i++) if (CATALOGUE[i].name === name) move = CATALOGUE[i];
    if (!move) { lastReport = { at: Date.now(), played: null, skipped: 'unknown move: ' + name }; return null; }
    clearOwned();
    var api = {
      pose: pose,
      after: after,
      seq: function (n) { try { if (window.__toshiSeq && typeof window.__toshiSeq[n] === 'function') window.__toshiSeq[n](); } catch (e) {} },
    };
    try { move.run(api); } catch (e) { lastReport = { at: Date.now(), played: null, skipped: 'move threw: ' + (e && e.message) }; return null; }
    // Regle 2, appliquee par NOUS: on ne suppose pas que la pose revienne d'elle-meme.
    after(move.cost, faceUser);
    lastAt = Date.now();
    recent.push(move.name); while (recent.length > 2) recent.shift();
    lastReport = { at: lastAt, played: move.name, skipped: null };
    return move.name;
  }

  function tick(force) {
    var now = Date.now();
    var why = blockedBecause(now, !!force);
    if (why) { lastReport = { at: now, played: null, skipped: why }; return null; }
    return play(pick().name);
  }

  function start(everyMs) {
    if (running) return;
    running = true;
    var period = Math.max(5000, Number(everyMs) || 20000);   // on TENTE souvent, on JOUE rarement (MIN_GAP)
    timer = setInterval(function () { tick(false); }, period);
  }
  function stop() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    clearOwned();
    faceUser();                                              // on ne laisse jamais Toshi de profil
  }

  window.__toshiRep = {
    version: '1.0.0',
    start: start,
    stop: stop,
    play: play,
    tick: tick,
    last: function () { return { at: lastReport.at, played: lastReport.played, skipped: lastReport.skipped, running: running }; },
    catalogue: function () { return CATALOGUE.map(function (m) { return { name: m.name, weight: m.weight, cost: m.cost }; }); },
  };

  // Demarrage doux: on ne bouge pas pendant que la fenetre s'installe.
  if (!REDUCED) setTimeout(function () { start(20000); }, 12000);
})();
