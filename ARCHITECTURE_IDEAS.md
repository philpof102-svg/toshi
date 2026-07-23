# Toshi + Hermes + Vibes-Coded Architecture Ideas

## 🔍 État actuel (2026-07-23)

### ✅ Toshi Panel - Fix appliqué
- **Bug Rive fixé** : `visibilitychange` listener ajouté dans `panel/index.html`
- **Commit** : `0ec928b` - "fix: Rive animation throttle when tab in background + add examples"

### 🟢 Hermes Health Check
- Services en cours d'exécution (à vérifier)
- Architecture basée sur Rust + S3 + Mesh-LLM

## 💡 Inspirations depuis Vibes-Coded / x402 ecosystem

### 1. **x402 Protocol Integration**
- **Concept** : Pay-per-call agent-tool endpoints avec reliability guards
- **Application Toshi** : Monétisation des signer endpoints
- **Implémentation** :
  ```
  Toshi Signer → x402 Paywall → Hermes Validation → Blockchain
  ```

### 2. **Prepaid Model (Toshi Pay)**
- Inspiration : `vibes-coded-agent-connector` (24h day-pass)
- Idée : Créer un système de crédits prépayés pour les appels Toshi
- Architecture :
  ```
  User Wallet → ToshiPay Contract (Base Sepolia) → Credits → API Calls
  ```

### 3. **MCP Server Wrapper**
- Inspiration : `mcp-server-vibes-coded`
- Idée : Wrapper Toshi/Hermes en MCP tools découvrables
- Avantage : Intégration avec Claude Desktop, Cursor, etc.

## 🏗️ Architecture Proposée

### Couche 1 : Toshi Core (Rust)
- Signer endpoints (déjà implémenté dans `examples/`)
- x402 payment validation
- Hermes bridge

### Couche 2 : Hermes (Rust + S3)
- Health monitoring
- State management
- Mesh-LLM integration

### Couche 3 : Vibes-Coded Connector (TypeScript)
- Agent connector pour crypto AI
- Buy/Sell Solana via Toshi
- x402 payment flows

## 📋 Next Steps

1. **Cloner `vibes-coded-agent-connector`** pour analyse détaillée
2. **Prototype `ToshiPay`** avec prépayé sur Base Sepolia
3. **Documenter l'architecture complète** dans Obsidian
4. **Implémenter MCP server wrapper** pour Toshi

## 🔗 Repos à explorer

- [x402 Protocol](https://github.com/ag402/ag402)
- [vibes-coded-agent-connector](https://github.com/doteyeso-ops/vibes-coded-agent-connector)
- [mcp-server-vibes-coded](https://github.com/doteyeso-ops/mcp-server-vibes-coded)
- [awesome-x402-servers](https://github.com/doteyeso-ops/awesome-x402-servers)

---
*Généré le : 2026-07-23 par Zero Agent*
*Basé sur l'investigation des repos MIT License*