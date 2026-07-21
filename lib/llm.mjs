// Toshi's voice — grounded NL synthesis through the `zero` CLI (gitlawb/zero, MIT). GPL-3.0.
// The canned summaries are honest but stiff; zero's one-shot mode (`zero -p`) lets Toshi SPEAK through
// whatever provider the user configured in zero — including free/local models (ollama, groq, …).
// Hard rule kept: the model answers ONLY from facts Toshi retrieved. No context → it must say so.
// Disable with TOSHI_LLM=off. No zero installed → silently absent (callers fall back to the raw answer).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
const pexec = promisify(execFile);

// Load a .env into THIS process (values never leave the process — same pattern as the keeper). Only
// fills vars that aren't already set; missing files are skipped. Lets Toshi pick up a provider key the
// user already has without anyone pasting it. Public installs have none of these paths → no-op.
(function loadEnv() {
  const paths = [process.env.TOSHI_ENV, join(process.cwd(), '.env')].filter(Boolean);
  if (process.platform === 'win32') {
    paths.push('D:\\Users\\VolKov\\veilleIA\\mainstreet\\.env', 'D:\\Users\\VolKov\\veilleIA\\agent-veille\\.env');
    // Toshi's own per-user env: ~/.toshi/.env (where the user pastes the provider key). Without this,
    // API() sees no key when the brain is spawned headless by zero/MCP and the key is only in that
    // file — chat() then returns "model didn't answer" even though the key is right there.
    const userEnv = join(homedir(), '.toshi', '.env');
    if (existsSync(userEnv)) paths.push(userEnv);
  }
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
})();

// Resolve zero. On Windows we spawn the Go BINARY (zero.exe) DIRECTLY: going through the JS shim
// means the shim spawns zero.exe itself WITHOUT windowsHide — that inner child is the black console
// window users saw flash on every spoken answer. Direct exe + windowsHide = silent. POSIX: JS entry
// or the PATH shim, both console-less.
function zeroEntry() {
  const isWin = process.platform === 'win32';
  const roots = [];
  const add = (p) => { if (p) roots.push(p); };
  add(process.env.npm_config_prefix);
  if (isWin) add(process.env.APPDATA && join(process.env.APPDATA, 'npm'));
  else {
    add(dirname(dirname(process.execPath)));
    add('/usr/local'); add('/opt/homebrew');
    add(homedir() && join(homedir(), '.npm-global'));
  }
  for (const r of roots) {
    for (const rel of [['node_modules'], ['lib', 'node_modules']]) {
      if (isWin) {
        const exe = join(r, ...rel, '@gitlawb', 'zero', 'zero.exe');
        if (existsSync(exe)) return { cmd: exe, pre: [] };
      }
      const js = join(r, ...rel, '@gitlawb', 'zero', 'bin', 'zero.js');
      if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
    }
  }
  if (!isWin) return { cmd: 'zero', pre: [] }; // POSIX shebang shim on PATH
  return null;
}

