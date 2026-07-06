// Test direct de la couche voix (lib/llm.mjs) — sans repo, sans index.
// On contourne ask() et on vérifie speak() end-to-end.
import { speak, hasVoice, voiceKind } from '../lib/llm.mjs';

const question = 'salut, qui es-tu ?';
const facts = 'Toshi est un petit chat compagnon de terminal. Il vit dans le repo "veilleIA/toshi". Sa voix passe par DeepSeek R1 (reasoning, free) sur OpenRouter.';

console.log('voiceKind =', voiceKind());
console.log('hasVoice  =', hasVoice());
const t0 = Date.now();
const out = await speak(question, facts, 'veilleIA/toshi');
const ms = Date.now() - t0;
console.log(`(${ms}ms) ${out ?? '(no spoken answer — API silently returned null)'}`);
