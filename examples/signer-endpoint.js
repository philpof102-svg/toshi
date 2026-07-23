#!/usr/bin/env node
/**
 * signer-endpoint.js
 * KMS-style signing server — holds an ephemeral private key and signs requests
 * without ever exposing the key to callers.
 *
 * Usage:
 *   node signer-endpoint.js              # listens on :4848
 *   node signer-endpoint.js 8080         # custom port
 *
 * Endpoints:
 *   POST /sign   { data: "<hex|base64|utf8>" }  → { signature, publicKey }
 *   GET  /pubkey                              → { publicKey }
 *   GET  /health                              → { ok: true, keyAge }
 *
 * GPL-3.0
 */

import { createServer } from 'node:http';
import { createSign, createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const PORT = parseInt(process.argv[2], 10) || 4848;
const ALGO = 'sha256';                 // hash algo for signing
const KEY_TYPE = 'ec';                // ECDSA — widely used, small sigs
const KEY_CURVE = 'secp256k1';        // same curve as Ethereum / Bitcoin

// ── Ephemeral key pair (rotated on startup, or add a timer for rotation) ──
let keyPair = generateKeyPairSync(KEY_TYPE, {
  namedCurve: KEY_CURVE,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
let keyBornAt = Date.now();

function getPublicKeyPem() {
  return keyPair.publicKey;
}

function signData(data) {
  const signer = createSign(ALGO);
  signer.update(Buffer.from(data, 'utf8'));
  signer.end();
  return signer.sign(keyPair.privateKey, 'hex');
}

function verifySignature(data, signatureHex, publicKeyPem) {
  const verifier = createVerify(ALGO);
  verifier.update(Buffer.from(data, 'utf8'));
  verifier.end();
  return verifier.verify(publicKeyPem, signatureHex, 'hex');
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // ── GET /health ──
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, keyAge: Date.now() - keyBornAt }));
    return;
  }

  // ── GET /pubkey ──
  if (req.method === 'GET' && url.pathname === '/pubkey') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ publicKey: getPublicKeyPem() }));
    return;
  }

  // ── POST /sign ──
  if (req.method === 'POST' && url.pathname === '/sign') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' })); return;
      }
      const data = payload.data;
      if (typeof data !== 'string' || !data) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing data (string)' })); return;
      }
      try {
        const signature = signData(data);
        const publicKey = getPublicKeyPem();
        // self-verify as a safety check
        const ok = verifySignature(data, signature, publicKey);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ signature, publicKey, verified: ok }));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`🔑  Signer endpoint listening on http://127.0.0.1:${PORT}`);
  console.log(`    POST /sign   { data: "..." }  → signature`);
  console.log(`    GET  /pubkey                  → public key`);
  console.log(`    GET  /health                  → status`);
  console.log(`\n⚠️  Ephemeral key — restart to rotate. Do NOT use in prod as-is.`);
});
