$f = 'D:\Users\VolKov\veilleIA\toshi\lib\llm.mjs'
$c = Get-Content $f -Raw
$o = $c

# 1) raise the ceiling for reasoning models (DeepSeek R1 needs headroom for the chain-of-thought)
$c = $c -replace 'max_tokens: 500', 'max_tokens: 1200'

# 2) replace speakViaApi with a reasoning-model-aware version: pull from `content` first, fall back
#    to `reasoning` / `reasoning_content` (DeepSeek R1 on OpenRouter exposes its thought there), and
#    add a one-line diagnostic so silent nulls stop being mysteries.
$old = @'
    const r = await fetch(api.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },
      body: JSON.stringify({ model: api.model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || null;
'@

$new = @'
    // OpenRouter accepts a normalized `reasoning` field; sending it only costs a flag and lets
    // reasoning models (DeepSeek R1, o-series, …) self-allocate budget. Guarded: non-reasoning
    // endpoints (raw /v1/chat) will simply ignore the unknown field.
    const useOpenRouter = api.url.includes('openrouter.ai');
    const reasoning = useOpenRouter ? { effort: 'medium' } : undefined;
    const r = await fetch(api.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + api.key },
      body: JSON.stringify({ model: api.model, max_tokens: 1200, ...(reasoning ? { reasoning } : {}), messages: [{ role: 'user', content: prompt }] }),
    });
    clearTimeout(t);
    if (!r.ok) { if (process.env.TOSHI_DEBUG) console.error('[toshi-llm] http', r.status, await r.text().catch(() => '')); return null; }
    const j = await r.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    // Reasoning models (DeepSeek R1) often leave `content` empty and put the answer in `reasoning`
    // or `reasoning_content`. Prefer content; fall back to the thought channel.
    const content = (msg && (msg.content || msg.reasoning || msg.reasoning_content)) || null;
    if (process.env.TOSHI_DEBUG && (!content || content.length < 2)) {
      console.error('[toshi-llm] empty content. raw:', JSON.stringify(j).slice(0, 400));
    }
    return content;
'@

$c = $c.Replace($old, $new)

if ($c -ne $o) { Set-Content -Path $f -Value $c -NoNewline; 'PATCHED' } else { 'NO-CHANGE' }
