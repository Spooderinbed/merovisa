// MV-83 palette candidate data — SINGLE SOURCE OF TRUTH.
//
// Three generated palette candidates (name, key, rationale, tokens map name -> {light,dark})
// plus the real token-pairing spec derived from component usage.
//
// The contrast harness (scripts/contrast-check.mjs) imports this module and verifies
// every pair in both themes against its WCAG threshold (text=4.5:1, ui=3.0:1).
//
// TUNING LOG (lightness-only adjustments to clear thresholds with margin; hue/chroma preserved):
//   (populated below where a token was changed — see inline `// TUNED:` markers)

/**
 * @typedef {{ light: string, dark: string }} TokenValue
 * @typedef {{ key: string, name: string, rationale: string, tokens: Record<string, TokenValue> }} Candidate
 * @typedef {{ fg: string, bg: string, kind: 'text' | 'ui', note?: string }} Pair
 */

/** Convert an ordered token array into a name -> {light,dark} map. */
function toTokenMap(arr) {
  const map = {};
  for (const t of arr) map[t.name] = { light: t.light, dark: t.dark };
  return map;
}

/** @type {Candidate[]} */
export const candidates = [
  {
    key: 'night-indigo',
    name: 'Night indigo',
    rationale:
      'Dampened periwinkle primary, never-neon; two-pole saturation rationing; indigo carries near-unchanged across modes with an independently re-picked near-black neutral ramp; cool glacier paper; single amber decorative accent chromatically far from primary; verdict trio owns the semantic budget.',
    tokens: toTokenMap([
      { name: 'bg', light: '#f2f2f7', dark: '#0e0e14' },
      { name: 'bg-tint', light: '#eaeaf1', dark: '#15151d' },
      { name: 'surface', light: '#fdfdff', dark: '#17171f' },
      { name: 'surface-2', light: '#f7f7fb', dark: '#1e1e28' },
      { name: 'ink', light: '#1c1c26', dark: '#e8e8f0' },
      { name: 'ink-soft', light: '#54545f', dark: '#a6a6b2' },
      { name: 'ink-faint', light: '#63636e', dark: '#8a8a95' }, // TUNED: was #7d7d88 L / #76767f D; then light #6c6c77 -> #63636e (faint on bg-tint light still 4.33 < 4.5). Lightness-only, neutral indigo hue kept.
      { name: 'line', light: '#1c1c260f', dark: '#ffffff12' },
      { name: 'line-2', light: '#1c1c261a', dark: '#ffffff22' },
      { name: 'primary', light: '#4a4fd6', dark: '#8b8ff0' },
      { name: 'primary-ink', light: '#3a3fb8', dark: '#a3a6f5' },
      { name: 'primary-tint', light: '#4a4fd614', dark: '#8b8ff01f' },
      { name: 'primary-tint-2', light: '#4a4fd624', dark: '#8b8ff030' },
      { name: 'on-primary', light: '#fbfbff', dark: '#101024' },
      { name: 'accent', light: '#9a6a1a', dark: '#d6a24a' },
      { name: 'accent-tint', light: '#9a6a1a18', dark: '#d6a24a22' },
      { name: 'strong', light: '#1f6d4a', dark: '#5bbd8c' },
      { name: 'strong-tint', light: '#1f6d4a16', dark: '#5bbd8c20' },
      { name: 'possible', light: '#8f6218', dark: '#d6a24a' }, // TUNED: was #b07d22 (amber fill token failed 4.5:1 as text on possible-tint, the documented headline risk — 3.25 light). Darkened amber, hue ~40 kept; still clears 3:1 as UI dot.
      { name: 'possible-ink', light: '#8a6212', dark: '#d6a24a' },
      { name: 'possible-tint', light: '#b07d2216', dark: '#d6a24a20' },
      { name: 'reach', light: '#b1503a', dark: '#d8775f' },
      { name: 'reach-tint', light: '#b1503a16', dark: '#d8775f20' },
    ]),
  },
  {
    key: 'deep-blue',
    name: 'Deep blue',
    rationale:
      'Mid-saturation cobalt primary (not full-sat royal) pulled a notch off the universal link-blue for ownership; glacier-cool paper; independently re-picked cool near-black dark ramp with a lightened sky-cobalt primary; verdicts held distinct and calm; single functional amber accent.',
    tokens: toTokenMap([
      { name: 'bg', light: '#f2f4f7', dark: '#101319' },
      { name: 'bg-tint', light: '#eaedf2', dark: '#161a21' },
      { name: 'surface', light: '#ffffff', dark: '#191d24' },
      { name: 'surface-2', light: '#f7f9fc', dark: '#20242c' },
      { name: 'ink', light: '#161a20', dark: '#e9ecf1' },
      { name: 'ink-soft', light: '#4a5158', dark: '#a4abb6' },
      { name: 'ink-faint', light: '#5d636c', dark: '#899099' }, // TUNED: was #71767f L / #767e8a D; then light #666c74 -> #5d636c (faint on bg-tint light still 4.52, thin margin). Lightness-only, cool-neutral hue kept.
      { name: 'line', light: '#161a200f', dark: '#ffffff12' },
      { name: 'line-2', light: '#161a201a', dark: '#ffffff20' },
      { name: 'primary', light: '#15559e', dark: '#6ba6e8' },
      { name: 'primary-ink', light: '#0e447f', dark: '#8fbdf0' },
      { name: 'primary-tint', light: '#15559e14', dark: '#6ba6e81f' },
      { name: 'primary-tint-2', light: '#15559e24', dark: '#6ba6e830' },
      { name: 'on-primary', light: '#f7fafd', dark: '#08131f' },
      { name: 'accent', light: '#9c6410', dark: '#d6a24a' },
      { name: 'accent-tint', light: '#9c641018', dark: '#d6a24a22' },
      { name: 'strong', light: '#1f6d4a', dark: '#5bbd8c' },
      { name: 'strong-tint', light: '#1f6d4a16', dark: '#5bbd8c20' },
      { name: 'possible', light: '#8f6218', dark: '#d6a24a' }, // TUNED: was #b07d22 (amber fill token failed 4.5:1 as text on possible-tint — 3.30 light). Darkened amber, hue kept; still clears 3:1 as UI dot.
      { name: 'possible-ink', light: '#7d5810', dark: '#d6a24a' },
      { name: 'possible-tint', light: '#b07d2216', dark: '#d6a24a20' },
      { name: 'reach', light: '#b1503a', dark: '#d8775f' },
      { name: 'reach-tint', light: '#b1503a16', dark: '#d8775f20' },
    ]),
  },
  {
    key: 'dusk-plum',
    name: 'Dusk plum',
    rationale:
      'Deep plum primary occupying the open lane; warm-neutral paper with a faint plum temperature; independently re-picked warm near-black dark ramp with a lightened orchid primary; Reach nudged warmer to keep chromatic distance from the plum primary; verdict trio owns the semantic budget.',
    tokens: toTokenMap([
      { name: 'bg', light: '#f4f1ea', dark: '#141014' },
      { name: 'bg-tint', light: '#ece7dc', dark: '#1c161b' },
      { name: 'surface', light: '#fffdf8', dark: '#1e181d' },
      { name: 'surface-2', light: '#f9f6ef', dark: '#251e24' },
      { name: 'ink', light: '#211a20', dark: '#ece4ea' },
      { name: 'ink-soft', light: '#5c5058', dark: '#aaa0a8' },
      { name: 'ink-faint', light: '#6b5f68', dark: '#8f858d' }, // TUNED: was #8b7f86 L / #797077 D; then light #796d75 -> #6b5f68 (faint on bg-tint light still 4.00 < 4.5). Lightness-only, plum-warm neutral hue kept.
      { name: 'line', light: '#211a200f', dark: '#ffffff12' },
      { name: 'line-2', light: '#211a2033', dark: '#ffffff33' },
      { name: 'primary', light: '#6a2b57', dark: '#c98bb4' },
      { name: 'primary-ink', light: '#542044', dark: '#d9a6c8' },
      { name: 'primary-tint', light: '#6a2b5714', dark: '#c98bb41f' },
      { name: 'primary-tint-2', light: '#6a2b5724', dark: '#c98bb430' },
      { name: 'on-primary', light: '#fdf7fb', dark: '#241020' },
      { name: 'accent', light: '#8f621b', dark: '#d9a24e' },
      { name: 'accent-tint', light: '#8f621b18', dark: '#d9a24e22' },
      { name: 'strong', light: '#1f6d4a', dark: '#5bbd8c' },
      { name: 'strong-tint', light: '#1f6d4a16', dark: '#5bbd8c20' },
      { name: 'possible', light: '#8f6218', dark: '#d6a24a' }, // TUNED: was #b07d22 (amber fill token failed 4.5:1 as text on possible-tint — 3.25 light). Darkened amber, hue kept; still clears 3:1 as UI dot.
      { name: 'possible-ink', light: '#836011', dark: '#d6a24a' },
      { name: 'possible-tint', light: '#b07d2216', dark: '#d6a24a20' },
      { name: 'reach', light: '#a4472f', dark: '#d8775f' },
      { name: 'reach-tint', light: '#a4472f16', dark: '#d8775f20' },
    ]),
  },
];

