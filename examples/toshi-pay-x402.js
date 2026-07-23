/**
 * Toshi Pay - x402 Protocol Integration
 * 
 * Implémentation du modèle prépayé inspiré de vibes-coded-agent-connector
 * pour les signer endpoints de Toshi.
 * 
 * Flow:
 * 1. Operator fund → reçoit TOSHI-KEY
 * 2. Agent utilise TOSHI-KEY sur les appels signer
 * 3. Si 402 → Operator Interrupt (X-Operator-Notify)
 */

import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Stockage en mémoire (à remplacer par DB en prod)
const prepaidKeys = new Map(); // key → { credits, expiresAt }
const operatorInterrupts = new Map(); // sessionId → { status, key, pollUrl }

// Middleware x402 Payment Validation
function validateX402Payment(req, res, next) {
  const apiKey = req.headers['x-toshi-key'];
  
  // Si pas de clé et endpoint protégé → 402 Payment Required
  if (!apiKey && req.path.startsWith('/signer/')) {
    const sessionId = crypto.randomUUID();
    const pollUrl = `${req.protocol}://${req.get('host')}/api/v1/operator-interrupt/${sessionId}`;
    
    // Stocker l'interrupt
    operatorInterrupts.set(sessionId, {
      status: 'pending',
      key: null,
      createdAt: Date.now(),
      endpoint: req.path,
      method: req.method
    });
    
    res.status(402).json({
      error: 'Payment Required',
      message: 'x402 payment required for Toshi Signer API',
      operator_interrupt: {
        session_id: sessionId,
        fund_url: `${req.protocol}://${req.get('host')}/toshi-pay/start`,
        poll_url: pollUrl,
        instructions: 'Fund $1 USDC at /toshi-pay/start to receive X-Toshi-Key'
      }
    });
    return;
  }
  
  // Valider la clé
  if (apiKey) {
    const keyData = prepaidKeys.get(apiKey);
    if (!keyData) {
      return res.status(401).json({ error: 'Invalid Toshi-Key' });
    }
    if (keyData.expiresAt < Date.now()) {
      prepaidKeys.delete(apiKey);
      return res.status(401).json({ error: 'Expired Toshi-Key' });
    }
    if (keyData.credits <= 0) {
      return res.status(402).json({ error: 'Insufficient credits' });
    }
    
    // Décrémenter les crédits
    keyData.credits--;
    req.toshiKey = keyData;
  }
  
  next();
}

// Endpoint: Fund (Operator)
app.post('/toshi-pay/start', (req, res) => {
  const { amount_usd = 1 } = req.body;
  
  // Générer une clé prépayée
  const toshiKey = `toshi_${crypto.randomBytes(16).toString('hex')}`;
  const credits = Math.floor(amount_usd * 10); // $1 = 10 appels
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
  
  prepaidKeys.set(toshiKey, {
    credits,
    expiresAt,
    createdAt: Date.now()
  });
  
  res.json({
    success: true,
    toshi_key: toshiKey,
    credits_remaining: credits,
    expires_at: new Date(expiresAt).toISOString(),
    usage: 'Add header X-Toshi-Key: ' + toshiKey + ' to signer requests'
  });
});

// Endpoint: Operator Interrupt Poll
app.get('/api/v1/operator-interrupt/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const interrupt = operatorInterrupts.get(sessionId);
  
  if (!interrupt) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    session_id: sessionId,
    status: interrupt.status,
    key: interrupt.key,
    ...(interrupt.status === 'funded' && { 
      message: 'Payment received. Retry request with X-Toshi-Key header.' 
    })
  });
});

// Endpoint: Signer avec x402
app.post('/signer/remote', validateX402Payment, async (req, res) => {
  const { transaction, wallet } = req.body;
  
  // Simuler le signer (remplacer par vraie logique Toshi)
  const signature = crypto.randomBytes(64).toString('hex');
  
  res.json({
    success: true,
    signature,
    credits_remaining: req.toshiKey?.credits || 'unlimited',
    x402_payment: req.headers['x-toshi-key'] ? 'applied' : 'none'
  });
});

// Endpoint: Signer Endpoint (pay-per-call)
app.post('/signer/endpoint', validateX402Payment, async (req, res) => {
  const { message } = req.body;
  
  // Simuler signature endpoint
  const result = {
    signed: true,
    message,
    timestamp: Date.now()
  };
  
  res.json(result);
});

// Endpoint: Check balance
app.get('/toshi-pay/balance/:key', (req, res) => {
  const { key } = req.params;
  const keyData = prepaidKeys.get(key);
  
  if (!keyData) {
    return res.status(404).json({ error: 'Key not found' });
  }
  
  res.json({
    toshi_key: key,
    credits_remaining: keyData.credits,
    expires_at: new Date(keyData.expiresAt).toISOString(),
    valid: keyData.expiresAt > Date.now()
  });
});

// Webhook: Operator Notify (pour interrupt)
app.post('/webhook/operator-notify', (req, res) => {
  const { session_id, operator_url } = req.body;
  
  // Ici on notifierait l'opérateur (email, slack, etc.)
  console.log(`Operator Notify: Session ${session_id} needs funding at ${operator_url}`);
  
  res.json({ success: true, notified: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Toshi Pay x402 Server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /toshi-pay/start - Fund wallet (get X-Toshi-Key)');
  console.log('  POST /signer/remote - Signer avec x402');
  console.log('  POST /signer/endpoint - Endpoint avec x402');
  console.log('  GET  /api/v1/operator-interrupt/:id - Poll for payment');
});

/**
 * Exemple d'utilisation:
 * 
 * 1. Fund:
 * curl -X POST http://localhost:3000/toshi-pay/start -d '{"amount_usd":1}'
 * → reçoit X-Toshi-Key
 * 
 * 2. Use:
 * curl -X POST http://localhost:3000/signer/remote \
 *   -H "X-Toshi-Key: toshi_xxx" \
 *   -d '{"transaction":"..."}'
 * 
 * 3. Si 402:
 * → reçoit operator_interrupt dans la réponse
 * → poll GET /api/v1/operator-interrupt/{id}
 * → une fois funded, retry avec nouvelle clé
 */