// Direct-API voice: a plain fetch to any OpenAI-compatible chat endpoint. PREFERRED over the zero CLI
// because it spawns NO subprocess — zero on Windows spawns helper exes (command-runner / sandbox-setup)
// that flash a console window on every call; the API path has none. Explicit config wins; otherwise we
// auto-map a provider key the user already has (read from their .env above). Keys never leave the process.
// The chosen model, in priority order: the TOSHI_API_MODEL env override → the model persisted by
// `toshi model <name>` (~/.toshi.json) → each provider's built-in default below. This is what makes
// `toshi model minimax/minimax-m3` stick for a user who just has OPENROUTER_API_KEY set, no env editing.
function persistedModel() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.toshi.json'), 'utf8'));
    const m = cfg && cfg.model;
    return typeof m === 'string' && m.trim() ? m.trim() : null;
  } catch { return null; }
}
function API() {
  const E = process.env;
  const model = E.TOSHI_API_MODEL || persistedModel(); // env wins, then the persisted CLI choice, then default
  if (E.TOSHI_API_URL && E.TOSHI_API_KEY && model)
    return { url: E.TOSHI_API_URL, key: E.TOSHI_API_KEY, model };
  // Default free model: OpenRouter's free slugs get RETIRED (deepseek-r1:free started 404-ing "unavailable
  // for free"), which silently killed chat. llama-3.3-70b-instruct:free is a listed, chat-tuned free model;
  // if a user hits its rate limit, `toshi model <id>` (e.g. minimax/minimax-m3) is the escape hatch — and
  // session.mjs now surfaces an LLM failure honestly instead of dead-ending.
  if (E.OPENROUTER_API_KEY) return { url: 'https://openrouter.ai/api/v1/chat/completions', key: E.OPENROUTER_API_KEY, model: model || 'meta-llama/llama-3.3-70b-instruct:free' };
  if (E.XAI_API_KEY || E.GROK_API_KEY) return { url: 'https://api.x.ai/v1/chat/completions', key: E.XAI_API_KEY || E.GROK_API_KEY, model: model || 'grok-2-latest' };
  if (E.GROQ_API_KEY) return { url: 'https://api.groq.com/openai/v1/chat/completions', key: E.GROQ_API_KEY, model: model || 'llama-3.3-70b-versatile' };
  if (E.OPENAI_API_KEY) return { url: 'https://api.openai.com/v1/chat/completions', key: E.OPENAI_API_KEY, model: model || 'gpt-4o-mini' };
  return null;
}

// Free-model fallback sequence. OpenRouter retires `:free` slugs silently (deepseek-r1:free started
// 404-ing 'unavailable for free' in 2025, llama-3.3-70b:free rate-limits hard on busy hours, ...).
// Empirically ordered by the live 21-slug probe on 2026-07-07 (C:\Users\VolKov\.claude\cache\probe-free-deep.cjs):
// 24 :free slugs listed on OpenRouter; 8 were rate-limited (429) in the first wave; 12 answered with
// real content. Ordered best->worst by latency on the FR short-shape prompt. A caller that retries on
// null lands on the winner first, then graceful-degrades. Lives here (not in the CLI) so chat() /
// speak() / `toshi model --free` all share the same source of truth and the same empirical ordering.
export const FREE_FALLBACK_MODELS = Object.freeze([
  'poolside/laguna-xs-2.1:free',         // 2026-07-07: 650ms winner, code-tuned, 262k ctx, real FR content
  'cohere/north-mini-code:free',         // 2026-07-07: 718ms, new, solid FR content
  'liquid/lfm-2.5-1.2b-instruct:free',   // 827ms, historical winner (agentic-tuned, 32k ctx)
  'nvidia/nemotron-3-nano-30b-a3b:free', // 843ms, new nano MoE, real content
  'liquid/lfm-2.5-1.2b-thinking:free',   // 1028ms but thinking channel sometimes returns empty
  'openai/gpt-oss-20b:free',             // 1140ms, new OpenAI open-weights, real content
  'poolside/laguna-xs.2:free',           // 1231ms, code-tuned, real content
  'openrouter/free',                     // 1525ms, the OpenRouter auto-router
  'tencent/hy3:free',                    // 2240ms, MoE 295B-21B-active (262k ctx) — kept as fall-back
  'poolside/laguna-m.1:free',            // 5256ms, flagship code
  'nvidia/nemotron-3-super-120b-a12b:free', // 5305ms
  'nvidia/nemotron-3-ultra-550b-a55b:free',  // 11540ms, often returns only 1-2 words — keep last
]);

