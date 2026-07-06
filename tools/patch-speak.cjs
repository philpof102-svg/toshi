// Patch: 1) fix the corrupted line, 2) inject the reasoning-model fields.
const fs = require('fs');
const path = 'D:/Users/VolKov/veilleIA/toshi/lib/llm.mjs';
let s = fs.readFileSync(path, 'utf8');
const before = s;

const lines = s.split('\n');
const out = [];
let i = 0;
let replaced = false;
while (i < lines.length) {
  if (!replaced && lines[i].trim() === 'async function speakViaApi(prompt) {') {
    out.push(...[
      'async function speakViaApi(prompt) {',
      '  const api = API(); if (!api) return null;',
      '  try {',
      '    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);',
      "    // OpenRouter accepts a normalized 'reasoning' field; it lets reasoning models (DeepSeek R1,",
      '    // o-series, ...) self-allocate budget. Non-OpenRouter endpoints just ignore the unknown field.',
      "    const useOpenRouter = api.url.includes('openrouter.ai');",
      "    const reasoning = useOpenRouter ? { effort: 'medium' } : undefined;",
      '    const r = await fetch(api.url, {',
      "      method: 'POST', signal: ctl.signal,",
      "      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },",
      '      body: JSON.stringify({',
      '        model: api.model,',
      '        max_tokens: 1200,',
      '        ...(reasoning ? { reasoning } : {}),',
      "        messages: [{ role: 'user', content: prompt }],",
      '      }),',
      '    });',
      '    clearTimeout(t);',
      '    if (!r.ok) {',
      "      if (process.env.TOSHI_DEBUG) console.error('[toshi-llm] http', r.status, await r.text().catch(() => ''));",
      '      return null;',
      '    }',
      '    const j = await r.json();',
      '    const msg = j.choices && j.choices[0] && j.choices[0].message;',
      "    // Reasoning models (DeepSeek R1) often leave 'content' empty and put the answer in",
      "    // 'reasoning' or 'reasoning_content'. Prefer content; fall back to the thought channel.",
      "    const content = (msg && (msg.content || msg.reasoning || msg.reasoning_content)) || null;",
      '    if (process.env.TOSHI_DEBUG && (!content || content.length < 2)) {',
      "      console.error('[toshi-llm] empty content. raw:', JSON.stringify(j).slice(0, 400));",
      '    }',
      '    return content;',
      '  } catch { return null; }',
      '}',
    ]);
    // skip until matching closing brace
    i++;
    let depth = 1;
    while (i < lines.length && depth > 0) {
      const t = lines[i].trim();
      if (t.endsWith('{')) depth++;
      if (t.startsWith('}')) depth--;
      i++;
    }
    replaced = true;
  } else {
    out.push(lines[i]);
    i++;
  }
}
if (!replaced) { console.log('NOT-FOUND'); process.exit(2); }
const next = out.join('\n');
fs.writeFileSync(path, next, 'utf8');
console.log('PATCHED len', next.length, 'was', before.length);
