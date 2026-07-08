# Landing redesign — v7 "Cursor cadence on our own skin"

**Date:** 2026-07-08
**Status:** Design spec — founder-locked ("looks good to me", 2026-07-08). Codex (GPT-5.5, xhigh) adversarially reviewed twice: round 1 → **BUILDABLE-WITH-FIXES** (6 blockers + 5 should-fixes), round 2 re-verify → 3 narrow residual items, all folded in (changelog §14). Founder-approved; build unblocked.
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
   Sample-student numbers are labelled as sample and **never carry a sourced `verified` citation**
   (a sample estimate must not read as a real-world claim — §6). No fabricated stats, no vanity
   metrics ("10,000 students"), ever.
4. **Max width 1160px** (`--maxw`), 26px gutters.
5. **Single scroll.** `overflow-x: clip` on the page root; wide content never induces a horizontal
   scrollbar.
6. **Reduced-motion is a real path, not an afterthought.** Every animation is gated behind
   `prefers-reduced-motion: no-preference`; every interactive island renders a complete, correct,
   **server-rendered rest state** — filled dimension details, set fill widths, first guide exchange,
   verified provenance — with reduced motion and with no JS at all. The reference builds this DOM in
   JS from an empty container; our build inverts that (server-render filled, JS only enhances — §7).
   Where the reference's JS-builds-empty pattern conflicts with this, the invariant wins.
7. **No em-dashes in landing copy.** (Middots `·` and commas only.)
8. **Both themes** carried by tokens with equal care; dark mode uses `background-color`, never the
   `background` shorthand (custom-property re-resolution bug).
9. **Imageless product body.** No photography anywhere on this page (marketing *may* use it; this
   page deliberately does not — restraint is the anti-AI-look defence).
10. **Signed-in redirect preserved.** The server shell keeps the existing Supabase `getUser()`
    guard that `redirect("/dashboard")`s authenticated users *before* rendering any landing markup
    (current `page.tsx:36–39`). The visual rebuild must not regress signed-in users back onto the
    marketing page.
11. **No dead links.** Every link and CTA resolves to a real route (§3a); no `href="#"`, no
    decorative non-navigating CTA. The reference's placeholder `#` hrefs are mock-only.

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
3. **"From verdict to plan"** (`id="how"`, the "How it works" anchor target) — split (copy left,
   artifact right): heading "The answer becomes a plan.", lede, "See a sample plan →" link;
   artifact = the **plan-step accordion** (§4.5).
4. **"Documents"** (`id="what"`, the "What you get" anchor target) — reversed split (artifact left,
   copy right): heading "Every requirement, sourced.", lede, link; artifact = the **interactive
   checklist** (§4.6).
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

### 3a. Link & navigation map (no placeholder hrefs — invariant 11)

The reference uses `href="#"` throughout; production must use real targets:
- Header brand → `/`; "Sign in" → `/auth` (matches the app chrome, `components/layout/app-bar.tsx:40`).
- Header nav "How it works" → in-page anchor `#how`; "What you get" → `#what` (ids on the plan +
  documents sections). These are the only in-page anchors.
- Hero primary CTA "Check your eligibility →" → `/assess`.
- Section soft links ("See a sample plan →", "See the checklist →", "Meet the guide →") → `/assess`
  (they funnel into the same assessment, not separate pages).
- Closing **sparkle CTA** → `/assess`, rendered as a **real `<Link href="/assess">`** styled as the
  sparkle button (not a router-push button), so it is a genuine anchor in the DOM.
- Verdict panel **"See full breakdown →"** affordance → `/assess` (funnels into the same assessment
  as the section soft links); a real link, never `href="#"`.
- Footer is text only (no links required).

A test asserts no rendered `href="#"` and that both eligibility CTAs point at `/assess`.

### 3b. Responsive contract

The reference holds the exact mobile rules; they are in scope and must be ported, not dropped:
panel body / dimension layout, the split's collapse, the proof strip stacking, the freshness row
grid reflow, nav-text hiding (all except "Sign in") under 860px, and reduced section padding on
small screens (reference ~lines 413–430). Breakpoint of record: **860px** for split collapse + nav
hide. Where a mobile pixel is unstated here, the reference wins (§1 precedence).

## 4. Interactive artifacts and the approved flourishes

§4.1–4.3 are the three approved departures from flat (two flourishes + the paper grain); §4.4–4.8
specify the five live artifacts the sections are built around. Each artifact spec below fixes its
**server-rendered rest state, its enhancement, its reduced-motion / no-JS behaviour, its a11y, and
its acceptance test** — the reference holds the exact markup and CSS, this spec holds the contract.

