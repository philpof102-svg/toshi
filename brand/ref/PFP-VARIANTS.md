# Variantes du PFP de Phil — image→image, pas texte→image

## Pourquoi la première série était mauvaise (diagnostic, 2026-07-30)

`brand/gen/GEN.md` décrit un pipeline **texte→image** : on décrit le personnage en mots
(« chibi mascot cat, cobalt blue fur, wide white muzzle… ») et FLUX invente *un* chat bleu.

**Il n'a jamais vu celui de Phil.** Donc aucun prompt ne peut produire des *variantes du sien* — il
produit des cousins génériques. C'est un défaut d'**architecture du pipeline**, pas de formulation, et
c'est la raison pour laquelle Phil a répondu « image horrible ».

Deuxième cause, cumulative : `FLUX.1-schnell` à **4 pas d'inférence** est le variant le plus rapide et
le moins net de la famille. Il aérographe. Les PFP de la communauté X sont en **cel-shading dur** —
aplats, contours navy épais, zéro dégradé mou. Le modèle tirait à l'opposé de la cible.

## La référence

`brand/ref/clansy-toshi-pfp.jpg` — 400×400, récupéré de `x.com/Clansy314495853`.
Le personnage, décrit pour mémoire : chat bleu cobalt, **visière verte** portant le jeton, **yeux en
chiffre « 1 » doré** (c'est la signature — Phil : « le chat avec 1 les yeux c'est moi »), kimono
bleu/blanc à motif jeton, shuriken en gueule, fond bleu clair filigrané.

## L'endpoint qui convient — mesuré le 2026-07-30

| espace | état | usage |
|---|---|---|
| `multimodalart/flux-style-shaping` | **HTTP 200** | ✅ **image→image**, garde le personnage |
| `black-forest-labs/FLUX.1-dev` | HTTP 200 | plus de pas, mais reste texte→image |
| `evalstate/flux1-schnell` | HTTP 200 | celui utilisé, à ne plus prendre seul |
| `cagliostrolab/animagine-xl-3.1` | HTTP 404 | mort |
| `linoyts/FLUX.1-Kontext-dev` | HTTP 404 | mort |

⚠️ **Quota ZeroGPU anonyme ≈ 3 images par fenêtre de recharge.** Avec un `HF_TOKEN` dans
l'environnement, la série entière passe en un run. **Poser le token = geste de Phil** (c'est un
identifiant de compte).

## Les variantes proposées — huit, volontairement variées

Phil : « pas obligé des thèmes, tu es varié ». Le bloc de style est constant, seule la scène change.

**Bloc de style constant** (à concaténer devant chaque thème) :

    flat cel-shaded anime avatar, thick dark navy outlines, hard-edged color blocks, no soft
    gradients, crisp vector-like rendering, centered square PFP crop, collectible avatar art

| # | thème | clause de scène |
|---|---|---|
| 1 | **Agent** | dark suit and tie, tilted fedora, gun-barrel spiral behind, monochrome背景 with one blue accent |
| 2 | **Keeper de nuit** | rooftop at night, city lights bokeh, dark hooded haori over the kimono, moon behind |
| 3 | **Salle de marché** | glowing candlestick chart wall, green and red bars, reflected in the visor |
| 4 | **Boardroom** | charcoal suit, boardroom window behind, Coinbase-blue palette — **un THÈME de dirigeant, jamais le portrait d'une personne réelle** |
| 5 | **Encre / enso** | sumi-e ink wash, single black enso ring behind, cream paper texture, minimal |
| 6 | **Arcade** | synthwave grid, magenta and cyan neon, CRT scanlines, 80s arcade cabinet glow |
| 7 | **Samouraï sous la pluie** | heavy rain streaks, paper umbrella, storm-grey sky, kimono soaked and dark |
| 8 | **Hiver** | falling snow, breath vapour, scarf over the kimono, pale blue winter light |

## Lancer la série

```bash
node brand/ref/gen-variants.mjs            # dry-run: imprime les prompts, ne consomme aucun quota
HF_TOKEN=… node brand/ref/gen-variants.mjs --run   # génère
```

## Provenance — à dire si on demande

`brand/out/` = **dessiné à la main** (SVG). `brand/gen/` et les sorties de ce pipeline =
**générées par modèle** à partir de nos prompts et de la référence de Phil. Ce n'est pas la même chose
et on ne les présente pas comme telles.
