# Making Toshi visible everywhere — owned channels only

The mascot PR landed because it was a *contribution*; an "announce my tool" issue on
openclaude got closed as spam. Lesson: **maintainer repos are not distribution.** Use channels we own.

## Already live
- **GitHub repo + Release** — <https://github.com/philpof102-svg/toshi> · [v0.2.0](https://github.com/philpof102-svg/toshi/releases/tag/v0.2.0)
- **Installable anywhere** — `npm i -g github:philpof102-svg/toshi` (CI-proven on Win/mac/Linux)
- **Registered as an MCP** in `~/.openclaude.json` and `~/.claude.json` (loads in openclaude / Claude Code / Cline)

## Phil's one-time publishes (each opens a discovery surface)

**1. npm** — the big one (npm search + short install). Name `toshi-companion` is **still unpublished**
   (`npm view toshi-companion` → 404 as of 2026-07-07), so `npm i -g toshi-companion` does NOT work yet.
   Until this runs, the working short install is the GitHub one above.
```
cd D:\Users\VolKov\veilleIA\toshi
npm login          # once
npm publish        # ships the lean tarball (the files[] whitelist)
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
   Scripted: `tools/publish-gitlawb.sh` (real linux `gl` on PATH, reuses the DID, registers, then mirrors
   the current GitHub master via `gl mirror`). ⚠️ The gl CLI is **macOS/Linux only** — on Windows run it
   inside WSL: `wsl bash tools/publish-gitlawb.sh`.

   **Status 2026-07-07 — one human gate left, not a code bug.** Diagnosed why nothing landed before: in WSL
   a stale Windows `C:\…\npm\gl` shim shadowed a real `gl`, so every `git push gitlawb` failed *silently*
   (helper aborted) — the gitlawb copy stayed empty ("un nouveau toshi = ancien modèle"). The script now
   forces the real linux `gl` (`npm i -g @gitlawb/gl`) + sets `GITLAWB_NODE` (was falling back to a dead
   local `:7545` gateway). Verified: DID `z6Mku6pui7L9…` already exists in WSL `~/.gitlawb/identity.pem`
   (reused, **back it up** — it IS the account), node reachable. **The only blocker is registration: the
   node now demands an iCaptcha proof (level ≥ 3) — a human challenge we must not bypass.** Clear it once:
   ```
   wsl
   export PATH="$(npm config get prefix)/bin:$PATH"
   export GITLAWB_NODE=https://node.gitlawb.com
   gl quickstart          # solves the iCaptcha, registers the existing DID (reuses your key)
   ```
   then re-run `wsl bash tools/publish-gitlawb.sh` — it stops loudly at the captcha if it's not cleared,
   and mirrors master (chat box included) once it is.

## Do NOT
- Open issues/PRs announcing Toshi on other people's repos (reads as spam — already happened once).
- Fabricate download/usage numbers. Only ship what's verifiable.
