#!/usr/bin/env node
/**
 * build-pfp.mjs — hand-drawn Toshi portraits (SVG), one character, many themes.
 * =============================================================================
 * Every path in here was drawn by hand from Phil's own reference PFPs (Base-blue cat, off-white
 * bib, broad ears, thick navy outline, forehead flashes). NOTHING is model-generated: this is
 * vector geometry, so it scales to any PFP size without artefacts and stays editable.
 *
 * The point of a generator rather than 6 separate files: the FACE is defined exactly once. A theme
 * only supplies a background, a palette tweak, an expression and accessories — so fixing the muzzle
 * fixes it in all six portraits, and the character can never drift between them.
 *
 * Zero dependencies (writes .svg only). Rasterise separately if you need PNG.
 *
 *   node brand/build-pfp.mjs                 # write every theme to brand/out/
 *   node brand/build-pfp.mjs --list          # list theme ids
 *   node brand/build-pfp.mjs terminal base   # only these themes
 *
 * Canvas is 1000x1000 with the head inside r=430 of centre, so an X/Discord CIRCULAR crop never
 * clips an ear or the chin — the most common way a square portrait dies as a profile picture.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');

// ── palette ────────────────────────────────────────────────────────────────────────────────────
// Base blue is not decorative: #0052FF is the chain's blue and it is already the panel's accent
// (panel/index.html). The fur is built around it so Toshi reads as "on Base" with no logo at all.
const P = {
  ink: '#0A1230',        // outline — very dark navy, never pure black (pure black kills the blue)
  furHi: '#4C93FF',
  fur: '#1667FF',
  furMid: '#0F53E0',
  furLo: '#0A3AAE',
  earIn: '#0C2E7A',
  bib: '#F2F6FC',
  bibSh: '#CFDCEF',
  bibSh2: '#AEC1DC',
  eyeW: '#FFFFFF',
  iris: '#12E0C8',
  pupil: '#08122B',
};

const S = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');

// ── the character ──────────────────────────────────────────────────────────────────────────────
// Drawn back-to-front: ears → head → forehead flashes → bib → eyes → nose/mouth → whiskers.
// Stroke width is deliberately heavy (13–16) — the sticker-thick outline is what makes the four
// reference PFPs read instantly at 48px, which is the size that actually matters on a timeline.

function ears({ fur = P.fur, earIn = P.earIn, ink = P.ink } = {}) {
  // Ears must clearly break the head silhouette, or the pair reads as a HOOD instead of a cat —
  // that was the first draft's failure. So: tall, back-swept triangles whose tips sit well outside
  // the head circle, and an inner ear that stays SMALL and lighter than the fur. A big dark inner
  // ear is exactly what made the first version look like a cowl.
  const L = 'M 296 356 C 258 272 224 178 220 128 C 218 102 246 96 274 120 C 338 172 414 226 476 266 Z';
  const Lin = 'M 322 330 C 300 272 282 212 281 178 C 280 162 294 160 310 174 C 350 208 398 242 438 270 Z';
  return `
  <g ${S({ stroke: ink, 'stroke-width': 15, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })}>
    <path d="${L}" fill="${fur}"/>
    <path d="${L}" fill="${fur}" transform="translate(1000,0) scale(-1,1)"/>
  </g>
  <g ${S({ stroke: 'none' })}>
    <path d="${Lin}" fill="${earIn}" opacity=".9"/>
    <path d="${Lin}" fill="${earIn}" opacity=".9" transform="translate(1000,0) scale(-1,1)"/>
  </g>`;
}

// Head: a touch wider than tall with a slight jaw taper, so it is a face and not a ball.
const HEAD_D = 'M 500 262 C 656 262 790 352 790 508 C 790 608 734 700 638 748 C 596 770 550 780 500 780 C 450 780 404 770 362 748 C 266 700 210 608 210 508 C 210 352 344 262 500 262 Z';
// The bib is a wide face MASK, not a muzzle blob: it points up between the eyes and spreads almost
// to the cheek edges — that width is what the reference PFPs actually have.
const BIB_D = 'M 500 434 C 552 496 604 522 660 540 C 716 558 744 606 732 658 C 714 728 620 784 500 784 C 380 784 286 728 268 658 C 256 606 284 558 340 540 C 396 522 448 496 500 434 Z';

function head({ fur = P.fur, ink = P.ink } = {}) {
  return `
  <path d="${HEAD_D}" fill="url(#furGrad)" stroke="${ink}" stroke-width="16" stroke-linejoin="round"/>
  <!-- cheek shading, kept inside the silhouette so no halo appears on dark backgrounds -->
  <path d="M 214 476 C 228 620 326 726 450 758 C 320 772 216 664 210 540 Z" fill="${P.furLo}" opacity=".5"/>
  <path d="M 786 476 C 772 620 674 726 550 758 C 680 772 784 664 790 540 Z" fill="${P.furLo}" opacity=".28"/>`;
}

function flashes({ hi = P.furHi } = {}) {
  // Three tapered forehead marks — the character's only "marking", straight off the references.
  return `
  <g fill="${hi}" opacity=".92">
    <path d="M 470 300 C 486 320 492 352 488 384 C 474 366 462 332 470 300 Z"/>
    <path d="M 524 296 C 544 318 552 352 548 388 C 530 368 516 330 524 296 Z"/>
    <path d="M 578 312 C 600 334 610 364 608 396 C 588 378 572 346 578 312 Z"/>
    <path d="M 416 318 C 432 340 438 370 434 400 C 418 382 408 350 416 318 Z" opacity=".7"/>
  </g>`;
}

function bib({ bib = P.bib, ink = P.ink } = {}) {
  return `
  <path d="${BIB_D}" fill="url(#bibGrad)" stroke="${ink}" stroke-width="14" stroke-linejoin="round"/>
  <path d="M 500 446 C 546 498 588 520 636 537 C 660 545 676 560 686 578 C 640 556 566 536 500 470 Z" fill="${P.bibSh}" opacity=".55"/>`;
}

/**
 * Eyes. `mood` changes only the LIDS, never the eyeball — an expression is a lid, which is why the
 * same character can look smug, focused or annoyed without redrawing anything underneath.
 */