### The three approved departures from flat

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
- Particles: a fixed count (per reference) mounted into the pen; their random drift CSS vars are
  seeded in `useEffect` **after mount only** (never during render — hydration parity §7), so the
  server HTML and first client paint match.
- **Navigation:** the sparkle CTA is a real link to `/assess` (§3a), styled as the button — not a
  decorative non-navigating button.
- `@media (prefers-reduced-motion:reduce)` kills all sparkle/particle animation and hides the
  particle pen; the button remains a legible, clickable pill.

### 4.3 Faint paper grain (material texture, not depth)
`.stage`, `.surface`, `.ftable` carry a `::before` noise layer: an inline `feTurbulence` data-URI
at very low opacity (light `.045` `mix-blend:multiply`; dark `.08` `mix-blend:screen`). This is
paper texture, not a shadow or gradient — it is the tactile warmth of the calm-authority language,
and it is static. It is in scope and approved; document it so a reviewer does not read it as a flat
violation.

### The five interactive artifacts

**Shared rule (hydration parity, §7):** every artifact is a `'use client'` island whose **first
client paint is byte-identical to the server HTML**. No `matchMedia`, `IntersectionObserver`,
`requestAnimationFrame`, or `Math.random` runs during render — all of them run only in `useEffect`
after mount. **Recommended:** build the plan-step, checklist, and freshness accordions on native
`<details>/<summary>` (and native `<input type="checkbox">` for the checklist) so the open/close and
checked rest states work with zero JS and need no hand-wired `aria-expanded`.

### 4.4 Live verdict panel (hero)
A bordered `.stage` showing one sample profile's banded verdict, four dimension rows, an estimated
cost, and a profile toggle.
- **SSR rest state:** renders Aarav fully — verdict word "Possible" in `--possible`; all four
  dimension rows (Academic / English / Finances / Visa risk) with their tag, blurb, and fill bar at
  its final width **set inline (not 0)**; the estimated cost shown at its **final value** (no
  count-up); the toggle defaulting to Aarav. Complete and correct with no JS.
- **Enhancement (JS + motion):** on first in-view, dimension fills animate from 0 and the cost
  counts up (rAF); the toggle swaps Aarav⇄Shruti with a short `.swapping` fade and re-runs
  fill/count. Dimension rows expand for the per-dimension blurb.
- **No-JS:** the panel stands complete on the default profile (Aarav) with final widths and final
  cost. If the toggle is built as a **native radio pair** (two `<input type="radio">` + CSS
  `:checked` sibling selectors, recommended), profile switching also works with zero JS; if it is a
  JS button instead, no-JS shows Aarav only and switching is a progressive enhancement. Either way
  the rest state is complete and correct.
- **Reduced motion (JS present):** the toggle switches Aarav⇄Shruti with **no** fade; final widths
  and final cost appear instantly; no count-up, no fill animation. Interaction is preserved, only
  animation is suppressed.
- **Honesty:** the cost line is labelled a **sample estimate** and carries **no** sourced `verified`
  citation (§6) — a "Sample profile" label and the `≈` marker sit adjacent to the number. Carry the
  reference's side content: the explanatory hint plus a **"See full breakdown →" link to `/assess`**
  (§3a), a real link, never `href="#"`.
- **A11y:** the verdict word is an `aria-live="polite"` status announced on swap; the toggle is a
  labelled `role="group"` (or radio pair); dimension expanders are `<details>` or `<button
  aria-expanded>`.
- **Acceptance test:** SSR render (no effects) shows "Possible", all four dimension labels, the
  final cost value, and the "Sample profile" label; the cost line renders **no** "verified"
  citation; toggling to Shruti yields "Strong".

### 4.5 Plan-step accordion ("From verdict to plan")
Five plan steps (state pill, title, detail, citation), one expandable at a time.
- **SSR rest state:** all five steps render with title + state pill visible; **step 02 is open**
  showing its detail + citation; the rest are collapsed but present in the DOM.
- **Enhancement:** clicking a step expands it (smooth `grid-template-rows` height transition) and
  collapses the previously open one.
- **Reduced motion / no-JS:** native `<details>` (recommended) makes this work with zero JS — step
  02 carries `open`; expand/collapse is instant under reduced motion. To preserve the
  one-open-at-a-time behaviour without JS, give every `<details>` a shared `name="plan"` (native
  exclusive-accordion grouping); if one-open is not required with no JS, plain `<details>` is fine
  and JS enforces the single-open rule.
