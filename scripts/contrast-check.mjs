#!/usr/bin/env node
// MV-83 contrast harness — pure Node, no external deps.
//
// For every candidate, for every token pair in the spec, in BOTH light and dark
// themes: composite any alpha (*-tint) background over the correct ambient base,
// compute the WCAG 2.1 contrast ratio, and PASS/FAIL against the pair threshold
// (text = 4.5:1, ui = 3.0:1).
//
// Prints a per-candidate matrix + a summary. Exits 1 if any pair fails, 0 if all pass.

import { candidates, pairs } from './palette-candidates.data.mjs';

const THRESHOLD = { text: 4.5, ui: 3.0 };

// Non-token literal foregrounds that may appear in the spec (e.g. off-token text-white).
const LITERALS = { white: '#ffffff', black: '#000000' };

// --- color parsing --------------------------------------------------------

/** Parse #rgb / #rrggbb / #rrggbbaa -> { r,g,b,a } with channels 0..255 and a 0..1. */
function parseHex(hex) {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) h += 'ff';
  if (h.length !== 8) throw new Error(`Bad hex: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

/** Alpha-composite a (possibly translucent) source over an opaque base. Returns opaque {r,g,b}. */
function composite(src, base) {
  const a = src.a;
  return {
    r: src.r * a + base.r * (1 - a),
    g: src.g * a + base.g * (1 - a),
    b: src.b * a + base.b * (1 - a),
    a: 1,
  };
}

// --- WCAG 2.1 relative luminance + contrast ratio -------------------------

/** sRGB 8-bit channel -> linear-light component. */
function linearize(c8) {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an opaque color. */
function luminance({ r, g, b }) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two opaque colors. */
function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- token / pair resolution ----------------------------------------------

// Which ambient base a translucent *-tint background composites over, per theme.
// bg-context tint pairs (info panels, callouts rendered on the page) sit over `bg`;
// card-context tint pairs (verdict pills, stale warnings on a card) sit over `surface`.
// This matches the pairing spec notes.
const TINT_BASE = {
  // fg|bg -> 'bg' | 'surface'
  'ink-soft|primary-tint': 'bg', // inline-callout rendered inline in page flow
  'ink-soft|possible-tint': 'bg',
  'ink-soft|strong-tint': 'bg',
  'strong|strong-tint': 'surface', // verdict pills render on cards
  'possible|possible-tint': 'surface',
  'possible-ink|possible-tint': 'surface',
  'reach|reach-tint': 'surface',
};

function resolveFg(tokens, name, theme) {
  if (LITERALS[name]) return parseHex(LITERALS[name]);
  const t = tokens[name];
  if (!t) throw new Error(`Unknown fg token: ${name}`);
  return parseHex(t[theme]);
}

/**
 * Resolve a background to an opaque color, compositing translucent tints over
 * the correct ambient base for the theme.
 */
function resolveBg(tokens, fgName, bgName, theme) {
  const t = tokens[bgName];
  if (!t) throw new Error(`Unknown bg token: ${bgName}`);
  const raw = parseHex(t[theme]);
  if (raw.a >= 1) return raw;
  const baseName = TINT_BASE[`${fgName}|${bgName}`] || 'bg';
  const base = parseHex(tokens[baseName][theme]); // ambient bases are opaque
  return composite(raw, base);
}

// --- run ------------------------------------------------------------------

const THEMES = ['light', 'dark'];

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

let totalFail = 0;
let totalChecks = 0;
const lines = [];

for (const cand of candidates) {
  lines.push('');
  lines.push('='.repeat(78));
  lines.push(`CANDIDATE: ${cand.name}  (${cand.key})`);
  lines.push('='.repeat(78));
  lines.push(
    pad('PAIR (fg on bg)', 34) +
      pad('KIND', 6) +
      pad('THEME', 7) +
      pad('RATIO', 8) +
      pad('MIN', 6) +
      'RESULT'
  );
  lines.push('-'.repeat(78));

  let candFail = 0;
  for (const p of pairs) {
    const min = THRESHOLD[p.kind];
    for (const theme of THEMES) {
      const fg = resolveFg(cand.tokens, p.fg, theme);
      const bg = resolveBg(cand.tokens, p.fg, p.bg, theme);
      const ratio = contrastRatio(fg, bg);
      const passed = ratio >= min - 1e-9;
      totalChecks++;
      if (!passed) {
        candFail++;
        totalFail++;
      }
      lines.push(
        pad(`${p.fg} on ${p.bg}`, 34) +
          pad(p.kind, 6) +
          pad(theme, 7) +
          pad(ratio.toFixed(2), 8) +
          pad(min.toFixed(1), 6) +
          (passed ? 'PASS' : 'FAIL <<<')
      );
    }
  }

  lines.push('-'.repeat(78));
  lines.push(
    `${cand.name}: ${pairs.length} pairs x ${THEMES.length} themes = ${pairs.length * THEMES.length} checks, ${candFail} failing`
  );
}

lines.push('');
lines.push('#'.repeat(78));
lines.push('SUMMARY');
lines.push('#'.repeat(78));
lines.push(`Candidates:        ${candidates.length}`);
lines.push(`Pairs per candidate: ${pairs.length}  (x ${THEMES.length} themes = ${pairs.length * THEMES.length} checks each)`);
lines.push(`Total checks:      ${totalChecks}`);
lines.push(`Total failing:     ${totalFail}`);
lines.push(totalFail === 0 ? 'ALL PAIRS PASS ✓' : `${totalFail} PAIR(S) FAIL ✗`);

console.log(lines.join('\n'));

process.exit(totalFail === 0 ? 0 : 1);