// Ping the free list against the current provider and return the FIRST model that actually answers with
// non-empty text. A 200 with empty content (upstream error / rate-limited free) is NOT enough -- the
// model has to *speak*. Used by `toshi model --free` to pick a brain the user can trust, and by
// chat()/speak() to discover the next viable slug during in-memory fallback.
// Returns { ok, model, ms, status, reason? } -- ok:false when none of the free slugs answered (the caller
// then surfaces an honest 'model did not answer' instead of a fake winner).
export async function pickFreeModel({ prompt = 'dis "ok" en francais.', maxTokens = 24, perTimeoutMs = 15000 } = {}) {
  const api = API();
  if (!api) return { ok: false, reason: 'no provider key set (need OPENROUTER_API_KEY or TOSHI_API_URL+TOSHI_API_KEY)' };
  const tried = [];
  for (const m of FREE_FALLBACK_MODELS) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), perTimeoutMs);
    const t0 = Date.now();
    try {
      const r = await fetch(api.url, { method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },
        body: JSON.stringify({ model: m, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }) });
      const ms = Date.now() - t0;
      if (!r.ok) { tried.push({ model: m, status: r.status, ms }); continue; }
      const j = await r.json().catch(() => null);
      const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (String(content).trim().length >= 2) return { ok: true, model: m, ms, status: 200, content: String(content).trim().slice(0, 80) };
      tried.push({ model: m, status: 200, ms, reason: 'empty content' });
    } catch (e) { tried.push({ model: m, status: 0, ms: Date.now() - t0, reason: e.name }); }
    finally { clearTimeout(t); }
  }
  return { ok: false, reason: 'all free models 404/429/empty', tried };
}

let entry; // zero resolved once
export function hasVoice() {
  if ((process.env.TOSHI_LLM || 'auto') === 'off') return false;
  if (API()) return true;
  if (entry === undefined) entry = zeroEntry();
  return !!entry;
}
// tells honest UIs what to suggest: 'api' (preferred, no flash) | 'zero' | 'none'
export function voiceKind() {
  if ((process.env.TOSHI_LLM || 'auto') === 'off') return 'none';
  if (API()) return 'api';
  if (entry === undefined) entry = zeroEntry();
  return entry ? 'zero' : 'none';
}

// One OpenAI-compatible chat completion over `messages`. Shared by the grounded speak() (single user
// prompt) and the free-conversation chat() (system + history + user). Returns the reply string, or null.
async function apiCallOnce(api, model, messages, ctl) {
  // OpenRouter accepts a normalized 'reasoning' field; it lets reasoning models (DeepSeek R1,
  // o-series, ...) self-allocate budget. Non-OpenRouter endpoints just ignore the unknown field.
  const useOpenRouter = api.url.includes('openrouter.ai');
  const reasoning = useOpenRouter ? { effort: 'medium' } : undefined;
  const body = JSON.stringify({
    model,
    max_tokens: 1200,
    ...(reasoning ? { reasoning } : {}),
    messages,
  });
  if (process.env.TOSHI_DEBUG) console.error('[toshi-llm-DEBUG] POST', api.url, 'model=' + model, 'bodyBytes=' + body.length);
  const r = await fetch(api.url, { method: 'POST', signal: ctl.signal,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },
    body,
  });
  if (process.env.TOSHI_DEBUG) console.error('[toshi-llm-DEBUG] response status=' + r.status + ' ok=' + r.ok);
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    if (process.env.TOSHI_DEBUG) console.error('[toshi-llm-DEBUG] errBody=' + errBody.slice(0, 500));
    return null;
  }
  const j = await r.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  // Reasoning models (DeepSeek R1) often leave 'content' empty and put the answer in
  // 'reasoning' or 'reasoning_content'. Prefer content; fall back to the thought channel.
  const content = (msg && (msg.content || msg.reasoning || msg.reasoning_content)) || null;
  if (process.env.TOSHI_DEBUG) console.error('[toshi-llm-DEBUG] content=' + JSON.stringify((content || '').slice(0, 200)) + ' msgKeys=' + Object.keys(msg || {}).join(','));
  if (process.env.TOSHI_DEBUG && (!content || content.length < 2)) {
    console.error('[toshi-llm] empty content. raw:', JSON.stringify(j).slice(0, 400));
  }
  return content;
}

