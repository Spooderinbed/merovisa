# MV-22 — Surface program notes (AHPRA etc.) on the anonymous results MatchCard

**Column:** Ready · **Priority:** P2 · **Owner:** agent · **Gate:** none (pure component + test)
**Created:** 2026-06-22
**Related:** [[MV-07]] (CRICOS render precedent on the program card), the 2026-06-18 full-app
evaluation Q11 (`docs/audits/2026-06-18-full-app-evaluation.md`).

## Why

A 2026-06-22 evidence-based reconciliation (10-agent verification of the 18-concern audit against
current code) found the audit is **essentially shipped** — only 3 items remain. This is the smallest,
highest-leverage one: a **parity gap**, not a missing feature.

Q11 ("surface program `notes`") **shipped on the signed-in dashboard ProgramCard** (the "Good to know"
caveat block) but **NOT on the anonymous results `MatchCard`**. So trust-critical per-program caveats —
e.g. AHPRA registration for nursing, MBA work-experience prerequisites — are **missing on the
pre-signup `/results` page**, which is the highest-traffic surface and the exact conversion moment.
A nervous Nepali applicant comparing nursing programs anonymously never sees the AHPRA caveat until
after they sign in. That's a direct hit to the "real chances before you commit" promise.

## Scope (verify against current code first — prior recon has hallucinated line numbers)

The verification cited these locations; **confirm them against the real files before editing** (the
MV-17 lesson: Codex recon was partly hallucinated — trust the code, not the citation):

- **Source pattern to clone:** the dashboard `ProgramCard` "Good to know" block that renders `p.notes`
  (search `components/` for the existing notes/`Good to know` treatment — that's the shipped, tested
  reference).
- **Target:** the inline `MatchCard` in `components/results/university-matches.tsx` (~lines 28–62) —
  add the same caveat block **after the reasons `<ul>` (~line 58), before `SourceLine`**.
- Confirm the program/match object on the results path actually carries `notes` (it may need to be
  threaded through from the match shape — if `notes` isn't present on the anonymous results match
  object, threading it is part of this slice; if absent at the data layer, STOP and report rather than
  invent).

## Build order (TDD)

1. RED: add a test in `tests/components/university-matches.test.tsx` (or the existing results-matchcard
   test file) asserting the notes/"Good to know" block **renders when `notes` is set** and **is absent
   when `notes` is null/empty**. Use an AHPRA-style fixture (nursing) to mirror the real case.
2. GREEN: render the `notes` caveat block in the results `MatchCard`, reusing the dashboard's component
   or copy if it's small (match existing style — design language: thin border, no shadow, sentence case).
3. Confirm parity: the same program shows the same caveat anonymously and signed-in.

## Acceptance criteria

- [ ] Anonymous `/results` MatchCard renders program `notes` (AHPRA etc.) with the same treatment as
      the signed-in dashboard ProgramCard; renders nothing when `notes` is empty.
- [ ] TDD: failing test first, then green; both states (present / absent) asserted.
- [ ] Gate green: `typecheck` + `lint` + full `test` suite (was 1274). No scorer/golden change
      (this is presentational) → `golden-assessments.json` byte-identical.
- [ ] No founder gate touched (no DB write, no legal copy, no live smoke).

## Resume notes (cold agent)

- This is a **clone of an already-shipped, already-tested pattern** — low risk, surgical. Do not
  redesign the notes block; match the dashboard's.
- If `notes` is **not threaded** to the anonymous results match object, threading it is in scope, but
  if the data simply isn't there at the seed/match layer, STOP and report (don't fabricate notes).
- Evidence trail: the 2026-06-22 audit-residual reconciliation (workflow run `wf_4b1a3438-b21`);
  it confirmed Q5/Q7/Q8-Q9/Q10/Q11-filter/Q12/Q15 already shipped and isolated this residual.
- Never stage the WIP trio; explicit `git add` paths only. Commit straight to master.