function eyes({ iris = P.iris, ink = P.ink, fur = P.fur, mood = 'calm', glow = 0 } = {}) {
  // A LID, not a frame. The first draft stroked an arc that hugged the eyeball, which read as a pair
  // of round glasses. Here the lid is a fur-coloured shape CLIPPED to the eyeball, with a crease line
  // along its lower edge — so it occludes the eye the way an eyelid does, and the eye outline stays
  // one unbroken stroke because it is drawn last.
  const RX = 70, RY = 76, CY = 470;
  const eye = (cx, dir, id) => {
    // dir: -1 = left eye (outer side is -x), +1 = right eye.
    const lidD = {
      annoyed: `M ${cx - 100} 320 L ${cx + 100} 320 L ${cx + 100} ${dir < 0 ? 430 : 460} L ${cx - 100} ${dir < 0 ? 460 : 430} Z`,
      smug: `M ${cx - 100} 320 L ${cx + 100} 320 L ${cx + 100} ${dir < 0 ? 470 : 436} L ${cx - 100} ${dir < 0 ? 436 : 470} Z`,
      focused: `M ${cx - 100} 320 L ${cx + 100} 320 L ${cx + 100} 414 L ${cx - 100} 414 Z`,
      calm: '', soft: '',
    }[mood];
    const creaseD = {
      annoyed: `M ${cx - 100} ${dir < 0 ? 460 : 430} L ${cx + 100} ${dir < 0 ? 430 : 460}`,
      smug: `M ${cx - 100} ${dir < 0 ? 436 : 470} L ${cx + 100} ${dir < 0 ? 470 : 436}`,
      focused: `M ${cx - 100} 414 L ${cx + 100} 414`,
      calm: '', soft: '',
    }[mood];
    const brow = (mood === 'annoyed' || mood === 'focused')
      ? `<path d="M ${cx - dir * 76} ${mood === 'annoyed' ? 356 : 348} C ${cx - dir * 30} ${mood === 'annoyed' ? 336 : 330} ${cx + dir * 34} ${mood === 'annoyed' ? 348 : 340} ${cx + dir * 74} ${mood === 'annoyed' ? 380 : 366}"
             fill="none" stroke="${ink}" stroke-width="17" stroke-linecap="round"/>` : '';
    return `
    <g>
      <ellipse cx="${cx}" cy="${CY}" rx="${RX}" ry="${RY}" fill="${P.eyeW}"/>
      <ellipse cx="${cx}" cy="${CY + 4}" rx="${RX - 12}" ry="${RY - 12}" fill="${iris}"/>
      <ellipse cx="${cx}" cy="${CY + 6}" rx="32" ry="42" fill="${P.pupil}"/>
      <ellipse cx="${cx + dir * 18}" cy="${CY - 24}" rx="16" ry="19" fill="#fff" opacity=".96"/>
      <circle cx="${cx - dir * 16}" cy="${CY + 34}" r="8" fill="#fff" opacity=".5"/>
      ${lidD ? `<g clip-path="url(#${id})">
        <path d="${lidD}" fill="${fur}"/>
        <path d="${creaseD}" fill="none" stroke="${ink}" stroke-width="11"/>
      </g>` : ''}
      <ellipse cx="${cx}" cy="${CY}" rx="${RX}" ry="${RY}" fill="none" stroke="${ink}" stroke-width="14"/>
      ${brow}
    </g>`;
  };
  const halo = glow
    ? `<g filter="url(#softGlow)" opacity="${glow}">
         <ellipse cx="396" cy="${CY}" rx="62" ry="68" fill="${iris}"/>
         <ellipse cx="604" cy="${CY}" rx="62" ry="68" fill="${iris}"/>
       </g>`
    : '';
  const clips = `<clipPath id="clipL"><ellipse cx="396" cy="${CY}" rx="${RX}" ry="${RY}"/></clipPath>
                 <clipPath id="clipR"><ellipse cx="604" cy="${CY}" rx="${RX}" ry="${RY}"/></clipPath>`;
  return `<defs>${clips}</defs>` + halo + eye(396, -1, 'clipL') + eye(604, 1, 'clipR');
}

