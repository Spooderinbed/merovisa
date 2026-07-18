# MV-90 — Overhaul Phase 1: Card + VerdictPill primitives

**Priority:** P1 · **Owner:** agent · **Created:** 2026-07-03
**Branch:** `mv-90-card-primitives` off `origin/master f6cada8`

## Why

The overhaul spec's Phase 1 "Primitive completion" (finishes MV-42 slices 2–3; design-division audit finding #12). MV-42 shipped only `VERDICT_LABELS`; the primitives never landed. Scout census (2026-07-03, 4-agent workflow): **69 card-shell sites** across 7 static families (dominant: `rounded-lg border border-line bg-surface` ×40) and **8 verdict-pill sites + 1 unpilled label**, with only 2 of 8 pill sites sourcing labels from `VERDICT_LABELS` — 5 local duplicate dicts + 1 hardcoded literal.

## Scope

1. **NEW `components/ui/card.tsx`** — role-radius map baked in per audit #12 (`card` = `rounded-md` 12px, `panel` = `rounded-lg` 16px in this app's `@theme` scale), tones `surface|tint|primary`, borders `line|line-2|transparent`, optional padding `sm|md|lg` (p-4/p-5/p-6), polymorphic `as`, `className` appended last via `cn`.
2. **NEW `components/ui/verdict-pill.tsx`** — colour classes lifted from verdict-card's `VERDICT_META.cls` (the contrast-tuned set: possible uses `text-possible-ink`); labels from `VERDICT_LABELS`; sizes `sm|md|lg` matching the three shipped tiers; `className` can retune font size per site (tailwind-merge).
3. **Migrate** all static-family shell sites + all 8 pill sites; delete the dead local label/colour dicts.

### Deliberate deltas (not regressions)

- Class **set** per site preserved exactly; attribute **order** normalizes shell-first (zero CSS effect; no snapshot infra exists).
- `rounded-xl` sites → `radius="card"`: renders 12px either way (Tailwind default 0.75rem ≡ `--radius-md` 12px) — fixes audit #12's off-scale drift with zero visual change.
- Possible pills unify onto `text-possible-ink` (5 drifted sites had `text-possible`) — spec-prescribed lift of the verdict-card set; a contrast improvement.
- 2 pill outliers (university-matches, outcome-funnel) gain `inline-flex items-center` like the other 6.
- All pill labels now come from `VERDICT_LABELS` (kills 5 local dicts + hero-preview's hardcoded "Strong match").

### Explicitly out of scope (follow-ups)

- Audit **#13** Button `loading` contract (shortlist-button / plan-item-card / document-card) — next primitives slice.
- Audit **#18** fake-loading theatre (Phase A quick win) and **#26** shared `Meter` (spec: MV-94).
- The **input/form-control shell** — 29 byte-identical sites, the single biggest duplicate string in the repo → future `Input` primitive slice.
- Ternary-tone shells (checklist-item, document-card :91, plan-item-card :74, guide-chat bubble), near-miss singletons (bank-loan-panel, scholarships-panel, readiness-map row :52, viewer modal, destination-detail primary-tint cousin).

## Test plan

- TDD red-first: `tests/components/ui/card.test.tsx` (9) + `tests/components/ui/verdict-pill.test.tsx` (5) — exact default shell string, variant maps, CTA string, className-after-shell, possible-ink, size tiers, tw-merge font-size override.
- Existing per-component tests are the migration harness; exact-string asserts updated minimally where order/dict changed.
- `tests/lib/scoring/verdict-labels.test.ts` importer allowlist updated centrally (verdict-pill becomes the pill importer).
- Gate: typecheck + lint + full suite (baseline 1 pre-existing red = MV-80 freshness timer) + preview sweep.

## Evidence

- Scout census: session task output `wueidi0n7` (4-agent workflow, 69 shell sites / 8+1 pill sites, byte-exact class strings).
- Primitives commit: `de12249` (14 tests green red-first).
- Migration: 4-agent workflow (disjoint file sets) — 71 census sites across 39 files, each batch's covering tests green (results 15 files/94 tests; matches/outcomes/destinations 6/37; dashboard/plan/checklist/misc 12/45; marketing/loading/ui 5/18). Post-sweep grep caught 5 sites the batch partition missed (wizard budget/education/english steps, layout/user-pill dropdown, ui/verdict-disclaimer) — migrated by hand; re-sweep clean. Total ~76 sites / 44 component files.
- NEW permanent guard `tests/styles/card-shell-ratchet.test.ts`: no `.tsx` under components/ or app/ may hand-roll the surface shell string (regex with `bg-surface-2` lookahead); allowlist = guide-chat's textarea only, with a second assertion that flags the allowlist entry going stale.
- Gate: `tsc --noEmit` exit 0 · lint 0 errors (1 pre-existing warning in docs/kanban/build.mjs) · suite **1612 passed / 1 failed** (the 1 = pre-existing MV-80 freshness timer; +16 new tests, zero regressions).
- Live preview: hero pill renders via VerdictPill (`inline-flex items-center rounded-pill font-mono px-2.5 py-0.5 text-[11.5px] bg-strong-tint text-strong`, label from VERDICT_LABELS); Card skeletons render the exact dominant shell string; page chrome + content compile clean (console parse errors during the migration window were stale buffer — post-fix compile verified).

## Resume notes (cold start)

Primitives are committed on `mv-90-card-primitives`. Migration ran as a 4-agent workflow (disjoint file sets: results / matches+outcomes+destinations / dashboard+plan+checklist+misc / marketing+loading+disclosure). If resuming mid-migration: `git status` shows which call-site files are touched; the census with byte-exact per-site class strings is in the scout output file (task `wueidi0n7`); rules = class-set identity, shell-first order OK, deliberate deltas listed above.
