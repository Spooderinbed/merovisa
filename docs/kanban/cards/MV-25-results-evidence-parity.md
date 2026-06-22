# MV-25 — Nepal evidence level on the anonymous results MatchCard

**Column:** In progress · **Priority:** P3 · **Owner:** agent · **Size:** S
**Gate:** none (agent-ownable; presentational, no DB, no scorer).
**Created:** 2026-06-22
**Related:** [[MV-24]] (the data + the dashboard ProgramCard line this mirrors); [[MV-22]] (the prior anon-results parity slice — same pattern); 2026-06-18 audit Q13b.

## Why

[[MV-24]] harvested the DHA Nepal evidence levels and surfaced `{level} evidence · Nepal`
on the **signed-in dashboard** ProgramCard. But the **anonymous results MatchCard**
(`components/results/university-matches.tsx`) — the pre-signup conversion surface, the
"real chances before a consultancy" moment, and the highest-traffic page — omits it.
A Streamlined evidence level is a concrete trust signal ("Australia already treats this
provider's Nepali applicants with lighter documentary expectations"), and it belongs on
the surface a student sees *before* they sign in. This is the deliberate anon-results
parity follow-on [[MV-24]] flagged as a founder-owned residual, taken as its own slice
exactly the way [[MV-22]] mirrored program notes.

## Constraint that shapes the design (the reason it's not a one-line clone)

The dashboard `ProgramCard` is a **server component**, so importing the evidence resolvers
(`cricos-lookup` → `au-cricos-directory` 1,669 rows + `nepal-evidence-lookup` →
`au-nepal-evidence-levels` 1,626 rows) costs nothing on the client. The anonymous
`MatchCard` and its whole render tree (`university-matches.tsx`, `results.tsx`) are
**client components** (`"use client"`). Importing those resolvers there would bundle
~3,300 records (~100KB source) into the client bundle shipped to every anonymous
visitor on the pre-signup page — a real regression on the trust-first surface.

**Resolution:** resolve the evidence level **server-side** and pass it to the client as a
precomputed string on the match. Both production callers of `assembleAssessment`
(`app/api/assess` route for anon; the owned `[id]` page) are server contexts, and the
anon client renders from the server-built `AssessmentPayload` JSON — so attaching the
level there keeps the heavy datasets server-only. The `MatchResult` type carries the
level via `import type` (type-erased → zero client cost).

## Scope

1. `MatchResult` gains optional `evidence?: { level: NepalEvidenceLevel; source: string } | null`
   (type-only import of `NepalEvidenceLevel`).
2. New server-only helper `lib/matches/evidence.ts` → `attachNepalEvidence(matches)` maps each
   match to its level via `cricosCodeForUniversity(university.id)` + `nepalEvidenceLevel(code)`,
   present-when-known (unmapped provider → match unchanged). Carries the WET source URL on the
   object so the client imports nothing heavy.
3. `lib/results/assemble.ts` wraps the computed matches through `attachNepalEvidence`.
4. `components/results/university-matches.tsx` MatchCard renders `m.evidence` as a mono/faint
   `{level} evidence · Nepal ↗` line (links to the DHA tool), shown only when set — mirroring
   the dashboard line, consistent with the anon card's leaner footer.

**OUT OF SCOPE:** the blurred locked-row peek (a different mini-row, not MatchCard — no
evidence there by design); the GS panel (a separate corridor-level surface, not per-provider);
gating on `homeCountry` (MVP is Nepal→Australia only — per the simplicity principle, no
handling for an impossible MVP case; matches the dashboard's existing ungated behaviour).

## Build order (TDD)

1. RED: `tests/matches/evidence.test.ts` — `attachNepalEvidence` attaches `{ level: "Streamlined",
   source }` for a match whose `university.id` resolves (e.g. "sydney" → 00026A → Streamlined,
   verified), and leaves an unmapped match (`u-melb`/unknown) with no `evidence`.
2. RED: `tests/components/university-matches.test.tsx` — a free match with `evidence` renders
   "{level} evidence · Nepal" linking to the source; a match without it renders no evidence line.
3. GREEN minimal per unit; full gate.
4. Confirm goldens byte-identical (the characterization golden snapshots only `runAssessment`
   output, not matches — so unaffected).

## Acceptance criteria

- [x] `attachNepalEvidence` attaches the true level for a resolvable catalogue university and
      omits evidence for an unmapped one (TDD).
- [x] Anon results MatchCard shows `{level} evidence · Nepal ↗` present-when-known / absent-when-unknown (TDD).
- [x] Heavy datasets stay server-side — no resolver import in any `"use client"` module (grep-verified).
- [x] Gate green: typecheck + lint + full test. Goldens byte-identical. `au-cricos-codes.ts` untouched.

## What shipped

- **`lib/matches/types.ts`** — `MatchResult.evidence?: { level: NepalEvidenceLevel; source: string } | null`,
  via `import type` (type-erased → zero client bundle cost).
- **`lib/matches/evidence.ts`** (NEW, server-only) — `attachNepalEvidence(matches)` maps each match to its
  level via `cricosCodeForUniversity(university.id)` + `nepalEvidenceLevel(code)`, carrying the WET source
  URL on the object; present-when-known (unmapped → unchanged).
- **`lib/results/assemble.ts`** — runs the ranked matches through `attachNepalEvidence` (server seam shared by
  both prod callers: the `/api/assess` route and the owned `[id]` page).
- **`components/results/university-matches.tsx`** — MatchCard renders `{evidence.level} evidence · Nepal ↗`
  (mono/faint, links to the DHA tool) only when set; imports `SourceAnchor` but nothing heavy.

## Test evidence (TDD, RED→GREEN)

- RED: `tests/matches/evidence.test.ts` failed on the missing `@/lib/matches/evidence` module; the new
  component test failed because no `Streamlined evidence · Nepal` link rendered.
- GREEN: +7 tests — `tests/matches/evidence.test.ts` (3: attaches Streamlined for sydney/00026A, omits for
  an unmapped id, preserves the rest of the match), `tests/components/university-matches.test.tsx` (2: free
  card shows the level linking to the DHA tool; absent when unset), `tests/results/assemble.test.ts` (2:
  the assemble seam carries Streamlined onto `payload.matches` for an injected sydney catalogue; default
  non-resolving fixtures leave no evidence — present-when-known holds end-to-end).
- Gate: typecheck clean · lint 0 errors (lone pre-existing `build.mjs` warning) · full suite **1297 passed**
  (was 1290) · goldens byte-identical (the characterization golden snapshots only `runAssessment` output,
  not matches — `golden-assessments.json` not in the diff) · `au-cricos-codes.ts` untouched.
- Architecture verified: grep confirms `lib/matches/evidence.ts` is imported only by `lib/results/assemble.ts`,
  which is imported only by server routes / the owned page / `re-score.ts` — no `"use client"` importer, so
  the ~3,300-row directory + evidence datasets never reach the client bundle.

## Status

**In review** — agent-ownable, SHIPPED TDD, gate green. Founder-owned residuals (not blockers): (1) accept → Done;
(2) the owned `[id]` assessment-results page shows evidence on freshly-assembled / re-scored payloads;
assessments stored before this change show it only after a re-score (graceful degradation, matching the
codebase's `rulesVerified?`-style "absent on legacy stored payloads" house pattern); (3) the GS panel
corridor-level evidence treatment, if wanted, is its own surface.

## Resume notes (cold agent)

- The anon MatchCard and `results.tsx` are client components; NEVER import `cricos-lookup` /
  `nepal-evidence-lookup` / the source datasets into them. Resolve server-side in `assemble.ts`,
  pass the level as data on the match.
- Sydney = 00026A = Streamlined, UNSW = 00098G = Streamlined (verified in the source files) —
  use a real catalogue id in the helper test, not the `u-melb`/`u-uts` fixtures (which don't resolve).
- Commit straight to master; explicit `git add` paths; never stage the WIP trio. Only the founder closes to Done.
