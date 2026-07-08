# Landing redesign — v7 "Cursor cadence on our own skin"

**Date:** 2026-07-08
**Status:** Design spec — founder-locked ("yes go", 2026-07-08). Awaiting founder review of this written spec before an implementation plan is written.
**Slice:** MV-112 · branch `mv-112-landing-redesign` off `origin/master` (merge founder-gated).
**Surface:** `app/(marketing)/page.tsx` + `components/marketing/*` (the signed-out home page).
**Design source of truth (exact markup / CSS / copy):**
`docs/superpowers/specs/assets/2026-07-08-landing-v7-reference.html` — the approved v7 mockup,
committed alongside this spec. Where this prose and the reference disagree on a pixel, **the
reference wins**; where they disagree on intent or an invariant, this spec wins.

> **Supersedes** the earlier draft of this file (Direction A / "tactile craft" vehicle B /
> proof-band / three-tiles). That direction was abandoned during mockup iteration. Nothing from
> the old §4 tiles / §4.2 proof band survives; do not build from memory of it.

---

## 1. What this is

A full visual + interaction redesign of the signed-out landing page. The copy thesis is unchanged
("An honest answer before you pay anyone"; "every figure shows its source and date"; free, 9
questions, no account). What changes is the **register and the medium**: the page now *demonstrates
the product live* instead of describing it. Borrowing the cadence of Cursor's site — a confident
hero, then a rhythm of alternating product sections each anchored by one **real, interactive
artifact** — rendered entirely in our own calm-authority skin (warm paper, dusk plum, flat
surfaces, hairline borders).

The through-line is the student's journey: **assess → verdict → plan → documents → guide →
provenance**. Each section shows the actual thing, working, with sourced numbers.

## 2. Locked constraints (invariants — every task must hold these)

1. **Palette:** warm-paper ground + dusk-plum accent, calm-authority tokens (§5). One accent,
   spent well.
2. **Flat body.** No drop-shadows, no gradients as decoration, no visual noise — **except the two
   founder-approved flourishes** (§4) and the faint paper grain (§4.3), which are material texture,
   not depth.
3. **Honesty invariant.** Every *factual figure* carries a visible `source · verified <month>`.
   Sample-student numbers are labelled as sample, never as claims (§6). No fabricated stats, no
   vanity metrics ("10,000 students"), ever.
4. **Max width 1160px** (`--maxw`), 26px gutters.
5. **Single scroll.** `overflow-x: clip` on the page root; wide content never induces a horizontal
   scrollbar.
6. **Reduced-motion is a real path, not an afterthought.** Every animation is gated behind
   `prefers-reduced-motion: no-preference`; every interactive island renders a complete, correct
   **rest state** with reduced motion and with no JS at all.
7. **No em-dashes in landing copy.** (Middots `·` and commas only.)
8. **Both themes** carried by tokens with equal care; dark mode uses `background-color`, never the
   `background` shorthand (custom-property re-resolution bug).
9. **Imageless product body.** No photography anywhere on this page (marketing *may* use it; this
   page deliberately does not — restraint is the anti-AI-look defence).

## 3. The Cursor-cadence structure (top to bottom)

The reference is the canonical order. Sections:

1. **Header** — sticky, `background-color:var(--paper)`, hairline bottom. Brand (plum square +
   "MyVisa"), nav ("How it works", "What you get", "Sign in"). Nav text hides under 860px except
   Sign in.
2. **Hero** — eyebrow "For students applying abroad"; H1 "An honest answer before you **pay
   anyone.**" with the **hand-drawn marker** (§4.1) on "pay anyone"; sub-line "Where do you
   actually stand academically, financially, and on visa risk?"; provenance line "Built on official
   Home Affairs and university data. Every figure shows its source and date."; primary CTA "Check
   your eligibility →" (flat plum pill); meta "9 quick questions · no account needed". Below the
   copy: the **live verdict panel** (§4.4) in a bordered stage. Under the stage: a quiet 3-item
   **proof strip** ("Official Home Affairs & university data", "Every figure sourced and dated",
   "Free, no sign-up to start").
3. **"From verdict to plan"** — split (copy left, artifact right): heading "The answer becomes a
   plan.", lede, "See a sample plan →" link; artifact = the **plan-step accordion** (§4.5).
4. **"Documents"** — reversed split (artifact left, copy right): heading "Every requirement,
   sourced.", lede, link; artifact = the **interactive checklist** (§4.6).
