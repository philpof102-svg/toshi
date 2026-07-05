#!/usr/bin/env bash
# Publish Toshi to gitlawb — the decentralized git network its terminal (zero) comes from. GPL-3.0.
# ==================================================================================================
# Closes the open-source loop: Toshi rides zero (@gitlawb/zero) → Toshi's code lives on gitlawb too.
#
# ⚠️ Linux/macOS ONLY (the gl CLI has no Windows build — on Windows run this inside WSL: `wsl bash
#    tools/publish-gitlawb.sh`). Idempotent: re-running re-registers (safe) and force-updates the mirror.
#
# What it does, step by step (everything is the documented gitlawb.com/start flow):
#   1. installs the gl CLI if absent (official installer)
#   2. creates a DID identity if absent (Ed25519 keypair in ~/.gitlawb/identity.pem — BACK IT UP)
#   3. registers the DID with the public node (idempotent)
#   4. creates the `toshi` repo on the node (idempotent-ish: create errors if it exists — ignored)
#   5. pushes the CURRENT toshi git history to gitlawb://<your-did>/toshi (mirror of master)
set -euo pipefail

NODE_URL="${GITLAWB_NODE:-https://node.gitlawb.com}"
export GITLAWB_NODE="$NODE_URL"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "· toshi repo: $REPO_DIR"
echo "· gitlawb node: $NODE_URL"

# 1. gl CLI
if ! command -v gl >/dev/null 2>&1; then
  echo "· installing the gl CLI (official installer)…"
  curl -fsSL https://gitlawb.com/install.sh | sh
  export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
fi
gl --version || true

# 2. identity (NEVER overwrite an existing one)
if gl identity show >/dev/null 2>&1; then
  echo "· identity exists: $(gl identity show)"
else
  echo "· creating a new DID identity (saved to ~/.gitlawb/identity.pem — BACK THIS FILE UP)"
  gl identity new
fi
MY_DID="$(gl identity show)"

# 3. register (idempotent per the docs)
gl register || true

# 4. create the repo (errors if it already exists — that's fine)
gl repo create toshi --description "Toshi — open-source floating terminal companion (Rive mascot + grounded MCP brain). Rides zero, lives on gitlawb." \
  || echo "· repo create skipped (already exists?)"

# 5. mirror the current history
cd "$REPO_DIR"
git remote remove gitlawb 2>/dev/null || true
git remote add gitlawb "gitlawb://$MY_DID/toshi"
git push gitlawb master:main --force
echo
DID_KEY="$(echo "$MY_DID" | cut -d: -f3)"
echo "✅ Toshi published to gitlawb"
echo "   profile: https://gitlawb.com/${DID_KEY:0:8}"
echo "   repos:   https://gitlawb.com/node/repos"