function snout({ ink = P.ink, mouth = 'neutral' } = {}) {
  const m = {
    neutral: 'M 500 652 C 500 682 468 696 448 676 M 500 652 C 500 682 532 696 552 676',
    smile: 'M 500 650 C 500 692 452 708 426 678 M 500 650 C 500 692 548 708 574 678',
    flat: 'M 452 668 L 548 668',
    open: 'M 456 654 C 478 706 522 706 544 654 C 520 674 480 674 456 654 Z',
  }[mouth];
  const open = mouth === 'open';
  return `
  <path d="M 466 596 C 466 580 481 571 500 571 C 519 571 534 580 534 596 C 534 617 517 630 500 630 C 483 630 466 617 466 596 Z" fill="${ink}"/>
  <path d="M 500 630 L 500 654" stroke="${ink}" stroke-width="12" stroke-linecap="round"/>
  <path d="${m}" fill="${open ? ink : 'none'}" stroke="${ink}" stroke-width="12" stroke-linecap="round"/>`;
}

function whiskers({ ink = P.ink, op = 0.45 } = {}) {
  return `
  <g fill="${ink}" opacity="${op}">
    <circle cx="372" cy="606" r="7"/><circle cx="330" cy="636" r="7"/><circle cx="380" cy="656" r="7"/>
    <circle cx="628" cy="606" r="7"/><circle cx="670" cy="636" r="7"/><circle cx="620" cy="656" r="7"/>
  </g>`;
}

/** Neck + shoulders. Narrow at the neck so the HEAD stays the subject; accessories go on top. */
function shoulders({ ink = P.ink } = {}) {
  return `
  <path d="M 500 742 C 462 742 434 768 428 806 C 330 838 240 916 202 1012 L 798 1012 C 760 916 670 838 572 806 C 566 768 538 742 500 742 Z"
        fill="url(#furGrad2)" stroke="${ink}" stroke-width="16" stroke-linejoin="round"/>
  <!-- shadow the fur just under the jaw, or the head looks pasted onto the body -->
  <path d="M 428 806 C 470 830 530 830 572 806 C 560 852 440 852 428 806 Z" fill="${P.furLo}" opacity=".55"/>`;
}

function character(o = {}) {
  return `
  <g>
    ${o.behind || ''}
    ${ears(o)}
    ${shoulders(o)}
    ${head(o)}
    ${flashes(o)}
    ${o.preBib || ''}
    ${bib(o)}
    ${eyes(o)}
    ${snout(o)}
    ${whiskers(o)}
  </g>`;
}

