# MV-133 — A DB read error renders as "no programs," not an outage (audit §7 #18)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Source:** 2026-07-10 audit, the unlabelled "false empty-state repositories" finding
(§7 item #18), confirmed uncarded 2026-07-17. Read-side sibling of MV-02, which fixed only
the WRITE-side swallow (`ok:true` on failure).

## Why (student outcome)

If the programs query fails, the student is told "no programs found" — a confident false
negative. They conclude the product has nothing for them (or is empty) and leave, when the
truth is a transient outage. The single most demoralising possible answer, shown for the
wrong reason.

## The bug

`lib/programs/repo.ts` returns `[]` on any error at four call sites (lines ~10, 16, 22, 38:
`if (error || !data) return [];`). A DB/network error is indistinguishable from a genuinely
empty result. Downstream, the matches/results surfaces render the empty state.

## Fix direction

Distinguish "queried successfully, nothing matched" from "the query failed." On a real
error, propagate it so the surface can show an honest outage/retry state (reuse the MV-62
error boundary) instead of the empty state. Do NOT throw blindly everywhere — audit each of
the four sites; some callers may legitimately tolerate empty.

## Acceptance criteria

- [x] A read error no longer renders as an empty result; it surfaces an honest error/retry
      state.
- [x] A genuinely empty result still renders the calm empty state.
- [x] The two are distinguishable in the return type (not both `[]`).
- [x] Gate green; cover with a test that mocks a repo error and asserts the error state, not
      the empty state.

## Resume notes

- Path + lines verified 2026-07-17: `lib/programs/repo.ts`, `return []` at 4 sites.
- MV-02 fixed the write-side (`ok:true`-on-failure) swallow; this is the read side.
- MV-62 shipped the error/loading boundaries to render into.

## Done evidence

**Branch:** `mv-133-read-errors` · **Built:** 2026-07-25 (TDD) · merge founder-gated.

### Shape of the fix

`lib/programs/errors.ts` (new) holds `CatalogReadError` + `isCatalogReadError`. All five reads
in `lib/programs/repo.ts` now `throw` on a PostgREST `error` and reserve `[]` / `null` for a
query that answered with nothing (`(data ?? []).map(...)`, `data ? map(data) : null`).

On AC-3: the error is carried by the throw, not by a `Result` wrapper. Same contract MV-02
chose on the write side (`patchProfileSection` throws; the route logs and 500s), it keeps the
repo signatures untouched — which matters while sibling branches are in flight — and it lands
straight in the MV-62 / `(focused)` boundaries, whose doc comments already anticipated a
throwing `listAllPrograms`. Empty and failed are no longer the same value anywhere.

### The four call-site verdicts (the card asked for a per-site audit)

| Surface | Was | Now |
|---|---|---|
| `/matches` | "No programs found yet. Complete your profile…" | propagates → `(app)/error.tsx` retry |
| `/checklist` + `/checklist/[programId]` | empty shortlist; `notFound()` on a read error | propagates; an outage is never a 404 |
| `/assessment/[id]` (legacy re-assemble) | `matches: []` | propagates → `(focused)/error.tsx` |
| `POST /api/assess` | 200 with a zero-match verdict, **persisted** for signed-in users | **503**; wizard shows its existing "answers are still here — try again" |
| `lib/plan/invalidate` · `lib/assessments/re-score` | rewrote plan / assessment-of-record from an empty catalogue | abort before any write; callers already catch+log |
| `lib/outcomes/freeze` | 404 "unknown program" / 409 "missing its university" | **503** "catalogue unavailable" |
| `/dashboard` outcome funnel | — | **tolerated** (the audited exception, see below) |

**The one legitimate tolerate:** the dashboard reads the catalogue only to put program *names*
on funnel rows the student's own attempts already prove exist. Nothing there is presented as
"we found nothing for you", so it catches + logs and degrades the labels rather than taking the
whole hub down. Every other signed-in read propagates.

Two consequential follow-ons from making reads throw, both fixed here:
- `/api/assess` now wraps `invalidatePlan` (it was the only one of six call sites unwrapped) —
  otherwise a derived-plan failure would report "Failed to save assessment" for an assessment
  that *was* saved: the same lie inverted.
- `FreezeResult` gained `503`; `app/api/outcomes/prediction/route.ts` passes `status` through
  untouched.

### Test evidence (TDD — red observed before each fix)

- `tests/programs/repo.test.ts` (+7): each read rejects with `CatalogReadError`; `[]` still
  returned for a no-rows answer; `getProgram` distinguishes error from absent; error names its
  table. Red was literally `promise resolved "[]" instead of rejecting` — the bug in one line.
  The old `listAllPrograms returns [] on error` test was deleted: it codified the defect.
- Genuinely-red behaviour changes (5): `tests/api/assess.test.ts` (200 → 503),
  `tests/api/assess-persist.test.ts` (500 → 200 on a failed derived rebuild),
  `tests/outcomes/freeze.test.ts` ×2 (404/409 → 503), `tests/app/dashboard-page.test.tsx`
  (page threw → page renders).
- Contract guards (pass once the repo throws, since these surfaces already propagated):
  `matches-page` (no "No programs found yet" on a read error, empty-state test kept alongside),
  `checklist-program-page` (`notFound` not called), `plan/invalidate` + `assessments/re-score`
  (no write of any kind when the catalogue read fails).

### Gate

`npm run typecheck` clean · `npm run lint` clean · **2050 passed (305 files)**.

### Follow-up spotted, deliberately not taken (scope fence)

The identical `if (error || !data) return []` swallow lives in `lib/matches/repo.ts:51`,
`lib/plan/repo.ts:15,25` and `lib/profiles/repo.ts:16,39`. The plan one is the sharpest — a
failed plan read renders "caught up". Left for its own card to keep this diff inside the
programs catalogue the card scoped.