// Decide whether the persisted model is a free slug (eligible for silent free->free fallback) or a
// paid choice the user picked on purpose (e.g. minimax/minimax-m3) -- for paid models we return null
// on failure and let session.mjs surface the honest 'model did not answer' message, never auto-switch.
function isFreeSlug(m) {
  if (!m) return false;
  if (/:free\b/.test(m)) return true;
  return FREE_FALLBACK_MODELS.indexOf(m) !== -1;
}

async function apiComplete(messages) {
  const api = API(); if (!api) return null;
  // Free-fallback candidate sequence: configured model first, then the rest of the free list.
  // For PAID models (not :free, not in FREE_FALLBACK_MODELS) we don't fall back: the user picked them
  // on purpose, a silent swap to a different vendor would be dishonest.
  const list = isFreeSlug(api.model)
    ? FREE_FALLBACK_MODELS.filter((m) => m !== api.model)
    : [];
  const sequence = [api.model, ...list];
  let lastErr = null;
  for (let i = 0; i < sequence.length; i++) {
    const model = sequence[i];
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const raw = await apiCallOnce(api, model, messages, ctl);
      if (raw != null && String(raw).trim().length >= 2) {
        if (i > 0 && process.env.TOSHI_DEBUG) console.error('[toshi-llm-DEBUG] free-fallback: ' + api.model + ' -> ' + model);
        return raw;
      }
      lastErr = 'empty/null from ' + model;
    } catch (e) {
      lastErr = e.name + ' from ' + model;
      if (e.name === 'AbortError') { clearTimeout(t); return null; } // hard timeout, don't burn the rest
    } finally { clearTimeout(t); }
  }
  if (process.env.TOSHI_DEBUG) console.error('[toshi-llm] all attempts failed. last=' + lastErr);
  return null;
}

const speakViaApi = (prompt) => apiComplete([{ role: 'user', content: prompt }]);

// Normalize a raw model completion into a chat-panel-ready reply (or null when it's empty/garbage).
// Strips the stray CJK tokens small models leak, drops a leading "ANSWER:"/"REPLY:", and trims a very
// long reply at a sentence boundary. Shared by the grounded speak() and the free-chat chat().
function tidy(raw) {
  if (raw == null) return null;
  let out = String(raw).replace(/[　-ヿ一-鿿가-힯]+/g, '').replace(/\s{2,}/g, ' ').trim();
  out = out.replace(/^(answer|reply|réponse|reponse)\s*:\s*/i, '').trim();
  if (out.length > 1400) { // the panel is roomy but not infinite — trim at the last sentence boundary past 60 chars
    const cut = out.slice(0, 1400);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    out = end > 80 ? cut.slice(0, end + 1) : cut.trimEnd() + '…';
  }
  return out.length >= 2 && out.length <= 1800 ? out : null;
}

// If a model still emits the legacy EN\n---\nFR bilingual shape, take just the first language — the
// panel now renders a single block in the user's language, and the FR mirror is no longer wanted.
function singleLang(raw) {
  if (raw == null) return null;
  const s = String(raw);
  return /\n\s*---\s*\n/.test(s) ? s.split(/\n\s*---\s*\n/)[0] : s;
}

