# Phase 5A: Documents Upload + OCR Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/documents` page where users upload document images, Tesseract.js extracts structured data, and the profile + assessment verdict update automatically.

**Architecture:** Multipart upload hits a Next.js API route → sharp preprocesses the image → Tesseract.js OCR extracts text → a kind-specific regex parser produces structured data → the profile is patched → a unified cascade re-scores the assessment, regenerates plan items, and recomputes completeness. All 19 document kinds have cards on the page; 9 have parsers in 5A; the rest are store-only.

**Tech Stack:** Next.js 16 (App Router), Supabase (Storage + PostgreSQL + RLS), Tesseract.js (CDN WASM), sharp, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-06-04-phase-5-documents-and-ocr-design.md`

---

## File Map

### New files
```
lib/documents/types.ts                    — DocumentKind type, DOCUMENT_KINDS const, kind metadata
lib/documents/ocr.ts                      — sharp preprocessing + Tesseract.js wrapper
lib/documents/parsers/ielts.ts            — IELTS scorecard parser
lib/documents/parsers/pte.ts              — PTE scorecard parser
lib/documents/parsers/toefl.ts            — TOEFL score report parser
lib/documents/parsers/passport.ts         — Passport bio page parser
lib/documents/parsers/transcript.ts       — Bachelor's transcript parser
lib/documents/parsers/bank-statement.ts   — Bank statement parser
lib/documents/parsers/employment-letter.ts — Employment letter parser
lib/documents/parsers/salary-slip.ts      — Salary slip parser
lib/documents/parsers/offer-letter.ts     — Offer letter parser
lib/documents/parsers/registry.ts         — Parser lookup by kind
lib/documents/profile-mapping.ts          — kind → profile section + field mapper
lib/documents/repo.ts                     — documents table CRUD
lib/matches/from-sections.ts              — sectionsToMatchInputs (extracted from dupes)
lib/scoring/from-sections.ts              — sectionsToStudentProfile (new reverse mapper)
lib/assessments/re-score.ts               — reScoreAssessment (cascade trigger)
app/api/documents/upload/route.ts         — POST multipart upload
app/api/documents/[id]/route.ts           — DELETE document
app/(app)/documents/page.tsx              — /documents page (server component)
components/documents/document-card.tsx     — single document card (client component)
components/documents/document-group.tsx    — section group wrapper
supabase/migrations/YYYYMMDD_add_documents.sql — documents table + RLS + storage bucket

tests/documents/parsers/ielts.test.ts
tests/documents/parsers/pte.test.ts
tests/documents/parsers/toefl.test.ts
tests/documents/parsers/passport.test.ts
tests/documents/parsers/transcript.test.ts
tests/documents/parsers/bank-statement.test.ts
tests/documents/parsers/employment-letter.test.ts
tests/documents/parsers/salary-slip.test.ts
tests/documents/parsers/offer-letter.test.ts
tests/documents/profile-mapping.test.ts
tests/documents/repo.test.ts
tests/matches/from-sections.test.ts
tests/scoring/from-sections.test.ts
tests/assessments/re-score.test.ts
```

### Modified files
```
lib/profiles/sections.ts                  — add per-band fields to english interface
lib/validation/profile-section.ts         — extend EnglishPatch Zod schema
components/profile/editors/english-editor.tsx — display per-band scores
components/layout/app-bar.tsx             — add Documents nav link
app/(app)/dashboard/page.tsx              — wire documents stat into StatsRow
app/(app)/matches/page.tsx                — use sectionsToMatchInputs()
lib/plan/invalidate.ts                    — use sectionsToMatchInputs()
app/api/profile/section/route.ts          — add reScoreAssessment() to cascade
app/api/assess/route.ts                   — add reScoreAssessment() to signed-in path
package.json                              — add tesseract.js dependency
```

---

## Task 1: Install dependencies + create document types

**Files:**
- Create: `lib/documents/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Install tesseract.js**

```bash
npm install tesseract.js
```

Expected: `added X packages` — tesseract.js appears in package.json dependencies. Note: `sharp` is already available in Vercel's Node.js runtime and does not need a manual install for production. For local dev:

```bash
npm install sharp
```

- [ ] **Step 2: Create document types and metadata**

```typescript
// lib/documents/types.ts
export const DOCUMENT_KINDS = [
  "passport", "birth-certificate", "national-id",
  "slc-see", "plus-two", "bachelors-transcript", "masters-transcript",
  "ielts", "pte", "toefl",
  "bank-statement", "loan-sanction", "sponsor-income",
  "employment-letter", "salary-slip",
  "offer-letter", "coe", "oshc", "medical", "other",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentKindMeta {
  kind: DocumentKind;
  label: string;
  group: "identity" | "academic" | "english" | "financial" | "employment" | "visa" | "other";
  profileSection: string | null;
  hasParser: boolean;
}

export const DOCUMENT_META: DocumentKindMeta[] = [
  { kind: "passport",            label: "Passport bio page",           group: "identity",   profileSection: "personal",       hasParser: true },
  { kind: "birth-certificate",   label: "Birth Certificate",           group: "identity",   profileSection: "personal",       hasParser: false },
  { kind: "national-id",         label: "Citizenship / National ID",   group: "identity",   profileSection: null,             hasParser: false },
  { kind: "slc-see",             label: "SLC/SEE Certificate (10th)",  group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "plus-two",            label: "+2 / Higher Secondary",       group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "bachelors-transcript", label: "Bachelor's Transcript",      group: "academic",   profileSection: "academic",       hasParser: true },
  { kind: "masters-transcript",  label: "Master's Transcript",        group: "academic",   profileSection: "academic",       hasParser: false },
  { kind: "ielts",               label: "IELTS Scorecard",             group: "english",    profileSection: "english",        hasParser: true },
  { kind: "pte",                 label: "PTE Academic Scorecard",      group: "english",    profileSection: "english",        hasParser: true },
  { kind: "toefl",               label: "TOEFL iBT Score Report",      group: "english",    profileSection: "english",        hasParser: true },
  { kind: "bank-statement",      label: "Bank Statement",              group: "financial",  profileSection: "finance",        hasParser: true },
  { kind: "loan-sanction",       label: "Education Loan Sanction Letter", group: "financial", profileSection: "finance",      hasParser: false },
  { kind: "sponsor-income",      label: "Sponsor Income Tax Return",   group: "financial",  profileSection: "finance",        hasParser: false },
  { kind: "employment-letter",   label: "Employment Letter",           group: "employment", profileSection: "work",           hasParser: true },
  { kind: "salary-slip",         label: "Salary Slip",                 group: "employment", profileSection: "work",           hasParser: true },
  { kind: "offer-letter",        label: "University Offer Letter",     group: "visa",       profileSection: "intended-study", hasParser: true },
  { kind: "coe",                 label: "Confirmation of Enrolment",   group: "visa",       profileSection: null,             hasParser: false },
  { kind: "oshc",                label: "Health Cover (OSHC) Policy",  group: "visa",       profileSection: null,             hasParser: false },
  { kind: "medical",             label: "Medical Exam Results",        group: "visa",       profileSection: null,             hasParser: false },
  { kind: "other",               label: "Other Document",              group: "other",      profileSection: null,             hasParser: false },
];

export const GROUP_LABELS: Record<DocumentKindMeta["group"], string> = {
  identity: "Identity",
  academic: "Academic",
  english: "English Proficiency",
  financial: "Financial",
  employment: "Employment",
  visa: "Visa",
  other: "Other",
};

export const GROUPS = ["identity", "academic", "english", "financial", "employment", "visa", "other"] as const;
```

