# MV-17 — Route logged-in re-assessment to profile-edit/reScore (stop minting duplicate wizard rows)

**Column:** Backlog · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder — product/routing decision)
**Created:** 2026-06-20
**Related:** [[MV-16]] — the claim-path fix (newest-wins) handles the *fallback*; this is the *primary* path Codex recommended. [[MV-14]] (lead-insert) and [[MV-08]]/[[MV-15]] (the outcome loop reads the primary assessment) all sit on the same claim/primary plumbing.

## Why

A logged-in user who wants to re-check their chances currently goes back through
the **anonymous wizard**, which mints a **new** `assessments` row (owner NULL →
claimed on the next OAuth round-trip). The result: owner `ece83f09` has accreted
**16 assessment rows** — only one can be primary, the rest are dead weight, and
every re-assessment leans on the claim path's demote-then-promote ([[MV-16]]) to
re-point the dashboard.

Codex's review (the A-vs-B-vs-C triangulation, 2026-06-20) ranked this the
**preferred primary path**: a signed-in user editing their data should update
their existing primary assessment **in place**, not create a parallel row.
`reScoreAssessment` (`lib/assessments/re-score.ts`) already recomputes and
overwrites the primary assessment's `result` when the profile changes — the
machinery exists; it just isn't on the re-assessment entry point for logged-in
users. [[MV-16]] (newest-wins on claim) remains the correct **fallback** for the
case where a logged-in user still completes a fresh anonymous wizard.

## What to build (proposed — needs founder sign-off before TDD)

- Detect an authenticated session at the wizard entry point (`/assess` and the
  results CTAs) and, for logged-in users, route to **profile-edit → `reScoreAssessment`**
  (update the existing primary in place) instead of starting a fresh anonymous
  assessment.
- Keep the anonymous wizard intact for signed-out users (the conversion funnel is
  unchanged).
- Decide the UX for "I want a genuinely *new* scenario" (e.g. a different target
  country/degree later) vs "re-check my current profile" — only the latter should
  reuse the primary row. (MVP corridor is Nepal→Australia, so this is largely
  theoretical today but worth naming.)

## Open questions for the founder

1. **Entry-point UX:** when a logged-in user clicks "assess" again, do we send
   them straight to profile-edit, or show a choice ("update my assessment" vs
   "start fresh")?
2. **Existing duplicate rows:** leave the historical 16 rows as-is (harmless once
   [[MV-16]] keeps the primary correct), or add a cleanup? (Cleanup = prod write,
   founder-gated.)
3. **Architecture:** stays in Next.js (reuse `reScoreAssessment`); no Postgres
   RPC — consistent with [[MV-16]].

## Acceptance criteria (draft)

- [ ] A logged-in user re-checking their chances updates their existing primary
      assessment in place (no new `assessments` row created).
- [ ] Signed-out anonymous wizard + OAuth claim funnel unchanged.
- [ ] The [[MV-16]] claim-path newest-wins remains as the fallback for a
      logged-in user who still completes a fresh anonymous wizard.
- [ ] No Postgres RPC/function; business logic in Next.js.
- [ ] TDD; no scoring/golden change beyond what `reScoreAssessment` already does.

## Status

Backlog — **founder-gated** (product/routing decision). Filed per the MV-16
Codex triangulation so option C isn't lost; not started.
