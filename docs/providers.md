# Wire Toshi to any LLM provider

> Toshi ships with an **honest demo mode** out of the box — the mascot floats, watches the repo, and
> says *"watching the repo, ask me what changed…"* when no key is set. This page is the shortest path
> from *installed* to *Toshi actually talks to an LLM*, no matter which provider you pick. For the
> OpenRouter-first walkthrough see [openrouter-key.md](openrouter-key.md); this page is the
> **provider-agnostic map**.

---

## 0. The 30-second summary

1. **Pick a provider** in the table below (or use a custom OpenAI-compatible endpoint).
2. **Set one env var** with the key — the `*_API_KEY` in the left column, or `TOSHI_API_URL` + `TOSHI_API_KEY`
   for a custom endpoint. The key never leaves your machine (`.env` is gitignored, the read is
   in-process, nothing in Toshi logs it).
3. **Pick a model** — `toshi model <id>` (persisted to `~/.toshi.json`). The default slug per provider
   is the one in the table; `toshi model --free` live-probes the free catalog when the provider is
   OpenRouter and saves the first slug that answers.

That's it. The rest of the page is the *why* and the *what if it didn't work*.

---

## 1. Provider map — pick one, drop one env var

| Env var | Endpoint | Default model | Why pick it |
|---|---|---|---|
| `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` | **easy default** — one key, every model (free + paid), best free-tier coverage. [Setup →](openrouter-key.md) |
| `XAI_API_KEY` *or* `GROK_API_KEY` | `https://api.x.ai/v1` | `grok-2-latest` | Grok — xAI's chat. Paid only, good at code + reasoning. |
| `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | **fastest** in the row — Groq's LPU hardware, generous free tier for dev. Llama 3.3 70B is the default. |
| `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4o-mini` | The reference. Paid only, but every model Toshi can hit lives on `api.openai.com/v1`. |
| `TOSHI_API_URL` + `TOSHI_API_KEY` (+ optional `TOSHI_API_MODEL`) | whatever you point at | whatever you pick | **escape hatch** — any OpenAI-compatible endpoint: Ollama (`http://127.0.0.1:11434/v1`), LM Studio (`http://127.0.0.1:1234/v1`), vLLM, OpenRouter (as a custom URL), Together, etc. |