// ── shared defs ────────────────────────────────────────────────────────────────────────────────
function defs(extra = '') {
  return `<defs>
    <linearGradient id="furGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.furHi}"/><stop offset=".42" stop-color="${P.fur}"/><stop offset="1" stop-color="${P.furMid}"/>
    </linearGradient>
    <linearGradient id="furGrad2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.furMid}"/><stop offset="1" stop-color="${P.furLo}"/>
    </linearGradient>
    <linearGradient id="bibGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="${P.bib}"/><stop offset="1" stop-color="${P.bibSh}"/>
    </linearGradient>
    <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <filter id="bigGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="48"/>
    </filter>
    <radialGradient id="vignette" cx=".5" cy=".46" r=".78">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/>
    </radialGradient>
    ${extra}
  </defs>`;
}

function svg(inner, extraDefs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
${defs(extraDefs)}
${inner}
</svg>`;
}

// ── deterministic pseudo-random, so a rebuild is byte-identical ────────────────────────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── themes ─────────────────────────────────────────────────────────────────────────────────────
const THEMES = {};

/* 0 ─ THE AGENT. The core ask ("image toshi agent"): spy-poster Toshi, straight from the 007-style
 *     reference — gun-barrel spiral behind, black suit, tie, earpiece, unimpressed stare. No weapon:
 *     the barrel rifling and the suit carry the trope on their own. */
THEMES.agent = () => {
  const rings = [470, 400, 332, 268, 210, 158, 112].map((rr, i) =>
    `<circle cx="500" cy="470" r="${rr}" fill="${i % 2 ? '#E9ECF2' : '#CBD2DE'}"/>`).join('');
  const rifling = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const x1 = 500 + Math.cos(a) * 118, y1 = 470 + Math.sin(a) * 118;
    const x2 = 500 + Math.cos(a + 0.5) * 476, y2 = 470 + Math.sin(a + 0.5) * 476;
    return `<path d="M ${x1.toFixed(0)} ${y1.toFixed(0)} L ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="#9AA3B4" stroke-width="7" opacity=".5"/>`;
  }).join('');
  return {
    title: 'L’Agent — la quête de base',
    inner: `
    <rect width="1000" height="1000" fill="#14161C"/>
    <g>${rings}${rifling}</g>
    <circle cx="500" cy="470" r="476" fill="none" stroke="#0B0D12" stroke-width="52"/>
    <g fill="#C22B2B" opacity=".85"><circle cx="122" cy="188" r="9"/><circle cx="874" cy="238" r="7"/><circle cx="146" cy="742" r="7"/></g>
    ${character({ mood: 'annoyed', mouth: 'flat', iris: '#7FA6C8',
      // suit drawn OVER the shoulder wedge: two lapels, a shirt V and the tie — worn, not floating
      preBib: '' })}
    <g stroke="${P.ink}" stroke-width="14" stroke-linejoin="round">
      <path d="M 500 806 L 396 1010 L 188 1010 C 216 892 320 800 436 780 Z" fill="#171B26"/>
      <path d="M 500 806 L 604 1010 L 812 1010 C 784 892 680 800 564 780 Z" fill="#11141D"/>
      <path d="M 452 788 L 500 846 L 548 788 L 548 1010 L 452 1010 Z" fill="#F2F5FA"/>
      <path d="M 500 846 L 466 900 L 500 1010 L 534 900 Z" fill="#1D2C55"/>
    </g>
    <!-- earpiece: the one prop that says agent without saying weapon -->
    <path d="M 786 552 C 826 570 838 620 812 660 C 800 700 786 738 776 766" fill="none" stroke="#0B0D12" stroke-width="10" stroke-linecap="round" opacity=".9"/>
    <circle cx="784" cy="548" r="17" fill="#0B0D12"/>
    <rect width="1000" height="1000" fill="url(#vignette)" opacity=".8"/>`,
  };
};

/* 1 ─ TERMINAL WATCHER. The "the eyes are me" portrait: everything else is dimmed to near-monochrome
 *     so the only living colour in the frame is the eyes, with a cursor block sitting in each pupil.
 *     Toshi's actual job in this repo is watching a terminal, so the theme is literal, not decorative. */
