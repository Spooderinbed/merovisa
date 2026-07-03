# MyVisa rebrand — palette candidates (MV-83)

This document presents **three complete palette candidates** for the MyVisa "elevated calm" rebrand (MV-83), each a full set of the **23 frozen design tokens** in both light and dark themes. It is the input the founder uses to **pick one** candidate; the picked palette is then wired into `app/globals.css` under MV-84 (this card does not touch `globals.css`).

Every hex value below is **WCAG-proven**, not asserted. The contrast harness at `scripts/contrast-check.mjs` imports the single source of truth (`scripts/palette-candidates.data.mjs`), composites every alpha `*-tint` background over its correct ambient base, computes the WCAG 2.1 contrast ratio for **27 real component token-pairs** per candidate, in **both** themes (27 × 2 = 54 checks), and exits non-zero on any failure. Reproduce with:

```
node scripts/contrast-check.mjs
```

The last run exited **0** — **162 checks total (3 candidates × 54), 0 failing**. Every ratio in the per-candidate matrices below is copied verbatim from that run; none is hand-computed. The thresholds are the WCAG AA minimums: **text = 4.5:1**, non-text **ui = 3.0:1**.

**Token names are frozen.** All three candidates use the identical 23 token names in the identical order; only the hex values differ. This lets the founder preview any candidate by swapping values only (see "Founder preview instructions").

The 27 pairs are derived from real component usage (`scripts/palette-candidates.data.mjs`, `pairs` export): the dominant `ink on surface` body pairing, the `on-primary on primary` CTA, the verdict trio (`strong` / `possible` / `reach` on their tints and on surface), inline-callout tones, and the faint eyebrow/provenance tier. The `possible on possible-tint` pair is flagged in the spec as the **headline risk** (an amber fill token used as text) and is explicitly checked; the AA-safe `possible-ink` token exists for the same relationship.

---

## Candidate 1 — Night indigo (`night-indigo`)

### Design rationale

