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

## Run it (v0)

```bash
# 1. index your repo so Toshi can answer cheaply (MIT, local, no telemetry)
npx codebase-memory-mcp            # or point Toshi at an already-running instance

# 2. start Toshi's MCP + the /ask bridge the panel talks to
node mcp/toshi-mcp.mjs             # serves POST /ask on :4820 and speaks MCP over stdio

# 3. open the panel (as a WebView beside your terminal, or just in a browser)
#    serves the real mascot from the tinyhumans manifest over the network
open panel/index.html
```

Without step 1–2 the panel still renders the live mascot and runs in **honest demo mode** — it will *say* it can't
read your session yet rather than invent an answer.

## Honest status

- **v0, unaudited.** The panel + mascot rendering are real; the MCP's "answer about your session" is a skeleton that
  bridges to `codebase-memory-mcp` — wire your model/provider before trusting its answers.
- The Rive runtime and the `.riv` load over the network in a real browser/WebView. Vendor them for offline use.
- Licence: **GPL-3.0** (the upstream Toshi mascot is GPL-3.0; a derivative must match it). See `ATTRIBUTION.md`.

## Credits

Mascot **Toshi** by [tinyhumans](https://github.com/tinyhumansai/mascots) (GPL-3.0). Session memory by
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (MIT). Runtime [gitlawb/zero](https://github.com/gitlawb/zero) (MIT).