// Lightweight language detection — no deps. Heuristics: diacritics (cheap, reliable) + a small stopword
// set per language. Returns an ISO code ('fr','en','es','de','it','pt','nl','ru','pl','tr','zh','ja','ko',
// 'ar') or 'en' as the safe default. Used to TELL the model the user's language so the reply matches
// what they typed (FR question → FR reply, ES → ES, EN → EN, ...). Good enough for short chat turns.
const LANG_HINTS = [
  ['fr', /[àâçéèêëîïôùûüœæ]/i, /\b(le|la|les|un|une|des|du|de|est|sont|je|tu|il|elle|nous|vous|ils|elles|moi|toi|lui|quoi|qui|que|où|dans|sur|avec|pour|sans|pas|plus|moins|très|et|ou|mais|donc|or|ni|car|cherche|trouve|montre|fichier|fichiers|fonction|appelle|appels|utilise|dépendances|changement|changements|nouveau|nouveaux|merci|bonjour|salut|svp|c'est|n'a|n'est|aujourd'hui|d'abord|j'ai|tu|voilà)\b/i],
  ['es', /[ñáéíóúü¿¡]/i,        /\b(hola|gracias|por favor|cómo|cuál|cuáles|dónde|cuándo|qué|quién|quiénes|busca|encuentra|encontrar|muestra|archivo|archivos|función|funciones|llama|llaman|llamar|usa|usan|cambio|cambios|nuevo|nueva|nuevos|nuevas|el|la|los|las|un|una|unos|unas|yo|tú|él|ella|nosotros|vosotros|ellos|ellas|muy|también|pero|porque|si|no|sí|aquí|allí|este|esta|estos|estas|aquel|aquella)\b/i],
  ['de', /[äöüß]/i,            /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|ich|du|er|sie|es|wir|ihr|was|wer|wo|wann|warum|wie|such|find|zeig|datei|dateien|funktion|ruft|verwendet|änderung|änderungen|hallo|danke|bitte|nicht|auch|sehr|aber|weil|wenn|dann|heute|morgen)\b/i],
  ['it', /[àèéìòóùù]/i,        /\b(ciao|grazie|prego|come|cosa|chi|dove|quando|perché|quale|quali|cerca|trova|trovare|mostra|mostrare|file|files|funzione|funzioni|chiama|chiamano|usa|usano|cambio|cambiamenti|nuovo|nuova|nuovi|nuove|il|lo|gli|la|le|un|uno|una|io|tu|lui|lei|noi|voi|loro|molto|anche|ma|perché|se|no|sì|qui|qua|là|questo|questa|questi|queste)\b/i],
  ['pt', /[ãõáéíóúâêôç]/i,     /\b(olá|obrigado|obrigada|por favor|como|quando|onde|qual|quais|quem|busca|buscar|encontra|encontrar|mostra|mostrar|arquivo|arquivos|função|funções|chama|chamam|usar|usa|mudança|mudanças|novo|nova|novos|novas|o|a|os|as|um|uma|uns|umas|eu|tu|ele|ela|nós|vós|eles|elas|muito|muita|também|mas|porque|se|não|sim|este|esta|estes|estas|aquele|aquela)\b/i],
  ['nl', /[äöüëïéèêáàâçñ]/i,   /\b(hallo|dank|alstublieft|hoe|wat|wie|waar|wanneer|waarom|welk|welke|zoek|zoeken|vind|vinden|toon|tonen|bestand|bestanden|functie|functies|noemt|noemen|gebruikt|gebruiken|verandering|veranderingen|nieuw|nieuwe|het|een|ik|jij|hij|zij|wij|jullie|de|het|een|geen|niet|ook|maar|omdat|als|dan|vandaag|morgen)\b/i],
  ['pl', /[ąćęłńóśźż]/i,       /\b(cześć|dziękuję|proszę|jak|co|kim|gdzie|kiedy|dlaczego|który|które|szukaj|szukać|znajdź|znaleźć|pokaż|pokazać|plik|pliki|funkcja|funkcje|wywołuje|wywołują|używa|używają|zmiana|zmiany|nowy|nowa|nowe|i|w|nie|na|ja|ty|on|ona|my|wy|oni|one|bardzo|też|ale|jeśli|tak|nie|tu|tam|ten|ta|to)\b/i],
  ['tr', /[çğışöü]/i,          /\b(merhaba|teşekkürler|teşekkür|lütfen|nasıl|ne|nerede|ne zaman|neden|kim|hangi|ara|aramak|bulmak|göster|göstermek|dosya|dosyalar|fonksiyon|çağırır|çağırırlar|kullanır|kullanırlar|değişiklik|yeni|ve|ile|bir|ben|sen|o|biz|siz|onlar|çok|da|de|ama|çünkü|eğer|evet|hayır|burada|şurada|şu|bu)\b/i],
];
export function detectLang(text) {
  const t = String(text || '').trim();
  if (!t) return 'en';
  // scripts trump heuristics — the writing system IS the answer
  if (/[一-鿿]/.test(t)) return 'zh';
  if (/[぀-ゟ゠-ヿ]/.test(t)) return 'ja';
  if (/[가-힯]/.test(t)) return 'ko';
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[а-яё]/i.test(t)) return 'ru';
  let best = 'en', bestScore = 0;
  for (const [code, dia, stop] of LANG_HINTS) {
    let s = 0;
    if (dia && dia.test(t)) s += 2; // diacritics: cheapest, most reliable signal
    if (stop) { const m = t.toLowerCase().match(stop); if (m) s += m.length * 2; }
    if (s > bestScore) { bestScore = s; best = code; }
  }
  return best;
}
// Human name for a code — used in the prompt to instruct the model in plain English.
const LANG_NAME = { en:'English', fr:'French', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', nl:'Dutch', ru:'Russian', pl:'Polish', tr:'Turkish', zh:'Chinese (Simplified)', ja:'Japanese', ko:'Korean', ar:'Arabic' };
export function langName(code) { return LANG_NAME[code] || 'English'; }

// speak(question, facts, repoBase) → a natural-language grounded reply in the user's language, or null.
// The previous version crammed everything into a "tiny speech bubble" and forbade markdown — that's what made
// Toshi read like a CLI command (stiff, clipped, no warmth). The chatbox lives in a regular text panel now,
// so we let the model breathe: 2-5 short lines, conversational, in the language Toshi detected from the
// question. Facts are still the only allowed source; if they don't cover the question, Toshi says so
// honestly (in the same language).
//
// ONE LANGUAGE (2026-07-07): the bubble now renders a single block in the user's language. We pass the
// detected ISO code → the prompt tells the model the target language. The old EN+FR bilingual shape is
// gone: no more `\n---\n` divider, no second mirror, no extra token spend. The chat() (free conversation)
// and pulse() (kind comments) follow the same single-language rule.
export async function speak(question, facts, repoBase) {
  if (!hasVoice()) return null;
  const lang = detectLang(question);
  const target = langName(lang);
  const prompt = [
    `You are Toshi, a small cat companion sitting beside a developer's terminal in the repo "${repoBase}".`,
    'You are chatting with the developer in a normal text panel — speak like a friendly colleague, NOT a CLI.',
    `Answer the QUESTION in 2-5 short lines, warmly and conversationally (about 120-700 characters total).`,
    `LANGUAGE (mandatory): reply ONLY in ${target}. The developer wrote in ${target}; match them. No second language, no translation, no separator line.`,
    'You may use light markdown for clarity (a short bullet list, a code span like `likeThis` for a symbol), but keep it natural and chatty — no headings, no tables, no "ANSWER:" prefix, no follow-up question at the end.',
    'GROUNDING — this is the only hard rule: answer ONLY from the FACTS below (they were just retrieved from the real repo). If the FACTS do not contain the answer, say so honestly in one warm sentence ("je n\'ai pas ça sous les yeux" / "I don\'t have that in view"). Do not invent files, functions, or counts.',
    '', 'FACTS:', facts || '(none)', '', 'QUESTION: ' + question, '', 'REPLY:',
  ].join('\n');
  try {
    let raw;
    if (API()) {
      raw = await speakViaApi(prompt); // PREFERRED: a fetch, no subprocess → no console flash, ever
      if (raw == null) return null;
    } else {
      if (entry === undefined) entry = zeroEntry();
      // TOSHI_HOOK_SKIP: zero fires sessionStart hooks — without this, Toshi SPEAKING (a zero one-shot)
      // would re-trigger its own launch hook and re-point the watch. The CLI exits early when it's set.
      ({ stdout: raw } = await pexec(entry.cmd, [...entry.pre, 'exec', '--prompt', prompt],
        { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } }));
    }
    return tidy(singleLang(raw));
  } catch { return null; }
}

