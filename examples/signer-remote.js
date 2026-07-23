#!/usr/bin/env node
/**
 * signer-remote.js
 * Remote signer client — asks a signer-endpoint to sign data WITHOUT ever
 * holding the private key locally.  Verifies the signature afterwards.
 *
 * Usage:
 *   node signer-remote.js "hello world"
 *   node signer-remote.js "data" http://127.0.0.1:4848
 *
 * GPL-3.0
 */

import { createSign, createVerify } from 'node:crypto';
import { request } from 'node:http';

const ALGO = 'sha256';

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { reject(new Error(`invalid json from server: ${body}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET',
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { reject(new Error(`invalid json from server: ${body}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function verifySignature(data, signatureHex, publicKeyPem) {
  const verifier = createVerify(ALGO);
  verifier.update(Buffer.from(data, 'utf8'));
  verifier.end();
  return verifier.verify(publicKeyPem, signatureHex, 'hex');
}

async function main() {
  const data = process.argv[2] || 'hello from remote signer';
  const endpoint = process.argv[3] || 'http://127.0.0.1:4848';

  console.log(`📡  Remote signer → ${endpoint}`);
  console.log(`📝  Data: "${data}"\n`);

  // 1. fetch public key (optional but good practice)
  let pubKey;
  try {
    const r = await httpGet(`${endpoint}/pubkey`);
    if (r.status === 200) {
      pubKey = r.body.publicKey;
      console.log(`🔓  Fetched public key (${pubKey.split('\n').length} lines PEM)`);
    }
  } catch (e) {
    console.warn(`⚠️  Could not fetch public key: ${e.message}`);
  }

  // 2. ask the endpoint to sign
  const payload = JSON.stringify({ data });
  const r = await httpPost(`${endpoint}/sign`, payload);
  if (r.status !== 200) {
    console.error(`❌  Signing failed (${r.status}):`, r.body);
    process.exit(1);
  }

  const { signature, publicKey: returnedPubKey, verified: serverVerified } = r.body;
  pubKey = pubKey || returnedPubKey;

  console.log(`✅  Signature received (${signature.length} hex chars)`);
  console.log(`    Server self-verify: ${serverVerified ? 'PASS' : 'FAIL'}`);

  // 3. verify locally
  const localOk = verifySignature(data, signature, pubKey);
  console.log(`🔍  Local verification: ${localOk ? 'PASS ✅' : 'FAIL ❌'}`);

  if (localOk) {
    console.log('\n🎉  Remote signing chain complete — private key never left the endpoint.');
  } else {
    console.error('\n❌  Signature did NOT verify locally. Something is wrong.');
    process.exit(1);
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
