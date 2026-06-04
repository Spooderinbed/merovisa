# Phase 2: Full profile editor — Implementation Plan

> Use superpowers:subagent-driven-development to execute.

**Goal:** Make all 12 remaining profile sections editable inline (personal already done in Phase 1.5).

**Architecture:** New Zod schema per section in `lib/validation/profile-section.ts` (discriminated union envelope). Each editor is a client component at `components/profile/editors/<section>-editor.tsx` following the PersonalEditor pattern. Profile page dispatches editor by section key.

**Tech Stack:** Next.js 16, React 19, TS strict, Tailwind tokens, Vitest + RTL, Zod.

## Background

- Spec: `docs/superpowers/specs/2026-06-04-phase-2-full-profile-editor-design.md`
- Pattern source: `components/profile/editors/personal-editor.tsx` and `tests/components/profile/personal-editor.test.tsx`
- ProfileSections shape: `lib/profiles/sections.ts`
- Existing API route: `app/api/profile/section/route.ts` (Phase 1.5 — only minor change needed)
- Apostrophes in JSX text → `&apos;`. Existing tokens only. `vi.hoisted` for mocks.

## File structure

```
lib/validation/profile-section.ts          REPLACE — all 13 schemas + discriminated union envelope
components/profile/editors/
├── personal-editor.tsx                    (existing)
├── destination-editor.tsx                 NEW
├── academic-editor.tsx                    NEW
├── intended-study-editor.tsx              NEW
├── english-editor.tsx                     NEW
├── gap-editor.tsx                         NEW
├── work-editor.tsx                        NEW
├── finance-editor.tsx                     NEW
├── immigration-editor.tsx                 NEW
├── family-editor.tsx                      NEW
├── career-editor.tsx                      NEW
├── scholarships-editor.tsx                NEW
└── deal-breakers-editor.tsx               NEW
app/(app)/profile/page.tsx                 MODIFY — dispatch table for editors
tests/components/profile/<editor>.test.tsx NEW per editor
tests/validation/profile-section.test.ts   MODIFY — add cases per section
```

---

## Task 1: Discriminated-union body schema

**Files:**
- Replace: `lib/validation/profile-section.ts`
- Modify:  `tests/validation/profile-section.test.ts` (extend with new sections)

### Step 1: Replace `lib/validation/profile-section.ts`

```ts
import { z } from "zod";

const PersonalPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  age: z.number().int().min(15).max(80).optional(),
  intakeIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PersonalSectionPatch = z.infer<typeof PersonalPatch>;
export const PersonalSectionPatchSchema = PersonalPatch;

const DestinationPatch = z.object({
  primary: z.string().min(1).max(40).optional(),
  alternates: z.array(z.string().min(1).max(40)).max(5).optional(),
});
const AcademicPatch = z.object({
  institution: z.string().min(1).max(200).optional(),
  degree: z.enum(["high-school","bachelors","masters","doctorate"]).optional(),
  gradePercent: z.number().min(0).max(100).optional(),
  gradeSystem: z.string().min(1).max(80).optional(),
});
const IntendedStudyPatch = z.object({
  level: z.enum(["bachelors","masters","doctorate"]).optional(),
  field: z.string().min(1).max(80).optional(),
  specialisation: z.string().min(1).max(160).optional(),
});
const EnglishPatch = z.object({
  test: z.enum(["ielts","pte","toefl"]).optional(),
  overall: z.number().min(0).max(9).optional(),
  reportUploaded: z.boolean().optional(),
});
const GapPatch = z.object({
  years: z.number().int().min(0).max(20).optional(),
  reasons: z.array(z.string().min(1).max(60)).max(5).optional(),
  evidence: z.array(z.string().min(1).max(160)).max(5).optional(),
});
const WorkPatch = z.object({
  title: z.string().min(1).max(120).optional(),
  years: z.number().min(0).max(40).optional(),
  relevance: z.enum(["directly-related","related","unrelated"]).optional(),
  docs: z.boolean().optional(),
});
const FinancePatch = z.object({
  total: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.enum(["NPR","USD","AUD","INR","BDT","PKR","NGN"]).optional(),
  source: z.enum(["self","parents","loan","scholarship","mixed"]).optional(),
  proofUploaded: z.boolean().optional(),
});
const ImmigrationPatch = z.object({
  refusals: z.enum(["none","one","multiple"]).optional(),
  travelled: z.boolean().optional(),
});
const FamilyPatch = z.object({
  situation: z.enum(["alone","spouse","spouse-and-kids","other"]).optional(),
});
const CareerPatch = z.object({
  goal: z.enum(["permanent-residency","jobs-abroad","back-home","experience"]).optional(),
  targetRole: z.string().min(1).max(120).optional(),
});
const ScholarshipsPatch = z.object({
  profile: z.array(z.string().min(1).max(80)).max(8).optional(),
});
const DealBreakersPatch = z.object({
  mustHaves: z.array(z.string().min(1).max(80)).max(10).optional(),
});

export const ProfileSectionPatchBodySchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("personal"), patch: PersonalPatch }),
  z.object({ section: z.literal("destination"), patch: DestinationPatch }),
  z.object({ section: z.literal("academic"), patch: AcademicPatch }),
  z.object({ section: z.literal("intended-study"), patch: IntendedStudyPatch }),
  z.object({ section: z.literal("english"), patch: EnglishPatch }),
  z.object({ section: z.literal("gap"), patch: GapPatch }),
  z.object({ section: z.literal("work"), patch: WorkPatch }),
  z.object({ section: z.literal("finance"), patch: FinancePatch }),
  z.object({ section: z.literal("immigration"), patch: ImmigrationPatch }),
  z.object({ section: z.literal("family"), patch: FamilyPatch }),
  z.object({ section: z.literal("career"), patch: CareerPatch }),
  z.object({ section: z.literal("scholarships"), patch: ScholarshipsPatch }),
  z.object({ section: z.literal("deal-breakers"), patch: DealBreakersPatch }),
]);
export type ProfileSectionPatchBody = z.infer<typeof ProfileSectionPatchBodySchema>;
```