- [ ] **Step 3: Commit**

```bash
git add lib/documents/types.ts package.json package-lock.json
git commit -m "feat(phase5a): add document types + install tesseract.js"
```

---

## Task 2: Database migration — documents table + Storage bucket

**Files:**
- Create: `supabase/migrations/YYYYMMDD_add_documents.sql`

- [ ] **Step 1: Create migration file**

Use the current date for the filename prefix (e.g. `20260604060000`).

```sql
-- Documents table
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in (
    'passport','birth-certificate','national-id',
    'slc-see','plus-two','bachelors-transcript','masters-transcript',
    'ielts','pte','toefl',
    'bank-statement','loan-sanction','sponsor-income',
    'employment-letter','salary-slip',
    'offer-letter','coe','oshc','medical','other'
  )),
  file_path      text not null,
  file_size      integer not null,
  original_name  text not null,
  extracted_data jsonb,
  profile_section text,
  status         text not null default 'processing'
                 check (status in ('processing','extracted','failed','stored')),
  created_at     timestamptz not null default now(),
  unique (owner, kind)
);

-- RLS
alter table public.documents enable row level security;

create policy "Users read own documents"
  on public.documents for select
  using (auth.uid() = owner);

create policy "Users delete own documents"
  on public.documents for delete
  using (auth.uid() = owner);

create policy "Service inserts documents"
  on public.documents for insert
  with check (true);

-- Index
create index documents_owner_idx on public.documents (owner);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Storage policies: users access only their own folder
create policy "Users read own document files"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own document files"
  on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Service uploads document files"
  on storage.objects for insert
  with check (bucket_id = 'documents');
```

- [ ] **Step 2: Apply migration via Supabase MCP or CLI**

```bash
npx supabase db push
```

Or apply via the Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(phase5a): add documents table + storage bucket migration"
```

---

## Task 3: Extend English profile section with per-band scores

**Files:**
- Modify: `lib/profiles/sections.ts`
- Modify: `lib/validation/profile-section.ts`
- Test: `tests/validation/profile-section-english.test.ts` (new)

- [ ] **Step 1: Write tests for the extended English schema**

```typescript
// tests/validation/profile-section-english.test.ts
import { describe, test, expect } from "vitest";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

