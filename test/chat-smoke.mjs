// Runtime smoke for the chat box — the feature Phil asked to "fix" (a fresh Toshi must chat, not dead-end). GPL-3.0.
// WHY THIS EXISTS: `ac4ea80` gave the panel a real chat box; `8b89412` fixed the dead default model. The box has
// TWO cores a fresh install depends on, and neither is covered by simulate.mjs:
//   1. the ROUTER — a repo question ("qui appelle X") must hit the graph; small talk ("salut") must hit chat().
//      A French router regression once made every FR question fall through to the same phrase (looked frozen),
//      and extractTerm once returned the verb ('appelle') instead of the symbol ('fetchUser') — both silent.
//   2. GRACEFUL DEGRADATION — with no model configured yet (the exact "un nouveau toshi" state), the box must
//      return an honest greeting, never throw or hang.
// This runs fully OFFLINE: TOSHI_LLM=off (chat()/speak() return null) + a bogus memory bin (grounded path ENOENTs
// instantly) — so it asserts the wiring, deterministically, with no network and no codebase-memory-mcp install.
//   node test/chat-smoke.mjs
import os from 'node:os';
import path from 'node:path';

// set env BEFORE importing session.mjs: hasVoice() reads TOSHI_LLM at call time, and `const BIN = resolveBin()`
// reads CODEBASE_MEMORY_BIN at module load — a dynamic import after this guarantees both are seen.
process.env.TOSHI_LLM = 'off';
process.env.CODEBASE_MEMORY_BIN = path.join(os.tmpdir(), 'toshi-no-such-memory-bin-smoke');
const { route, extractTerm, ask } = await import('../lib/session.mjs');

let pass = 0, fail = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); },
  (e) => { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.message)); });
const eq = (got, want) => { if (got !== want) throw new Error(`expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
const has = (s, sub) => { if (!String(s).includes(sub)) throw new Error(`expected to contain ${JSON.stringify(sub)}, got ${JSON.stringify(s)}`); };

console.log('chat box — runtime smoke (router + graceful no-model degradation, fully offline):');

// ── 1. the router: grounded repo questions land on the right graph tool (EN + FR parity) ──────────────
await t('"quoi de neuf ?" → detect_changes (FR)', () => eq(route('quoi de neuf ?').tool, 'detect_changes'));
await t('"what changed?" → detect_changes (EN)', () => eq(route('what changed?').tool, 'detect_changes'));
await t('"architecture du projet" → get_architecture', () => eq(route('architecture du projet').tool, 'get_architecture'));
await t('"où est handleClick" → search_graph carrying the symbol', () => {
  const r = route('où est handleClick'); eq(r.tool, 'search_graph'); has(r.params.name_pattern, 'handleClick');
});
await t('"where is fooBar" → search_graph carrying the symbol', () => {
  const r = route('where is fooBar'); eq(r.tool, 'search_graph'); has(r.params.name_pattern, 'fooBar');
});

// ── 2. the two silent 2026-07-06/07 bugs: FR caller routing + symbol-from-END, not the verb ────────────
await t('"qui appelle fetchUser" → trace_call_path, function_name = fetchUser (NOT "appelle")', () => {
  const r = route('qui appelle fetchUser'); eq(r.tool, 'trace_call_path'); eq(r.params.function_name, 'fetchUser');
});
await t('"who calls doThing" → trace_call_path, function_name = doThing', () => {
  const r = route('who calls doThing'); eq(r.tool, 'trace_call_path'); eq(r.params.function_name, 'doThing');
});
await t('extractTerm backticks win: "… `fetchUser`" → fetchUser', () => eq(extractTerm('qui appelle `fetchUser`'), 'fetchUser'));
await t('extractTerm last-token fix: "trouve le paquet payment" → payment (not "paquet")', () =>
  eq(extractTerm('trouve le paquet payment'), 'payment'));

// ── 3. conversational input routes to the chat fallback, not a grounded tool ───────────────────────────
await t('"salut toshi, ça va ?" → help (the chat() branch)', () => eq(route('salut toshi, ça va ?').tool, 'help'));

// ── 4. graceful degradation: a FRESH toshi with no model configured still answers, never throws ────────
await t('ask() small talk with NO model → honest greeting, grounded:false, no throw', async () => {
  const r = await ask('salut toshi, ça va ?');
  eq(r.tool, 'help'); eq(r.grounded, false);
  if (typeof r.answer !== 'string' || !r.answer.length) throw new Error('empty answer — chat box would look dead');
});
await t('ask() repo question with no memory bin → routes right + degrades to a helpful string, no throw', async () => {
  const r = await ask('qui appelle fetchUser');
  eq(r.tool, 'trace_call_path'); eq(r.grounded, false); // binary absent → honest demo/instructions, not a crash
  if (typeof r.answer !== 'string' || !r.answer.length) throw new Error('empty answer on the grounded path');
});

await Promise.resolve();
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
