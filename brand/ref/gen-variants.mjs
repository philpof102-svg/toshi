#!/usr/bin/env node
/**
 * Variantes du PFP de Phil, en IMAGE→IMAGE.
 *
 * Le pipeline précédent (brand/gen/GEN.md) faisait du texte→image : il inventait un chat bleu au lieu de
 * varier CELUI de Phil. Ici la référence `clansy-toshi-pfp.jpg` entre dans l'appel, donc le personnage —
 * visière verte, yeux en chiffre « 1 », kimono à motif jeton — est conservé.
 *
 * ⚠️ DRY-RUN PAR DÉFAUT. Sans `--run`, rien n'est envoyé et aucun quota n'est consommé : le script
 * imprime les prompts et vérifie la référence. C'est volontaire — le quota ZeroGPU anonyme est de ~3
 * images par fenêtre, donc une série lancée par erreur coûte la fenêtre entière.
 */
'use strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const REF = join(ICI, 'clansy-toshi-pfp.jpg');
const SORTIE = join(ICI, '..', 'gen', 'variants');
const ESPACE = 'https://multimodalart-flux-style-shaping.hf.space';

/** Le bloc de style ne bouge jamais : c'est lui qui donne le cel-shading dur des PFP X. */
const STYLE = 'flat cel-shaded anime avatar, thick dark navy outlines, hard-edged color blocks, '
  + 'no soft gradients, crisp vector-like rendering, centered square PFP crop, collectible avatar art';

const VARIANTES = [
  ['agent',      'dark suit and tie, tilted fedora, gun-barrel spiral behind, monochrome background with one blue accent'],
  ['keeper',     'rooftop at night, city lights bokeh behind, dark hooded haori over the kimono, full moon'],
  ['trading',    'glowing candlestick chart wall behind, green and red bars, chart reflected in the green visor'],
  // Un thème de DIRIGEANT, jamais le portrait d'une personne réelle — on ne rend pas de ressemblance.
  ['boardroom',  'charcoal suit over the kimono collar, boardroom window behind, Coinbase-blue palette, calm confident pose'],
  ['enso',       'sumi-e ink wash, single black enso ring behind, cream paper texture, minimal, no background clutter'],
  ['arcade',     'synthwave grid floor, magenta and cyan neon rim light, CRT scanlines, 80s arcade glow'],
  ['rain',       'heavy rain streaks, paper umbrella held over the shoulder, storm-grey sky, kimono soaked dark'],
  ['winter',     'falling snow, visible breath vapour, thick scarf over the kimono, pale blue winter light'],
];

const RUN = process.argv.includes('--run');

if (!existsSync(REF)) {
  console.error('✗ référence absente: ' + REF + '\n  Sans elle ce script retomberait en texte→image, '
    + 'c\'est-à-dire exactement le défaut qu\'il corrige. Arrêt.');
  process.exit(1);
}
const octets = readFileSync(REF);
console.log('référence : ' + REF.split(/[\\/]/).pop() + '  ' + octets.length + ' octets  '
  + (octets.subarray(0, 2).toString('hex') === 'ffd8' ? 'JPEG ✓' : '⚠️ pas un JPEG'));
console.log('espace    : ' + ESPACE);
console.log('mode      : ' + (RUN ? '⚡ RUN — le quota va être consommé' : 'dry-run (aucun appel, aucun quota)'));
console.log('token     : ' + (process.env.HF_TOKEN ? 'HF_TOKEN présent' : 'absent → quota anonyme ≈3 images/fenêtre'));
console.log('');

for (const [nom, scene] of VARIANTES) {
  console.log('── ' + nom);
  console.log('   ' + STYLE + ', ' + scene);
}
console.log('\n' + VARIANTES.length + ' variante(s) décrites.');

if (!RUN) {
  console.log('\nDry-run terminé. Pour générer : HF_TOKEN=… node ' + import.meta.url.split('/').pop() + ' --run');
  console.log('⚠️ Sans HF_TOKEN, s\'attendre à ~3 images puis un refus de quota — et un refus de quota');
  console.log('   n\'est PAS une image ratée : ne pas le confondre avec un mauvais prompt.');
  process.exit(0);
}

mkdirSync(SORTIE, { recursive: true });
console.log('⚠️ Le pilotage Gradio n\'est pas encore branché ici : le schéma exact de /call/… de cet espace');
console.log('   doit être LU sur un appel réel avant d\'être codé. Une signature devinée produirait des');
console.log('   erreurs 422 qu\'on prendrait pour un problème de prompt. Prochaine étape: probe l\'endpoint,');
console.log('   lire la forme de la réponse, PUIS écrire l\'appel. Sortie prévue: ' + SORTIE);
process.exit(3);
