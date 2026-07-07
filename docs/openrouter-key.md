# Wire Toshi to OpenRouter — first-key guide for new users

> **You just installed Toshi** (`npm i -g github:philpof102-svg/toshi` or
> `toshi setup`) and the mascot is up, but every question falls back to the
> *"watching the repo, ask me what changed…"* greeting instead of *actually
> answering*. That's Toshi running in **honest demo mode** — the brain is fine,
> it just doesn't have a model key yet. This page is the shortest path from
> *installed* to *Toshi is speaking from OpenRouter*, in three copy-paste steps.

---

## 0. The 30-second summary

1. **Get a key** at <https://openrouter.ai/keys> (free tier, no card).
2. **Put it where Toshi looks** — `~/.toshi/.env` on Windows, or
   `OPENROUTER_API_KEY` in your shell env on macOS/Linux.
3. **Pick a model** — `toshi model <id>` (persisted to `~/.toshi.json`).

You're done. Toshi now reads from your repo *and* speaks, in your language.
The rest of the page is the *why* and the *what if it didn't work*.

---

## 1. Get an OpenRouter key

1. Go to **<https://openrouter.ai/keys>** and sign in (GitHub OAuth is the
   fastest).
2. Click **"Create Key"**, name it `toshi` (or whatever), copy the
   `sk-or-v1-…` string. **You only see it once** — paste it somewhere safe
   (a password manager) before closing the modal.

   > **⚠️ Use a normal API key — NOT a *Provisioning* / management key.** OpenRouter's
   > keys page has a separate **Provisioning** section for keys that *manage your account*
   > (create/delete other keys). Those keys have the **same `sk-or-v1-…` format** but
   > **cannot make chat calls** — every request returns `401 "User not found"`. A real
   > new user lost ~20 min here: the format looked right, so re-copying it (twice) never
   > helped. If you get `401 User not found` with a key you're sure you copied whole, you
   > grabbed a provisioning key — go back and make a **standard** key with the normal
   > **"Create Key"** button (not the Provisioning/management area).
3. Optional: top up a few dollars of credits. OpenRouter has many free
   models — `toshi` works on a $0 balance against `:free` slugs, but paid
   slugs (e.g. `minimax/minimax-m3`) need a positive balance. The default
   Toshi picks on a fresh install is `meta-llama/llama-3.3-70b-instruct:free`
   — a listed free chat model.

> **The key never leaves your machine.** Toshi's `.env` is gitignored (it
> was a real hole once, see commit `8d874f4`), the read happens in-process,
> and nothing in Toshi ever logs it. See `SECURITY.md` if you want the
> receipts.

---

## 2. Place the key — the three places Toshi looks, in order

Toshi's loader (`lib/llm.mjs`) checks these on every chat turn. **First hit
wins**, so put it wherever's easiest for you.

| # | Where | How | Best for |
|---|---|---|---|
| 1 | **Environment variable** | `export OPENROUTER_API_KEY=sk-or-v1-…` | one terminal session, or pinned in your shell rc |
| 2 | **`~/.toshi/.env`** (Windows helper) | Create the file, paste `OPENROUTER_API_KEY=sk-or-v1-…` on one line | **the path of least surprise on Windows** — survives reboots, picked up by the headless brain |
| 3 | **`./.env`** in the repo Toshi watches | Same one-line `KEY=…` format | per-project, e.g. work vs personal |

> **Don't** edit `.env.example` — it's a template, and your key would land in
> git the moment you do. Copy it to `.env` first.

### macOS / Linux (bash, zsh, fish)

```bash
# option A — the shell env (one terminal)
export OPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXXXXXX
# pin it permanently so every new terminal has it:
echo 'export OPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXXXXXX' >> ~/.bashrc   # or ~/.zshrc
```

### Windows (PowerShell — what Toshi's headless brain spawns)

```powershell
# option A — current shell only
$env:OPENROUTER_API_KEY = "sk-or-v1-XXXXXXXXXXXXXXXXXXXX"

# pin it permanently for the USER (survives reboots + new shells)
[Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", "sk-or-v1-XXXXXXXXXXXXXXXXXXXX", "User")

# option B — the per-user file Toshi auto-loads on Windows (recommended
# for users who keep their shell clean, or who launch Toshi from a shortcut)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.toshi" | Out-Null
"$env:USERPROFILE\.toshi\.env" | Out-File -FilePath "$env:USERPROFILE\.toshi\.env" -Encoding utf8 -Append -NoNewline
# now paste ONE line into that file (use Notepad if you prefer a GUI):
#   OPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXXXXXX
notepad "$env:USERPROFILE\.toshi\.env"
```

`cmd.exe` (legacy) — the same idea, two commands:

```cmd
setx OPENROUTER_API_KEY "sk-or-v1-XXXXXXXXXXXXXXXXXXXX"
```

> **`setx` writes to the registry, not the current shell.** Open a new
> terminal before testing.

---

## 3. Pick the model — `toshi model <id>`

A key without a model picks the provider's default
(`meta-llama/llama-3.3-70b-instruct:free` for OpenRouter). That works, but
usually you want a specific one — the slug must be the **exact id listed on
<https://openrouter.ai/models>**.

```bash
# show what Toshi is using right now
toshi model

# pick a model (saved to ~/.toshi.json, no env editing)
toshi model minimax/minimax-m3           # paid, very capable, what Phil uses
toshi model meta-llama/llama-3.3-70b-instruct:free   # the safe free default
toshi model deepseek/deepseek-chat-v3:free          # another free option

# let Toshi AUTO-PICK the first free model that actually answers
# (runs a 12-step live probe, saves the winner — 2026-07-07 ordering
#  lives in lib/llm.mjs → FREE_FALLBACK_MODELS)
toshi model --free

# back to the provider's default
toshi model --clear
```

