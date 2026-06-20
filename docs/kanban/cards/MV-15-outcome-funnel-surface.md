# MV-15 — Read-side outcome surface (make the moat loop visible)

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder live-smoke)
**Created:** 2026-06-20 · **Entered review:** 2026-06-20
**Related:** [[MV-08]] — this is the user-facing read half of the outcome-validation loop.

## Why

MV-08 shipped the full write side of the moat (predictions → attempts → outcome
events, capture contracts, POST/GET routes, the 3-state Applied UI) but nothing
*shows the user their own loop back to them*. `GET /api/outcomes` /
`getOutcomesForUser` return raw normalized rows, not a display view. Surfacing the
loop is the highest-trust signal a user sees after reporting an outcome, and it's
fully agent-ownable (no founder legal gate, no schema change) — both my analysis
and Codex ranked it the #1 next slice.

## What shipped

- **`lib/outcomes/funnel.ts`** (pure, server-safe):
  - `deriveFunnelStage(events)` folds a recorded event set into the single current
    stage for display (`applied | offer | accepted | rejected | visa_lodged |
    visa_granted | visa_refused | enrolled | withdrawn`). The existing
    `state-machine.ts` answers "what's legal next"; this answers "where am I now."
    Terminal/negative outcomes (withdrawn, refusal, rejection) outrank the positive
    milestones they imply, so a refused visa reads as "Visa refused", not "CoE".
  - `buildOutcomeFunnel({predictions, attempts, events, programLookup})` — one row
    per attempt: program name + frozen verdict (from its prediction) + current
    stage, sorted most-recently-updated first. Attempts with no matching prediction
    are dropped (defensive; the FK should make that impossible).
- **`components/outcomes/outcome-funnel.tsx`** — presentational server component.
  Verdict chip reuses the strong/possible/reach tints; a status pill shows the
  current stage with tone (positive/negative/pending/neutral). Copy is honest:
  "What you told us happened, against the verdict we gave you. Self-reported until
  verified." Renders nothing when there are no rows.
- **`app/(app)/dashboard/page.tsx`** — loads outcomes in the existing `Promise.all`;
  **only** when `attempts.length > 0` does it fetch programs/universities and build
  the lookup (keeps the common no-attempt path — the current 5 users — at one extra
  query). Renders `<OutcomeFunnel>` after `StatsRow`.

Empty-state stance matches the dashboard's existing "no fake trackers" rule
(page comment at the removed "Your journey"): the section is omitted entirely until
there's a real attempt to show, rather than rendering an empty shell.

## Acceptance criteria

- [x] Per-attempt current stage derived correctly across the full legal event ladder, incl. terminal precedence.
- [x] Rows join attempt → prediction (verdict) + program name; sorted by recency.
- [x] Graceful fallbacks: unknown program → "Your program"; attempt without a prediction → dropped.
- [x] Section hidden entirely when the user has no attempts (no empty shell, no extra queries).
- [x] No DB schema change; no scoring/golden change; RLS owner-scoping unchanged (reads via `createSupabaseServerClient`).

## Test evidence (TDD, failing-test-first)

- RED → GREEN, `tests/outcomes/funnel.test.ts` (+15): `deriveFunnelStage` across 12
  ladder cases incl. terminal precedence + defensive empty; `buildOutcomeFunnel`
  join/sort, program-lookup fallback, missing-prediction drop.
- `tests/app/dashboard-page.test.tsx` updated to mock the new `getOutcomesForUser`
  (empty) — all 7 dashboard tests stay green.
- Gate green: **typecheck clean · lint 0 errors** (1 pre-existing unrelated
  `build.mjs` warning) · **full suite 1268/1268** (+15).

## Founder-owed / notes

- **Live smoke** (not headless-provable — dashboard is OAuth-gated + needs seeded
  attempts): sign in as a user with an application attempt + events, open
  `/dashboard`, confirm "Your applications" shows the program, verdict chip, and the
  right stage pill; confirm it's absent for a user with no attempts.
- **Possible follow-ups** (not in scope): a dedicated `/applications` page if the
  list grows; a compact 3-phase ladder (Applied → Admission → Visa) instead of a
  single status pill; surfacing the refusal `reason_code` once verification exists.