### Step 2: Extend `tests/validation/profile-section.test.ts`

Keep all existing personal tests. Add one positive + one negative case per new section:

```ts
describe("ProfileSectionPatchBodySchema — other sections", () => {
  const cases: Array<[string, unknown, boolean]> = [
    // destination
    [{ section: "destination", patch: { primary: "australia" } }, true],
    [{ section: "destination", patch: { primary: "" } }, false],
    // academic
    [{ section: "academic", patch: { institution: "TU", gradePercent: 72 } }, true],
    [{ section: "academic", patch: { gradePercent: 150 } }, false],
    // intended-study
    [{ section: "intended-study", patch: { level: "masters", field: "cs" } }, true],
    [{ section: "intended-study", patch: { level: "phd" } }, false],
    // english
    [{ section: "english", patch: { test: "ielts", overall: 7 } }, true],
    [{ section: "english", patch: { overall: 10 } }, false],
    // gap
    [{ section: "gap", patch: { years: 2, reasons: ["worked"] } }, true],
    [{ section: "gap", patch: { years: -1 } }, false],
    // work
    [{ section: "work", patch: { title: "Junior Dev", years: 1 } }, true],
    [{ section: "work", patch: { relevance: "tangentially" } }, false],
    // finance
    [{ section: "finance", patch: { total: 4_500_000, currency: "NPR", source: "loan" } }, true],
    [{ section: "finance", patch: { currency: "XYZ" } }, false],
    // immigration
    [{ section: "immigration", patch: { refusals: "none", travelled: true } }, true],
    [{ section: "immigration", patch: { refusals: "many" } }, false],
    // family
    [{ section: "family", patch: { situation: "alone" } }, true],
    [{ section: "family", patch: { situation: "spouse++" } }, false],
    // career
    [{ section: "career", patch: { goal: "permanent-residency" } }, true],
    [{ section: "career", patch: { goal: "rich" } }, false],
    // scholarships
    [{ section: "scholarships", patch: { profile: ["merit", "minority"] } }, true],
    [{ section: "scholarships", patch: { profile: ["", "x"] } }, false],
    // deal-breakers
    [{ section: "deal-breakers", patch: { mustHaves: ["PR-friendly"] } }, true],
    [{ section: "deal-breakers", patch: { mustHaves: [""] } }, false],
  ].map(([body, expected]) => [JSON.stringify(body), body, expected] as [string, unknown, boolean]);

  for (const [label, body, expected] of cases) {
    it(`${expected ? "accepts" : "rejects"} ${label}`, () => {
      expect(ProfileSectionPatchBodySchema.safeParse(body).success).toBe(expected);
    });
  }
});
```

NOTE: the `personal` tests in the existing file should also be updated to ensure they still pass against the new discriminated-union envelope. Keep their bodies the same; they should already be in the envelope shape `{ section: "personal", patch: {...} }`.

### Step 3: Run + commit

