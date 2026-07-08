# MV-117 — Plan + freshness accordions animate open (kill the native-<details> snap)

**Priority:** P2 · **Owner:** agent
**Branch:** `mv-117-accordion-animate` (off `master`) · **PR:** [#78](https://github.com/Spooderinbed/merovisa/pull/78) (founder-gated merge)
**Goal:** On the landing, expanding a plan step or a freshness row animates smoothly
(body eases open in sync with the chevron), instead of snapping open instantly.

## Context links
- Audit: [docs/audits/2026-07-08-jsdom-blind-audit.md](../../audits/2026-07-08-jsdom-blind-audit.md) — finding **#5** (Tier 3, CONFIRMED medium, bug class G). The last remaining landing *medium*.
- Lesson: [[2026-07-08-jsdom-blind-to-layout]] — jsdom has no layout engine / no CSS transitions; guard the class contract + verify live.
- Code: `components/marketing/plan-steps.tsx`, `components/marketing/freshness-table.tsx`, `app/(marketing)/landing.css`. Pattern template: `verdict-panel.tsx` `.dim` + `landing.css:106-107`.

## What was wrong
Both accordions used native `<details>`/`<summary>` with a `grid-template-rows: 0fr→1fr`
ease on the collapsible child (`landing.css` `.step-detail` / `.fdetail`). A **closed**
native `<details>` `display:none`s its non-summary content, so there is no prior laid-out
frame for the grid-rows transition to interpolate from — the body **snaps** open in one
frame while the chevron rotates over 0.3s (a visible mismatch on the landing's primary
interaction). The verdict-panel's `.dim` (a plain `<div>` toggled by a JS `.open` class,
detail always rendered) *does* animate — proving intent.

## The fix
Drive both expands with a JS `.open` class instead of native `<details>`:
- **plan-steps.tsx** (was a server component) → client component, single-open accordion
  (mirrors the old `<details name="mv-plan">`): one `openN` state seeded from the data's
  `open` step (02), toggled by a `<button className="step-head" aria-expanded>`. The
  `<details>`→`<div className="step … open">` and `<summary>`→`<button>`.
- **freshness-table.tsx** (already client): `<details>`→`<div className="fitem … open">`,
  `<summary>`→`<button className="frow …" aria-expanded>`, independent multi-open rows
  via an `openRows` Set. The IO `lit` sweep + `verified`/`vdot` are untouched (finding #6
  is a separate slice).
- **landing.css**: the three `details[open]…` selectors → class-based `.step.open`,
  `.fitem.open` (grid-rows + chevron rotate). Removed the now-orphaned
  `::-webkit-details-marker` rules + `list-style:none` (only applied to `<summary>`).

Because `.step-detail`/`.fdetail` are now always rendered (`display:grid`, `0fr` at rest),
the grid-rows transition has a prior frame and interpolates. Buttons inherit font/colour
via Tailwind preflight (as `.dim-head` already does) and pick up the existing
`.mv-landing button:focus-visible` ring. The open step is server-rendered filled at rest
(useState initial is derived from static data — no window/clock read), so the MV-112
FILLED-rest-state + hydration-parity invariants hold.

## Acceptance criteria
- No native `<details>` on the landing; plan is single-open, freshness multi-open.
- Step 02 open at rest, server-rendered; chevron rotates on the open item.
- The collapsed detail is `display:grid` (rendered) with a `grid-template-rows` transition.

## Test plan
- `tests/components/marketing/plan-steps.test.tsx` — SSR: 5 titles, exactly one
  `aria-expanded="true"` and it is `class="step open now"` (step 02), **no** `<details>`
  / `name="mv-plan"`, citation intact. (updated)
- `tests/styles/landing-css.test.ts` — new guard: `.step.open .step-detail{…1fr}`,
  `.fitem.open .fdetail{…1fr}`, `.step.open .chev` / `.fitem.open .fchev`, and **no**
  `details[open]` selector remains.
- `tests/components/marketing/freshness-table.test.tsx` — unchanged, still green
  (`frow verified` ×5 + content survive the `<details>`→`<div>`/`<button>` swap).

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
None. Presentational only — no scoring/API/DB/Zod; goldens untouched.

## Risk notes
Low. Copy-integrity guard caught one em-dash in a new comment → fixed to a comma
(design-language invariant: no em-dashes).

## Agent resume notes (for a cold start)
Done + green + live-verified. Fix #3 (last medium) of the 5-slice jsdom-blind fix phase
(after MV-115/116; next: the hydration-hardening slice MV-118 = audit #3+#7+#4+#11).
Move to In Review, open PR, founder-gated merge.

## Decision log
- 2026-07-08 — Converted plan-steps server→client (needs state for single-open); kept
  the exact rest-state (step 02 open) server-rendered so no CLS/hydration regression.
  Removed dead `::-webkit-details-marker` + `list-style:none` orphaned by summary→button.

## Done evidence
- Gate green: typecheck 0 · lint 0 errors (pre-existing `build.mjs` warning only) · **295 files / 1897 tests** pass (+1 landing-css guard).
- **Live-verified** on `/`: 0 native `<details>`; closed `.step-detail` = `display:grid`,
  `grid-template-rows:0px`, `transition:grid-template-rows` (rendered + animatable);
  a click caught `grid-template-rows` **mid-transition at 53.48px** (interpolating 0→94px
  — a snap would only read 0 or 94); step 02 open at rest, chevron rotated 90°, single-open holds.
- Branch `mv-117-accordion-animate`; PR pending.