The model id is **case- and punctuation-sensitive**. A wrong slug fails
silently in the worst case (Toshi falls back to its greeting — see §5), so
copy it from the OpenRouter models page, don't retype it.

> **Why three ways to set a model?** `TOSHI_API_MODEL` (env) > `toshi model`
> (`~/.toshi.json`) > provider default. The CLI is the one that sticks across
> shells and reboots without anyone editing dotfiles.

---

## 4. Verify it works

Two quick checks — no guessing.

```bash
# 1) the brain sees the key?
node -e "console.log('OPENROUTER key loaded:', !!process.env.OPENROUTER_API_KEY)"
# → true   ✅
# → false  → see §5

# 2) end-to-end — Toshi actually talks to OpenRouter
toshi ask "dis ok en francais"
# → "ok"   (or similar)  ✅ — the key works, the model answers
# → "watching the repo …"  ❌ — Toshi doesn't see the key (or has no model)
```

If the second one prints the *watching* greeting, the brain is up but the
provider key didn't land. Jump to §5.

If you see something like *"hmm, mon modèle n'a rien renvoyé (LLM call
failed)"* — the key is loaded but the call failed. Run with
`TOSHI_DEBUG=1` to see the raw upstream error:

```bash
TOSHI_DEBUG=1 toshi ask "dis ok"
# stderr: [toshi-llm-DEBUG] POST https://openrouter.ai/api/v1/chat/completions
# stderr: response status=401 ok=false
# → 401 = bad key     → re-copy the key from openrouter.ai/keys
# → 402 = no credits  → top up at openrouter.ai/credits
# → 429 = rate-limit  → `toshi model --free` to switch
# → 404 = retired slug → `toshi model --free` to switch
```

---

## 5. Troubleshooting — "I did all that, Toshi still won't talk"

| Symptom | Likely cause | Fix |
|---|---|---|
| `toshi ask` returns the *watching* greeting every time | `OPENROUTER_API_KEY` not in Toshi's env | re-check the path: `node -e "console.log(process.env.OPENROUTER_API_KEY)"` from the same shell you launched Toshi in. On Windows headless, prefer `~/.toshi/.env` — see §2. |
| *"hmm, mon modèle n'a rien renvoyé"* with `TOSHI_DEBUG=1` showing 401 | bad / truncated key | re-copy from <https://openrouter.ai/keys> (the full string is ~50 chars starting with `sk-or-v1-`) |
| `401 "User not found"` with a key you're **sure** is copied whole, and re-copying doesn't help | you made a **Provisioning / management key**, not an inference key — same `sk-or-v1-…` format, but it can only manage the account, not chat | at <https://openrouter.ai/keys> make a **standard** key (the normal **Create Key** button), NOT one from the Provisioning/management section. *(A real new user lost ~20 min on exactly this.)* |
| 402 from OpenRouter | no credits on the account | OpenRouter has many `:free` slugs that don't need credits — `toshi model --free` switches to one automatically. For paid models, top up at <https://openrouter.ai/credits>. |
| 404 from OpenRouter | the model id was retired or mistyped | `toshi model --free` to auto-pick a live one, or browse <https://openrouter.ai/models> for current slugs |
| 429 from OpenRouter | free-tier rate limit hit | `toshi model --free` (different free model) or wait a few minutes |
| Toshi *does* answer but in English when I typed French | the model is a small/old free one | switch to a stronger model: `toshi model minimax/minimax-m3` — the language detection is in `lib/llm.mjs`, the bigger models follow it more reliably |
| Toshi is silent — the brain isn't even running | Electron didn't install (it's an `optionalDependencies`) | Toshi falls back to a browser panel automatically; check <http://127.0.0.1:4821/panel/>. If that page is also blank, run `node serve.js` from the toshi repo. |

---

## 6. Switching to another provider later

OpenRouter is the easy default because it serves many models behind one
key. But Toshi auto-maps any of these — just set the matching env var
instead of `OPENROUTER_API_KEY`:

| Env var | Endpoint | Default model |
|---|---|---|
| `TOSHI_API_URL` + `TOSHI_API_KEY` + `TOSHI_API_MODEL` | whatever you point at | whatever you pick (highest priority — wins over the rows below) |
| `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` |
| `XAI_API_KEY` / `GROK_API_KEY` | `https://api.x.ai/v1` | `grok-2-latest` |
| `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4o-mini` |

Or point Toshi at a **fully local** model with `TOSHI_API_URL=http://127.0.0.1:11434/v1`
(ollama), `http://127.0.0.1:1234/v1` (LM Studio), or any other
OpenAI-compatible endpoint.

---

## 7. See also

- **`.env.example`** at the repo root — the annotated template (safe to read,
  gitignored when copied to `.env`).
- **`README.md` §"Change Toshi's brain model"** — the same key-resolution
  order in 6 lines, useful as a refresher.
- **`tools/diag-env.ps1`** — a one-shot diagnostic for Windows that prints
  which env vars Toshi sees and whether the brain binary is on PATH. Run it
  when nothing else makes the failure mode obvious.
- **`lib/llm.mjs`** — the source of truth: `loadEnv()` shows the exact file
  paths Toshi checks, `API()` shows the env-var precedence, `FREE_FALLBACK_MODELS`
  is the live-ordered list behind `toshi model --free`.