5. **"The guide"** — split: heading "A guide that remembers you.", lede, "Meet the guide →" link;
   artifact = the **autoplay guide typewriter** (§4.7).
6. **"Sourced & dated"** (freshness band, full-width, tinted): centred heading "Every figure shows
   its source and date.", lede; artifact = the **freshness table** with the verify-sweep (§4.8);
   footnote "If a figure ages past its check date, we re-verify it before you see it."
7. **Close** — centred heading "Know, instead of hoping.", the **sparkle CTA** (§4.2) "Check your
   eligibility", meta "9 quick questions · no account needed · free".
8. **Footer** — "© 2026 MyVisa" + mono "Nepal → Australia · data verified Jun 2026".

Section rhythm: `.psec` sections open with a hairline top rule and 88px top padding; splits are
`minmax(340px,.9fr) minmax(560px,1.25fr)` with 72px gap, collapsing to one column under 860px.

## 4. The two approved flourishes + the grain

These are the *only* departures from flat, each founder-approved during mockup iteration. They must
be ported faithfully and must degrade to calm static states under reduced motion.

### 4.1 Hand-drawn hero marker (founder-approved exception, "variant A")
A rough, hand-swiped highlight behind "pay anyone", giving the hero one human, marker-on-paper
gesture. Implementation (see reference lines ~65–68, 440):
- `h1 .accent.hand` sets `color:var(--ink)` (text rides *over* the mark), `position:relative`,
  `display:inline-block`, `isolation:isolate`.
- `::before` = the swipe: a rectangle `width:calc(100% + 1ch)`, `left:-.25ch`, `height:110%`,
  `top:-5%`, `border-bottom-right-radius:20px 30px`, filled `background-color:var(--mark)`
  `opacity:.78`, with an inset ink-pool `box-shadow`, distorted by SVG filter `#hero-rough`,
  `z-index:-1`.
- `::after` = a small skewed radial "lift-off" blob at the tail, `opacity:.4`, same filter.
- **Filter** `#hero-rough` = inline hidden SVG: `feTurbulence type="fractalNoise"
  baseFrequency="0.012 0.03" numOctaves="2" seed="7"` → `feDisplacementMap scale="6"`.
- **Theme-aware** via the `--mark` token: light `#a85b90`, dark `#6a2b57`.
- **Fully static** — no animation, so reduced-motion is a non-issue by construction.

### 4.2 Sparkle CTA (founder-approved exception)
A single sparkle-button flourish on the **closing** CTA only (never the hero CTA, which stays a
flat pill). Adapted from jh3y's Sparkle Button, retuned to dusk-plum `--hue:320`, every selector
scoped under `.sparkle-cta` so its bare `button{}`/`svg{}` resets never leak. Key points
(reference ~317–405, 709–736, 1026–1048):
- Visible label always: `.text` uses `color:hsl(0 0% calc(92% + (var(--active)*8%)))` at
  `z-index:2`.
- Hover/focus raises `--active:1` (glow, scale, bounce on the three sparkle paths).
- **Edge shimmer is in-view-gated:** an IntersectionObserver adds `.live` only while the button is
  on screen (`cta-flip` + `cta-rotate` run only under `.live`), so scrolling never pays for an
  off-screen rotating conic gradient.
- Particles are seeded with random drift CSS vars in JS on mount.
- `@media (prefers-reduced-motion:reduce)` kills all sparkle/particle animation and hides the
  particle pen; the button remains a legible, clickable pill.

### 4.3 Faint paper grain (material texture, not depth)
`.stage`, `.surface`, `.ftable` carry a `::before` noise layer: an inline `feTurbulence` data-URI
at very low opacity (light `.045` `mix-blend:multiply`; dark `.08` `mix-blend:screen`). This is
paper texture, not a shadow or gradient — it is the tactile warmth of the calm-authority language,
and it is static. It is in scope and approved; document it so a reviewer does not read it as a flat
violation.

## 5. Design tokens (both themes)

Port the reference `:root` block verbatim into the Tailwind token layer (custom properties; **no
default Tailwind colours**). Tokens: `--paper #f4f1ea/#131013`, `--frame #efe8db/#1b161b`,
`--ink #241c22/#ece4ea`, `--ink-soft`, `--ink-faint`, `--line`/`--line-soft` (rgba ink),
`--plum #6a2b57/#c98bb4`, `--cta-ink #fff/#1a1016`, `--mark #a85b90/#6a2b57`, verdicts
`--strong #1f6d4a/#5fc196` · `--possible #8f6218/#d8a44c` · `--reach #a4472f/#dd8468`,
`--ease cubic-bezier(.22,.61,.36,1)`, `--maxw 1160px`, `--sans` Hanken Grotesk, `--mono` IBM Plex
Mono. Themed three ways for parity: `@media (prefers-color-scheme:dark)`, `:root[data-theme="dark"]`,
`:root[data-theme="light"]` (the app's theme toggle stamps `data-theme`, which must win over the
media query in both directions).