> **The first hit wins.** The loader checks `TOSHI_API_URL` first (custom endpoint), then walks the
> provider keys in the order above, then `~/.toshi/.env` and `./.env` for the same names. Source of
> truth: `lib/llm.mjs` → `loadEnv()` + `API()`. For full precedence: see
> [openrouter-key.md §2](openrouter-key.md#2-place-the-key--the-three-places-toshi-looks-in-order).

---

## 2. Per-provider quick-start

Every provider follows the same three steps: **get a key → put it where Toshi looks → pick a model**.
Below is the per-provider delta; the placement rules (Windows helper, shell rc, `./.env`) are shared
and explained in [openrouter-key.md §2](openrouter-key.md#2-place-the-key--the-three-places-toshi-looks-in-order).

### 2.1 OpenRouter — the easy default

```bash
# 1. key from https://openrouter.ai/keys  (free tier, no card)
# 2. place it — Windows helper recommended:
#    notepad "$env:USERPROFILE\.toshi\.env"   →  OPENROUTER_API_KEY=sk-or-v1-…
# 3. pick a model
toshi model --free                                # auto-pick the first free slug that answers
toshi model minimax/minimax-m3                    # paid, capable, what Phil uses
```

Full step-by-step (Windows helper, free vs paid, troubleshooting): **[openrouter-key.md](openrouter-key.md)**.

### 2.2 xAI / Grok

```bash
# 1. key from https://console.x.ai → API Keys
# 2. place it (any of: env var, ~/.toshi/.env, ./.env)
export XAI_API_KEY=xai-…                           # or GROK_API_KEY=xai-…
# 3. pick a model — xAI's catalog: https://console.x.ai → Models
toshi model grok-2-latest
toshi model grok-2-vision-1212                     # if you want vision
```

> **Both names work.** Toshi accepts `XAI_API_KEY` (the canonical name in `.env.example`) **and**
> `GROK_API_KEY` (the one xAI's own SDK uses). They map to the same endpoint.

### 2.3 Groq

```bash
# 1. key from https://console.groq.com/keys  (free tier, no card — generous for dev)
# 2. place it
export GROQ_API_KEY=gsk-…
# 3. pick a model — Groq catalog: https://console.groq.com/docs/models
toshi model llama-3.3-70b-versatile                # the default — strong + fast
toshi model llama-3.1-8b-instant                  # the cheap-and-fast pick
toshi model deepseek-r1-distill-llama-70b          # reasoning model
```

> **Why Groq for the dev loop:** sub-second time-to-first-token on Llama 3.3 70B. The free tier has
> rate limits, but they reset fast and `toshi model llama-3.1-8b-instant` is essentially uncapped for
> dev.

### 2.4 OpenAI

```bash
# 1. key from https://platform.openai.com/api-keys
# 2. place it
export OPENAI_API_KEY=sk-…
# 3. pick a model
toshi model gpt-4o-mini                            # the default — cheap, capable
toshi model gpt-4o                                 # the flagship
toshi model o4-mini                                # reasoning, slow + sharp
```

> **All OpenAI slugs pass through unchanged.** Toshi's `lib/llm.mjs` doesn't filter the model list —
> whatever you `toshi model` is what hits `https://api.openai.com/v1/chat/completions`.

### 2.5 Custom OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, …)

```bash
# 1. start your local server — pick one:
ollama serve                                       # default :11434
# LM Studio: "Local Server" tab → Start
# vLLM:      vllm serve <model> --port 8000
# 2. set the URL (+ key, even if empty for local) and the model
export TOSHI_API_URL=http://127.0.0.1:11434/v1
export TOSHI_API_KEY=ollama                        # any non-empty string — local servers ignore it
export TOSHI_API_MODEL=llama3.2                    # must match the model the server has loaded
# 3. verify
toshi ask "dis ok"
```

> **Why the custom path wins over `OPENAI_API_KEY`.** The loader checks `TOSHI_API_URL` first, so a
> local Ollama pointed at `:11434` will be picked even if `OPENAI_API_KEY` is also set. Use this when
> you want a *fully offline* Toshi (no key, no cloud, only your GPU/CPU).

---

## 3. Picking the model — the CLI is the one that sticks

`TOSHI_API_MODEL` (env) > `toshi model <id>` (`~/.toshi.json`) > provider default. The CLI is the
one that survives reboots without anyone editing dotfiles.

```bash
toshi model                              # show the current brain
toshi model minimax/minimax-m3           # paid, capable, FR/EN (OpenRouter slug)
toshi model grok-2-latest                # Grok (xAI)
toshi model llama-3.3-70b-versatile      # Groq
toshi model gpt-4o-mini                  # OpenAI
toshi model --free                       # live-probe the OpenRouter free catalog, save the winner
toshi model --list                       # print the free catalog (no save)
toshi model --clear                      # back to the provider default
```

> **The slug is case- and punctuation-sensitive.** A wrong slug falls back to the *watching* greeting
> silently — copy the exact id from the provider's models page, don't retype it.

For the full troubleshooting matrix (401 / 402 / 404 / 429 from OpenRouter, the *watching* greeting,
Windows env quirks): see [openrouter-key.md §5](openrouter-key.md#5-troubleshooting--i-did-all-that-toshi-still-wont-talk).

---

## 4. Switching providers without losing your model

The env-var pattern means switching is one shell line:

```bash
# from OpenRouter → Groq (faster free tier, dev loop)
unset OPENROUTER_API_KEY
export GROQ_API_KEY=gsk-…
toshi model llama-3.3-70b-versatile

# from Groq → local Ollama (fully offline)
unset GROQ_API_KEY
export TOSHI_API_URL=http://127.0.0.1:11434/v1
export TOSHI_API_KEY=ollama
export TOSHI_API_MODEL=llama3.2

# back to OpenRouter (one key, all models)
unset TOSHI_API_URL TOSHI_API_KEY TOSHI_API_MODEL
unset GROQ_API_KEY
export OPENROUTER_API_KEY=sk-or-v1-…
toshi model --free
```

`~/.toshi.json {model}` survives all of these — it's only the *key* and the *URL* that swap.

---

## 5. See also

- **[openrouter-key.md](openrouter-key.md)** — the full OpenRouter first-key walkthrough (recommended
  for a brand-new user; this page is the map, that page is the recipe).
- **`.env.example`** at the repo root — the annotated template (safe to read, gitignored when copied
  to `.env`).
- **`README.md` §"Change Toshi's brain model"** — the same key-resolution order in 6 lines.
- **`VOICE.md`** — the audio TTS ladder (kokoro / piper / system). Independent from the brain model
  (the brain produces the *text*, the voice produces the *audio*).
- **`lib/llm.mjs`** — the source of truth: `loadEnv()` (file paths), `API()` (env-var precedence),
  `FREE_FALLBACK_MODELS` (the live-ordered list behind `toshi model --free`), `pickFreeModel()`
  (the live probe behind `toshi model --free`).
