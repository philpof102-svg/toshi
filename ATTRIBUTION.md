# Attribution & licences

Toshi (this project) is licensed **GPL-3.0** — see `LICENSE`. It is GPL-3.0 because it builds on the Toshi
mascot, which is GPL-3.0; a work that incorporates a GPL-3.0 asset must be distributed under GPL-3.0.

## Bundled / consumed upstream work

| Component | Source | Licence | How we use it |
|---|---|---|---|
| **Toshi mascot** (`toshi.riv` / state engine) | [tinyhumansai/mascots](https://github.com/tinyhumansai/mascots) — mascot marked *ready* in [PR #2](https://github.com/tinyhumansai/mascots/pull/2) | **GPL-3.0** | The panel loads the real `toshi.riv` and drives its state machine. We redistribute/derive under GPL-3.0. **This is the reason Toshi is GPL-3.0.** |
| **codebase-memory-mcp** | [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | MIT | The session-awareness backend (token-cheap repo knowledge graph). MIT is GPL-compatible; used unmodified as a separate MCP process. |
| **zero** | [gitlawb/zero](https://github.com/gitlawb/zero) | MIT | The runtime Toshi plugs into (plugin + MCP). Not modified here. |
| **Rive runtime** (`@rive-app/canvas`) | rive-app | MIT | Renders the `.riv` in the panel. Loaded at runtime. |

## Obligations we honour

- **Keep it GPL-3.0.** Any distribution of Toshi (or a derivative) ships under GPL-3.0 with source available.
- **Preserve notices.** This file + `LICENSE` travel with the code; upstream authors are credited above.
- **No relicensing of the mascot.** We do **not** relabel the GPL-3.0 mascot as MIT or any other licence.
- **codebase-memory-mcp stays MIT** and is used as an independent process (aggregation, not a derivative).

If tinyhumans grants a separate/dual licence for the mascot in the future, this project may relicense the
non-mascot portions accordingly — until then, GPL-3.0 stands.