- **A11y:** each header is a `<summary>` (or `<button aria-expanded>`); one detail region per step.
- **Data:** `lib/marketing/plan-steps.ts` (§6). Sourced citations render `source · verified`.
- **Acceptance test:** SSR shows all five titles and step 02's detail; the data module has exactly
  five steps; each step carrying a citation renders its `source · verified` string.

### 4.6 Documents checklist ("Documents")
Six requirement rows, each toggleable done/undone, with a live progress bar and an "All set" pill at
6/6.
- **SSR rest state:** all six rows render with label + source; **2 of 6 marked done**; the progress
  fill width is set to 2/6 **inline (not 0)**; the count reads "2 of 6".
- **Enhancement:** toggling a row updates the count and animates the fill; at 6/6 the "All set" pill
  appears.
- **Reduced motion / no-JS:** rows are **native `<input type="checkbox">`** (two defaulted
  `checked`), so toggling and the checked state work with no JS; the fill still shows 2/6 at rest.
- **Honesty:** each row shows its requirement `source` (Home Affairs / university). These are
  requirement labels, not sample estimates.
- **A11y:** native checkboxes with visible labels (never `aria-pressed` on a div); the count lives
  in one `aria-live="polite"` region.
- **Data:** `lib/marketing/checklist-items.ts` (§6).
- **Acceptance test:** SSR shows six labels, two `role="checkbox"` checked, progress "2 of 6";
  toggling a third updates the count to "3 of 6".

### 4.7 Guide typewriter ("The guide")
An autoplay chat that types one of three genuine first-person applicant questions and its sourced
answer, with clickable chips to jump between them.
- **SSR rest state:** the **first exchange (`ielts`) is fully rendered** — question, answer, and its
  `Home Affairs · Jun 2026` citation, all as final text (no typing). The three chips render as real
  buttons.
- **Enhancement:** in-view autoplay (IO threshold 0.35) types Q → typing dots → types A → reveals
  the citation, then advances through `order = [ielts, funds, gte]`; a chip click interrupts the run
  (run-id guard) and plays that exchange.
- **No-JS:** no typing; the `ielts` exchange stands as the complete static rest state. Chip
  switching is a progressive enhancement — either build the chips as a **native radio group** (CSS
  `:checked` reveals the matching exchange, so switching works with zero JS) or accept that with no
  JS only `ielts` shows. The rest state is always complete and correct.
- **Reduced motion (JS present):** no typewriter and no typing dots; a chip click swaps to that
  exchange **instantly** as final text. Interaction (chip switching, autoplay-pause-on-click) is
  preserved, only the typing animation is suppressed.
- **Honesty:** every answer carries its citation; the three questions are the founder-approved set,
  verbatim in `lib/marketing/guide-answers.ts` (§6).
- **A11y:** the thread is `aria-live="off"` (no character-by-character spam); a separate visually
  hidden `aria-live="polite"` region announces **completed exchanges only**; user chip interaction
  **pauses/stops autoplay** so it never fights the reader.
- **Acceptance test:** SSR shows the `ielts` question, full answer, and citation; the data module
  has exactly the three approved questions; the thread container is `aria-live="off"`.

### 4.8 Freshness table ("Sourced & dated")
Five provenance rows, each a real sourced figure with its verification, plus a one-time "verify
sweep" on first view.
- **SSR rest state:** all five rows render **already verified** — value, source, verified date, and
  next-check date all **visible at rest** (not hidden behind the row accordion); each verified dot
  shown. No row depends on JS to reveal its provenance.
- **Enhancement:** on first in-view (IO threshold 0.4) a staggered `.lit → .verified` sweep plays
  once; rows expand for extra detail (the *core* provenance triple stays visible when collapsed).
- **Reduced motion / no-JS:** rows render verified and static; `<details>` (recommended) gives no-JS
  expand of the extra detail.
- **Honesty (critical):** every row exposes `source · verified Jun 2026 · next check Jul 2026`
  **without interaction** — this is the page's provenance proof and must never be gated behind a
  click or JS. Exact figures per §6 (A$29,710 · s.500 · ≈A$33,000 tuition · 485 = 2–4 yrs · OSHC).
- **A11y:** row expanders are `<summary>` / `<button aria-expanded>`; the sweep is decorative and
  not announced.
- **Acceptance test:** SSR (no effects) shows all five rows with value, source, verified date, and
  next-check date visible; each sourced figure string matches §6 exactly (fabrication guard).

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

**Font loading:** load the two faces the way the rest of the app already loads them (the existing
`next/font` or `@font-face` pipeline) — `--sans`/`--mono` must resolve to *real, loaded* Hanken
Grotesk + IBM Plex Mono, not a bare CSS stack that silently falls back to system fonts. Reuse the
app's font setup; do not add a font-CDN link.

