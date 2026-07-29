#!/usr/bin/env node
// Offline integration smoke for the toshi_see BRIDGE. GPL-3.0.
// =================================================================================================
// see-serve-smoke.cjs proves the WINDOW half (capture → read → refusals). This proves the JOINT: the
// MCP tool call, the queued request, the delivery, the reply, and the timeout. Two halves each tested
// with the seam between them assumed is how a feature ships broken while every suite is green.
//
// No Electron, no network beyond loopback: this script PLAYS the window — it polls /see-pending and
// POSTs /see-result exactly as main.cjs does.
//
// ⚠️ THE CASES THAT MATTER ARE THE ONES WHERE NOBODY ANSWERS. `toshi_see` must never hand an agent a
// blank ScreenContext when the truth is "no window" or "no reply" — an empty desk and a closed eye are
// opposite facts. Both are asserted below, with the happy path beside them so a server that only ever
// refuses cannot pass.
//
// Run: node mcp/see-bridge-smoke.mjs
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SMOKE_PORT || 4899);   // jamais 4820: un Toshi peut deja le tenir
let ko = 0;
const check = (nom, got, want) => {
  const ok = got === want;
  if (!ok) ko++;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${nom}\n`);
  if (!ok) process.stdout.write(`       attendu ${want}, obtenu ${got}\n`);
};

const httpJson = (method, p, body) => new Promise((resolve) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, timeout: 4000,
    headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
  (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); });
  r.on('error', () => resolve(null)); r.on('timeout', () => { r.destroy(); resolve(null); });
  if (data) r.write(data); r.end();
});

const srv = spawn(process.execPath, [path.join(ICI, 'toshi-mcp.mjs')],
  { env: { ...process.env, TOSHI_PORT: String(PORT) }, stdio: ['pipe', 'pipe', 'pipe'] });

const enAttente = new Map();
let buf = '';
srv.stdout.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const ligne = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!ligne) continue;
    try { const m = JSON.parse(ligne); const r = enAttente.get(m.id); if (r) { enAttente.delete(m.id); r(m); } } catch {}
  }
});
let seq = 0;
const rpc = (method, params) => new Promise((resolve) => {
  const id = ++seq; enAttente.set(id, resolve);
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const outilJson = (r) => { try { return JSON.parse(r.result.content[0].text); } catch { return null; } };
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

const CONTEXT = { app: 'Code', title: 'trace.js', kind: 'editor', text: 'assert failed', summary: '',
  source: 'ocr', confidence: 0.8, hasError: true, mustLabel: true, label: 'screen text sent to X' };

(async () => {
  await dodo(700);                       // laisser le serveur ouvrir :PORT
  await rpc('initialize', {});

  process.stdout.write('toshi_see — le pont cerveau ↔ fenetre:\n');
  const outils = (await rpc('tools/list', {})).result.tools.map((t) => t.name);
  check('l outil est declare', String(outils.includes('toshi_see')), 'true');

  /* ── ★ personne au bout: un oeil eteint n est pas un ecran vide ────────────────────────────── */
  const sansFenetre = outilJson(await rpc('tools/call', { name: 'toshi_see', arguments: {} }));
  check('★ sans fenetre vivante, l appel REFUSE', String(sansFenetre.ok), 'false');
  check('★ et il dit pourquoi', sansFenetre.reason, 'no_window');
  check('★ il ne rend AUCUN contexte (sinon ca se lirait « rien a l ecran »)',
    String(sansFenetre.context === undefined), 'true');
  check('★ et la note l ecrit noir sur blanc',
    String(/NOT "the screen is empty"/.test(sansFenetre.note || '')), 'true');

  /* ── ★ le tour complet: la fenetre sonde, repond, l agent recoit ───────────────────────────── */
  await httpJson('GET', '/see-pending', null);        // ce sondage vaut battement de fenetre
  const promesse = rpc('tools/call', { name: 'toshi_see', arguments: { want: 'text' } });
  await dodo(120);
  const attente = await httpJson('GET', '/see-pending', null);
  check('★ la demande est livree a la fenetre', String(!!(attente && attente.seeRequest)), 'true');
  check('   avec le `want` demande', attente.seeRequest.want, 'text');
  check('★ allowCloud vaut false par defaut (un champ absent n est pas un consentement)',
    String(attente.seeRequest.allowCloud), 'false');

  const revide = await httpJson('GET', '/see-pending', null);
  check('★ livree UNE SEULE fois — un second sondeur ne la revoit pas',
    String(revide.seeRequest), 'null');

  await httpJson('POST', '/see-result', { id: attente.seeRequest.id, sourceName: 'Écran 1', tier: 'read',
    frameBytes: 4096, context: CONTEXT });
  const vu = outilJson(await promesse);
  check('★ BORNE: l agent recoit bien le ScreenContext', String(vu.ok), 'true');
  check('   le texte lu traverse', vu.context.text, 'assert failed');
  check('★ mustLabel traverse — si le texte a quitte la machine, ca DOIT se voir',
    String(vu.context.mustLabel), 'true');
  check('   et le libelle de provenance aussi', vu.context.label, 'screen text sent to X');
  check('la confiance traverse (une lecture faible doit rester faible)', String(vu.context.confidence), '0.8');

  /* ── ★ la fenetre est la mais ne repond pas: timeout, et surtout pas « ecran vide » ────────── */
  await httpJson('GET', '/see-pending', null);
  const muet = outilJson(await rpc('tools/call', { name: 'toshi_see', arguments: { timeoutMs: 600 } }));
  check('★ une fenetre qui ne repond pas donne un timeout explicite', muet.reason, 'timeout');
  check('★ et pas davantage de contexte', String(muet.context === undefined), 'true');
  check('★ la note interdit de le lire comme un ecran vide',
    String(/do not treat this as an empty screen/.test(muet.note || '')), 'true');

  /* ── une reponse en retard ne doit pas etre avalee en silence ──────────────────────────────── */
  const tardive = await httpJson('POST', '/see-result', { id: 'inconnu', context: CONTEXT });
  check('une reponse sans demandeur est refusee et le DIT', String(/no waiter/.test(tardive.error || '')), 'true');

  srv.kill();
  process.stdout.write('\n' + (ko ? `${ko} cas en echec\n` : 'tous les cas tiennent\n'));
  process.exit(ko ? 1 : 0);
})().catch((e) => { srv.kill(); process.stderr.write('smoke a jete: ' + e.message + '\n'); process.exit(1); });
