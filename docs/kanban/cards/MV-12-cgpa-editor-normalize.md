# MV-12 — Fix CGPA entry in the profile academic editor

**Status:** **Done (founder-gated 2026-06-20)** — gate green; committed to master.
**Owner:** agent · **Priority:** P2 (live correctness/trust bug)

## The bug (promoted from a background-task chip)

The signed-in profile academic editor (`components/profile/editors/academic-editor.tsx`)
has a "Grade percent" number field **and** a "Grade system" select offering CGPA. A
user entering CGPA `3.5` on a 4.0 scale stored `academic: { gradePercent: 3.5,
gradeSystem: "cgpa-4" }` **raw**, via `PATCH /api/profile/section` →
`ProfileSectionPatchBodySchema` → `patchProfileSection` (which merged the patch raw).

This violated the MV-01 invariant (`gradePercent` is always a true 0–100 percentage,
normalized at the boundary, never re-normalized downstream). The two read paths then
diverged:

- **Verdict path** (`lib/scoring/from-sections.ts`) normalized `3.5` via the stored
  `gradeSystem` → 87.5% (correct verdict).
- **Matches path** (`lib/matches/from-sections.ts:61`) read `gradePercent` **raw** →
  treated 3.5 as 3.5% → **every program collapsed to "reach"**.

So a signed-in student who entered a CGPA saw a reasonable verdict but an all-"reach"
match list — an internal contradiction in a trust-first product.

## The fix (option a — normalize at the save boundary)

Mirror the canonical contract `profileSectionsFromAssessment` already enforces for the
wizard path: normalize the grade to a true percentage **at the server-side save
boundary** and **never persist `gradeSystem`**.

- New pure helper `lib/profiles/normalize-academic.ts` — `normalizeAcademicPatch(patch)`:
  `gradePercent = normalizeGradeToPercentage(gradePercent, gradeSystem ?? "percentage")`,
  and `gradeSystem` is set to `undefined` (not merely omitted) so the
  `patchProfileSection` merge (`{ ...stored, ...patch }`) **overwrites** any stale
  system on a pre-fix row — the JSONB write then drops the undefined key (self-healing
  on next save). This sidesteps the double-normalization trap.
- Wired as a Zod `.transform` on `AcademicPatch` in `lib/validation/profile-section.ts`,
  so the single boundary the route already parses through is canonical for **every**
  client. F16-safe: confirmed no client component imports the validation module or
  `grade-normalize` (the scoring rule stays server-side).

### Why not the alternatives
- **Option c (normalize in the matches adapter):** leaves the data in two shapes and
  would double-normalize anon-origin rows (which already store a normalized percentage
  with `gradeSystem` unset). Rejected.
- **Editor relabel (option b):** the field is still labelled "Grade percent" next to a
  CGPA selector — now *harmless to correctness* (the server normalizes whatever system
  is chosen), but cosmetically misleading. Left as an optional copy follow-up, not
  bundled (copy is founder-reviewed).

## Acceptance criteria

- [x] A CGPA entered in the editor is stored as a true percentage; `gradeSystem` is
      never persisted.
- [x] The same value reaches both the verdict path and the matches adapter as 87.5%.
- [x] Regression proving a CGPA in the editor yields non-all-reach matches (and a
      contrast test proving the raw value WOULD collapse to all-reach).
- [x] No scorer/golden change (normalization happens at the write boundary, not the
      engine); the existing schema consumers (repo, from-assessment) untouched.

## Test plan / evidence

- `tests/profiles/normalize-academic.test.ts` (6): CGPA-4 3.5→87.5, CGPA-10 8→80,
  percentage pass-through, `gradeSystem` always cleared (incl. no-grade patch).
- `tests/validation/profile-section-academic.test.ts` (3): schema parse normalizes the
  submitted CGPA + drops `gradeSystem`; percentage unchanged; out-of-range still rejected.
- `tests/matches/cgpa-editor-regression.test.ts` (3): editor submission → matcher sees
  87.5; ≥1 non-reach match; contrast — raw 3.5 collapses every match to reach.
- Gate: `typecheck` clean · `lint` 0 errors · full suite **1140 passed** (+12).

## Files

- `lib/profiles/normalize-academic.ts` (new) — boundary normalizer.
- `lib/validation/profile-section.ts` — `AcademicPatch.transform(normalizeAcademicPatch)`.
- Tests as above.

## Deferred (noted, not in this slice)

- Relabel the editor field "Grade percent" → "Grade" + helper text (cosmetic clarity;
  founder-reviewed copy).
- One-time data migration of any pre-fix rows (≤5 profiles live); re-saving the academic
  section self-heals them via the explicit `gradeSystem` clear.