## 6. Data & honesty model

Two categories of number appear on the page and the build must keep them distinct:

- **Sample-student demo data** — the two toggleable sample profiles (Aarav · GPA 3.2 → "Possible";
  Shruti · GPA 3.8 → "Strong"), their dimension bars (Academic/English/Finances/Visa risk),
  per-dimension blurbs, and estimated first-year costs (≈A$42,600 / ≈A$44,200). These are
  **illustrative sample profiles**, surfaced under the explicit "Sample profile" label and the `≈`
  estimate marker. They are demo scaffolding, not claims about a real person. The **estimated cost
  renders as a sample estimate with no sourced `verified` citation** (a `≈` figure beside the
  "Sample profile" label), so it can never read as a sourced claim. Tests assert the "Sample
  profile" label is present *and* that the cost line carries no "verified" string.
- **Sourced facts** — the figures that *are* real-world claims: living-cost requirement A$29,710
  (Home Affairs), the **Genuine Student (GS) requirement** — this replaced the old "GTE / Genuine
  Temporary Entrant" in 2024, so do **not** ship "GTE"; use the current official label and its
  correct instrument, **source-confirmed at build time** — avg first-year tuition ≈A$33,000
  (university data), post-study work 485 = 2–4 years, OSHC required, IELTS 6.5 floor / 7.0 stretch.
  Each renders a visible `source · verified Jun 2026` (freshness rows also carry "next check Jul
  2026"). The exact official label + instrument + date per figure are pinned in the data module (not
  free-typed in JSX) and stay consistent across hero, guide, and freshness — no loose GS/GTE/s.500
  mixing.

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
intact. Make the sample-vs-sourced distinction a **discriminated union at the type level** (a
`kind: 'sample' | 'sourced'` tag) so a test can mechanically assert that sample data never renders a
`verified` citation and sourced data always does — the honesty invariant becomes type-enforced, not
just prose.

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
- **Hydration parity (SSR === first client paint).** Islands are `'use client'` but their initial
  render must equal the server HTML. No `matchMedia`, `IntersectionObserver`, `requestAnimationFrame`,
  or `Math.random` runs during render — read reduced-motion, observe in-view, count up, and seed
  sparkle particles only inside `useEffect` after mount. The reference's "build DOM in JS from an
  empty container" is a **mock-only** technique; porting it verbatim would ship empty rest states and
  random-seeded hydration mismatches. Invert it: server-render the filled state (§4.4–4.8), then
  enhance.

## 8. Architecture / component decomposition

A **server-component page shell** composes static copy + a handful of **client-island** artifacts.
Keep islands small and single-purpose; server-render their rest state.

- `app/(marketing)/page.tsx` — server shell: **keeps the existing `getUser()` →
  `redirect("/dashboard")` guard at the top (invariant 10)**, then renders header, hero copy, section
  copy/leads, footer, and the inline hidden SVG filters (`#hero-rough` + the grain data-URI usage).
  Imports the islands.
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
- **`TrustStrip` (`components/layout/trust-strip.tsx`) is removed from this page** — the v7 sticky
  header + hero proof strip replace its role. It is *layout* chrome, not a marketing component: drop
  its import/usage from the rebuilt `page.tsx`, but only delete the component itself if a usage
  check shows the landing page was its sole importer; otherwise leave it for its other users.

## 10. Accessibility & theming

- **Verdict:** the verdict word is an `aria-live="polite"` status; the profile toggle is a labelled
  `role="group"` (or radio pair).
- **Guide:** the thread is `aria-live="off"` (no character-by-character announcement); a separate
  visually hidden `aria-live="polite"` region announces **completed exchanges only**; a user chip
  click pauses/stops autoplay.
- **Checklist:** native `<input type="checkbox">` rows with visible labels (not `aria-pressed` on a
  div); the "N of 6" count updates in one `aria-live="polite"` region.
- **Accordions:** every trigger is a real `<summary>` or `<button aria-expanded>` (native
  `<details>` recommended for plan / freshness / dimension rows so no-JS works for free).
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
- Rest-state completeness (per artifact): islands render their static content in a no-JS render
  (React Testing Library without firing effects) — verdict panel's final cost + "Sample profile"
  label, plan step 02's detail, checklist at 2/6 with real checkboxes, the guide's `ielts` exchange
  + citation, and all five freshness rows with visible source + verified + next-check.
- **Signed-in redirect:** a `getUser()` returning a user redirects to `/dashboard` before any
  landing markup renders (invariant 10).
