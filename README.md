# Toshi — a terminal companion

A tiny AI companion that lives **beside your terminal**, wearing the community-ready **Toshi** mascot from
[tinyhumansai/mascots](https://github.com/tinyhumansai/mascots). It watches your [`gitlawb/zero`](https://github.com/gitlawb/zero)
coding session and you can **talk to it about what's happening** — what changed, why a test is red, what to do next —
through a small, token-cheap context instead of a full chat UI.

> Not a new mascot. We take the **already-open-source Toshi model** ([PR #2, merged](https://github.com/tinyhumansai/mascots/pull/2))
> and give it **tools**: a `zero` plugin + an MCP server + a side-panel that renders the real Rive mascot.

## What it is

- **Rides on `gitlawb/zero`** — Zero is the runtime (Go, MIT, MCP client **and** server). Toshi is a **plugin**
  (`./.zero/plugins/toshi/`) plus a **stdio MCP server** so any MCP client (Claude Desktop, Cline, …) can call it.
- **The mascot on the side** — `panel/index.html` is a WebView that loads the real `toshi.riv` from the tinyhumans
  manifest and drives its state machine (idle · look_around · pointing · hand_wave · dancing · celebration, plus the
  eye channel). It's the face; the MCP is the brain.
- **Token-cheap by design** — session awareness comes from [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp)
  (MIT): a persistent knowledge graph of the repo, ~99% fewer tokens than reading files one by one. Toshi asks *it*
  what changed instead of re-reading the tree, so most turns stay small.
- **You sign, always** — any money action is descriptor-only: Toshi *prepares* a transaction, you sign it. No custody.

## Layout

```
toshi/
├── panel/index.html      the side-panel WebView (renders the real Toshi mascot + talk-to-session)
├── mcp/toshi-mcp.mjs      the MCP server (toshi_status / toshi_ask / toshi_mood) + the /ask bridge the panel calls
├── plugin/plugin.json     the gitlawb/zero plugin manifest
├── tinyhumans/mascots.json pinned copy of the upstream manifest (the mascot contract we consume)
├── ATTRIBUTION.md         upstream credits + licences
└── LICENSE                GPL-3.0 (the Toshi mascot is GPL-3.0, so this is too)
```

## Run it

**The floating companion (Clippy-energy)** — one command launches the mascot window *and* its brain:

```bash
npm install          # once
npm run toshi        # a frameless, always-on-top Toshi floats bottom-right, over any terminal
```

Windows: just double-click **`toshi.bat`**. Drag Toshi by its header; hide it with ✕. It greets you with a
wave, floats + blinks on its own, reacts when you ask, and bursts into a celebration when it has a *grounded*
answer from your repo.

**Make its answers real** — index your repo so `toshi_ask` reads the graph instead of guessing (token-cheap):

```bash
# get codebase-memory-mcp (MIT, local, no telemetry), then:
codebase-memory-mcp cli index_repository '{"repo_path":"/abs/path/to/your/repo"}'
# tell Toshi where the repo + binary are (optional; defaults to cwd / PATH):
export TOSHI_REPO=/abs/path/to/your/repo
export CODEBASE_MEMORY_BIN=/abs/path/to/codebase-memory-mcp
```

Until then Toshi runs in **honest demo mode** — the mascot is fully alive, and it *says* it can't read your
session yet (with the exact index command) rather than inventing an answer.

**Other surfaces:** `npm run brain` runs just the MCP (stdio + `/ask` on :4820) for any MCP client; `panel/index.html`
opens standalone in a browser; `zero plugins add .` installs it as a [zero](https://github.com/gitlawb/zero) plugin.

## Honest status

- **v0, unaudited.** The panel + mascot rendering are real; the MCP's "answer about your session" is a skeleton that
  bridges to `codebase-memory-mcp` — wire your model/provider before trusting its answers.
- The Rive runtime and the `.riv` load over the network in a real browser/WebView. Vendor them for offline use.
- Licence: **GPL-3.0** (the upstream Toshi mascot is GPL-3.0; a derivative must match it). See `ATTRIBUTION.md`.

## Credits

Mascot **Toshi** by [tinyhumans](https://github.com/tinyhumansai/mascots) (GPL-3.0). Session memory by
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (MIT). Runtime [gitlawb/zero](https://github.com/gitlawb/zero) (MIT).
