# Phase 2: Full profile editor — design spec

**Date:** 2026-06-04
**Status:** Approved (autonomous controller decision per user directive).
**Extends:** Phase 1.5 (`2026-06-04-phase-1-5-signed-in-shell-design.md`).

---

## 1. Goal

Make all 13 profile sections editable inline, not just "personal". When a user opens `/profile` and expands any accordion, they see an editor for that section that saves via `PATCH /api/profile/section`. Updating any section recomputes completeness and (in Phase 4) invalidates the user's plan.

This finishes the profile surface the Claude Design prototype shows. No new DB work.

## 2. Decisions (locked)

1. **Pattern lock-in:** every section editor is a client component in `components/profile/editors/<section>-editor.tsx`. Same `initial` prop shape, same `fetch("/api/profile/section", { method: "PATCH", … })` body shape (envelope: `{ section, patch }`), same idle/saving/saved/error state machine, same notice copy.
2. **Validation:** one Zod schema per section in `lib/validation/profile-section.ts`. The body envelope `ProfileSectionPatchBodySchema` becomes a discriminated union on `section`.
3. **`patchProfileSection`** (repo) already takes `<K extends SectionKey>` — no signature change. It only needs the new sections via the union type.
4. **No partial typing of inputs.** Editors render exactly the fields in their section's TS shape. No dynamic schema introspection.
5. **English/IELTS report upload** is `reportUploaded: boolean` only — actual file upload is Phase 5 territory.

## 3. Editor surfaces (per section)

| Section | Fields shown |
|---|---|
| personal (Phase 1.5) | name, age, intakeIso |
| destination | primary (select), alternates (multi-text) |
| academic | institution (text), degree (select), gradePercent (number 0–100), gradeSystem (select) |
| intended-study | level (select bachelors/masters/doctorate), field (select from `lib/data/fields-of-study.ts`), specialisation (text) |
| english | test (select ielts/pte/toefl), overall (number 0–9 step 0.5), reportUploaded (checkbox) |
| gap | years (number 0–10), reasons (multi-select), evidence (multi-text) |
| work | title (text), years (number 0–20), relevance (select directly-related/related/unrelated), docs (checkbox) |
| finance | total (number), currency (select NPR/USD/AUD), source (select self/parents/loan/scholarship), proofUploaded (checkbox) |
| immigration | refusals (select none/one/multiple), travelled (checkbox) |
| family | situation (select alone/spouse/spouse+kids) |
| career | goal (select pr/jobs/back-home), targetRole (text) |
| scholarships | profile (multi-text) |
| deal-breakers | mustHaves (multi-checkbox set) |

## 4. Discriminated union body schema

```ts
// lib/validation/profile-section.ts
import { z } from "zod";

const personal = z.object({
  name: z.string().min(1).max(120).optional(),
  age: z.number().int().min(15).max(80).optional(),
  intakeIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const destination = z.object({
  primary: z.string().min(1).optional(),
  alternates: z.array(z.string().min(1)).max(5).optional(),
});
// ... 11 more schemas

export const ProfileSectionPatchBodySchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("personal"), patch: personal }),
  z.object({ section: z.literal("destination"), patch: destination }),
  // ... 11 more
]);
```

## 5. Route behavior

`PATCH /api/profile/section` (Phase 1.5) currently calls `patchProfileSection(admin, user.id, "personal", patch)`. Phase 2: same call, but `patch` and `section` types come from the discriminated union — no code change beyond removing the `section: "personal"` literal restriction. The `patchProfileSection` repo function's generic already handles any `SectionKey`.

## 6. Profile page wiring

`app/(app)/profile/page.tsx` (Phase 1.5) currently renders `<PersonalEditor>` for the `personal` accordion and "Editing coming in Phase 2" for the others. Phase 2 changes that conditional to a dispatch:

```tsx
const EDITORS: Record<SectionKey, React.ComponentType<{ initial: unknown }>> = {
  personal: PersonalEditor,
  destination: DestinationEditor,
  academic: AcademicEditor,
  // ... 10 more
};

// inside the SECTION_KEYS.map:
{(() => {
  const Editor = EDITORS[key];
  return <Editor initial={sections[key] ?? {}} />;
})()}
```

Each editor's prop shape is the section's TS type (`ProfileSections[K]`).

## 7. Testing

Each editor gets a Vitest + RTL test covering: renders initial values, PATCHes on save, shows success notice. Same pattern as `tests/components/profile/personal-editor.test.tsx`.

The validation tests in `tests/validation/profile-section.test.ts` extend with at least one positive + one negative case per new section (12 × 2 = 24 new cases).

## 8. Acceptance

- All 13 sections render an editor when expanded.
- Saving any section updates `profiles.sections.<key>` and recomputes `profiles.completeness`.
- Validation rejects out-of-range values per section (e.g. `english.overall > 9` returns 422).
- 200+ new test cases added; full suite green; typecheck + lint + build clean.

## 9. Out of scope (still)

- File uploads (English report, financial proof, work docs) — Phase 5.
- Triggering plan regeneration on profile change — Phase 4.
- Multi-destination assessment trigger on profile change — implicit (recomputed only on `/assess` rerun).