- **No dead links:** no rendered `href="#"`; the hero CTA, the verdict panel "See full breakdown"
  link, and the closing sparkle CTA all resolve to `/assess`; "Sign in" resolves to `/auth`.
- **Checklist semantics:** rows are queryable as `role="checkbox"`; two are checked at rest;
  toggling a third updates the live count to "3 of 6".
- **Terminology guard:** the marketing copy modules contain no user-facing "GTE" / "Genuine
  Temporary Entrant" string (current official term only — §6).
- **Hydration parity:** an SSR-then-hydrate render produces no React hydration warning; no
  `Math.random` / `matchMedia` / IntersectionObserver call during initial render (deferred to
  effects).
- **Reduced-motion behaviour:** with `matchMedia('(prefers-reduced-motion: reduce)')` mocked to
  match, the artifacts render their **final static** states (no count-up, no fill-grow, no typing,
  no verify-sweep, no `.reveal` transition) while interaction that does not depend on animation is
  preserved (profile toggle switches, guide chips switch exchange, checkboxes toggle).
- **Theme parity:** `:root[data-theme="dark"]` overrides the `prefers-color-scheme` media query in
  both directions (a stamped `data-theme` wins).
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

## 14. Changelog — Codex review fold-in (2026-07-08)

Codex (GPT-5.5, xhigh) reviewed this spec against the reference; verdict **BUILDABLE-WITH-FIXES**.
All blockers + should-fixes are folded in:

- **B1** dangling artifact refs → added §4.4–4.8 (verdict / plan / checklist / guide / freshness),
  each with SSR rest state, enhancement, reduced-motion + no-JS, a11y, and an acceptance test.
- **B2** rest-state not operationalized → invariant 6 + §7 now require a *server-rendered filled*
  rest state and explicitly reject the reference's JS-builds-empty pattern; each §4.x pins its rest
  DOM (step 02 open, 2/6 checked, `ielts` shown, rows pre-verified, fills set inline).
- **B3** undefined links → §3a link map + invariant 11 (no `href="#"`; both CTAs → `/assess`; Sign
  in → `/auth`; closing CTA a real navigation).
- **B4** signed-in redirect omitted → invariant 10 + §8 (keep `getUser()` → `/dashboard`) + §11 test.
- **B5** honesty split not airtight → invariant 3 + §6: sample cost carries no `verified` citation;
  discriminated `kind: 'sample' | 'sourced'` type; freshness rows expose source + verified + next
  check at rest (§4.8).
- **B6** hydration under-specified → §4 shared rule + §7 hydration-parity bullet (no matchMedia / IO
  / rAF / Math.random during render; particles seeded post-mount).
- **S1** checklist a11y → native checkboxes + single live count (§4.6, §10).
- **S2** guide announce → `aria-live="off"` thread, completed-exchange-only polite region, autoplay
  pauses on chip click (§4.7, §10).
- **S3** legal terminology → §6 corrects GTE → **Genuine Student (GS)**, source-confirmed, pinned in
  the data module; §11 terminology guard.
- **S4** missing tests → §11 adds redirect, dead-link, checklist-semantics, terminology, hydration,
  and theme-parity tests.
- **S5** `TrustStrip` fate → §9 (removed from this page; delete only if sole importer).
- **Notes:** native `<details>/<summary>` recommended for accordions; discriminated data types;
  real font loading (§5); responsive contract pulled forward as §3b.

**Round 2 (2026-07-08, re-verify pass):** Codex re-reviewed the revised spec → **STILL-HAS-BLOCKERS**
(narrow, 2 blockers + 1 should-fix), now folded in:
- **R2-B1** no-JS vs reduced-motion conflated for the profile toggle (§4.4) and guide chips (§4.7) →
  contracts split: no-JS = complete default rest state (native radio path offered for zero-JS
  switching); reduced-motion-with-JS = interaction preserved, animation suppressed.
- **R2-B2** verdict panel "See full breakdown" was an unmapped link-like affordance → mapped to
  `/assess` in §3a + §4.4, added to the §11 dead-link test.
- **R2-S1** §11 lacked the reduced-motion test §14 claimed → added an explicit reduced-motion DOM/
  behaviour test.
- Nice-to-haves also folded: `#how`/`#what` ids pinned inline in §3; closing CTA pinned as a real
  `<Link href="/assess">` (not router-push); native `<details name="plan">` specified for no-JS
  one-open accordions (§4.5).

---

*Terminal step after founder approval of this spec: the `writing-plans` skill turns it into a
task-by-task implementation plan, built via subagent-driven-development (TDD) on
`mv-112-landing-redesign` off `origin/master`. Merge to master stays founder-gated.*