// chat(question, history?) → a plain, free-conversation reply (a classic chatbot turn), through the SAME
// provider/voice as speak(). This is Toshi's fallback when a question ISN'T a grounded repo question (a
// greeting, small talk, a general "what is X" not about this codebase). It is NOT grounded: the prompt
// forbids inventing repo specifics — for real code facts the grounded path (session.ask → the graph) runs
// instead. Returns a string, or null when there's no voice / the query is empty / the call fails. Never
// throws. `history` is an optional array of { role:'user'|'assistant', content } for multi-turn context.
//
// ONE LANGUAGE (2026-07-07): same as speak() — reply in the language the user typed in. The panel no
// longer splits on `\n---\n`; a model that still emits that shape has its second language dropped.
/**
 * Free conversation turn.
 * @param {object} [opts]
 * @param {boolean} [opts.canLookUp=true] — can this node ACTUALLY answer from the code right now?
 *   The two call sites have different truth conditions: from the `help` branch a repo is indexed and
 *   available, so offering "just ask and I'll look it up" is true. From the no-repo fallback it is
 *   FALSE — and the prompt used to instruct the model to promise it anyway, so with the backend absent
 *   Toshi cheerfully offered to "look through your git history, recent commits, or code modifications".
 *   grounded:false was still set, which is correct machine-side — but a human reads the ANSWER, not the
 *   flag. A degraded state is exactly where a false capability claim does the most damage.
 */
