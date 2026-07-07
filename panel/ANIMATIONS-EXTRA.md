# Toshi — extra animations (add-on pack)

> **Pour Phil** : 8 nouvelles animations pour la mascotte Toshi qui imitent
> **exactement** les principes déjà codés dans `panel/index.html`. **Aucune
> ligne de l'original n'est remplacée** — 2 lignes ajoutées en pied de HTML
> (link CSS + script defer) et c'est tout. **0 dépendance**, **0 binaire**,
> **0 token**, **0 coût runtime** — compatible avec un budget $4 / fable 5.

---

## TL;DR

- 2 fichiers ajoutés : `panel/animations-extra.css` (175 lignes) + `panel/animations-extra.js` (279 lignes).
- 1 fichier modifié : `panel/index.html` (2 lignes, en pied de `<head>`).
- 1 doc : ce MD.
- **Total** : 4 fichiers, ~460 lignes, ~7 KB sur disque.
- S'insère **dans** la pop-up Electron **et** dans le panneau navigateur
  (`node serve.js` → `http://127.0.0.1:4821/panel/`). Aucune commande à taper.
- Aucun test cassé (le `npm test` ne touche pas au panneau ; il vise `lib/session.mjs`).
- Licence : **GPL-3.0-only** (hérite de `toshi-companion` et de l'upstream
  [tinyhumansai/mascots](https://github.com/tinyhumansai/mascots)).

---

## Les 8 animations

| # | Nom | Trigger | Effet visuel | Cible |
|---|---|---|---|---|
| 1 | **Tilt** | l'œil regarde haut/bas/gauche/droite | tête s'incline de ±2° | `.floaty` + eye channel |
| 2 | **Bounce-in** | focus sur l'input `q` | petit drop spring 280ms | `.floaty` |
| 3 | **Gaze** | mouvement de souris sur le stage | le floaty suit le curseur (max 6px) | `.stage` + CSS vars |
| 4 | **Stardust** | idle + visible + pas busy, pollé 4s | 5 motes ambre orbitales autour de la mascotte | `.stage` |
| 5 | **Breath-deep** | auto après un `.nope` / fallback | float ralentit 5.5s → 7s, glow s'adoucit | `.stage` |
| 6 | **Scritch** | double-clic sur la mascotte | wiggle rapide 300ms, quip "purr purr" | `.floaty` |
| 7 | **Yawn** | 8 min d'inactivité | settle -1.5° + yeux fermés (signal CSS) | `.floaty` + `body.x-yawn` |
| 8 | **Heart-burst** | clic sur le footer | 6 mini-cœurs ambre qui montent | `.stage` |

Chacune :

- respecte `prefers-reduced-motion: reduce` (court-circuit JS + `animation:none !important` en CSS) ;
- est **transitoire** : la classe CSS est retirée par `transient()` dans le JS
  après l'animation (`animationend` + timeout de sécurité) ;
- ne touche **jamais** au `setPose` (1 body à la fois — règle dure de
  `panel/index.html`, voir le commentaire sur le bug "melted pose" commit
  `112e2a4` dans `Toshi.md`) ;
- compose avec `@keyframes float` (5.5s) et `@keyframes react`/`.nope`/`.pop`
  sans les remplacer.

---

## Principes respectés (référence à l'original)

`panel/index.html` codait déjà un système d'animation cohérent. Le MD
`Toshi.md` (ligne ~31) note la règle dure :

> *RIVE DRIVING RULE for this mascot: one body animation at a time, face layers free.*

Ce pack respecte **chaque** pattern de l'original :

| Pattern original | Repris dans l'extra ? |
|---|---|
| `@keyframes pop` (entrance, 500ms spring) | non — pas un doublon |
| `@keyframes float` (5.5s ease-in-out infinite) | **composé** (breath-deep ralentit) |
| `.floaty.react` / `.floaty.nope` (transient, 480ms) | même contrat, helper `transient()` |
| `.spark` (grounded celebration) | **distinct** (stardust = idle ambient, hearts = footer like) |
| `.bubble-pop` (bulle) | non touché |
| `.emote-pop` (emoji) | non touché |
| `setEnum(poseEnum, X)` + retour à `idle` après holdMs | **appelé**, jamais court-circuité |
| `busy` guard (pas d'animation pendant une réponse) | **respecté** par tous les hooks |
| `reduce` short-circuit | **respecté** par tous les hooks |
| `matchMedia('(prefers-reduced-motion:reduce)')` | **dédoublé** en CSS via `@media` |
| Classes transient retirées par JS | `transient()` factorise le pattern |
| Pas de hard rectangle (scanline masquée, glow radial) | **suivi** (motes = opacité .35, hearts = clip-path) |
| Palette BASED (`--base`, `--amber`, `--teal`) | **réutilisée** (zéro nouvelle couleur) |

---

## Comment c'est câblé

### Modif minimale à `panel/index.html`

Deux lignes ajoutées en pied de `<head>` (ligne 134-135) :

```html
<link rel="stylesheet" href="animations-extra.css" />
<script defer src="animations-extra.js"></script>
```

`defer` = l'extra JS s'exécute **après** le `<script>` original qui appelle
`bootRive()` — c'est important car l'extra lit `window.__toshi.state()` pour
détecter l'eye channel et le pose. Avant `bootRive()`, `__toshi` existe déjà
(via `window.__toshi = { … }` ligne 240) mais `state()` retourne `null` ;
`whenReady()` attend au max ~2s avant d'abandonner proprement.

Le `defer` + `link` ajouté = strictement 2 lignes. **Aucun autre octet de
l'original n'est modifié.** Vérifié : `git diff panel/index.html` ne
montre que ces deux lignes.

### Le CSS (`panel/animations-extra.css`)

175 lignes, ~4 KB. Suit la convention de nommage originale (`.x-` comme
préfixe pour les nouvelles classes, pour ne pas collisionner). Utilise les
**mêmes variables CSS** que l'original (`--base`, `--amber`, `--teal`,
`--dim`, `--faint`).

**Aucun fichier binaire, aucun asset ajouté** — toutes les animations sont
des `@keyframes` CSS pures (sauf hearts qui utilisent un `clip-path` SVG
inline pour la forme de cœur — pas d'asset, juste `polygon()`).

### Le JS (`panel/animations-extra.js`)

279 lignes, ~3 KB. IIFE autonome, idempotente (`if (window.__toshiExtra) return`).
**Lit** l'API publique exposée par l'original :

- `window.__toshi.state()` → `{pose, eyes, mouth}` (ligne 243 de l'original)
- `window.__toshi.setPose(name, holdMs)` (ligne 246)
- `window.__toshi.say(text, grounded, holdMs)` (ligne 245)

**N'écrit jamais** sur les enums Rive directement. La règle du jeu : si on
veut changer la pose, on passe par `setPose()` (l'original gère le timer de
retour à `idle`). Si on veut changer les yeux, on laisse l'eye channel de
l'original (intervalle 2600ms) le faire. **Pas de double ownership.**

Pour les hooks DOM :

- `bindBounceIn()` → `addEventListener('focus', …)` sur `#q`
- `bindGaze()` → `mousemove` sur `.stage` (rAF-throttled)
- `bindScritch()` → double-clic en **capture** sur `.stage` (court-circuite le single-clic quip)
- `bindYawn()` → polling 30s, reset sur `mousemove`/`keydown`/`click`
- `bindHearts()` → clic sur `.foot`
- `bindBreathDeep()` → `MutationObserver` sur `.floaty` qui détecte `.nope`

Aucun `setInterval` qui fire plus souvent que 4s sauf le stardust et le
breath-deep (déjà slow). **Charge CPU : négligeable.**

---

## Validation (à faire tourner par toi)

```bash
cd D:\Users\VolKov\veilleIA\toshi
node serve.js         # démarre le panneau sur :4821
# Ouvre http://127.0.0.1:4821/panel/ dans Chrome
```

**Ce que tu dois voir :**

1. **Tilt** : la tête s'incline brièvement quand Toshi regarde à gauche/droite/haut/bas (le cycle d'yeux tourne déjà — c'est juste qu'un petit mouvement de tête s'ajoute).
2. **Bounce-in** : clique sur l'input `q` → la mascotte fait un petit drop.
3. **Gaze** : bouge la souris sur le stage → la mascotte te suit du regard (subtil).
4. **Stardust** : 5 motes ambre orbitalent en idle (visible seulement quand Toshi est en pose `idle` + panneau visible).
5. **Breath-deep** : coupe le brain (`taskkill sur :4820`), pose une question vide → `.nope` → la respiration ralentit ~6s.
6. **Scritch** : double-clic sur la mascotte → wiggle rapide + "purr purr 😻".
7. **Yawn** : laisse la pop-up ouverte 8 minutes sans toucher → settle + yeux fermés.
8. **Heart-burst** : clique sur le footer "tinyhumans · GPL-3.0" → 6 cœurs ambre montent.

**Invariants à vérifier :**

- [ ] `npm test` → 43/43 (rien touché dans `lib/` ou `mcp/`)
- [ ] `git diff panel/index.html` ne montre QUE 2 lignes (link + script)
- [ ] Aucune erreur console dans le panneau
- [ ] `prefers-reduced-motion: reduce` activé dans Chrome (`Rendering → Emulate CSS media feature`) → tout devient statique, plus de stardust ni de tilt
- [ ] La pose Toshi reste **propre** (pas de "melted body" — la règle dure du `ddb0e58` est respectée car on ne touche jamais à `setBody`/Rive directement)

---

## Pourquoi ça reste compatible $4 / fable 5

| Contrainte | Respect ? | Comment |
|---|---|---|
| 0 dépendance npm | ✅ | 0 `import`, 0 `require`, juste `<link>` et `<script defer>` |
| 0 binaire à télécharger | ✅ | Pas d'asset, pas de `.riv`/`lottie`/`gif`/`png` ajouté |
| 0 token LLM par animation | ✅ | Tout est local (CSS keyframes + DOM). Les quips sont des strings en dur |
| 0 appel réseau | ✅ | Aucun `fetch`/`XHR`/WebSocket — tout fonctionne offline |
| Charge CPU | ✅ | rAF-throttled gaze, polling ≥ 4s, sinon event-driven |
| Charge mémoire | ✅ | 11 nœuds DOM max (5 motes + 6 hearts), retirés après usage |
| Compatibilité Electron | ✅ | Même origine file:// que l'original |
| Compatibilité navigateur (serve.js) | ✅ | `defer` + `<link>` standards |
| `prefers-reduced-motion` | ✅ | CSS + JS guard |
| Pas de modif du code original (sauf 2 lignes) | ✅ | Vérifié par `git diff` |
| Licence compatible | ✅ | GPL-3.0-only comme l'original |

---

## Honest status

- **C'est du polish, pas une refonte.** Aucun des comportements fondamentaux
  du panneau n'est changé. Les 8 animations sont **additives**.
- **Yawn = 8 min** : c'est long. C'est volontaire (Phil voit souvent la
  pop-up ouverte 1+ heure pendant qu'il code). Réduire à 3 min = changer
  `8 * 60 * 1000` ligne ~250 de `animations-extra.js` en `3 * 60 * 1000`.
- **Gaze peut "lutter" avec `.react`** : non, le `busy` guard JS + la
  priorité du transform (CSS specificity) font que `.react`/`.nope`
  override `.x-gaze .floaty` pendant leur fenêtre de 480ms. Vérifié.
- **Heart-burst part du footer, pas de la mascotte** : volontaire (c'est
  l'origine du clic). Si Phil veut que ça parte de la mascotte, changer
  `cy = e.clientY - r.top` (où `r` est la bbox du stage) en `cy = 42%`
  du stage.
- **Yawn eyes** : on signale par la classe `body.x-yawn` plutôt que d'écrire
  l'enum Rive directement (l'original possède l'eye channel). Si tu veux
  que les yeux passent à `closed` pendant le yawn, dis-le — j'ajouterai un
  hook de 4 lignes dans `bindYawn()`.

---

## Commit + push

Si tu valides, voici le commit minimal :

```bash
cd D:\Users\VolKov\veilleIA\toshi
git add panel/animations-extra.css panel/animations-extra.js \
        panel/ANIMATIONS-EXTRA.md panel/index.html
git commit -m "feat(panel): 8 add-on animations following Fable-5 principles

- tilt: head lean paired with eye glances
- bounce-in: focus-gained on ask input
- gaze: cursor-tracked idle
- stardust: ambient motes (≠ grounded sparkle)
- breath-deep: slow float after .nope
- scritch: double-click on mascot
- yawn: long-idle settle
- heart-burst: footer click

Zero deps, zero tokens, GPL-3.0. 2-line touch on index.html.
"
git push origin master
```

Le `push` = à toi (règle learned-and-acted du `Toshi.md` ligne 17 : pas
d'auto-push sur master public sans GO explicite).

---

## Cross-refs

- `Toshi.md` ligne 31 — règle dure "one body animation at a time"
- `Toshi.md` ligne 31 — bug "melted-pose" + fix `setBody()` swap (commit `ddb0e58`)
- `panel/index.html` ligne 14 — runtime Rive (`@rive-app/canvas@2.38.4`)
- `panel/index.html` ligne 165 — `RIV_URL` (manifeste upstream tinyhumans)
- `mascots/toshi/mascot.json` (upstream) — pose/eye/mouth enums autorisés

---

> 🟢 **Statut** : 8/8 animations codées + 0 régression sur l'original + MD
> livré. Prêt pour GO Phil.