THEMES.terminal = () => {
  const r = rng(7);
  let rain = '';
  for (let col = 0; col < 26; col++) {
    const x = 12 + col * 39 + r() * 8;
    const len = 6 + Math.floor(r() * 16);
    const y0 = -100 + r() * 900;
    for (let i = 0; i < len; i++) {
      const o = (0.1 + 0.72 * (i / len)) * (0.35 + r() * 0.65);
      rain += `<rect x="${x.toFixed(1)}" y="${(y0 + i * 30).toFixed(1)}" width="14" height="${(9 + r() * 11).toFixed(1)}" rx="3" fill="#39FF9E" opacity="${o.toFixed(2)}"/>`;
    }
  }
  // Desaturated, NOT dark: the first pass dimmed the fur so far that the cat disappeared into the
  // background. Keep the blue readable and let the eyes be the only saturated thing in the frame.
  const dim = { fur: '#1E3A78', furHi: '#3860AE', furMid: '#152C5E', furLo: '#0C1B3C', earIn: '#122A5C', bib: '#DCE6F4' };
  return {
    title: 'Terminal Watcher — les yeux, c’est toi',
    inner: `
    <rect width="1000" height="1000" fill="#03080C"/>
    <g opacity=".8">${rain}</g>
    <rect width="1000" height="1000" fill="url(#vignette)"/>
    <ellipse cx="500" cy="500" rx="360" ry="360" fill="#39FF9E" opacity=".12" filter="url(#bigGlow)"/>
    ${character({ ...dim, iris: '#39FF9E', mood: 'focused', mouth: 'flat', glow: 1 })}
    <!-- the cursor: one solid block in each pupil, the single most Toshi detail in the whole set -->
    <g fill="#DEFFEE"><rect x="388" y="462" width="18" height="32" rx="3"/><rect x="596" y="462" width="18" height="32" rx="3"/></g>
    <!-- scanlines kept faint; at .28 they washed the whole face grey -->
    <g stroke="#39FF9E" stroke-width="2" opacity=".1">
      ${Array.from({ length: 34 }, (_, i) => `<line x1="0" y1="${i * 30 + 8}" x2="1000" y2="${i * 30 + 8}"/>`).join('')}
    </g>`,
  };
};

/* 2 ─ BASE BLUE. No props, no gimmick: the character alone on the chain's blue. This is the one that
 *     survives being shrunk to 48px, which is the only test a PFP has to pass. */
THEMES.base = () => ({
  title: 'Base Blue — le portrait officiel',
  extraDefs: `<radialGradient id="bb" cx=".5" cy=".4" r=".8">
      <stop offset="0" stop-color="#2E6BFF"/><stop offset=".6" stop-color="#0B3ACF"/><stop offset="1" stop-color="#041A63"/>
    </radialGradient>`,
  inner: `
    <rect width="1000" height="1000" fill="url(#bb)"/>
    <g fill="none" stroke="#7FB0FF" opacity=".22" stroke-width="3">
      ${[200, 280, 360, 440].map((rr) => `<circle cx="500" cy="470" r="${rr}"/>`).join('')}
    </g>
    <g opacity=".5">${Array.from({ length: 40 }, (_, i) => { const r = rng(i + 3); return `<circle cx="${(r() * 1000).toFixed(0)}" cy="${(r() * 1000).toFixed(0)}" r="${(1 + r() * 2.4).toFixed(1)}" fill="#DCEAFF"/>`; }).join('')}</g>
    ${character({ mood: 'calm', mouth: 'smile' })}
    <rect width="1000" height="1000" fill="url(#vignette)" opacity=".7"/>`,
});

/* 3 ─ THE NOTARY. Toshi as LAWBOR's clerk: wax seal at the collar, ledger rules behind. The whole
 *     project's claim is "settled = actually paid", and a notary is what that looks like as a face. */
THEMES.notary = () => ({
  title: 'Le Notaire — settled = vraiment payé',
  extraDefs: `<linearGradient id="parch" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141C36"/><stop offset="1" stop-color="#070C1C"/>
    </linearGradient>`,
  inner: `
    <rect width="1000" height="1000" fill="url(#parch)"/>
    <g stroke="#7C8CB8" opacity=".18" stroke-width="2">
      ${Array.from({ length: 22 }, (_, i) => `<line x1="60" y1="${70 + i * 42}" x2="940" y2="${70 + i * 42}"/>`).join('')}
      <line x1="140" y1="40" x2="140" y2="960" stroke="#C4693F" opacity=".5"/>
    </g>
    <g opacity=".5" fill="none" stroke="#D8B36A" stroke-width="4">
      <rect x="42" y="42" width="916" height="916" rx="18"/>
      <rect x="60" y="60" width="880" height="880" rx="12" opacity=".5"/>
    </g>
    ${character({ mood: 'calm', mouth: 'flat', iris: '#E0B45E',
      // A quill was tried here and cut: half-hidden behind the new wide bib it read as a toothpick
      // stuck in the cheek. The seal carries the theme alone — fewer props, stronger face.
    })}
    <!-- wax seal: the collar medallion. Embossed ring, no text — a seal reads as a seal. -->
    <g transform="translate(500,876)">
      <circle r="86" fill="#9E2B2B" stroke="${P.ink}" stroke-width="14"/>
      <circle r="86" fill="none" stroke="#C64B4B" stroke-width="10" opacity=".8"/>
      <circle r="60" fill="none" stroke="#6E1A1A" stroke-width="9"/>
      <path d="M -26 -6 L -4 20 L 30 -22" fill="none" stroke="#F4D9D9" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <rect width="1000" height="1000" fill="url(#vignette)"/>`,
});