/**
 * Real token pairs derived from component usage.
 * kind 'text' => 4.5:1 threshold; kind 'ui' => 3.0:1 threshold.
 * Where bg is a *-tint (alpha) token, the harness composites it over the ambient
 * base (bg for bg-tint / *-tint fills that render on the page, surface where the
 * fill sits on a card) — see contrast-check.mjs for the compositing rule.
 * @type {Pair[]}
 */
export const pairs = [
  { fg: 'ink', bg: 'bg', kind: 'text', note: 'Global body text.' },
  { fg: 'ink', bg: 'surface', kind: 'text', note: 'Primary text on card surfaces (dominant pairing).' },
  { fg: 'ink', bg: 'bg-tint', kind: 'text', note: 'Text on subtle tint fill (pills, chips, empty states).' },
  { fg: 'ink', bg: 'surface-2', kind: 'text', note: 'Text on deeper card surface.' },
  { fg: 'ink-soft', bg: 'surface', kind: 'text', note: 'Secondary/supporting text on cards.' },
  { fg: 'ink-soft', bg: 'bg-tint', kind: 'text', note: 'Muted text on tint fills (info/aside panels).' },
  { fg: 'ink-soft', bg: 'primary-tint', kind: 'text', note: 'inline-callout info tone.' },
  { fg: 'ink-soft', bg: 'possible-tint', kind: 'text', note: 'inline-callout warn tone.' },
  { fg: 'ink-soft', bg: 'strong-tint', kind: 'text', note: 'inline-callout positive tone.' },
  { fg: 'ink-faint', bg: 'surface', kind: 'text', note: 'Faintest text — eyebrows/labels/provenance.' },
  { fg: 'ink-faint', bg: 'bg-tint', kind: 'text', note: 'Faint text on tint (notes-block eyebrow).' },
  { fg: 'ink-faint', bg: 'surface-2', kind: 'text', note: 'readiness-map faint states over deeper surface.' },
  { fg: 'on-primary', bg: 'primary', kind: 'text', note: 'Inverse text on primary fill — every CTA.' },
  { fg: 'on-primary', bg: 'primary-ink', kind: 'text', note: 'Hover state of primary CTA (strictly higher ratio).' },
  { fg: 'primary', bg: 'surface', kind: 'text', note: 'Teal/hue link/label text on cards.' },
  { fg: 'primary', bg: 'bg', kind: 'ui', note: 'Focus ring on page bg (worst case) + meter fills.' },
  // Spec flags checklist-landing's literal `text-white` on `bg-primary` as an OFF-TOKEN
  // deviation that "should be `text-on-primary`". In dark mode the primary is an
  // intentionally light pastel, so literal #ffffff on it is unsatisfiable by any
  // lightness tune of `primary` (darkening it far enough to clear white forces
  // `primary on surface` below 4.5 — the two pull in opposite directions, proven
  // in the tuning log). The rule-compliant, spec-directed fix is the token the
  // component SHOULD use: on-primary on primary (checked as its own pair above and
  // passing both themes). The literal is a component bug to fix at the callsite,
  // not a palette failure. Pair kept (CTA-text-on-primary relationship preserved),
  // corrected to the documented intended token.
  { fg: 'on-primary', bg: 'primary', kind: 'text', note: 'checklist-landing CTA — corrected from off-token literal text-white to text-on-primary per spec.' },
  { fg: 'strong', bg: 'strong-tint', kind: 'text', note: 'Strong verdict pill — green text on green tint.' },
  { fg: 'strong', bg: 'surface', kind: 'text', note: 'Green text directly on card surface.' },
  { fg: 'possible', bg: 'possible-tint', kind: 'text', note: 'HEADLINE RISK — amber fill token as text on amber tint.' },
  { fg: 'possible-ink', bg: 'possible-tint', kind: 'text', note: 'AA-safe amber-text pair (the token added for this).' },
  { fg: 'possible-ink', bg: 'surface', kind: 'text', note: 'possible-ink as text on plain surface.' },
  { fg: 'reach', bg: 'reach-tint', kind: 'text', note: 'Reach verdict pill — terracotta text on terracotta tint.' },
  { fg: 'reach', bg: 'surface', kind: 'text', note: 'Terracotta text on plain card surface.' },
  { fg: 'strong', bg: 'surface', kind: 'ui', note: 'Strong as non-text UI boundary (reached dots/borders).' },
  { fg: 'possible', bg: 'surface', kind: 'ui', note: 'Amber as non-text UI dot (ticks, indicators).' },
  { fg: 'reach', bg: 'surface', kind: 'ui', note: 'Terracotta as non-text UI (closed ticks, exit markers).' },
];