export async function chat(question, history = [], opts = {}) {
  const q = String(question || '').trim();
  if (!q || !hasVoice()) return null;
  const canLookUp = opts.canLookUp !== false;
  const lang = detectLang(q);
  const target = langName(lang);
  const system = [
    "You are Toshi, a small, warm cat companion who sits beside a developer's terminal.",
    'Right now you are just CHATTING — this is ordinary conversation, not a question about their code repository.',
    'Reply like a friendly colleague in 1-5 short lines (about 40-700 characters).',
    `LANGUAGE (mandatory): reply ONLY in ${target}. The developer wrote in ${target}; match them. No second language, no translation, no separator line.`,
    'Light markdown is fine (a short list, a `code span`) but stay natural and chatty — no headings, no tables, no "ANSWER:" prefix, no needless follow-up question.',
    canLookUp
      ? "Be honest and down to earth: you're a coding companion having a friendly chat. Do NOT invent specifics about their particular repo, files, functions, commits, or history — if they want those, tell them (briefly) they can just ask about the code and you'll look it up for real."
      : "Be honest and down to earth. RIGHT NOW YOU CANNOT SEE ANY CODE: there is no indexed repository available to you in this session. Never invent specifics about their repo, files, functions, commits or history, and NEVER offer to look through their git history, commits, branches or files — you genuinely cannot. If they ask about code, say plainly that you have no repo indexed here and that running `toshi` inside an indexed project is what would let you answer for real.",
  ].join('\n');
  const hist = (Array.isArray(history) ? history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content).slice(-8);
  try {
    let raw;
    if (API()) {
      raw = await apiComplete([
        { role: 'system', content: system },
        ...hist.map((h) => ({ role: h.role, content: String(h.content) })),
        { role: 'user', content: q },
      ]);
    } else {
      if (entry === undefined) entry = zeroEntry();
      if (!entry) return null;
      const hx = hist.map((h) => (h.role === 'assistant' ? 'Toshi: ' : 'User: ') + String(h.content)).join('\n');
      const prompt = system + '\n\n' + (hx ? hx + '\n' : '') + 'User: ' + q + '\nToshi:';
      // TOSHI_HOOK_SKIP: same guard as speak() — zero's one-shot fires sessionStart hooks; without this it
      // would re-trigger Toshi's own launch hook and re-point the watch mid-answer.
      ({ stdout: raw } = await pexec(entry.cmd, [...entry.pre, 'exec', '--prompt', prompt],
        { timeout: 40000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, TOSHI_HOOK_SKIP: '1' } }));
    }
    return tidy(singleLang(raw));
  } catch { return null; }
}