/* 4 ─ NIGHT KEEPER. The keeper process that never sleeps (rugrace's, and every other one). Hood up,
 *     moon behind, and a real heartbeat line — the thing a supervisor is actually for. */
THEMES.keeper = () => {
  const r = rng(19);
  const stars = Array.from({ length: 90 }, () => `<circle cx="${(r() * 1000).toFixed(0)}" cy="${(r() * 700).toFixed(0)}" r="${(0.8 + r() * 2.2).toFixed(1)}" fill="#E8F0FF" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`).join('');
  return {
    title: 'Night Keeper — le process qui ne dort jamais',
    extraDefs: `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B1436"/><stop offset=".55" stop-color="#0A1B4E"/><stop offset="1" stop-color="#050A20"/>
    </linearGradient>`,
    inner: `
    <rect width="1000" height="1000" fill="url(#night)"/>
    ${stars}
    <circle cx="768" cy="200" r="104" fill="#F3F7DF" opacity=".92"/>
    <circle cx="726" cy="170" r="104" fill="#0A1B4E"/>
    <!-- heartbeat BEHIND the cat and below the chin line — the first draft ran it across the muzzle -->
    <path d="M 60 830 L 200 830 L 232 764 L 268 900 L 300 830 L 700 830 L 732 764 L 768 900 L 800 830 L 940 830"
          fill="none" stroke="#39FF9E" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    ${character({ mood: 'soft', mouth: 'neutral', iris: '#7FD4FF' })}
    <!-- scarf instead of a hood: it can sit UNDER the chin without hiding the ears (the whole point) -->
    <g stroke="${P.ink}" stroke-width="14" stroke-linejoin="round">
      <path d="M 404 788 C 440 828 560 828 596 788 C 640 810 664 850 660 892 C 600 862 400 862 340 892 C 336 850 360 810 404 788 Z" fill="#16307C"/>
      <path d="M 560 866 L 596 1004 L 508 1004 L 520 872 Z" fill="#16307C"/>
      <path d="M 356 872 C 420 852 580 852 644 872" fill="none" stroke="#3B5CC4" stroke-width="9" opacity=".9"/>
    </g>
    <rect width="1000" height="1000" fill="url(#vignette)"/>`,
  };
};

/* 5 ─ THE MERCHANT (BIII). Kimono collar, a coin, and a real QR-looking block: the till that earns.
 *     Non-custodial by nature — the cat renders a charge, it never holds the money. */
