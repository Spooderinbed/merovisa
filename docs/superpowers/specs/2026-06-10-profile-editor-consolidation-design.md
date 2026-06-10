# Profile editor consolidation — design spec

**Date:** 2026-06-10
**Fix order:** #10 (last item of the 10-item order in `docs/audits/2026-06-10-visual-audit-and-fix-order.md`)
**Status:** grouping approved by user 2026-06-10; implementation starts only after slice 9.5 (CSS reset layering) is merged — both touch visual behavior, and the corrected cascade is the baseline this slice must be reviewed against. Strictly sequential, never parallel with 9.5.

## Problem

The profile editor presents 13 single-field-cluster sections, several of which are one or two fields. Audit findings: navigation fatigue (13 rows for ~30 fields), three comma-separated free-text fields that should be structured input, "Grade system" as free text inviting typos into an enum, and the intake date misfiled under Personal information. Separately parked from the destination-honesty slice: the destination editor still offers all six countries as if supported, and writes `"us"` where the scoring `Destination` type says `"usa"`.

## Approved grouping (13 → 8)

Editor-level regroup only. **Storage keys do not change** — `SECTION_KEYS`, the JSONB shapes in `lib/profiles/sections.ts`, `REQUIRED_FIELDS`, the completeness math, and `sectionsToStudentProfile` are all untouched. A group is a presentation unit over one or more storage sections.

| Group (display name) | Storage sections | Notes |
|---|---|---|
| About you | `personal` (name, age) + `family` | intake date moves OUT (see below) |
| Destination & intake | `destination` + `personal.intakeIso` + `deal-breakers` | honesty fix lands here |
| Academic background | `academic` | grade system becomes a select |
| Study & career goals | `intended-study` + `career` | |
| English proficiency | `english` | unchanged fields |
| Work & study gap | `work` + `gap` | evidence becomes chips |
| Money & scholarships | `finance` + `scholarships` | profile tags become chips |
| Visa history | `immigration` | unchanged fields |

## Decisions

1. **Multi-section group editors save per dirty storage section.** The save API stays `PATCH /api/profile/section { section, patch }`. A group editor tracks which member sections changed and dispatches one PATCH per dirty section (sequentially); the shared `useSectionSave` lifecycle is extended (or composed) so the user sees a single Saved/error notice for the group — error if any PATCH fails.
2. **Intake date** renders inside Destination & intake but keeps its storage home (`personal.intakeIso`); its PATCH targets `personal`. No data migration.
3. **Group row status** (the accordion summary chip): complete when every member storage section is complete per the existing per-section completeness; partial when any member is partial or some-but-not-all complete; otherwise not started. The completeness **ring** keeps its existing math over storage sections — only row presentation groups.
4. **Row summaries** compose the existing `summarize(key, sections)` outputs of member sections, separated by " · ", skipping empty ones.
5. **Structured inputs replace free text:**
   - `academic.gradeSystem`: select over the `GradeSystem` enum values (labels humanized).
   - `gap.evidence`: chip input (type, Enter/comma adds a chip, click removes) writing `string[]` — same storage shape as today.
   - `scholarships.profile`: same chip input, `string[]`.
   - `deal-breakers.mustHaves`: same chip input, `string[]`.
   - `career.targetRole` stays free text (genuinely free-form).
6. **Destination editor honesty (parked follow-up lands here):** primary destination offers only `SUPPORTED_DESTINATIONS` + `not-sure` as selectable; the other countries render disabled with the wizard's "Coming soon" treatment (`isDestinationSupported` from `lib/scoring/types.ts` — same source of truth as the wizard). Alternates get the same treatment. **Id normalization:** the editor currently writes `"us"`; scoring uses `"usa"`. On load, map stored `"us"` → `"usa"` (read-time shim); on save, always write scoring ids. No bulk migration — rows self-heal on next save.
7. **Component shape:** 8 group editor files under `components/profile/editors/` composing the existing field controls (move, don't rewrite); editor files emptied by the merge are deleted in the same slice (the orphans this change creates). The profile page accordion renders 8 rows. The chip input is one new small shared component.

## Out of scope

- The wizard (separate flow, already honest after fix #1).
- Storage schema, Zod section schemas' shapes (`string[]` stays `string[]`), scoring, completeness math.
- Any copy changes to sourced content.

## Acceptance criteria (tests)

1. Profile page renders exactly 8 section rows with the approved names; every field reachable before is reachable after (field census test per group).
2. A group containing two storage sections saves only the dirty section's PATCH (mock fetch: one call), and saves two PATCHes when both changed; one Saved notice either way; ring/summaries refresh via the existing `router.refresh()` lifecycle.
3. Intake date edited under Destination & intake persists to `personal.intakeIso` (PATCH body asserts section "personal").
4. Group status: member sections complete+not-started → partial; all complete → complete.
5. Grade system renders a select with only `GradeSystem` values — no free text path.
6. Chip inputs round-trip `string[]` (add, remove, save payload).
7. Destination editor: unsupported countries disabled with "Coming soon"; stored `"us"` loads as `"usa"` and saves as `"usa"`; supported + not-sure selectable.
8. Completeness ring math unchanged (existing tests stay green untouched).
