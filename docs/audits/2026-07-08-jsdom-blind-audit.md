# jsdom-blind visual/timing audit — 2026-07-08

**Why:** the vitest suite runs under jsdom, which has **no layout engine** — it
computes no geometry, honours no `display`/`height`, fires no real
`IntersectionObserver`, runs no CSS transitions, and never does a server-render →
hydrate cycle. So a fully-green suite (currently 1896 tests) says nothing about
whether pages actually render/animate correctly. Twice on the MV-112 landing this
bit us (MV-113, MV-114). This audit swept **all 9 surfaces** for the seven
jsdom-blind bug classes, each finding adversarially verified
(CONFIRMED / REFUTED / severity-corrected).

**Method:** background Workflow `wf_41f5cf0d-d01` — `pipeline(find → adversarial-verify)`
per surface. **Complete: 23/23 agents, 0 errors.** Bug classes: A Tailwind-utility
class collision · B inline element given box height · C `display:none` gating an
observer · D one state driving instant+delayed = lag · E gapless/clipping group ·
F hydration hazard · G leaked timer / impossible transition.

**Post-verification severity note:** the adversarial pass corrected several findings
*down* — only **four** survive at **medium** (#1 chrome, #2 profile focus, #3 assess
hydration, #5 landing accordion snap); everything else is **low/cosmetic**, and **two**
findings were **refuted**.

**Landing live pass:** already done this session — the six landing *sections*
render clean in a real browser (desktop light+dark, mobile 375px). The landing
findings below are **motion/timing** defects a screenshot can't catch.

---

## Triage — CONFIRMED findings, ranked by student impact

### Tier 1 — broad, always-on (whole signed-in shell)

**1. Signed-in footer never pins + ~103px dead scrollbar** — `app/(app)/layout.tsx:46`
· bug G · **CONFIRMED medium**
The `min-h-dvh` flex column (main+footer) excludes the `AppBar` (~66px) and
`JourneyMarker` (~37px): they sit in body flow *above* the 100dvh column (their
wrapper is `display:contents`, boxless). So the document is always ~100dvh + ~103px
tall → on every short signed-in page (empty states) and on the streamed
`loading.tsx` fallback during *every* route transition, a persistent ~103px
scrollbar shows and the footer sits below the fold. The marketing/focused layouts
put the header *inside* the column (correct); the (app) layout copied the "footer
pinned to viewport bottom" comment but broke it — a regression of the MV-98 CLS
invariant.
**Fix:** move `AppBar` + `JourneyMarker` inside the `min-h-dvh` column (mirror
`app/(marketing)/layout.tsx`).

### Tier 2 — accessibility + trust paths

**2. Profile section focus ring clipped (WCAG 2.4.7)** — `components/ui/disclosure.tsx:34`
· bug E · **CONFIRMED medium**
The accordion `Card` is `overflow-hidden` with zero padding, so its clip box equals
the trigger `<button>` border box. The global focus ring paints at `outline-offset:2px`
(*outside* the box) → the ancestor clips it away. Tabbing the 8 profile section
headers shows no visible focus outline in Chrome/FF/Safari (collapsed = default
state = fully clipped). Affects every `Disclosure` header.
**Fix:** allow the ring to escape — e.g. `overflow-visible` on the Disclosure Card,
or inset the focus ring (`outline-offset` ≤ 0 / a `ring` inside), scoped so it
doesn't reintroduce a clip need.

**3. Assess hydration mismatch → wizard→results flash** — `components/assess/assess-flow.tsx:55`
· bug F · **CONFIRMED medium** *(found by both wizard + results agents)*
`readPersistedResults()` (reads `window.sessionStorage`) runs in the **render body**
to seed `useState(phase)`. SSR (window undefined) → `phase='wizard'` → emits Wizard;
client first render (sessionStorage has results) → `phase='results'`. Whole-subtree
hydration mismatch + a visible wizard flash before results, exactly on the MV-28
"refresh on results" recovery path this code exists to serve.
**Fix:** gate the restore behind a mount effect (render a stable SSR shell, swap
after mount) or `useSyncExternalStore` — without regressing MV-28.

**4. Expiry date TZ hydration mismatch on trust copy** — `components/results/conversion-paths.tsx:59`
· bug F · **CONFIRMED — corrected to low** (self-healing 1-day flip, secondary
anonymous-recovery route only)
`expiryDate()` reads `new Date()` and formats month/day during render on the SSR
`/assessment/[id]` route. Server (UTC) vs browser (Asia/Kathmandu, UTC+5:45) differ
after ~18:15 UTC → the "keep your assessment (by …)" date flips on hydration.
**⚠️ Adjacent (non-jsdom) trust bug the verifier flagged on the same line:** the
expiry is derived from `new Date()` **at view time**, not from the assessment's
stored creation timestamp — so the recovery route always shows "3 days from now"
regardless of the assessment's real age. That's arguably the more meaningful trust
defect and should be fixed together.
**Fix:** derive expiry from the stored creation timestamp (server-computed, passed
through the payload); don't read the clock in render.

### Tier 3 — landing motion polish (page just shipped; screenshot-invisible)

**5. Plan + freshness accordions snap instead of animate** — `components/marketing/plan-steps.tsx:23`
(+ `freshness-table.tsx:52`) · bug G · **CONFIRMED medium**
The `grid-template-rows 0fr→1fr` ease is on a child of a native `<details>`; browsers
don't render closed-`<details>` content, so there's no prior state to interpolate —
the body pops open instantly while the chevron rotates 0.3s (visible mismatch on the
landing's primary interaction). The verdict-panel's JS `.open` toggle *does* animate,
proving intent.
**Fix:** drive the plan/freshness expand with a JS `.open` class (element always
rendered), matching the verdict-panel pattern; or accept the snap and drop the ease.

**6. Freshness "verify" pulse fires off-screen** — `components/marketing/freshness-table.tsx:43`
· bug G · **CONFIRMED — corrected to low** (cosmetic; the sweep still tints backgrounds)
`verified` is hardcoded on every row, so `.vdot` `vpulse` resolves at hydration while
the band is far below the fold; by scroll-in it's long over. The IntersectionObserver
sweep only toggles `.lit` (a background tint), not the dots — so the staggered green
"verify" pulse the sweep is named for never plays in view.
**Fix:** stage `verified`/the pulse from the IO sweep (like `.lit`), not statically.

### Tier 4 — low / cosmetic

- **7. Wizard persisted-restore step-1 flash** — `components/wizard/use-wizard-state.ts:104`
  · bug F · **CONFIRMED low.** Same render-body-sessionStorage pattern as #3; brief
  step-1 flash on anonymous mid-wizard refresh. Self-heals, no data loss. Fold into #3's fix.
- **8. Dashboard journey-rail baseline ~4px low** — `components/dashboard/journey-rail.tsx:43`
  · bug G · **CONFIRMED low.** Connector at `top-[13px]` but dot centre is 9px
  (`Link py-1` + half of `h-2.5`). Trivial: `top-[13px]` → `top-[9px]` (sibling
  outcome-funnel uses the correct `top-[5px]` with no padding).
- **9. Matches tablist width jitter** — `components/matches/matches-tabs.tsx:83`
  · bug E · **CONFIRMED low.** Active tab gains `font-medium` (500) → ~1-2px wider →
  siblings nudge on each switch. Fix: reserve the bold width (e.g. weight via
  `::after` content trick, or fixed tab min-width).
- **10. Guide-thread leaked timers** — `components/marketing/guide-thread.tsx:85`
  · bug G · **CONFIRMED low.** Typewriter/autoplay have no unmount cancel (cleanup
  only `obs.disconnect()`); post-unmount setState (React no-ops, no crash; bounded
  ~18s). One-line fix: bump `runId.current` in cleanup.
- **11. intake-timing offsetPct hydration** — `components/results/intake-timing.tsx:19`
  · bug F · **CONFIRMED low.** Inline `left:%` from `new Date()` → SSR/client float
  mismatch on `/assessment/[id]`; in React 19 this is a **dev-only** `console.error`
  (attribute checks compiled out in prod — no re-render, no visible flash), div is
  aria-hidden. Fix: compute offsetPct server-side into the payload. Fold into #4/#3
  render-clock cleanup.

### Refuted
- **graduation-year-step `new Date()` year-boundary** — `graduation-year-step.tsx:8`
  · **REFUTED.** The year DOM is never in the initial hydrated paint (wizard renders
  one step; step 0 is homeCountry), so no hydration comparison of that subtree occurs.
- **cost-to-apply / university-matches locale grouping** — `cost-to-apply.tsx:54`,
  `university-matches.tsx:15` · **REFUTED.** The lakh-vs-thousands divergence only
  appears at ≥ 100,000, but every figure here is static seed/policy data capped well
  under 100k (max tuition 65,000; NPR subtotal 57,765), so en-IN and en-US format
  identically. Latent smell (missing explicit locale) but no active mismatch.

---

## Recommended fix order (final severities)
1. **#1 chrome footer/scrollbar** (medium) — broadest blast radius (every signed-in page + every route-transition loading state), clean contained fix.
2. **#2 profile focus ring** (medium) — accessibility (WCAG 2.4.7), all Disclosure headers.
3. **#5 plan/freshness accordion snap** (medium) — on the just-shipped landing, screenshot-invisible; the only remaining landing *medium*.
4. **Hydration-hardening slice** — #3 assess-flow sessionStorage-in-render (medium) + #7 wizard restore + #4 expiry (incl. the ⚠️ "always 3 days from now" trust bug) + #11 intake offsetPct. One slice: stop reading `window`/the clock in render bodies on the assess/results trust paths.
5. **Cosmetic polish slice** — #8 dashboard rail `top-[9px]` (trivial) + #9 matches tab jitter + #6 vpulse + #10 guide timer cleanup.

Two refuted findings need no work.

Each fix: per-slice branch off `master` → TDD (assert the class/structure contract
jsdom *can* see + a real fix) → PR → **founder-gated merge**. See
[[2026-07-08-jsdom-blind-to-layout]].