THEMES.merchant = () => {
  const r = rng(41);
  let qr = '';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (r() > 0.44) qr += `<rect x="${x * 22}" y="${y * 22}" width="19" height="19" rx="3" fill="#0A1230"/>`;
  return {
    title: 'Le Marchand — le tiroir-caisse qui encaisse',
    extraDefs: `<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DCE9FA"/><stop offset="1" stop-color="#A9C4E8"/>
    </linearGradient>`,
    inner: `
    <rect width="1000" height="1000" fill="url(#cream)"/>
    <g opacity=".5">${Array.from({ length: 26 }, (_, i) => { const rr = rng(i + 90); const cx = rr() * 1000, cy = rr() * 1000; return `<g transform="translate(${cx.toFixed(0)},${cy.toFixed(0)})"><circle r="18" fill="none" stroke="#5D8CD6" stroke-width="4"/><path d="M 0 -9 L 0 9 M -6 -3 L 6 -3 M -6 3 L 6 3" stroke="#5D8CD6" stroke-width="3.5"/></g>`; }).join('')}</g>
    <circle cx="500" cy="470" r="340" fill="#F4F9FF" opacity=".55"/>
    ${character({ mood: 'smug', mouth: 'smile', iris: '#F0B72E' })}
    <!-- kimono collar over the shoulders, meeting at the sternum like a real lapel -->
    <g stroke="${P.ink}" stroke-width="15" stroke-linejoin="round">
      <path d="M 470 800 L 300 1010 L 168 1010 C 210 906 316 812 430 782 Z" fill="#EAF2FF"/>
      <path d="M 530 800 L 700 1010 L 832 1010 C 790 906 684 812 570 782 Z" fill="#D6E6FB"/>
      <path d="M 500 828 L 444 1010 L 556 1010 Z" fill="#1667FF"/>
    </g>
    <!-- a real coin, and a QR block: mint an intent, render a code, hold nothing.
         Both fully inside the canvas — the first draft clipped the QR at the edge. -->
    <g transform="translate(816,796)">
      <circle r="70" fill="#F0B72E" stroke="${P.ink}" stroke-width="13"/>
      <circle r="49" fill="none" stroke="#B7801A" stroke-width="8"/>
      <path d="M 0 -32 L 0 32 M -19 -13 L 19 -13 M -19 11 L 19 11" stroke="#6E4A08" stroke-width="12" stroke-linecap="round"/>
    </g>
    <g transform="translate(64,746)"><rect x="-16" y="-16" width="230" height="230" rx="12" fill="#F7FBFF" stroke="${P.ink}" stroke-width="11"/>${qr}</g>`,
  };
};

/* 6 ─ FABLE. Ink-wash enso, gold leaf, storybook warmth — the one that does not look like crypto at
 *     all, on purpose. A set where every portrait shouts is a set with no range. */
THEMES.fable = () => {
  const r = rng(103);
  const leaf = Array.from({ length: 46 }, () => `<circle cx="${(r() * 1000).toFixed(0)}" cy="${(r() * 1000).toFixed(0)}" r="${(1.5 + r() * 4.5).toFixed(1)}" fill="#D9AE55" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`).join('');
  return {
    title: 'Fable — encre et feuille d’or',
    extraDefs: `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F6EEDC"/><stop offset="1" stop-color="#E4D5B8"/>
    </linearGradient>
    <radialGradient id="warm" cx=".5" cy=".42" r=".7">
      <stop offset="0" stop-color="#FFF8E8" stop-opacity=".9"/><stop offset="1" stop-color="#C9B48A" stop-opacity="0"/>
    </radialGradient>`,
    inner: `
    <rect width="1000" height="1000" fill="url(#paper)"/>
    <rect width="1000" height="1000" fill="url(#warm)"/>
    ${leaf}
    ${character({ mood: 'soft', mouth: 'smile', iris: '#3FB6A6', fur: '#2A6FE8', furHi: '#63A0FF', furMid: '#1B52C0', furLo: '#123A8E', ink: '#221A10',
      // The enso goes BEHIND the cat (drawn via the behind hook): in the first draft it crossed the
      // ears in front and read as an antenna. Behind, it frames — 990 diameter, opening at 10 o'clock.
      behind: `<path d="M 560 62 C 760 90 908 268 900 490 C 892 726 706 906 480 898 C 262 890 96 716 100 496 C 103 330 198 196 338 130"
                     fill="none" stroke="#2A2116" stroke-width="36" stroke-linecap="round" opacity=".8"/>
               <path d="M 560 88 C 744 118 878 282 872 488 C 866 706 694 878 484 872" fill="none" stroke="#2A2116" stroke-width="9" opacity=".25"/>` })}
    <g transform="translate(806,340)"><circle r="30" fill="none" stroke="#D9AE55" stroke-width="10"/><circle r="12" fill="#D9AE55"/></g>`,
  };
};

// ── build ──────────────────────────────────────────────────────────────────────────────────────
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (process.argv.includes('--list')) { console.log(Object.keys(THEMES).join('\n')); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
const build = ids.length ? ids : Object.keys(THEMES);
const made = [];
for (const id of build) {
  const make = THEMES[id];
  if (!make) { console.error(`unknown theme: ${id} (try --list)`); process.exit(1); }
  const t = make();
  const file = path.join(OUT, `toshi-${id}.svg`);
  fs.writeFileSync(file, svg(t.inner, t.extraDefs || ''));
  made.push({ id, title: t.title, file });
  console.log(`  ✓ ${id.padEnd(10)} ${t.title}`);
}
console.log(`\n${made.length} portrait(s) → ${OUT}`);