describe("English section patch with per-band scores", () => {
  test("accepts per-band scores", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 },
    });
    expect(result.success).toBe(true);
  });

  test("rejects band score above 9", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: 10 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects band score below 0", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { listening: -1 },
    });
    expect(result.success).toBe(false);
  });

  test("accepts mix of overall and band scores", () => {
    const result = ProfileSectionPatchBodySchema.safeParse({
      section: "english",
      patch: { test: "ielts", overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0, reportUploaded: true },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/validation/profile-section-english.test.ts
```

Expected: FAIL — `listening` not recognized by current EnglishPatch schema.

- [ ] **Step 3: Update ProfileSections interface**

In `lib/profiles/sections.ts`, change the `english` field:

```typescript
// lib/profiles/sections.ts — replace the english line
english?: { test?: "ielts" | "pte" | "toefl"; overall?: number; listening?: number; reading?: number; writing?: number; speaking?: number; reportUploaded?: boolean };
```

- [ ] **Step 4: Update EnglishPatch Zod schema**

In `lib/validation/profile-section.ts`, replace the `EnglishPatch`:

```typescript
const EnglishPatch = z.object({
  test: z.enum(["ielts","pte","toefl"]).optional(),
  overall: z.number().min(0).max(9).optional(),
  listening: z.number().min(0).max(9).optional(),
  reading: z.number().min(0).max(9).optional(),
  writing: z.number().min(0).max(9).optional(),
  speaking: z.number().min(0).max(9).optional(),
  reportUploaded: z.boolean().optional(),
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/validation/profile-section-english.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add lib/profiles/sections.ts lib/validation/profile-section.ts tests/validation/profile-section-english.test.ts
git commit -m "feat(phase5a): extend English section with per-band scores"
```

---

## Task 4: Extract sectionsToMatchInputs shared function

**Files:**
- Create: `lib/matches/from-sections.ts`
- Test: `tests/matches/from-sections.test.ts`
- Modify: `app/(app)/matches/page.tsx`
- Modify: `lib/plan/invalidate.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/matches/from-sections.test.ts
import { describe, test, expect } from "vitest";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToMatchInputs", () => {
  const policy = { nepalAssessmentLevel: "L3" as const };

  test("maps full profile to MatchInputs", () => {
    const sections: ProfileSections = {
      academic: { gradePercent: 75 },
      english: { test: "ielts", overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 },
      finance: { total: 3_000_000, currency: "NPR" },
      "intended-study": { field: "computer-science" },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userGradePercent).toBe(75);
    expect(result.userEnglishOverall).toBe(7.0);
    expect(result.userEnglishBand).toBe(6.5);
    expect(result.userBudgetAud).toBeCloseTo(30000, -2);
    expect(result.userField).toBe("computer-science");
    expect(result.policy.nepalAssessmentLevel).toBe("L3");
  });

  test("uses overall as band proxy when per-band missing", () => {
    const sections: ProfileSections = {
      english: { test: "ielts", overall: 6.5 },
    };
    const result = sectionsToMatchInputs(sections, policy);
    expect(result.userEnglishBand).toBe(6.5);
  });

  test("returns nulls for empty sections", () => {
    const result = sectionsToMatchInputs({}, policy);
    expect(result.userGradePercent).toBeNull();
    expect(result.userEnglishOverall).toBeNull();
    expect(result.userEnglishBand).toBeNull();
    expect(result.userBudgetAud).toBeNull();
    expect(result.userField).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/matches/from-sections.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement sectionsToMatchInputs**

```typescript
// lib/matches/from-sections.ts
import type { MatchInputs } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

export function sectionsToMatchInputs(
  sections: ProfileSections,
  policy: { nepalAssessmentLevel: "L2" | "L3" },
): MatchInputs {
  const english = sections.english;
  const hasBands = english?.listening != null && english?.reading != null
    && english?.writing != null && english?.speaking != null;

  const minBand = hasBands
    ? Math.min(english!.listening!, english!.reading!, english!.writing!, english!.speaking!)
    : english?.overall ?? null;

  return {
    userGradePercent: sections.academic?.gradePercent ?? null,
    userEnglishOverall: english?.overall ?? null,
    userEnglishBand: minBand != null && minBand > 0 ? minBand : null,
    userBudgetAud: budgetToAud(sections.finance?.total ?? null, sections.finance?.currency ?? null),
    userField: sections["intended-study"]?.field ?? null,
    policy,
  };
}

function budgetToAud(total: number | null, currency: string | null): number | null {
  if (total == null) return null;
  switch (currency) {
    case "AUD": return total;
    case "USD": return total * 1.5;
    case "NPR": return total / 100;
    case "INR": return total / 55;
    case "BDT": return total / 75;
    case "PKR": return total / 200;
    case "NGN": return total / 1000;
    default: return total;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/matches/from-sections.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Replace inline construction in matches/page.tsx**

In `app/(app)/matches/page.tsx`, replace the inline `inputs` construction (lines 25-32) with:

```typescript
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
```

Then replace:
```typescript
const inputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
```

Remove the `budgetToAud` function from the bottom of the file — it now lives in `from-sections.ts`.

- [ ] **Step 6: Replace inline construction in plan/invalidate.ts**

In `lib/plan/invalidate.ts`, replace lines 29-37 with:

```typescript
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
```

Then replace the inline `MatchInputs` construction with:
```typescript
const matchInputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
const matches = computeMatches(matchInputs, programs, universities);
```

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass — no behavior change, just extracted duplication.

- [ ] **Step 8: Commit**

```bash
git add lib/matches/from-sections.ts tests/matches/from-sections.test.ts app/(app)/matches/page.tsx lib/plan/invalidate.ts
git commit -m "refactor(phase5a): extract sectionsToMatchInputs from 3 inline copies"
```

---

## Task 5: Create sectionsToStudentProfile reverse mapper

**Files:**
- Create: `lib/scoring/from-sections.ts`
- Test: `tests/scoring/from-sections.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/scoring/from-sections.test.ts
import { describe, test, expect } from "vitest";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("sectionsToStudentProfile", () => {
  test("maps full profile sections to StudentProfile", () => {
    const sections: ProfileSections = {
      destination: { primary: "australia" },
      academic: { degree: "bachelors", gradePercent: 72, gradeSystem: "percentage-nepal", institution: "TU" },
      english: { test: "ielts", overall: 7.0 },
      finance: { total: 3_000_000, currency: "NPR", source: "parents" },
      career: { goal: "permanent-residency" },
      gap: { years: 2, reasons: ["worked"] },
      "intended-study": { field: "computer-science" },
    };
    const result = sectionsToStudentProfile(sections);
    expect(result.destination).toBe("australia");
    expect(result.educationLevel).toBe("bachelors");
    expect(result.grade).toBe(72);
    expect(result.gradeSystem).toBe("percentage-nepal");
    expect(result.englishScore).toBe(7.0);
    expect(result.budget).toBe(3_000_000);
    expect(result.budgetCurrency).toBe("NPR");
    expect(result.fundingSource).toBe("parents-family");
    expect(result.goal).toBe("permanent-residency");
    expect(result.gapReasons).toEqual(["worked"]);
    expect(result.fieldOfStudy).toBe("computer-science");
  });

  test("returns sensible defaults for empty sections", () => {
    const result = sectionsToStudentProfile({});
    expect(result.homeCountry).toBe("nepal");
    expect(result.destination).toBe("australia");
    expect(result.grade).toBe(0);
    expect(result.englishStatus).toBe("not-taken");
    expect(result.gapReasons).toEqual([]);
  });

  test("derives englishStatus from score presence", () => {
    const withScore = sectionsToStudentProfile({ english: { overall: 6.5 } });
    expect(withScore.englishStatus).toBe("taken");
    expect(withScore.englishScore).toBe(6.5);

    const without = sectionsToStudentProfile({ english: { test: "ielts" } });
    expect(without.englishStatus).toBe("booked");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/scoring/from-sections.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reverse mapper**

```typescript
// lib/scoring/from-sections.ts
import type { StudentProfile } from "./types";
import type { ProfileSections } from "@/lib/profiles/sections";

const FUNDING_MAP: Record<string, StudentProfile["fundingSource"]> = {
  self: "self-funded",
  parents: "parents-family",
  loan: "education-loan",
  scholarship: "scholarship-dependent",
  mixed: "mixed",
};

const DEGREE_MAP: Record<string, StudentProfile["educationLevel"]> = {
  "high-school": "higher-secondary",
  bachelors: "bachelors",
  masters: "masters",
  doctorate: "masters",
};

export function sectionsToStudentProfile(sections: ProfileSections): StudentProfile {
  const academic = sections.academic;
  const english = sections.english;
  const finance = sections.finance;
  const gap = sections.gap;
  const career = sections.career;
  const dest = sections.destination;
  const study = sections["intended-study"];

  const hasScore = english?.overall != null;
  const hasTest = english?.test != null;

  const currentYear = new Date().getUTCFullYear();
  const gapYears = gap?.years ?? 0;
  const graduationYear = gapYears > 0 ? currentYear - gapYears : currentYear;

  return {
    homeCountry: "nepal",
    destination: (dest?.primary as StudentProfile["destination"]) ?? "australia",
    educationLevel: DEGREE_MAP[academic?.degree ?? ""] ?? "bachelors",
    gradeSystem: (academic?.gradeSystem as StudentProfile["gradeSystem"]) ?? "percentage-nepal",
    grade: academic?.gradePercent ?? 0,
    fieldOfStudy: (study?.field as StudentProfile["fieldOfStudy"]) ?? "other",
    graduationYear,
    gapReasons: (gap?.reasons as StudentProfile["gapReasons"]) ?? [],
    englishStatus: hasScore ? "taken" : hasTest ? "booked" : "not-taken",
    englishScore: english?.overall,
    budget: finance?.total ?? 0,
    budgetCurrency: (finance?.currency as StudentProfile["budgetCurrency"]) ?? "NPR",
    fundingSource: FUNDING_MAP[finance?.source ?? ""] ?? "self-funded",
    goal: (career?.goal as StudentProfile["goal"]) ?? "permanent-residency",
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/scoring/from-sections.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/from-sections.ts tests/scoring/from-sections.test.ts
git commit -m "feat(phase5a): add sectionsToStudentProfile reverse mapper"
```

---

## Task 6: Create reScoreAssessment cascade function

**Files:**
- Create: `lib/assessments/re-score.ts`
- Test: `tests/assessments/re-score.test.ts`
- Modify: `app/api/profile/section/route.ts`
- Modify: `app/api/assess/route.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/assessments/re-score.test.ts
import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetProfile = vi.fn();
const mockGetPrimary = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn() }) });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

vi.mock("@/lib/profiles/repo", () => ({ getProfile: (...a: unknown[]) => mockGetProfile(...a) }));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser: (...a: unknown[]) => mockGetPrimary(...a) }));

import { reScoreAssessment } from "@/lib/assessments/re-score";

describe("reScoreAssessment", () => {
  test("skips when no primary assessment exists", async () => {
    mockGetProfile.mockResolvedValue({ sections: { academic: { gradePercent: 75 } } });
    mockGetPrimary.mockResolvedValue(null);
    await reScoreAssessment({ from: mockFrom } as any, "user-1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("skips when no profile exists", async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetPrimary.mockResolvedValue({ id: "assess-1" });
    await reScoreAssessment({ from: mockFrom } as any, "user-1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/assessments/re-score.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement reScoreAssessment**

```typescript
// lib/assessments/re-score.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getProfile } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import { runAssessment } from "@/lib/scoring/engine";
import type { ProfileSections } from "@/lib/profiles/sections";

type DB = SupabaseClient<Database>;

export async function reScoreAssessment(db: DB, userId: string): Promise<void> {
  const [profileRow, primaryRow] = await Promise.all([
    getProfile(db, userId),
    getPrimaryAssessmentForUser(db, userId),
  ]);

  if (!profileRow || !primaryRow) return;

  const sections = (profileRow.sections as ProfileSections | undefined) ?? {};
  const studentProfile = sectionsToStudentProfile(sections);
  const result = runAssessment(studentProfile);

  await db
    .from("assessments")
    .update({ result: result as unknown as Json })
    .eq("id", primaryRow.id)
    .eq("owner", userId);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/assessments/re-score.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Wire reScoreAssessment into profile section PATCH route**

In `app/api/profile/section/route.ts`, add after the existing `invalidatePlan` call:

```typescript
import { reScoreAssessment } from "@/lib/assessments/re-score";
```

Then in the route body, after `invalidatePlan`:

```typescript
  try {
    await invalidatePlan(admin, data.user.id);
  } catch { /* best-effort */ }
  try {
    await reScoreAssessment(admin, data.user.id);
  } catch { /* best-effort */ }
```

- [ ] **Step 6: Wire reScoreAssessment into assess route (signed-in path)**

In `app/api/assess/route.ts`, add the import and call `reScoreAssessment` after `invalidatePlan` inside the signed-in `if (user)` block, wrapped in try/catch.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/assessments/re-score.ts tests/assessments/re-score.test.ts app/api/profile/section/route.ts app/api/assess/route.ts
git commit -m "feat(phase5a): add reScoreAssessment + wire into cascade"
```

---

## Task 7: Documents repo (CRUD for documents table)

**Files:**
- Create: `lib/documents/repo.ts`
- Test: `tests/documents/repo.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/documents/repo.test.ts
import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listDocumentsForUser, deleteDocument } from "@/lib/documents/repo";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

describe("documents repo", () => {
  test("listDocumentsForUser queries by owner", async () => {
    const db = fakeSupabase([
      { id: "d1", kind: "ielts", owner: "u1", status: "extracted" },
    ]);
    const docs = await listDocumentsForUser(db as any, "u1");
    expect(docs).toHaveLength(1);
    expect(docs[0].kind).toBe("ielts");
  });

  test("deleteDocument calls delete + eq", async () => {
    const db = fakeSupabase([]);
    await deleteDocument(db as any, "d1", "u1");
    // No throw = success
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// lib/documents/repo.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

export interface DocumentRow {
  id: string;
  owner: string;
  kind: DocumentKind;
  file_path: string;
  file_size: number;
  original_name: string;
  extracted_data: Record<string, unknown> | null;
  profile_section: string | null;
  status: "processing" | "extracted" | "failed" | "stored";
  created_at: string;
}

export async function listDocumentsForUser(db: DB, userId: string): Promise<DocumentRow[]> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as DocumentRow[];
}

export async function getDocumentByKind(db: DB, userId: string, kind: DocumentKind): Promise<DocumentRow | null> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .eq("kind", kind)
    .maybeSingle();
  return (data as unknown as DocumentRow) ?? null;
}

export async function insertDocument(
  db: DB,
  doc: {
    owner: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
    extractedData: Record<string, unknown> | null;
    profileSection: string | null;
    status: DocumentRow["status"];
  },
): Promise<string | null> {
  const { data } = await db
    .from("documents")
    .insert({
      owner: doc.owner,
      kind: doc.kind,
      file_path: doc.filePath,
      file_size: doc.fileSize,
      original_name: doc.originalName,
      extracted_data: (doc.extractedData as Json) ?? null,
      profile_section: doc.profileSection,
      status: doc.status,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function deleteDocument(db: DB, docId: string, userId: string): Promise<void> {
  await db.from("documents").delete().eq("id", docId).eq("owner", userId);
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/documents/repo.test.ts
git add lib/documents/repo.ts tests/documents/repo.test.ts
git commit -m "feat(phase5a): add documents repo CRUD"
```

---

## Task 8: OCR engine — sharp preprocessing + Tesseract.js wrapper

**Files:**
- Create: `lib/documents/ocr.ts`

- [ ] **Step 1: Implement OCR wrapper**

```typescript
// lib/documents/ocr.ts
import "server-only";
import sharp from "sharp";
import Tesseract from "tesseract.js";

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 1000;
  const height = metadata.height ?? 1000;
  const shorter = Math.min(width, height);
  const scale = shorter < 2000 ? 2000 / shorter : 1;

  return sharp(buffer)
    .resize({ width: Math.round(width * scale) })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

export async function recognizeText(imageBuffer: Buffer): Promise<string> {
  const processed = await preprocessImage(imageBuffer);
  const { data } = await Tesseract.recognize(processed, "eng");
  return data.text;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/documents/ocr.ts
git commit -m "feat(phase5a): add OCR engine with sharp preprocessing + Tesseract.js"
```

---

## Task 9: Parser — IELTS scorecard

**Files:**
- Create: `lib/documents/parsers/ielts.ts`
- Test: `tests/documents/parsers/ielts.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/documents/parsers/ielts.test.ts
import { describe, test, expect } from "vitest";
import { parseIelts } from "@/lib/documents/parsers/ielts";

describe("parseIelts", () => {
  test("extracts standard IELTS scorecard layout", () => {
    const text = `
      Test Report Form
      Overall Band Score    7.0
      Listening   7.5
      Reading     6.5
      Writing     6.5
      Speaking    7.0
    `;
    expect(parseIelts(text)).toEqual({
      overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0,
    });
  });

  test("handles compact format", () => {
    const text = "Overall Band Score: 6.5 Listening: 7.0 Reading: 6.0 Writing: 6.0 Speaking: 6.5";
    const result = parseIelts(text);
    expect(result?.overall).toBe(6.5);
    expect(result?.listening).toBe(7.0);
  });

  test("returns null for unrecognized text", () => {
    expect(parseIelts("This is a bank statement")).toBeNull();
  });

  test("returns null for partial data missing overall", () => {
    expect(parseIelts("Listening 7.5 Reading 6.5")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// lib/documents/parsers/ielts.ts
export interface IeltsResult {
  overall: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export function parseIelts(text: string): IeltsResult | null {
  const overall = extractScore(text, /overall\s*(?:band\s*)?score[:\s]*(\d+\.?\d*)/i);
  if (overall == null) return null;

  const listening = extractScore(text, /listening[:\s]*(\d+\.?\d*)/i);
  const reading = extractScore(text, /reading[:\s]*(\d+\.?\d*)/i);
  const writing = extractScore(text, /writing[:\s]*(\d+\.?\d*)/i);
  const speaking = extractScore(text, /speaking[:\s]*(\d+\.?\d*)/i);

  if (listening == null || reading == null || writing == null || speaking == null) return null;

  return { overall, listening, reading, writing, speaking };
}

function extractScore(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) || n < 0 || n > 9 ? null : n;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/documents/parsers/ielts.test.ts
git add lib/documents/parsers/ielts.ts tests/documents/parsers/ielts.test.ts
git commit -m "feat(phase5a): add IELTS scorecard parser"
```

---

## Task 10: Parsers — PTE, TOEFL, passport, transcript, bank-statement, employment-letter, salary-slip, offer-letter

**Files:**
- Create: 8 parser files in `lib/documents/parsers/`
- Create: 8 test files in `tests/documents/parsers/`

Each parser follows the exact same pattern as Task 9 (pure function, regex extraction, returns typed result or null). Build and test each one independently — commit after each parser.

**PTE parser:** Extract overall + communicative skills (listening, reading, writing, speaking). PTE scores are 10-90 scale.

**TOEFL parser:** Extract total + section scores (listening, reading, writing, speaking). TOEFL scores are 0-30 per section, 0-120 total. Normalize to 0-9 scale for profile consistency: `score / 120 * 9`.

**Passport parser:** Extract name and date of birth from MRZ or visual text. Do NOT extract passport number (privacy). Derive age from DOB.

**Transcript parser:** Extract institution name, degree (bachelors/masters), GPA or percentage. Handle "GPA: 3.5/4.0" and "Percentage: 72%" formats.

**Bank statement parser:** Extract balance and currency. Look for patterns like "Available Balance: NPR 3,500,000" or "Closing Balance AUD 35,000.00".

**Employment letter parser:** Extract job title, employer name, years of service. Look for patterns like "has been employed as [title] since [date]" or "worked for [N] years".

**Salary slip parser:** Extract net/gross pay amount and employer. Look for "Net Pay:", "Gross Salary:", "Total Earnings:".

**Offer letter parser:** Extract university name, program/course name, and intake date. Look for "We are pleased to offer you admission to [program] at [university], commencing [date]".

- [ ] **Step 1-8: For each parser, write test → verify fail → implement → verify pass → commit**

Follow the same TDD pattern as Task 9. Each commit message follows: `feat(phase5a): add [kind] parser`

---

## Task 11: Parser registry + profile mapping

**Files:**
- Create: `lib/documents/parsers/registry.ts`
- Create: `lib/documents/profile-mapping.ts`
- Test: `tests/documents/profile-mapping.test.ts`

- [ ] **Step 1: Create parser registry**

```typescript
// lib/documents/parsers/registry.ts
import type { DocumentKind } from "../types";
import { parseIelts } from "./ielts";
import { parsePte } from "./pte";
import { parseToefl } from "./toefl";
import { parsePassport } from "./passport";
import { parseTranscript } from "./transcript";
import { parseBankStatement } from "./bank-statement";
import { parseEmploymentLetter } from "./employment-letter";
import { parseSalarySlip } from "./salary-slip";
import { parseOfferLetter } from "./offer-letter";

type ParseResult = Record<string, unknown> | null;
type Parser = (rawText: string) => ParseResult;

const PARSERS: Partial<Record<DocumentKind, Parser>> = {
  ielts: parseIelts,
  pte: parsePte,
  toefl: parseToefl,
  passport: parsePassport,
  "bachelors-transcript": parseTranscript,
  "bank-statement": parseBankStatement,
  "employment-letter": parseEmploymentLetter,
  "salary-slip": parseSalarySlip,
  "offer-letter": parseOfferLetter,
};

export function getParser(kind: DocumentKind): Parser | null {
  return PARSERS[kind] ?? null;
}
```

- [ ] **Step 2: Write profile mapping tests**

```typescript
// tests/documents/profile-mapping.test.ts
import { describe, test, expect } from "vitest";
import { mapToProfilePatch } from "@/lib/documents/profile-mapping";

describe("mapToProfilePatch", () => {
  test("maps IELTS extraction to english section patch", () => {
    const result = mapToProfilePatch("ielts", { overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0 });
    expect(result).not.toBeNull();
    expect(result!.section).toBe("english");
    expect(result!.patch.test).toBe("ielts");
    expect(result!.patch.overall).toBe(7.0);
    expect(result!.patch.reportUploaded).toBe(true);
  });

  test("maps passport extraction to personal section patch", () => {
    const result = mapToProfilePatch("passport", { name: "Sushant Bhattarai", dob: "1998-05-15" });
    expect(result).not.toBeNull();
    expect(result!.section).toBe("personal");
    expect(result!.patch.name).toBe("Sushant Bhattarai");
  });

  test("returns null for store-only kinds", () => {
    expect(mapToProfilePatch("coe", {})).toBeNull();
    expect(mapToProfilePatch("other", {})).toBeNull();
  });
});
```

- [ ] **Step 3: Implement profile mapping**

```typescript
// lib/documents/profile-mapping.ts
import type { DocumentKind } from "./types";
import type { SectionKey } from "@/lib/profiles/sections";

interface ProfilePatch {
  section: SectionKey;
  patch: Record<string, unknown>;
}

type Mapper = (extracted: Record<string, unknown>) => Record<string, unknown>;

const MAPPINGS: Partial<Record<DocumentKind, { section: SectionKey; map: Mapper }>> = {
  passport: {
    section: "personal",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.name) patch.name = d.name;
      if (d.dob) {
        const age = Math.floor((Date.now() - new Date(d.dob as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age >= 15 && age <= 80) patch.age = age;
      }
      return patch;
    },
  },
  ielts: {
    section: "english",
    map: (d) => ({ test: "ielts", overall: d.overall, listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking, reportUploaded: true }),
  },
  pte: {
    section: "english",
    map: (d) => ({ test: "pte", overall: d.overall, listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking, reportUploaded: true }),
  },
  toefl: {
    section: "english",
    map: (d) => ({ test: "toefl", overall: d.overall, listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking, reportUploaded: true }),
  },
  "bachelors-transcript": {
    section: "academic",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.institution) patch.institution = d.institution;
      if (d.degree) patch.degree = d.degree;
      if (d.gradePercent != null) patch.gradePercent = d.gradePercent;
      return patch;
    },
  },
  "bank-statement": {
    section: "finance",
    map: (d) => {
      const patch: Record<string, unknown> = { proofUploaded: true };
      if (d.balance != null) patch.total = d.balance;
      if (d.currency) patch.currency = d.currency;
      return patch;
    },
  },
  "employment-letter": {
    section: "work",
    map: (d) => {
      const patch: Record<string, unknown> = { docs: true };
      if (d.title) patch.title = d.title;
      if (d.years != null) patch.years = d.years;
      return patch;
    },
  },
  "salary-slip": {
    section: "work",
    map: (d) => ({ docs: true }),
  },
  "offer-letter": {
    section: "intended-study",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.field) patch.field = d.field;
      return patch;
    },
  },
};

export function mapToProfilePatch(kind: DocumentKind, extracted: Record<string, unknown>): ProfilePatch | null {
  const mapping = MAPPINGS[kind];
  if (!mapping) return null;
  const patch = mapping.map(extracted);
  if (Object.keys(patch).length === 0) return null;
  return { section: mapping.section, patch };
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run tests/documents/profile-mapping.test.ts
git add lib/documents/parsers/registry.ts lib/documents/profile-mapping.ts tests/documents/profile-mapping.test.ts
git commit -m "feat(phase5a): add parser registry + profile mapping"
```

---

## Task 12: Upload API route

**Files:**
- Create: `app/api/documents/upload/route.ts`

- [ ] **Step 1: Implement upload route**

```typescript
// app/api/documents/upload/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents/types";
import { getDocumentByKind, insertDocument, deleteDocument } from "@/lib/documents/repo";
import { recognizeText } from "@/lib/documents/ocr";
import { getParser } from "@/lib/documents/parsers/registry";
import { mapToProfilePatch } from "@/lib/documents/profile-mapping";
import { patchProfileSection } from "@/lib/profiles/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";
import type { SectionKey } from "@/lib/profiles/sections";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const kind = formData.get("kind") as string | null;

  if (!file || !kind) {
    return NextResponse.json({ error: "Missing file or kind" }, { status: 422 });
  }
  if (!DOCUMENT_KINDS.includes(kind as DocumentKind)) {
    return NextResponse.json({ error: "Invalid document kind" }, { status: 422 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File must be JPG, PNG, or WebP" }, { status: 422 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 422 });
  }

  const docKind = kind as DocumentKind;
  const admin = createSupabaseAdminClient();

  // Delete existing document for this kind (one per kind)
  const existing = await getDocumentByKind(admin, userId, docKind);
  if (existing) {
    await admin.storage.from("documents").remove([existing.file_path]);
    await deleteDocument(admin, existing.id, userId);
  }

  // Upload to Storage
  const timestamp = Date.now();
  const filePath = `${userId}/${docKind}/${timestamp}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // OCR + parse
  const parser = getParser(docKind);
  let extractedData: Record<string, unknown> | null = null;
  let status: "extracted" | "failed" | "stored" = "stored";
  let profileChanges: Record<string, unknown> | null = null;

  if (parser) {
    try {
      const rawText = await recognizeText(buffer);
      extractedData = parser(rawText);
      status = extractedData ? "extracted" : "failed";
    } catch {
      status = "failed";
    }
  }

  // Find profile section for this kind
  const profilePatch = extractedData ? mapToProfilePatch(docKind, extractedData) : null;
  const profileSection = profilePatch?.section ?? null;

  // Insert document row
  const docId = await insertDocument(admin, {
    owner: userId,
    kind: docKind,
    filePath,
    fileSize: file.size,
    originalName: file.name,
    extractedData,
    profileSection,
    status,
  });

  // Patch profile + cascade
  if (profilePatch && extractedData) {
    try {
      const oldProfile = await patchProfileSection(
        admin,
        userId,
        profilePatch.section as SectionKey,
        profilePatch.patch as any,
      );
      profileChanges = profilePatch.patch;
      await reScoreAssessment(admin, userId);
      await invalidatePlan(admin, userId);
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    id: docId,
    status,
    extracted_data: extractedData,
    profile_changes: profileChanges,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/documents/upload/route.ts
git commit -m "feat(phase5a): add document upload API route with OCR + cascade"
```

---

## Task 13: Delete API route

**Files:**
- Create: `app/api/documents/[id]/route.ts`

- [ ] **Step 1: Implement delete route**

```typescript
// app/api/documents/[id]/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchProfileSection } from "@/lib/profiles/repo";
import type { SectionKey } from "@/lib/profiles/sections";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  // Fetch the document to get file_path and kind
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("owner", userId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  // Delete from Storage
  await admin.storage.from("documents").remove([doc.file_path]);

  // Delete DB row
  await admin.from("documents").delete().eq("id", id).eq("owner", userId);

  // Reset boolean flags based on kind
  const flagResets: Record<string, { section: SectionKey; patch: Record<string, unknown> }> = {
    ielts:   { section: "english", patch: { reportUploaded: false } },
    pte:     { section: "english", patch: { reportUploaded: false } },
    toefl:   { section: "english", patch: { reportUploaded: false } },
    "bank-statement": { section: "finance", patch: { proofUploaded: false } },
    "employment-letter": { section: "work", patch: { docs: false } },
    "salary-slip": { section: "work", patch: { docs: false } },
  };

  const reset = flagResets[doc.kind];
  if (reset) {
    try {
      await patchProfileSection(admin, userId, reset.section, reset.patch as any);
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/documents/[id]/route.ts"
git commit -m "feat(phase5a): add document delete API route"
```

---

## Task 14: /documents page + document card components

**Files:**
- Create: `app/(app)/documents/page.tsx`
- Create: `components/documents/document-group.tsx`
- Create: `components/documents/document-card.tsx`

- [ ] **Step 1: Create DocumentCard client component**

```typescript
// components/documents/document-card.tsx
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentKindMeta } from "@/lib/documents/types";

interface DocumentData {
  id: string;
  status: "extracted" | "failed" | "stored";
  originalName: string;
  fileSize: number;
  extractedData: Record<string, unknown> | null;
}

export function DocumentCard({
  meta,
  initial,
}: {
  meta: DocumentKindMeta;
  initial: DocumentData | null;
}) {
  const [doc, setDoc] = useState<DocumentData | null>(initial);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setNotification(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", meta.kind);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        setNotification(err.error ?? "Upload failed");
        return;
      }
      const data = await res.json();
      setDoc({
        id: data.id,
        status: data.status,
        originalName: file.name,
        fileSize: file.size,
        extractedData: data.extracted_data,
      });
      if (data.status === "extracted") {
        setNotification("Data extracted and saved to your profile");
      } else if (data.status === "failed") {
        setNotification("Could not read this document — try a clearer photo");
      } else {
        setNotification("Document stored");
      }
    } catch {
      setNotification("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDoc(null);
    setNotification(null);
  };

  const fileSize = doc ? `${(doc.fileSize / 1024).toFixed(0)} KB` : null;

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors duration-150 ease-calm ${doc ? "border-primary bg-surface" : "border-line bg-bg-tint"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-ink">{meta.label}</span>
        {doc && (
          <span className={`rounded-pill px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${doc.status === "extracted" ? "bg-strong/10 text-strong" : doc.status === "failed" ? "bg-reach/10 text-reach" : "bg-ink-faint/10 text-ink-faint"}`}>
            {doc.status === "extracted" ? "Extracted" : doc.status === "failed" ? "Failed" : "Stored"}
          </span>
        )}
      </div>

      {doc && (
        <p className="truncate font-mono text-[12px] text-ink-faint">
          {doc.originalName} · {fileSize}
        </p>
      )}

      {doc?.status === "extracted" && doc.extractedData && (
        <p className="text-[13px] text-ink-soft">
          {formatExtracted(meta.kind, doc.extractedData)}
        </p>
      )}

      {notification && (
        <p className="text-[13px] text-ink-soft">{notification}</p>
      )}

      <div className="mt-1 flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant={doc ? "ghost" : "primary"}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : doc ? "Re-upload" : "Upload"}
        </Button>
        {doc && (
          <Button size="sm" variant="quiet" onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function formatExtracted(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "ielts":
    case "pte":
    case "toefl":
      return `Overall: ${data.overall} | L: ${data.listening} | R: ${data.reading} | W: ${data.writing} | S: ${data.speaking}`;
    case "passport":
      return `${data.name}`;
    case "bachelors-transcript":
      return `${data.institution ?? ""} · ${data.gradePercent ?? ""}%`;
    case "bank-statement":
      return `Balance: ${data.currency ?? ""} ${Number(data.balance ?? 0).toLocaleString()}`;
    case "employment-letter":
      return `${data.title ?? ""} · ${data.years ?? ""} years`;
    case "salary-slip":
      return `${data.employer ?? ""} · ${data.amount ?? ""}`;
    case "offer-letter":
      return `${data.university ?? ""} · ${data.program ?? ""}`;
    default:
      return JSON.stringify(data);
  }
}
```

- [ ] **Step 2: Create DocumentGroup wrapper**

```typescript
// components/documents/document-group.tsx
import type { DocumentKindMeta } from "@/lib/documents/types";
import { DocumentCard } from "./document-card";

interface DocumentData {
  id: string;
  kind: string;
  status: "extracted" | "failed" | "stored";
  original_name: string;
  file_size: number;
  extracted_data: Record<string, unknown> | null;
}

export function DocumentGroup({
  label,
  kinds,
  documents,
}: {
  label: string;
  kinds: DocumentKindMeta[];
  documents: DocumentData[];
}) {
  const docByKind = new Map(documents.map((d) => [d.kind, d]));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{label}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kinds.map((meta) => {
          const existing = docByKind.get(meta.kind);
          return (
            <DocumentCard
              key={meta.kind}
              meta={meta}
              initial={existing ? {
                id: existing.id,
                status: existing.status as "extracted" | "failed" | "stored",
                originalName: existing.original_name,
                fileSize: existing.file_size,
                extractedData: existing.extracted_data,
              } : null}
            />
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create /documents page**

```typescript
// app/(app)/documents/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { DOCUMENT_META, GROUPS, GROUP_LABELS } from "@/lib/documents/types";
import { DocumentGroup } from "@/components/documents/document-group";

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const documents = await listDocumentsForUser(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Documents</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Upload your documents</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Upload photos of your documents and we&apos;ll extract the data to improve your profile, match accuracy, and assessment verdict.
        </p>
      </header>

      {GROUPS.map((group) => {
        const kinds = DOCUMENT_META.filter((m) => m.group === group);
        const groupDocs = documents.filter((d) => kinds.some((k) => k.kind === d.kind));
        return (
          <DocumentGroup
            key={group}
            label={GROUP_LABELS[group]}
            kinds={kinds}
            documents={groupDocs as any}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/documents/page.tsx components/documents/document-card.tsx components/documents/document-group.tsx
git commit -m "feat(phase5a): add /documents page with upload cards"
```

---

## Task 15: Add Documents to AppBar + dashboard stat widget

**Files:**
- Modify: `components/layout/app-bar.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add Documents link to AppBar**

In `components/layout/app-bar.tsx`, find the `NAV_APP` array and add:

```typescript
{ label: "Documents", href: "/documents" },
```

Add it after "Profile" in the list.

- [ ] **Step 2: Add documents count to dashboard StatsRow**

In `app/(app)/dashboard/page.tsx`:

1. Import `listDocumentsForUser` from `@/lib/documents/repo`
2. Add to the `Promise.all` data fetch: `listDocumentsForUser(supabase, user.id)`
3. Replace `checklistDone={null}` with `checklistDone={documents.length}` (or update the label to "Documents" if StatsRow supports it)

- [ ] **Step 3: Run typecheck + tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: clean typecheck, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/layout/app-bar.tsx app/(app)/dashboard/page.tsx
git commit -m "feat(phase5a): add Documents nav link + dashboard stat widget"
```

---

## Task 16: Update EnglishEditor to display per-band scores

**Files:**
- Modify: `components/profile/editors/english-editor.tsx`

- [ ] **Step 1: Add per-band score inputs**

Add state variables for `listening`, `reading`, `writing`, `speaking` to the editor component. Add 4 number inputs below the overall score field, in a 2x2 grid. Include them in the save `patch` object.

These fields are editable (user can correct OCR errors). When populated by OCR (via the document upload flow), the page reloads and they appear pre-filled.

- [ ] **Step 2: Run typecheck + test, commit**

```bash
npx tsc --noEmit
npx vitest run
git add components/profile/editors/english-editor.tsx
git commit -m "feat(phase5a): display per-band scores in EnglishEditor"
```

---

## Task 17: Final integration test + full suite

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass. Note the new test count (should be ~400+ with parser tests).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: Clean.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, sign in, navigate to `/documents`:
- Upload an IELTS scorecard image → verify extraction shows scores → check `/profile` English section updated → check `/matches` reflects new scores → check dashboard verdict updated
- Upload a passport photo → verify name extracted → check `/profile` personal section
- Try uploading a file > 5MB → verify error
- Try uploading a PDF → verify error
- Delete a document → verify file removed, card goes back to empty state

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore(phase5a): final integration fixes"
```

---

## Summary

| Task | Description | Estimated time |
|------|-------------|---------------|
| 1 | Install deps + document types | 5 min |
| 2 | Database migration | 5 min |
| 3 | English per-band scores (schema + Zod) | 10 min |
| 4 | Extract sectionsToMatchInputs | 15 min |
| 5 | Create sectionsToStudentProfile | 15 min |
| 6 | Create reScoreAssessment + wire cascade | 15 min |
| 7 | Documents repo CRUD | 10 min |
| 8 | OCR engine (sharp + Tesseract.js) | 10 min |
| 9 | IELTS parser | 10 min |
| 10 | 8 remaining parsers | 40 min |
| 11 | Parser registry + profile mapping | 15 min |
| 12 | Upload API route | 15 min |
| 13 | Delete API route | 10 min |
| 14 | /documents page + components | 20 min |
| 15 | AppBar + dashboard widget | 10 min |
| 16 | EnglishEditor per-band UI | 10 min |
| 17 | Integration test + smoke test | 15 min |
| **Total** | | **~3.5 hours** |
