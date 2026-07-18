# MV-122 — /trust claims uploads verify your assessment; they don't (C-1c)

**Priority:** P1 · **Owner:** agent
**Merge:** _founder-gated_ (trust copy — founder owns the wording)
**Source:** **NOT in the 2026-07-10 audit.** Found 2026-07-17 by the verification workflow that
re-checked the audit against live code. Filed as **C-1c** in
`docs/audits/2026-07-10-comprehensive/VERIFIED-BUILD-ORDER.md`.

## The bug

`app/(marketing)/trust/page.tsx:41-44` tells students uploaded documents are

> "used only to replace declared values with verified ones in your assessment."

They are not. `reScoreAssessment` is called from `/api/assess`, `/api/assess/refresh`, and
`/api/profile/section` — **never** from the upload route. Uploading a document does not re-score
anything.

This is a false claim about the product's core trust promise, on the page whose entire job is to
justify trusting the product. It is the worst possible page to be wrong on.

## Why it survived

Commit `fc380e2` ("uploads don't rescore") **already fixed this exact claim** on the accuracy meter
and missed the trust page. So the codebase currently states both the true and the false version of
the same fact in two places. That is also why an audit reading either surface in isolation could
conclude it was fine.

## Fix

Either make the copy true (say plainly that uploads are stored for the checklist and do not change
your assessment), or make the code true (call `reScoreAssessment` from the upload route). **These
are very different slices** — the first is a copy fix, the second is a feature with real scoring and
provenance consequences. Default to the copy fix; the founder owns the call.

Slice 7 of the verified build order ("The trust page describes the system we actually built") is
where this belongs, and it is free to fix there — it is the same paragraph as C-1.

## Acceptance criteria

- [x] `/trust` no longer claims uploads feed the assessment. **Copy fix** (founder's call,
      AskUserQuestion 2026-07-18): the §2 paragraph now reads uploads are "stored privately so you
      can track them against your application checklist. They do not change your verdict — your
      assessment is computed only from the inputs above."
- [x] The claim agrees with the accuracy-meter wording `fc380e2` already corrected — swept the whole
      repo for `replace declared values` / `verified ones in your assessment`; the only remaining
      hits are this dossier, the guard test, and two historical audit docs. No live surface disagrees.
- [x] Founder has signed off on the wording (approved verbatim via AskUserQuestion).

## Evidence (2026-07-18)

- **Root cause reconfirmed against live code:** `reScoreAssessment` is called only from
  `app/api/assess/route.ts`, `app/api/assess/refresh/route.ts`, `app/api/profile/section/route.ts`
  — never the upload route. Uploading a document changes no verdict, so the old §2 claim was false.
- **Slice = copy fix** (founder chose it over "make the code true" — a reScore-on-upload feature —
  via AskUserQuestion). One file changed: `app/(marketing)/trust/page.tsx` §2.
- **TDD:** `tests/marketing/trust-page-claims.test.ts` (new, source-text guard mirroring
  `copy-integrity.test.ts`) went red first — both assertions failed for the right reason (false
  claim present, honest wording absent) — then green after the edit. It pins the honest wording so
  the two surfaces can never drift apart again (the exact failure mode that let this survive).
- **Gate green:** typecheck 0 · lint 0 · **1962 tests / 299 files** (was 1960/298; +2 for the guard).

## Resume notes

- Grep `reScoreAssessment` call sites before writing any copy — the set may have changed.
- Related: the same verification pass found the audit's C-1/C-2 delete-ordering claim was **wrong**
  (`route.ts:49-63,66-69,73,85` with the `failedSteps` check at `:76-82` is correct as written). Do
  not "fix" that. See the corrections block in VERIFIED-BUILD-ORDER.md.