## 6. Data & honesty model

Two categories of number appear on the page and the build must keep them distinct:

- **Sample-student demo data** — the two toggleable sample profiles (Aarav · GPA 3.2 → "Possible";
  Shruti · GPA 3.8 → "Strong"), their dimension bars (Academic/English/Finances/Visa risk),
  per-dimension blurbs, and estimated first-year costs (≈A$42,600 / ≈A$44,200). These are
  **illustrative sample profiles**, surfaced under the explicit "Sample profile" label and the `≈`
  estimate marker. They are demo scaffolding, not claims about a real person. Tests assert the
  "Sample profile" label is present so this can never silently read as real data.
- **Sourced facts** — the figures that *are* real-world claims: living-cost requirement A$29,710
  (Home Affairs s.500), GTE s.500 criteria, avg first-year tuition ≈A$33,000 (university data),
  post-study work 485 = 2–4 years, OSHC required, IELTS 6.5 floor / 7.0 stretch. Each renders a
  visible `source · verified Jun 2026` (freshness rows also carry "Next check Jul 2026").

Model these as **typed data modules** so copy is reviewable and the honesty invariant is testable
in isolation, not buried in JSX:
- `lib/marketing/sample-profiles.ts` — the two profiles + dimensions (mirrors the reference
  `profiles` object).
- `lib/marketing/plan-steps.ts` — the 5 plan steps (state, title, detail, cite).
- `lib/marketing/checklist-items.ts` — the 6 checklist items (label, source, initial done).
- `lib/marketing/guide-answers.ts` — the 3 `{q,a,c}` exchanges (the genuine first-person questions,
  founder-approved 2026-07-08) + `order`.
- `lib/marketing/freshness-rows.ts` — the 5 provenance rows (key, value, source, detail, verified,
  nextCheck).
Every string in these modules is copy the founder reviews; keep apostrophes and the no-em-dash rule
intact.

## 7. Progressive enhancement & reduced-motion contract

The reference is a single inline `<script>`; the build re-expresses it as React islands, but the
**contract** it encodes is a hard requirement:

- **Server-rendered rest state is complete.** Without JS, every section shows correct, sourced
  content: the verdict panel shows Aarav's verdict + dimensions + cost statically; the guide shows
  the first Q&A (`ielts`) fully rendered with its citation; the freshness rows show their
  verified dots; all `.reveal` content is visible (never hidden without JS). JS only *enhances*.
- **Reduced motion** collapses every animated reveal/typewriter/count-up/sweep to its final state
  instantly (no typing, no counting, no sweep), while keeping all interactivity (accordions,
  toggles, checklist) working.
- **Motion is JS-gated for hiding:** the `.reveal` hidden state only applies under `.js`, so a
  no-JS client is never left with invisible content.

## 8. Architecture / component decomposition

A **server-component page shell** composes static copy + a handful of **client-island** artifacts.
Keep islands small and single-purpose; server-render their rest state.

- `app/(marketing)/page.tsx` — server shell: header, hero copy, section copy/leads, footer, and the
  inline hidden SVG filters (`#hero-rough` + the grain data-URI usage). Imports the islands.
- `components/marketing/verdict-panel.tsx` — **client**: profile toggle, dimension accordion +
  animated fills, rAF cost count-up, swap fade. Rest state = Aarav, static.
- `components/marketing/plan-steps.tsx` — **client** (accordion); rest state = step 02 open.
- `components/marketing/documents-checklist.tsx` — **client**: toggle rows, progress bar, "All set"
  pill; rest state = 2/6 done.
- `components/marketing/guide-thread.tsx` — **client**: chips + typewriter (`playExchange`,
  `typeText` with `punctPause`, autoplay via IntersectionObserver at threshold 0.35, chip-click
  interrupt via a run-id guard, `aria-live` announcements). Rest/reduced-motion = first Q&A static.
- `components/marketing/freshness-table.tsx` — **client**: verify-sweep on first view (IO threshold
  0.4), persistent verified dots, row accordion. Rest state = all rows verified, static.
