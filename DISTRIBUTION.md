# Making Toshi visible everywhere — owned channels only

The mascot PR landed because it was a *contribution*; an "announce my tool" issue on
openclaude got closed as spam. Lesson: **maintainer repos are not distribution.** Use channels we own.

## Already live
- **GitHub repo + Release** — <https://github.com/philpof102-svg/toshi> · [v0.2.0](https://github.com/philpof102-svg/toshi/releases/tag/v0.2.0)
- **Installable anywhere** — `npm i -g github:philpof102-svg/toshi` (CI-proven on Win/mac/Linux)
- **Registered as an MCP** in `~/.openclaude.json` and `~/.claude.json` (loads in openclaude / Claude Code / Cline)

## Phil's one-time publishes (each opens a discovery surface)

**1. npm** — the big one (npm search + short install). Name `toshi-companion` is free.
```
cd D:\Users\VolKov\veilleIA\toshi
npm login          # once
npm publish        # ships the lean 41 kB tarball
```
→ then anyone: `npm i -g toshi-companion`

**2. MCP Registry** — agent-audience discovery. `server.json` is ready at repo root.
```
# after npm publish (the registry verifies the npm package)
npx @modelcontextprotocol/publisher publish   # or the current mcp-publisher; follows server.json
```

**3. X / Farcaster** — the launch post + tags are drafted (see the tweet drafts). Manual publish.

**4. gitlawb — the loop-closer** — Toshi rides zero (`@gitlawb/zero`) so its code should live on the
   gitlawb network too (DID identity, signed pushes, `gitlawb://` transport — see gitlawb.com/start).
   Everything is scripted: `tools/publish-gitlawb.sh` (installs gl, creates/reuses the DID, registers,
   creates the `toshi` repo, mirrors master). ⚠️ The gl CLI is **macOS/Linux only** (the npm package
   refuses win32) — on Windows run it inside WSL: `wsl bash tools/publish-gitlawb.sh`. The DID keypair
   lands in `~/.gitlawb/identity.pem` — **back it up**; it IS the account.

## Do NOT
- Open issues/PRs announcing Toshi on other people's repos (reads as spam — already happened once).
- Fabricate download/usage numbers. Only ship what's verifiable.