```bash
npm test -- tests/validation/profile-section.test.ts
git add lib/validation/profile-section.ts tests/validation/profile-section.test.ts
git commit -m "feat: extend profile section schema to all 13 sections"
```

---

## Task 2: 6 editors — destination, academic, intended-study, english, gap, work

For each editor, follow the PersonalEditor pattern exactly:

1. `"use client"`, `useState` for fields + status, PATCH `/api/profile/section` with `{ section, patch }`, success/error notice.
2. Test: renders initial values, PATCHes on save, shows success notice.

**Files (one impl + one test per section):**
- `components/profile/editors/destination-editor.tsx` — primary (select with options: Australia/Canada/UK/Germany/US/Ireland), alternates (comma-separated text field that splits on `,`).
- `components/profile/editors/academic-editor.tsx` — institution (text), degree (select: High school / Bachelor's / Master's / Doctorate), gradePercent (number 0–100), gradeSystem (text).
- `components/profile/editors/intended-study-editor.tsx` — level (select: Bachelor's / Master's / Doctorate), field (text — Phase 3 will swap to a select from `lib/data/fields-of-study.ts`), specialisation (text).
- `components/profile/editors/english-editor.tsx` — test (select: IELTS / PTE / TOEFL), overall (number 0–9 step 0.5), reportUploaded (checkbox).
- `components/profile/editors/gap-editor.tsx` — years (number 0–20), reasons (multi-checkbox set: worked / further-study / family / health / other), evidence (comma-separated text).
- `components/profile/editors/work-editor.tsx` — title (text), years (number 0–40), relevance (select), docs (checkbox).

Each editor:
- Accepts `initial: NonNullable<ProfileSections[<key>]>` (or `{}` shape)
- Builds a patch dict from non-empty fields (mirror PersonalEditor's `patch` construction)
- POSTs body `{ section: "<section>", patch }`
- Same `idle | saving | saved | error` state

For each, the test mocks `fetch` and asserts the body shape includes the right `section` value.

Run target tests after implementing each editor. Commit each editor + its test in **one combined commit** at the end of this task with the message:
```
feat: profile editors — destination, academic, intended-study, english, gap, work
```

---

## Task 3: 6 editors — finance, immigration, family, career, scholarships, deal-breakers

Same pattern. Specifics:
- `finance-editor.tsx` — total (number), currency (select NPR/USD/AUD/INR/BDT/PKR/NGN), source (select self/parents/loan/scholarship/mixed), proofUploaded (checkbox).
- `immigration-editor.tsx` — refusals (select none/one/multiple), travelled (checkbox).
- `family-editor.tsx` — situation (select alone/spouse/spouse-and-kids/other).
- `career-editor.tsx` — goal (select permanent-residency/jobs-abroad/back-home/experience), targetRole (text).
- `scholarships-editor.tsx` — profile (comma-separated text → array).
- `deal-breakers-editor.tsx` — mustHaves (multi-checkbox set: PR-friendly / work-rights / dependants-allowed / affordable / english-only / regional-bonus).

One combined commit:
```
feat: profile editors — finance, immigration, family, career, scholarships, deal-breakers
```

---

## Task 4: Wire editors into `/profile` + verification

### Step 1: Update `app/(app)/profile/page.tsx`

Replace the inline `key === "personal" ? <PersonalEditor … /> : <p>Editing coming in Phase 2</p>` conditional with a dispatch table:

```tsx
import { PersonalEditor } from "@/components/profile/editors/personal-editor";
import { DestinationEditor } from "@/components/profile/editors/destination-editor";
// ... 11 more imports

const EDITORS: Record<SectionKey, React.ComponentType<{ initial: any }>> = {
  "personal": PersonalEditor,
  "destination": DestinationEditor,
  "academic": AcademicEditor,
  "intended-study": IntendedStudyEditor,
  "english": EnglishEditor,
  "gap": GapEditor,
  "work": WorkEditor,
  "finance": FinanceEditor,
  "immigration": ImmigrationEditor,
  "family": FamilyEditor,
  "career": CareerEditor,
  "scholarships": ScholarshipsEditor,
  "deal-breakers": DealBreakersEditor,
};

// Inside the SECTION_KEYS.map:
{(() => {
  const Editor = EDITORS[key];
  return <Editor initial={sections[key] ?? {}} />;
})()}
```

Replace `any` with `unknown` if eslint complains; cast inside each editor.

### Step 2: Full verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

### Step 3: Commit + milestone

```bash
git add app/(app)/profile/page.tsx
git commit -m "feat: wire all 13 section editors into /profile"
git commit --allow-empty -m "chore: Phase 2 full profile editor complete"
```