Night indigo deliberately enters the **crowded indigo-violet lane MV-82 flags** (web section, line 369: three of ten studied apps already sit there — Linear ~#5E6AD2, Revolut ~#5C5CE0, Phantom ~#ab9ff2) and earns ownership from a **distinct saturation/temperature position, not the hue** (MV-82's rule that "ownability depends on a distinct saturation/temperature position, not the hue alone"). The primary is a **dampened periwinkle** (`#4a4fd6` light / `#8b8ff0` dark) — deliberately never-neon (Linear's "periwinkle-not-electric" mechanic), and cooler + a shade more saturated than the pale lavender Phantom/Revolut sit on, so it reads as its own register within the set.

- **Two-pole saturation rationing** (MV-82 line 372): the mid-sat primary is spent on one action per screen; `primary-tint` / `primary-tint-2` are near-white same-hue fills (the Revolut ~#ECECFB lavender-tint model) for selected/secondary/disabled — no full-saturation ambient flood.
- **Dark mode is the cheapest carry** (line 369/376): indigo holds nearly unchanged across modes (Phantom's identical lavender on both grounds), so dark primary is a modest lift (`#8b8ff0`), not a re-hue — but the neutral ramp is **re-picked, not inverted** (line 376 "unanimous"): dark `bg #0e0e14` → `surface-2 #1e1e28` is an independently chosen 5-step near-black with a faint indigo temperature (Wise's hue-tinted near-black).
- **5-step neutral ramp + hairline** (line 373): `bg` / `bg-tint` / `surface` / `surface-2` give four ambient steps separated by 2–3% tint shift, plus `line` / `line-2` hairlines — never shadow. Light paper is the cool near-white "Phantom pole" (`#f2f2f7`, glacier-neutral rather than warm sand).
- **Accent discipline** (lines 374–375): the verdict trio consumes the entire accent budget, so there is exactly **one** decorative accent (amber `#9a6a1a` / `#d6a24a`), chromatically far from the indigo primary; the primary never enters the semantic verdict system (Headspace's clean action-vs-semantics split).
- **Three-way red separation** (line 371): the indigo primary (hue ~238) keeps large distance from Reach red (`#b1503a`, hue ~12), so a primary button never whispers "error", and Reach stays distinct from any destructive red. Indigo has no adjacency risk here.

### Tokens (23) — light and dark

| Token | Light | Dark |
| --- | --- | --- |
| `bg` | `#f2f2f7` | `#0e0e14` |
| `bg-tint` | `#eaeaf1` | `#15151d` |
| `surface` | `#fdfdff` | `#17171f` |
| `surface-2` | `#f7f7fb` | `#1e1e28` |
| `ink` | `#1c1c26` | `#e8e8f0` |
| `ink-soft` | `#54545f` | `#a6a6b2` |
| `ink-faint` | `#63636e` | `#8a8a95` |
| `line` | `#1c1c260f` | `#ffffff12` |
| `line-2` | `#1c1c261a` | `#ffffff22` |
| `primary` | `#4a4fd6` | `#8b8ff0` |
| `primary-ink` | `#3a3fb8` | `#a3a6f5` |
| `primary-tint` | `#4a4fd614` | `#8b8ff01f` |
| `primary-tint-2` | `#4a4fd624` | `#8b8ff030` |
| `on-primary` | `#fbfbff` | `#101024` |
| `accent` | `#9a6a1a` | `#d6a24a` |
| `accent-tint` | `#9a6a1a18` | `#d6a24a22` |
| `strong` | `#1f6d4a` | `#5bbd8c` |
| `strong-tint` | `#1f6d4a16` | `#5bbd8c20` |
| `possible` | `#8f6218` | `#d6a24a` |
| `possible-ink` | `#8a6212` | `#d6a24a` |
| `possible-tint` | `#b07d2216` | `#d6a24a20` |
| `reach` | `#b1503a` | `#d8775f` |
| `reach-tint` | `#b1503a16` | `#d8775f20` |

### WCAG matrix (copied verbatim from `node scripts/contrast-check.mjs`)

| Pair (fg on bg) | Kind | Theme | Ratio | Min | Result |
| --- | --- | --- | --- | --- | --- |
| ink on bg | text | light | 15.13 | 4.5 | PASS |
| ink on bg | text | dark | 15.79 | 4.5 | PASS |
| ink on surface | text | light | 16.62 | 4.5 | PASS |
| ink on surface | text | dark | 14.62 | 4.5 | PASS |
| ink on bg-tint | text | light | 14.10 | 4.5 | PASS |
| ink on bg-tint | text | dark | 14.90 | 4.5 | PASS |
| ink on surface-2 | text | light | 15.80 | 4.5 | PASS |
| ink on surface-2 | text | dark | 13.55 | 4.5 | PASS |
| ink-soft on surface | text | light | 7.36 | 4.5 | PASS |
| ink-soft on surface | text | dark | 7.40 | 4.5 | PASS |
| ink-soft on bg-tint | text | light | 6.24 | 4.5 | PASS |
| ink-soft on bg-tint | text | dark | 7.54 | 4.5 | PASS |
| ink-soft on primary-tint | text | light | 6.00 | 4.5 | PASS |
| ink-soft on primary-tint | text | dark | 6.83 | 4.5 | PASS |
| ink-soft on possible-tint | text | light | 6.13 | 4.5 | PASS |
| ink-soft on possible-tint | text | dark | 6.63 | 4.5 | PASS |
| ink-soft on strong-tint | text | light | 5.94 | 4.5 | PASS |
| ink-soft on strong-tint | text | dark | 6.63 | 4.5 | PASS |
| ink-faint on surface | text | light | 5.84 | 4.5 | PASS |
| ink-faint on surface | text | dark | 5.22 | 4.5 | PASS |
| ink-faint on bg-tint | text | light | 4.95 | 4.5 | PASS |
| ink-faint on bg-tint | text | dark | 5.32 | 4.5 | PASS |
| ink-faint on surface-2 | text | light | 5.55 | 4.5 | PASS |
| ink-faint on surface-2 | text | dark | 4.84 | 4.5 | PASS |
| on-primary on primary | text | light | 6.02 | 4.5 | PASS |
| on-primary on primary | text | dark | 6.50 | 4.5 | PASS |
| on-primary on primary-ink | text | light | 7.88 | 4.5 | PASS |
| on-primary on primary-ink | text | dark | 8.32 | 4.5 | PASS |
| primary on surface | text | light | 6.11 | 4.5 | PASS |
| primary on surface | text | dark | 6.18 | 4.5 | PASS |
| primary on bg | ui | light | 5.57 | 3.0 | PASS |
| primary on bg | ui | dark | 6.67 | 3.0 | PASS |
| on-primary on primary | text | light | 6.02 | 4.5 | PASS |
| on-primary on primary | text | dark | 6.50 | 4.5 | PASS |
| strong on strong-tint | text | light | 5.46 | 4.5 | PASS |
| strong on strong-tint | text | dark | 6.26 | 4.5 | PASS |
| strong on surface | text | light | 6.18 | 4.5 | PASS |
| strong on surface | text | dark | 7.72 | 4.5 | PASS |
| possible on possible-tint | text | light | 4.80 | 4.5 | PASS |
| possible on possible-tint | text | dark | 6.27 | 4.5 | PASS |
| possible-ink on possible-tint | text | light | 4.91 | 4.5 | PASS |
| possible-ink on possible-tint | text | dark | 6.27 | 4.5 | PASS |
| possible-ink on surface | text | light | 5.39 | 4.5 | PASS |
| possible-ink on surface | text | dark | 7.74 | 4.5 | PASS |
| reach on reach-tint | text | light | 4.51 | 4.5 | PASS |
| reach on reach-tint | text | dark | 4.83 | 4.5 | PASS |
| reach on surface | text | light | 5.07 | 4.5 | PASS |
| reach on surface | text | dark | 5.70 | 4.5 | PASS |
| strong on surface | ui | light | 6.18 | 3.0 | PASS |
| strong on surface | ui | dark | 7.72 | 3.0 | PASS |
| possible on surface | ui | light | 5.26 | 3.0 | PASS |
| possible on surface | ui | dark | 7.74 | 3.0 | PASS |
| reach on surface | ui | light | 5.07 | 3.0 | PASS |
| reach on surface | ui | dark | 5.70 | 3.0 | PASS |

**Night indigo: 27 pairs × 2 themes = 54 checks, 0 failing.**

---

## Candidate 2 — Deep blue (`deep-blue`)

### Design rationale

Deep blue is a **mid-saturation cobalt** primary (not full-sat royal) on glacier-cool paper. It is the **safest** candidate on contrast/dark-mode cost but the **weakest on ownership** — and MV-82 flags exactly why, surfaced here rather than hidden.

- **Corporate-generic risk (the load-bearing caveat):** MV-82's web section says blue "is owned by the interaction layer, not by any brand — the default *functional* colour" (Headspace ~#0061ef = all actions, Notion ~#2383E2 = its only interactive hue, Airbnb reserves blue for legal links). A blue primary "camouflages against the universal link/button convention," and MV-82's deep-blue verdict is blunt: the corporate-generic risk is **confirmed, not just suspected**. The mitigation (not a cure): the primary is pulled to a slightly muted, marginally cooler navy-cobalt (`#15559e` light) a notch off pure-link blue — MV-82's "ownability depends on saturation/temperature, not hue." A plum primary would out-own this; if the brief prioritises distinctiveness over safety, deep blue is the wrong pick.
- **Verdict separation is its one structural win:** blue is chromatically maximally distant from Strong-green, Possible-amber **and** Reach-red, so the "primary must be chromatically distant from all three verdict hues" rule is satisfied trivially (unlike plum, which needs a Reach-adjacency gate).
- **Two-pole saturation rationing** (line 372): primary spent on exactly one action per screen; `primary-tint` / `primary-tint-2` are near-white same-hue fills (Revolut model transposed to blue) — never a second saturated element competing on one screen.
- **5-step glacier-cool neutral ramp** (line 373): `bg #f2f4f7` → `bg-tint #eaedf2` → `surface #ffffff` → `surface-2 #f7f9fc`, separated by 2–3% tint + hairline, never shadow. The cool ground has thinner precedent than warm paper (only Airbnb + Linear) — acknowledged; the paper is kept barely blue-grey (hue-tied to primary) rather than icy so it does not read clinical for anxious users.
- **Dark mode re-picked, not inverted** (line 376): the dark ramp is chosen independently on a cool near-black (`#101319` → `surface #191d24`). No studied app runs full-sat royal blue on dark grounds, so the primary lifts to a legible sky-cobalt `#6ba6e8` (the same teal→#4eb39f move), with `primary-ink` lighter still. Dark-carry cost is mid — cheaper than plum, dearer than indigo.
- **Verdict discipline** (lines 374–375): the trio consumes the entire accent budget, re-tuned to sit calmly beside blue but unmistakably green/amber/red at band/chip scale on neutral ground; `possible-ink` is a darkened amber clearing AA on tint; one functional accent (amber `#9c6410`); Reach held distinct and reserved for genuine failure.

### Tokens (23) — light and dark

| Token | Light | Dark |
| --- | --- | --- |
| `bg` | `#f2f4f7` | `#101319` |
| `bg-tint` | `#eaedf2` | `#161a21` |
| `surface` | `#ffffff` | `#191d24` |
| `surface-2` | `#f7f9fc` | `#20242c` |
| `ink` | `#161a20` | `#e9ecf1` |
| `ink-soft` | `#4a5158` | `#a4abb6` |
| `ink-faint` | `#5d636c` | `#899099` |
| `line` | `#161a200f` | `#ffffff12` |
| `line-2` | `#161a201a` | `#ffffff20` |
| `primary` | `#15559e` | `#6ba6e8` |
| `primary-ink` | `#0e447f` | `#8fbdf0` |
| `primary-tint` | `#15559e14` | `#6ba6e81f` |
| `primary-tint-2` | `#15559e24` | `#6ba6e830` |
| `on-primary` | `#f7fafd` | `#08131f` |
| `accent` | `#9c6410` | `#d6a24a` |
| `accent-tint` | `#9c641018` | `#d6a24a22` |
| `strong` | `#1f6d4a` | `#5bbd8c` |
| `strong-tint` | `#1f6d4a16` | `#5bbd8c20` |
| `possible` | `#8f6218` | `#d6a24a` |
| `possible-ink` | `#7d5810` | `#d6a24a` |
| `possible-tint` | `#b07d2216` | `#d6a24a20` |
| `reach` | `#b1503a` | `#d8775f` |
| `reach-tint` | `#b1503a16` | `#d8775f20` |

### WCAG matrix (copied verbatim from `node scripts/contrast-check.mjs`)

| Pair (fg on bg) | Kind | Theme | Ratio | Min | Result |
| --- | --- | --- | --- | --- | --- |
| ink on bg | text | light | 15.85 | 4.5 | PASS |
| ink on bg | text | dark | 15.70 | 4.5 | PASS |
| ink on surface | text | light | 17.46 | 4.5 | PASS |
| ink on surface | text | dark | 14.27 | 4.5 | PASS |
| ink on bg-tint | text | light | 14.88 | 4.5 | PASS |
| ink on bg-tint | text | dark | 14.73 | 4.5 | PASS |
| ink on surface-2 | text | light | 16.55 | 4.5 | PASS |
| ink on surface-2 | text | dark | 13.13 | 4.5 | PASS |
| ink-soft on surface | text | light | 8.05 | 4.5 | PASS |
| ink-soft on surface | text | dark | 7.31 | 4.5 | PASS |
| ink-soft on bg-tint | text | light | 6.86 | 4.5 | PASS |
| ink-soft on bg-tint | text | dark | 7.54 | 4.5 | PASS |
| ink-soft on primary-tint | text | light | 6.49 | 4.5 | PASS |
| ink-soft on primary-tint | text | dark | 6.69 | 4.5 | PASS |
| ink-soft on possible-tint | text | light | 6.69 | 4.5 | PASS |
| ink-soft on possible-tint | text | dark | 6.59 | 4.5 | PASS |
| ink-soft on strong-tint | text | light | 6.48 | 4.5 | PASS |
| ink-soft on strong-tint | text | dark | 6.58 | 4.5 | PASS |
| ink-faint on surface | text | light | 6.06 | 4.5 | PASS |
| ink-faint on surface | text | dark | 5.24 | 4.5 | PASS |
| ink-faint on bg-tint | text | light | 5.16 | 4.5 | PASS |
| ink-faint on bg-tint | text | dark | 5.41 | 4.5 | PASS |
| ink-faint on surface-2 | text | light | 5.74 | 4.5 | PASS |
| ink-faint on surface-2 | text | dark | 4.82 | 4.5 | PASS |
| on-primary on primary | text | light | 7.10 | 4.5 | PASS |
| on-primary on primary | text | dark | 7.34 | 4.5 | PASS |
| on-primary on primary-ink | text | light | 9.32 | 4.5 | PASS |
| on-primary on primary-ink | text | dark | 9.53 | 4.5 | PASS |
| primary on surface | text | light | 7.43 | 4.5 | PASS |
| primary on surface | text | dark | 6.64 | 4.5 | PASS |
| primary on bg | ui | light | 6.75 | 3.0 | PASS |
| primary on bg | ui | dark | 7.30 | 3.0 | PASS |
| on-primary on primary | text | light | 7.10 | 4.5 | PASS |
| on-primary on primary | text | dark | 7.34 | 4.5 | PASS |
| strong on strong-tint | text | light | 5.55 | 4.5 | PASS |
| strong on strong-tint | text | dark | 5.87 | 4.5 | PASS |
| strong on surface | text | light | 6.28 | 4.5 | PASS |
| strong on surface | text | dark | 7.33 | 4.5 | PASS |
| possible on possible-tint | text | light | 4.87 | 4.5 | PASS |
| possible on possible-tint | text | dark | 5.90 | 4.5 | PASS |
| possible-ink on possible-tint | text | light | 5.84 | 4.5 | PASS |
| possible-ink on possible-tint | text | dark | 5.90 | 4.5 | PASS |
| possible-ink on surface | text | light | 6.41 | 4.5 | PASS |
| possible-ink on surface | text | dark | 7.34 | 4.5 | PASS |
| reach on reach-tint | text | light | 4.58 | 4.5 | PASS |
| reach on reach-tint | text | dark | 4.56 | 4.5 | PASS |
| reach on surface | text | light | 5.15 | 4.5 | PASS |
| reach on surface | text | dark | 5.41 | 4.5 | PASS |
| strong on surface | ui | light | 6.28 | 3.0 | PASS |
| strong on surface | ui | dark | 7.33 | 3.0 | PASS |
| possible on surface | ui | light | 5.35 | 3.0 | PASS |
| possible on surface | ui | dark | 7.34 | 3.0 | PASS |
| reach on surface | ui | light | 5.15 | 3.0 | PASS |
| reach on surface | ui | dark | 5.41 | 3.0 | PASS |

**Deep blue: 27 pairs × 2 themes = 54 checks, 0 failing.**

---

## Candidate 3 — Dusk plum (`dusk-plum`)

### Design rationale

Dusk plum is a **deep plum primary** (`#6a2b57` light / `#c98bb4` dark) occupying the **open lane** MV-82 identifies — none of the ten studied apps sit in the plum/magenta register, so ownership comes from the hue itself rather than only from saturation/temperature positioning. This is the candidate that **out-owns** the other two on distinctiveness, at a higher dark-mode carry cost and with one extra gate to manage.

- **Warm-neutral paper with a faint plum temperature:** `bg #f4f1ea` is warm near-white (not the glacier pole of the other two), hue-tied to the plum primary so the ground feels of a piece — closer to the "warm paper" precedent MV-82 notes is the better-trodden neutral ground for calm/anxious contexts.
- **Reach-adjacency gate (the plum-specific caveat):** a plum primary (magenta-leaning) sits closer on the wheel to Reach red than blue or indigo does, so MV-82's "primary must be chromatically distant from all verdict hues" rule is **not free** here. Reach is deliberately nudged **warmer** (`#a4472f` light, vs the shared `#b1503a`) to hold chromatic distance from the plum primary, so a primary control never reads as an error state and Reach stays unmistakably terracotta.
- **Dark mode re-picked, not inverted** (line 376): the dark ramp is an independently chosen **warm near-black** (`#141014` → `surface-2 #251e24`) carrying a faint plum temperature. Plum is the most expensive carry of the three — the primary lifts to a legible orchid `#c98bb4`, a real re-hue toward lighter/desaturated rather than a modest lift, because deep plum on a dark ground is otherwise illegible.
- **Two-pole saturation rationing** (line 372) and the **5-step ramp + hairline** (line 373) follow the same discipline as the other candidates: `primary-tint` / `primary-tint-2` are near-white same-hue fills; four ambient steps plus `line` / `line-2` hairlines, never shadow.
- **Accent + verdict discipline** (lines 374–375): the verdict trio owns the semantic budget; one decorative accent (amber `#8f621b` / `#d9a24e`); the primary never enters the verdict system. Notably, plum's chromatic distance from the green/amber verdicts is large — the only tight relationship is the Reach one, handled by the warm-nudge above.

### Tokens (23) — light and dark

| Token | Light | Dark |
| --- | --- | --- |
| `bg` | `#f4f1ea` | `#141014` |
| `bg-tint` | `#ece7dc` | `#1c161b` |
| `surface` | `#fffdf8` | `#1e181d` |
| `surface-2` | `#f9f6ef` | `#251e24` |
| `ink` | `#211a20` | `#ece4ea` |
| `ink-soft` | `#5c5058` | `#aaa0a8` |
| `ink-faint` | `#6b5f68` | `#8f858d` |
| `line` | `#211a200f` | `#ffffff12` |
| `line-2` | `#211a2033` | `#ffffff33` |
| `primary` | `#6a2b57` | `#c98bb4` |
| `primary-ink` | `#542044` | `#d9a6c8` |
| `primary-tint` | `#6a2b5714` | `#c98bb41f` |
| `primary-tint-2` | `#6a2b5724` | `#c98bb430` |
| `on-primary` | `#fdf7fb` | `#241020` |
| `accent` | `#8f621b` | `#d9a24e` |
| `accent-tint` | `#8f621b18` | `#d9a24e22` |
| `strong` | `#1f6d4a` | `#5bbd8c` |
| `strong-tint` | `#1f6d4a16` | `#5bbd8c20` |
| `possible` | `#8f6218` | `#d6a24a` |
| `possible-ink` | `#836011` | `#d6a24a` |
| `possible-tint` | `#b07d2216` | `#d6a24a20` |
| `reach` | `#a4472f` | `#d8775f` |
| `reach-tint` | `#a4472f16` | `#d8775f20` |

### WCAG matrix (copied verbatim from `node scripts/contrast-check.mjs`)

| Pair (fg on bg) | Kind | Theme | Ratio | Min | Result |
| --- | --- | --- | --- | --- | --- |
| ink on bg | text | light | 15.10 | 4.5 | PASS |
| ink on bg | text | dark | 15.13 | 4.5 | PASS |
| ink on surface | text | light | 16.75 | 4.5 | PASS |
| ink on surface | text | dark | 14.00 | 4.5 | PASS |
| ink on bg-tint | text | light | 13.81 | 4.5 | PASS |
| ink on bg-tint | text | dark | 14.28 | 4.5 | PASS |
| ink on surface-2 | text | light | 15.78 | 4.5 | PASS |
| ink on surface-2 | text | dark | 13.07 | 4.5 | PASS |
| ink-soft on surface | text | light | 7.53 | 4.5 | PASS |
| ink-soft on surface | text | dark | 6.90 | 4.5 | PASS |
| ink-soft on bg-tint | text | light | 6.21 | 4.5 | PASS |
| ink-soft on bg-tint | text | dark | 7.04 | 4.5 | PASS |
| ink-soft on primary-tint | text | light | 5.96 | 4.5 | PASS |
| ink-soft on primary-tint | text | dark | 6.27 | 4.5 | PASS |
| ink-soft on possible-tint | text | light | 6.22 | 4.5 | PASS |
| ink-soft on possible-tint | text | dark | 6.12 | 4.5 | PASS |
| ink-soft on strong-tint | text | light | 6.03 | 4.5 | PASS |
| ink-soft on strong-tint | text | dark | 6.15 | 4.5 | PASS |
| ink-faint on surface | text | light | 5.97 | 4.5 | PASS |
| ink-faint on surface | text | dark | 4.91 | 4.5 | PASS |
| ink-faint on bg-tint | text | light | 4.92 | 4.5 | PASS |
| ink-faint on bg-tint | text | dark | 5.01 | 4.5 | PASS |
| ink-faint on surface-2 | text | light | 5.62 | 4.5 | PASS |
| ink-faint on surface-2 | text | dark | 4.58 | 4.5 | PASS |
| on-primary on primary | text | light | 9.48 | 4.5 | PASS |
| on-primary on primary | text | dark | 6.70 | 4.5 | PASS |
| on-primary on primary-ink | text | light | 11.92 | 4.5 | PASS |
| on-primary on primary-ink | text | dark | 8.75 | 4.5 | PASS |
| primary on surface | text | light | 9.86 | 4.5 | PASS |
| primary on surface | text | dark | 6.51 | 4.5 | PASS |
| primary on bg | ui | light | 8.88 | 3.0 | PASS |
| primary on bg | ui | dark | 7.03 | 3.0 | PASS |
| on-primary on primary | text | light | 9.48 | 4.5 | PASS |
| on-primary on primary | text | dark | 6.70 | 4.5 | PASS |
| strong on strong-tint | text | light | 5.46 | 4.5 | PASS |
| strong on strong-tint | text | dark | 6.12 | 4.5 | PASS |
| strong on surface | text | light | 6.18 | 4.5 | PASS |
| strong on surface | text | dark | 7.56 | 4.5 | PASS |
| possible on possible-tint | text | light | 4.79 | 4.5 | PASS |
| possible on possible-tint | text | dark | 6.10 | 4.5 | PASS |
| possible-ink on possible-tint | text | light | 5.16 | 4.5 | PASS |
| possible-ink on possible-tint | text | dark | 6.10 | 4.5 | PASS |
| possible-ink on surface | text | light | 5.67 | 4.5 | PASS |
| possible-ink on surface | text | dark | 7.58 | 4.5 | PASS |
| reach on reach-tint | text | light | 5.19 | 4.5 | PASS |
| reach on reach-tint | text | dark | 4.70 | 4.5 | PASS |
| reach on surface | text | light | 5.87 | 4.5 | PASS |
| reach on surface | text | dark | 5.59 | 4.5 | PASS |
| strong on surface | ui | light | 6.18 | 3.0 | PASS |
| strong on surface | ui | dark | 7.56 | 3.0 | PASS |
| possible on surface | ui | light | 5.26 | 3.0 | PASS |
| possible on surface | ui | dark | 7.58 | 3.0 | PASS |
| reach on surface | ui | light | 5.87 | 3.0 | PASS |
| reach on surface | ui | dark | 5.59 | 3.0 | PASS |

**Dusk plum: 27 pairs × 2 themes = 54 checks, 0 failing.**

---

## Summary (harness output)

```
Candidates:          3
Pairs per candidate: 27  (x 2 themes = 54 checks each)
Total checks:        162
Total failing:       0
ALL PAIRS PASS
```

---

## Comparison and recommendation

The brief asks for a palette that is **elevated + calm**, **placeless** (not tied to any one market — MyVisa expands beyond Nepal→Australia without a re-brand), **furthest from the current teal**, and that **owns its hue** rather than borrowing a convention. All three candidates clear AA in both themes with margin, so the decision is about **positioning**, not contrast.

| Criterion (from the brief + MV-82) | Night indigo | Deep blue | Dusk plum |
| --- | --- | --- | --- |
| Owns its hue | Medium — earns it by saturation/temperature inside a crowded lane (3/10 apps already indigo-violet) | **Weakest** — MV-82 confirms the corporate-generic risk; blue is the universal interaction colour, not a brand | **Strongest** — the open lane; no studied app sits in plum/magenta |
| Furthest from teal | Good — indigo is far around the wheel from teal | Moderate — blue is teal's near-neighbour; risks reading as "teal, cooler" | **Best** — plum is opposite-warm from teal, cleanest break |
| Elevated + calm | Yes — dampened, never-neon | Yes, but reads as functional/corporate rather than distinctive | Yes — warm-paper plum is the most "elevated" register |
| Placeless | Yes | Yes | Yes |
| Dark-mode carry cost | **Cheapest** (near-unchanged hue) | Mid | Highest (real re-hue to orchid) |
| Extra gates to manage | None | None | Reach-adjacency (handled by warm-nudged `#a4472f`) |

**Recommendation: Dusk plum.** It is the only candidate that owns its hue by occupying an **open lane** rather than by fighting for a distinct position inside a crowded one, it is the **furthest chromatic break from the current teal** (an opposite-warm register, where blue is teal's neighbour and indigo shares the crowded cool corner), and its warm-paper ground reads as the most "elevated calm." Its two real costs — the higher dark-mode carry (a genuine orchid re-hue) and the Reach-adjacency gate — are already resolved in the tokens above and proven by the matrix, so they are known-and-managed, not open risks.

**Runner-up: Night indigo.** If the founder wants the cheapest, most robust dark-mode story and is comfortable earning ownership through saturation/temperature discipline inside the indigo-violet lane (rather than through an untaken hue), indigo is the safe, distinctive-enough choice. **Deep blue is included for completeness and is not recommended for ownership** — MV-82 confirms (not merely suspects) that a blue primary camouflages against the universal link/button convention; it is the pick only if maximum safety is valued over brand distinctiveness.

---

## Founder preview instructions

To see a candidate rendered in the real app before committing, spin it into a **throwaway branch** that swaps **only the values** in `app/globals.css` (token **names unchanged**) and push it for a Vercel preview:

1. `git checkout master && git pull`
2. `git checkout -b preview/palette-dusk-plum` (one throwaway branch per candidate).
3. In `app/globals.css`, for each of the 23 tokens, replace the current teal-era **value** with this candidate's Light value in the light-theme block and its Dark value in the dark-theme block. **Do not rename any token** — the component layer references names, so only the hex values move. Copy the values straight from this candidate's token table.
4. `git commit -am "preview: dusk-plum palette (values only, names frozen)"` then `git push -u origin preview/palette-dusk-plum`.
5. Open the Vercel preview URL for that branch to review light + dark on real pages. Repeat with a fresh branch per candidate to compare.
6. Delete the preview branches once a candidate is picked — they are throwaway.

**This card (MV-83) does not modify `app/globals.css`.** It only produces this evaluated candidate document; the actual value swap into `globals.css` on `master` is done under **MV-84**.

---

## Hand-off to MV-84

MV-84 takes the founder-picked candidate from this document and swaps its 23 Light/Dark values into `app/globals.css` on a real branch (token names frozen), keeping the WCAG harness green.