- `components/marketing/sparkle-cta.tsx` — **client**: particle seeding + in-view `.live` gate.
- `components/marketing/reveal.tsx` — small **client** wrapper/hook for the shared `.reveal → .in`
  IntersectionObserver (threshold 0.15, `rootMargin 0 0 -8% 0`); no-JS/reduced-motion shows all.
- `components/marketing/hero-marker.tsx` (or inline) — the `.accent.hand` span; purely presentational.
- **Styling:** additive tokens in `tailwind.config`; the keyframes, grain, marker, sparkle, and
  accordion `grid-template-rows` transitions live in a scoped global CSS (they do not map cleanly to
  utilities). Follow existing marketing-component conventions (kebab-case files, PascalCase
  components, named exports, server-by-default).

No scoring, API, DB, or Zod changes — this is a presentational slice.

## 9. Codex below-fold migration note (reconcile, don't duplicate)

The **current** production `app/(marketing)/page.tsx` uses an ad-hoc `animate-rise` reveal on
several sections (lines ~48, 49, 84, 109 at time of writing). When building, **reconcile** with it
rather than layering a second reveal system:
- Replace every `animate-rise` with the single `.reveal` observer above, gated on reduced-motion.
- The marketing route currently has **no** peek-through blur; do not introduce any here. If a future
  gate is needed it follows the product decision "gated content uses peek-through blur, not flat
  lock icons" (that pattern lives on in-app gated surfaces, not this signed-out page).
- **Delete the superseded old-landing components** rather than leaving orphans:
  `components/marketing/hero-preview.tsx`, `how-it-works.tsx`, `tile.tsx`, `trust-callout.tsx`
  (verify each has no other importer first). `eyebrow.tsx` is a reusable primitive — keep it if the
  new hero still uses an eyebrow, otherwise remove. The plan enumerates the exact deletions.

## 10. Accessibility & theming

- Verdict is an `aria-live` status; the guide announces each completed exchange via a visually
  hidden `aria-live` region; the toggle is a labelled `role="group"`; every accordion trigger is a
  real `<button>` with `aria-expanded`. Preserve all of this.
- Visible `:focus-visible` outline (plum, offset) on every interactive control.
- Contrast: plum-on-paper, paper-on-plum (CTA), and all three verdict colours clear AA for their
  sizes in **both** themes.

## 11. Testing approach

TDD per task. Assert **structure, content, and the honesty invariant** — not pixels:
- Hero renders H1 text, the CTA label + `href="/assess"`, the provenance line, the proof strip's
  three exact claims.
- The "Sample profile" label renders (sample-vs-real guard) and both profiles' verdict words are
  present in the data module.
- Each sourced figure renders its `source · verified` string (assert the exact A$29,710 / s.500 /
  ≈A$33,000 / 485 / OSHC rows and their citations) — a drift-into-fabrication guard.
- The guide data module contains exactly the three founder-approved questions and their citations.
- Rest-state completeness: islands render their static content in a no-JS render (React Testing
  Library without firing effects) — e.g. guide shows the `ielts` Q&A, checklist shows 2/6.
- A repo-wide guard test: no em-dash (`—`) in the marketing copy modules.
- Gate green before review: `npm run typecheck`, `npm run lint`, `npm test`.

## 12. Non-goals (out of scope)

- No copy rewrite beyond what the approved v7 reference already contains.
- No gamification (no streaks, XP, points, variable-reward loops).
- No photography / imagery in the body.
- No mascot / ringtail art or speculative mascot-slot scaffolding (deferred to the rebrand).
- No scoring, data, API, or auth changes.
- Not wiring the sample profiles to the real scoring engine — they stay static demo data for the
  marketing page.

## 13. Files touched (design-level; exact edits belong in the plan)

- `app/(marketing)/page.tsx` — full rebuild to the v7 structure.
- `components/marketing/*` — new islands (§8); delete superseded old-landing components.
- `lib/marketing/*` — new typed data + copy modules (§6).
- `tailwind.config.*` + a scoped marketing global CSS — tokens, keyframes, grain, marker, sparkle.
- Tests under the existing marketing test location.
- Reference kept at `docs/superpowers/specs/assets/2026-07-08-landing-v7-reference.html`.

---

*Terminal step after founder approval of this spec: the `writing-plans` skill turns it into a
task-by-task implementation plan, built via subagent-driven-development (TDD) on
`mv-112-landing-redesign` off `origin/master`. Merge to master stays founder-gated.*
