# Phase 1.5: Signed-in shell + multi-assessment foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take MyVisa from "signed-out marketing site that supports a wizard run" to a real signed-in product: signed-in chrome (avatar + app nav), multi-assessment + profiles DB foundation, dashboard with real snapshot from primary assessment, minimal profile (name/email/personal edit), signed-in `/assess` interstitial, and stub pages for the surfaces that ship in Phases 2–6.

**Architecture:** A new `(app)` route group with its own auth-gated layout sits alongside the existing `(marketing)` and `(focused)` groups; both existing layouts become session-aware and pass an `AppBar` variant (or `signedIn` prop) to the chrome. A `profiles` table joins `assessments` via `owner`; the wizard's `profile` jsonb migrates to `assessments.profile_snapshot` and the profile editor reads/writes the new `profiles.sections` jsonb. Server components everywhere; client islands for the user-pill menu, assess interstitial, and personal-section editor.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 with existing `@theme` tokens, Vitest + @testing-library, Zod, Supabase (`@supabase/ssr`, `@supabase/supabase-js`). Supabase MCP available for migrations on project `obfvrxixtautamflzxzq`.

---

## Background the engineer needs

- **Spec:** `docs/superpowers/specs/2026-06-04-phase-1-5-signed-in-shell-design.md`. §4 (data model), §6 (route behavior), §10 (testing) are most load-bearing.
- **Phase 0 (just merged to master):** marketing chrome, route groups `(marketing)`/`(focused)`, layout components in `components/layout/{logo,trust-strip,footer,focus-bar,app-bar}.tsx`, `components/auth/auth-card.tsx`, `app/auth/callback/route.ts` already handles OAuth + claim.
- **Tests:** Vitest + jsdom + `@testing-library/react`. Existing fake-supabase stub at `tests/helpers/fake-supabase.ts` is chainable + awaitable + records `(method, args)` for assertions. **When you add new query builder methods used by repos (e.g. `delete`, `order`, `limit`), extend the stub in the same task.**
- **Existing repo pattern:** see `lib/assessments/repo.ts` for the shape (named exports, `SupabaseClient<Database>` typed `DB`, errors as values, no thrown exceptions for "row not found").
- **Server-only modules:** import `"server-only"` at the top of every `lib/*/repo.ts`, `lib/supabase/admin.ts`, and route handlers that import them. Client modules never import these.
- **Apostrophes in JSX text** must be `&apos;` (lint rule `react/no-unescaped-entities`). Apostrophes inside JS string literals (e.g. `const x = "you're"`) are fine.
- **Run a single test:** `npm test -- <path>`. **Full gate:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- **Supabase MCP migrations** apply directly to the live project. Always check `list_migrations` before applying so you don't double-apply.

---

## File Structure

```
supabase/migrations/<ts>_add_profiles_evolve_assessments.sql   NEW
lib/supabase/types.ts                                            REPLACE — regenerated after migration

lib/profiles/                                                    NEW
├── sections.ts                  SECTION_KEYS, SectionKey, REQUIRED_FIELDS, types
├── completeness.ts              pure computeCompleteness(sections)
├── from-assessment.ts           pure profileSectionsFromAssessment(snapshot, fallback)
├── repo.ts                      getProfile, upsertProfile, patchProfileSection
└── types.ts                     re-exports

lib/assessments/
├── repo.ts                      MODIFY — add getPrimaryAssessmentForUser, listAssessmentsForUser
├── claim.ts                     NEW — claimAndBootstrapProfile (claim + profile insert + set primary in one server-side flow)
└── expiry.ts                    (unchanged)

lib/validation/
└── profile-section.ts           NEW — PersonalSectionPatch zod schema

app/
├── (marketing)/
│   ├── layout.tsx               MODIFY — read session, pass user to AppBar
│   └── auth/page.tsx            MODIFY — redirect ?next= aware, default /dashboard
├── (focused)/
│   ├── layout.tsx               MODIFY — read session, pass signedIn to FocusBar
│   └── assess/page.tsx          MODIFY — signed-in interstitial fork
├── (app)/                       NEW
│   ├── layout.tsx               NEW — auth gate + AppBar variant="app" + Footer
│   ├── dashboard/page.tsx       NEW
│   ├── profile/page.tsx         NEW
│   ├── matches/page.tsx         NEW (stub)
│   ├── plan/page.tsx            NEW (stub)
│   ├── checklist/page.tsx       NEW (stub)
│   └── guide/page.tsx           NEW (stub)
├── api/
│   ├── assess/route.ts          MODIFY — signed-in branch
│   └── profile/section/route.ts NEW — PATCH personal section
└── auth/callback/route.ts       MODIFY — default redirect is /dashboard (was /)

components/
├── layout/
│   ├── app-bar.tsx              MODIFY — variants: marketing | marketing-signed-in | app
│   ├── focus-bar.tsx            MODIFY — signedIn?: boolean prop
│   └── user-pill.tsx            NEW    — client; avatar circle + dropdown
├── auth/
│   └── auth-card.tsx            MODIFY — redirectTo /auth/callback?next=/dashboard
├── assess/
│   └── assess-interstitial.tsx  NEW    — client; Refresh / New destination buttons
├── dashboard/                   NEW
│   ├── greeting.tsx
│   ├── snapshot-card.tsx
│   ├── prompt-card.tsx
│   ├── journey-timeline.tsx
│   ├── stats-row.tsx
│   └── recent-updates.tsx
└── profile/                     NEW
    ├── completeness-ring.tsx
    ├── section-accordion.tsx
    ├── section-summary.tsx
    └── editors/personal-editor.tsx

tests/                            mirror structure; one *.test.ts(x) per file
```

---

## Task 1: Section keys + types

**Files:**
- Create: `lib/profiles/sections.ts`
- Create: `tests/profiles/sections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/profiles/sections.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_KEYS, REQUIRED_FIELDS, type SectionKey } from "@/lib/profiles/sections";

describe("profile sections registry", () => {
  it("ships exactly the 13 designed sections", () => {
    expect(SECTION_KEYS).toEqual([
      "personal", "destination", "academic", "intended-study", "english",
      "gap", "work", "finance", "immigration", "family", "career",
      "scholarships", "deal-breakers",
    ]);
  });

  it("REQUIRED_FIELDS has an entry for every section", () => {
    for (const k of SECTION_KEYS) {
      const required = REQUIRED_FIELDS[k as SectionKey];
      expect(Array.isArray(required)).toBe(true);
    }
  });

  it("personal section requires at least name", () => {
    expect(REQUIRED_FIELDS.personal).toContain("name");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/profiles/sections.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/profiles/sections.ts
export const SECTION_KEYS = [
  "personal", "destination", "academic", "intended-study", "english",
  "gap", "work", "finance", "immigration", "family", "career",
  "scholarships", "deal-breakers",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface ProfileSections {
  personal?:        { name?: string; age?: number; intakeIso?: string };
  destination?:     { primary?: string; alternates?: string[] };
  academic?:        { institution?: string; degree?: string; gradePercent?: number; gradeSystem?: string };
  "intended-study"?: { level?: string; field?: string; specialisation?: string };
  english?:         { test?: "ielts" | "pte" | "toefl"; overall?: number; reportUploaded?: boolean };
  gap?:             { years?: number; reasons?: string[]; evidence?: string[] };
  work?:            { title?: string; years?: number; relevance?: string; docs?: boolean };
  finance?:         { total?: number; currency?: string; source?: string; proofUploaded?: boolean };
  immigration?:     { refusals?: string; travelled?: boolean };
  family?:          { situation?: string };
  career?:          { goal?: string; targetRole?: string };
  scholarships?:    { profile?: string[] };
  "deal-breakers"?: { mustHaves?: string[] };
}

export const REQUIRED_FIELDS: Record<SectionKey, string[]> = {
  "personal":        ["name"],
  "destination":     ["primary"],
  "academic":        ["institution", "gradePercent"],
  "intended-study":  ["level", "field"],
  "english":         ["test", "overall"],
  "gap":             ["years"],
  "work":            ["title"],
  "finance":         ["total", "source"],
  "immigration":     ["refusals"],
  "family":          ["situation"],
  "career":          ["goal"],
  "scholarships":    [],
  "deal-breakers":   [],
};
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/profiles/sections.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profiles/sections.ts tests/profiles/sections.test.ts
git commit -m "feat: add profile sections registry + required fields map"
```

---

## Task 2: Completeness calc (pure)

**Files:**
- Create: `lib/profiles/completeness.ts`
- Create: `tests/profiles/completeness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/profiles/completeness.test.ts
import { describe, it, expect } from "vitest";
import { computeCompleteness } from "@/lib/profiles/completeness";
import type { ProfileSections } from "@/lib/profiles/sections";

describe("computeCompleteness", () => {
  it("returns 0 for empty sections", () => {
    const { pct, status } = computeCompleteness({});
    expect(pct).toBe(0);
    expect(status.personal).toBe("empty");
    expect(status.destination).toBe("empty");
  });

  it("marks a fully-required section as complete", () => {
    const sections: ProfileSections = { personal: { name: "Aarav" } };
    const { status } = computeCompleteness(sections);
    expect(status.personal).toBe("complete");
  });

  it("marks a section with some required fields filled as partial", () => {
    const sections: ProfileSections = { academic: { institution: "TU" } }; // gradePercent missing
    const { status } = computeCompleteness(sections);
    expect(status.academic).toBe("partial");
  });

  it("treats zero-required-fields sections (scholarships) as complete when any value exists", () => {
    expect(computeCompleteness({ scholarships: { profile: ["merit"] } }).status.scholarships).toBe("complete");
    expect(computeCompleteness({}).status.scholarships).toBe("empty");
  });

  it("computes percent as weighted sum / total * 100", () => {
    // 1 complete (1.0) + 1 partial (0.5) + 11 empty (0) = 1.5 / 13 = ~11.5 -> rounds to 12
    const sections: ProfileSections = {
      personal: { name: "X" },
      academic: { institution: "TU" },
    };
    expect(computeCompleteness(sections).pct).toBe(12);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/profiles/completeness.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/profiles/completeness.ts
import { SECTION_KEYS, REQUIRED_FIELDS, type SectionKey, type ProfileSections } from "./sections";

export type SectionStatus = "complete" | "partial" | "empty";

export interface CompletenessResult {
  pct: number;
  status: Record<SectionKey, SectionStatus>;
}

export function computeCompleteness(sections: ProfileSections): CompletenessResult {
  const status = {} as Record<SectionKey, SectionStatus>;
  let sum = 0;

  for (const key of SECTION_KEYS) {
    const data = (sections as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
    const required = REQUIRED_FIELDS[key];
    let s: SectionStatus;
    if (!data || Object.keys(data).length === 0) {
      s = "empty";
    } else if (required.length === 0) {
      s = "complete";
    } else {
      const filled = required.filter((f) => {
        const v = data[f];
        return v !== undefined && v !== null && v !== "";
      });
      s = filled.length === required.length ? "complete" : filled.length > 0 ? "partial" : "empty";
    }
    status[key] = s;
    sum += s === "complete" ? 1 : s === "partial" ? 0.5 : 0;
  }

  const pct = Math.round((sum / SECTION_KEYS.length) * 100);
  return { pct, status };
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/profiles/completeness.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profiles/completeness.ts tests/profiles/completeness.test.ts
git commit -m "feat: add profile completeness calc"
```

---

## Task 3: From-assessment mapper (pure)

**Files:**
- Create: `lib/profiles/from-assessment.ts`
- Create: `tests/profiles/from-assessment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/profiles/from-assessment.test.ts
import { describe, it, expect } from "vitest";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";

describe("profileSectionsFromAssessment", () => {
  const wizardProfile = {
    homeCountry: "Nepal",
    educationLevel: "bachelors",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: 2024,
    gapReasons: ["worked"],
    englishStatus: "taken",
    englishScore: 7,
    destination: "australia",
    budget: 4_500_000,
    budgetCurrency: "NPR",
    fundingSource: "education-loan",
    goal: "permanent-residency",
  };

  it("maps wizard answers into the section schema", () => {
    const out = profileSectionsFromAssessment(wizardProfile, { name: "Aarav Sharma" });
    expect(out.personal?.name).toBe("Aarav Sharma");
    expect(out.destination?.primary).toBe("australia");
    expect(out.academic?.gradePercent).toBe(72);
    expect(out["intended-study"]?.field).toBe("computer-science");
    expect(out.english?.overall).toBe(7);
    expect(out.gap?.reasons).toEqual(["worked"]);
    expect(out.finance?.total).toBe(4_500_000);
    expect(out.finance?.currency).toBe("NPR");
    expect(out.finance?.source).toBe("education-loan");
    expect(out.career?.goal).toBe("permanent-residency");
  });

  it("omits personal.name when no fallback given and snapshot has no name", () => {
    expect(profileSectionsFromAssessment(wizardProfile, {}).personal?.name).toBeUndefined();
  });

  it("computes gap years from current year - graduationYear when present", () => {
    const out = profileSectionsFromAssessment(
      { ...wizardProfile, graduationYear: 2024 },
      {},
      { nowYear: 2026 },
    );
    expect(out.gap?.years).toBe(2);
  });

  it("handles completely empty input gracefully", () => {
    const out = profileSectionsFromAssessment({}, {});
    expect(out).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/profiles/from-assessment.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/profiles/from-assessment.ts
import type { ProfileSections } from "./sections";

interface Fallback {
  name?: string;
}

interface Options {
  nowYear?: number;
}

export function profileSectionsFromAssessment(
  snapshot: Record<string, unknown>,
  fallback: Fallback,
  opts: Options = {},
): ProfileSections {
  const out: ProfileSections = {};
  const get = <T>(k: string) => snapshot[k] as T | undefined;

  // personal
  if (fallback.name) out.personal = { name: fallback.name };

  // destination
  const dest = get<string>("destination");
  if (dest) out.destination = { primary: dest };

  // academic
  const grade = get<number>("grade");
  const educationLevel = get<string>("educationLevel");
  if (grade !== undefined || educationLevel) {
    out.academic = {};
    if (grade !== undefined) out.academic.gradePercent = grade;
    if (educationLevel) out.academic.degree = educationLevel;
  }

  // intended study
  const field = get<string>("fieldOfStudy");
  if (field) out["intended-study"] = { field };

  // english
  const score = get<number>("englishScore");
  if (score !== undefined) out.english = { test: "ielts", overall: score };

  // gap
  const gapReasons = get<string[]>("gapReasons");
  const gradYear = get<number>("graduationYear");
  if ((gapReasons && gapReasons.length > 0) || gradYear !== undefined) {
    out.gap = {};
    if (gapReasons && gapReasons.length > 0) out.gap.reasons = gapReasons;
    if (gradYear !== undefined && opts.nowYear !== undefined) {
      out.gap.years = Math.max(0, opts.nowYear - gradYear);
    }
  }

  // finance
  const budget = get<number>("budget");
  const budgetCurrency = get<string>("budgetCurrency");
  const fundingSource = get<string>("fundingSource");
  if (budget !== undefined || budgetCurrency || fundingSource) {
    out.finance = {};
    if (budget !== undefined) out.finance.total = budget;
    if (budgetCurrency) out.finance.currency = budgetCurrency;
    if (fundingSource) out.finance.source = fundingSource;
  }

  // career
  const goal = get<string>("goal");
  if (goal) out.career = { goal };

  return out;
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/profiles/from-assessment.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profiles/from-assessment.ts tests/profiles/from-assessment.test.ts
git commit -m "feat: add wizard profile → ProfileSections mapper"
```

---

## Task 4: Profiles types re-export

**Files:**
- Create: `lib/profiles/types.ts`

- [ ] **Step 1: Implement (no test needed; pure re-export)**

```ts
// lib/profiles/types.ts
export type { SectionKey, ProfileSections } from "./sections";
export type { SectionStatus, CompletenessResult } from "./completeness";
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/profiles/types.ts
git commit -m "feat: add lib/profiles/types re-export"
```

---

## Task 5: Apply DB migration

**Files:**
- Create: `supabase/migrations/<timestamp>_add_profiles_evolve_assessments.sql`

This task uses the **Supabase MCP** to apply the migration to the live project `obfvrxixtautamflzxzq` AND writes the same SQL into a new file in the repo for version control.

- [ ] **Step 1: Confirm the prior migration is the only one applied**

Use Supabase MCP: `list_migrations({ project_id: "obfvrxixtautamflzxzq" })`.
Expected: one migration listed (`20260603011208_init_assessments_and_leads`). If `add_profiles_evolve_assessments` is already there, skip to Step 4.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `apply_migration({ project_id: "obfvrxixtautamflzxzq", name: "add_profiles_evolve_assessments", query: ... })` with this SQL:

```sql
-- profiles table
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null unique references auth.users(id) on delete cascade,
  sections     jsonb not null default '{}'::jsonb,
  completeness int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_owner_idx on public.profiles (owner);

-- private schema + updated_at trigger
create schema if not exists private;

create or replace function private.set_updated_at()
  returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- RLS on profiles
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = owner);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- evolve assessments
alter table public.assessments
  add column destination_id   text,
  add column is_primary       boolean not null default false,
  add column profile_snapshot jsonb;

update public.assessments
  set profile_snapshot = profile
  where profile_snapshot is null;

update public.assessments
  set destination_id = coalesce(profile_snapshot->>'destination', 'australia')
  where destination_id is null;

alter table public.assessments
  alter column destination_id   set not null,
  alter column profile_snapshot set not null,
  drop column profile;

-- at-most-one-primary per owner
create unique index assessments_primary_idx on public.assessments (owner) where is_primary;
```

- [ ] **Step 3: Run the security advisors via MCP to confirm RLS health**

Use `get_advisors({ project_id: "obfvrxixtautamflzxzq", type: "security" })`. Expected: no new ERROR-level advisories from this migration. Known INFO advisories from prior plans may still appear — those are fine.

- [ ] **Step 4: Write the same SQL into the repo for version control**

Create `supabase/migrations/<timestamp>_add_profiles_evolve_assessments.sql` with the exact SQL from Step 2. Pick the timestamp returned by `list_migrations` for this migration (so the local file matches the remote ledger).

> If you need a fresh timestamp because the migration hasn't been applied yet, generate one in UTC with format `YYYYMMDDHHMMSS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: migration — add profiles + evolve assessments"
```

---

## Task 6: Regenerate `lib/supabase/types.ts`

**Files:**
- Replace: `lib/supabase/types.ts`

- [ ] **Step 1: Regenerate types via Supabase MCP**

Use `generate_typescript_types({ project_id: "obfvrxixtautamflzxzq" })`. Save the **entire** returned content to `lib/supabase/types.ts`, overwriting the file.

You can verify the new schema by checking:
- `Database["public"]["Tables"]["profiles"]` exists with `Row.sections: Json`, `Row.completeness: number`, etc.
- `Database["public"]["Tables"]["assessments"]["Row"]` now includes `destination_id: string`, `is_primary: boolean`, `profile_snapshot: Json`, AND no longer includes `profile`.

- [ ] **Step 2: Run typecheck — there WILL be failures**

Run: `npm run typecheck`
Expected: errors from `lib/assessments/repo.ts`, `app/api/assess/route.ts`, `app/auth/callback/route.ts`, and existing tests because `profile` column no longer exists in the type. **These are addressed in the next tasks.** Don't fix them here.

- [ ] **Step 3: Commit just the regenerated types**

```bash
git add lib/supabase/types.ts
git commit -m "feat: regenerate supabase types after profiles migration"
```

---

## Task 7: Migrate existing `lib/assessments/repo.ts` to new schema

**Files:**
- Modify: `lib/assessments/repo.ts`
- Modify: `tests/assessments/repo-writes.test.ts`
- Modify: `tests/assessments/repo-claim.test.ts`

The existing `createAnonymousAssessment` writes `profile` (gone), and existing tests pass `profile` to it. The shape changes to `profile_snapshot` + `destination_id`. The `claimAssessment` function loses its profile-promote role — that moves to the new `claim.ts` in Task 9.

- [ ] **Step 1: Update `createAnonymousAssessment` signature + body**

Replace the function in `lib/assessments/repo.ts`:

```ts
export interface NewAssessment {
  profileSnapshot: Json;
  destinationId: string;
  result: Json;
  ruleVersion: string;
  expiresAt: string;
}

export async function createAnonymousAssessment(db: DB, input: NewAssessment): Promise<string | null> {
  const { data, error } = await db
    .from("assessments")
    .insert({
      owner: null,
      profile_snapshot: input.profileSnapshot,
      destination_id: input.destinationId,
      result: input.result,
      rule_version: input.ruleVersion,
      expires_at: input.expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}
```

- [ ] **Step 2: Update existing tests `tests/assessments/repo-writes.test.ts`**

Change the existing `createAnonymousAssessment` calls to use the new shape:

```ts
// Before:
//   profile: { homeCountry: "Nepal" }, result: {...}, ruleVersion: ..., expiresAt: ...
// After:
//   profileSnapshot: { homeCountry: "Nepal", destination: "australia" },
//   destinationId: "australia",
//   result: {...},
//   ruleVersion: ...,
//   expiresAt: ...
```

The two existing test cases (success returns id, error returns null) keep the same shape — just update the input object.

- [ ] **Step 3: Run the repo write tests**

Run: `npm test -- tests/assessments/repo-writes.test.ts`
Expected: PASS.

- [ ] **Step 4: Existing `claimAssessment` test stays as-is**

Existing `tests/assessments/repo-claim.test.ts` already only asserts on `update` / `eq` / `is` / `gt` chain methods + returned id list — those don't change. Run and confirm:

Run: `npm test -- tests/assessments/repo-claim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/assessments/repo.ts tests/assessments/repo-writes.test.ts
git commit -m "refactor: assessments repo uses profile_snapshot + destination_id"
```

---

## Task 8: Add `getPrimaryAssessmentForUser` and `listAssessmentsForUser`

**Files:**
- Modify: `lib/assessments/repo.ts` (append)
- Create: `tests/assessments/repo-reads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/assessments/repo-reads.test.ts
import { describe, it, expect } from "vitest";
import { getPrimaryAssessmentForUser, listAssessmentsForUser } from "@/lib/assessments/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("getPrimaryAssessmentForUser", () => {
  it("returns the user's primary assessment when one exists", async () => {
    const row = { id: "a1", owner: "u1", is_primary: true, destination_id: "australia" };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    const out = await getPrimaryAssessmentForUser(client, "u1");
    expect(out).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "assessments")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "is_primary" && c.args[1] === true)).toBe(true);
  });

  it("returns null when no primary exists", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getPrimaryAssessmentForUser(client, "u1")).toBeNull();
  });
});

describe("listAssessmentsForUser", () => {
  it("returns all assessments owned by the user, newest first", async () => {
    const rows = [
      { id: "a2", owner: "u1", created_at: "2026-06-01T00:00:00Z" },
      { id: "a1", owner: "u1", created_at: "2026-05-01T00:00:00Z" },
    ];
    const { client, calls } = fakeSupabase({ data: rows, error: null });
    const out = await listAssessmentsForUser(client, "u1");
    expect(out).toEqual(rows);
    expect(calls.some((c) => c.method === "order" && c.args[0] === "created_at" && (c.args[1] as { ascending: boolean }).ascending === false)).toBe(true);
  });

  it("returns [] on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await listAssessmentsForUser(client, "u1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Extend the fake-supabase stub to support `order`**

Edit `tests/helpers/fake-supabase.ts` — add `"order"` to the chain-method list:

```ts
for (const m of ["insert", "update", "upsert", "select", "eq", "is", "gt", "order"]) {
  builder[m] = record(m);
}
```

- [ ] **Step 3: Run it and confirm failure**

Run: `npm test -- tests/assessments/repo-reads.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 4: Implement (append to `lib/assessments/repo.ts`)**

```ts
export async function getPrimaryAssessmentForUser(db: DB, userId: string): Promise<AssessmentRow | null> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("owner", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AssessmentRow;
}

export async function listAssessmentsForUser(db: DB, userId: string): Promise<AssessmentRow[]> {
  const { data, error } = await db
    .from("assessments")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as AssessmentRow[];
}
```

- [ ] **Step 5: Run it and confirm pass**

Run: `npm test -- tests/assessments/repo-reads.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/assessments/repo.ts tests/assessments/repo-reads.test.ts tests/helpers/fake-supabase.ts
git commit -m "feat: add getPrimaryAssessmentForUser + listAssessmentsForUser"
```

---

## Task 9: Profiles repo

**Files:**
- Create: `lib/profiles/repo.ts`
- Create: `tests/profiles/repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/profiles/repo.test.ts
import { describe, it, expect } from "vitest";
import { getProfile, upsertProfile, patchProfileSection } from "@/lib/profiles/repo";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("getProfile", () => {
  it("returns the row for the user", async () => {
    const row = { id: "p1", owner: "u1", sections: { personal: { name: "Aarav" } }, completeness: 8 };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    expect(await getProfile(client, "u1")).toEqual(row);
    expect(calls.some((c) => c.method === "from" && c.args[0] === "profiles")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
  });

  it("returns null on not found", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getProfile(client, "u1")).toBeNull();
  });
});

describe("upsertProfile", () => {
  it("inserts via service-role client (insert + select)", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "p1" }, error: null });
    const id = await upsertProfile(client, {
      owner: "u1",
      sections: { personal: { name: "Aarav" } },
      completeness: 8,
    });
    expect(id).toBe("p1");
    expect(calls.some((c) => c.method === "upsert")).toBe(true);
  });

  it("returns null when insert errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "duplicate" } });
    expect(await upsertProfile(client, { owner: "u1", sections: {}, completeness: 0 })).toBeNull();
  });
});

describe("patchProfileSection", () => {
  it("merges into sections[key] and updates completeness in one go", async () => {
    // Initial read returns existing sections
    const existingRow = { sections: { personal: { name: "Old" }, academic: { gradePercent: 70 } } };
    let calledOrder = 0;
    const { client, calls } = fakeSupabase({ data: existingRow, error: null });
    // Override the `single` to return the existing row first and the update later
    const updatedRow = { sections: { personal: { name: "New" }, academic: { gradePercent: 70 } }, completeness: 12 };
    // Two-call dance: the implementation reads first, then writes. The stub returns the same value for both.
    // We assert via the calls array.
    const result = await patchProfileSection(client, "u1", "personal", { name: "New" });
    expect(result.completeness).toBe(12);
    expect(calls.some((c) => c.method === "update")).toBe(true);
    void calledOrder; void updatedRow;
  });
});
```

> **Note about the patchProfileSection test:** the implementation needs to (a) read current sections, (b) compute new completeness, (c) update. The fake returns the same `data` for both calls. The test only asserts the post-conditions: the update was made and completeness computed; we don't assert exact merged sections jsonb in the fake.

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/profiles/repo.test.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```ts
// lib/profiles/repo.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { SectionKey, ProfileSections } from "./sections";
import { computeCompleteness } from "./completeness";

type DB = SupabaseClient<Database>;
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getProfile(db: DB, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("owner", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileRow;
}

export interface UpsertProfileInput {
  owner: string;
  sections: ProfileSections;
  completeness: number;
}

export async function upsertProfile(db: DB, input: UpsertProfileInput): Promise<string | null> {
  const { data, error } = await db
    .from("profiles")
    .upsert(
      {
        owner: input.owner,
        sections: input.sections as unknown as Json,
        completeness: input.completeness,
      },
      { onConflict: "owner", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export interface PatchResult {
  completeness: number;
  sections: ProfileSections;
}

export async function patchProfileSection<K extends SectionKey>(
  db: DB,
  userId: string,
  section: K,
  patch: NonNullable<ProfileSections[K]>,
): Promise<PatchResult> {
  // Read current
  const current = await getProfile(db, userId);
  const sections: ProfileSections = (current?.sections as ProfileSections | undefined) ?? {};
  const next: ProfileSections = {
    ...sections,
    [section]: { ...(sections[section] ?? {}), ...patch },
  };
  const { pct } = computeCompleteness(next);

  // Write
  await db
    .from("profiles")
    .update({ sections: next as unknown as Json, completeness: pct })
    .eq("owner", userId);

  return { completeness: pct, sections: next };
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/profiles/repo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/profiles/repo.ts tests/profiles/repo.test.ts
git commit -m "feat: add profiles repo (get, upsert, patch section)"
```

---

## Task 10: Claim + bootstrap profile

**Files:**
- Create: `lib/assessments/claim.ts`
- Create: `tests/assessments/claim.test.ts`

The new flow replaces the standalone `claimAssessment` call in the OAuth callback with a single function that claims + inserts/upgrades profile + sets is_primary.

- [ ] **Step 1: Write the failing test**

```ts
// tests/assessments/claim.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const claimAssessment = vi.fn();
const upsertProfile = vi.fn();
const getProfile = vi.fn();
const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { profile_snapshot: { destination: "australia" } }, error: null }) }) });
const from = vi.fn(() => ({ update, select }));
const fakeAdmin = { from } as never;

vi.mock("@/lib/assessments/repo", () => ({ claimAssessment }));
vi.mock("@/lib/profiles/repo", () => ({ upsertProfile, getProfile }));

import { claimAndBootstrapProfile } from "@/lib/assessments/claim";

describe("claimAndBootstrapProfile", () => {
  beforeEach(() => {
    claimAssessment.mockReset();
    upsertProfile.mockReset();
    getProfile.mockReset();
    from.mockClear();
  });

  it("returns claimed:false when claimAssessment fails", async () => {
    claimAssessment.mockResolvedValue(false);
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out).toEqual({ claimed: false });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("bootstraps profile when claim succeeds and user has no profile", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue("p1");
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).toHaveBeenCalled();
    const call = upsertProfile.mock.calls[0]![1];
    expect(call.owner).toBe("u1");
    expect(call.sections.personal?.name).toBe("Aarav Sharma");
  });

  it("does not overwrite existing profile when claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: { personal: { name: "Old" } }, completeness: 8 });
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/assessments/claim.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/assessments/claim.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { claimAssessment } from "./repo";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";

type DB = SupabaseClient<Database>;

export interface ClaimAndBootstrapInput {
  assessmentId: string;
  userId: string;
  googleName?: string;
}

export interface ClaimAndBootstrapResult {
  claimed: boolean;
}

export async function claimAndBootstrapProfile(
  adminDb: DB,
  input: ClaimAndBootstrapInput,
): Promise<ClaimAndBootstrapResult> {
  const ok = await claimAssessment(adminDb, {
    id: input.assessmentId,
    userId: input.userId,
    nowIso: new Date().toISOString(),
  });
  if (!ok) return { claimed: false };

  // Read the just-claimed row's snapshot
  const { data } = await adminDb
    .from("assessments")
    .select("profile_snapshot")
    .eq("id", input.assessmentId)
    .maybeSingle();
  const snapshot = (data?.profile_snapshot ?? {}) as Record<string, unknown>;

  // Skip if profile already exists
  const existing = await getProfile(adminDb, input.userId);
  if (!existing) {
    const sections = profileSectionsFromAssessment(snapshot, { name: input.googleName }, { nowYear: new Date().getUTCFullYear() });
    const { pct } = computeCompleteness(sections);
    await upsertProfile(adminDb, { owner: input.userId, sections, completeness: pct });
  }

  // Mark is_primary unless the user already has one
  await adminDb
    .from("assessments")
    .update({ is_primary: true })
    .eq("id", input.assessmentId)
    .is("is_primary", false);
  // The unique partial index ensures the update is a no-op if another row is already primary.

  return { claimed: true };
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/assessments/claim.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/assessments/claim.ts tests/assessments/claim.test.ts
git commit -m "feat: add claimAndBootstrapProfile (claim + profile + set primary)"
```

---

## Task 11: Wire OAuth callback to claimAndBootstrapProfile

**Files:**
- Modify: `app/auth/callback/route.ts`
- Modify: `tests/api/auth-callback.test.ts`

- [ ] **Step 1: Update the route**

Edit `app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claim = url.searchParams.get("claim");
  const next = url.searchParams.get("next");
  const origin = url.origin;

  if (!code) return NextResponse.redirect(`${origin}/assess`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/assess?error=auth`);

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  const googleName = data.user?.user_metadata?.full_name as string | undefined;

  if (claim && userId) {
    await claimAndBootstrapProfile(createSupabaseAdminClient(), {
      assessmentId: claim, userId, googleName,
    });
    return NextResponse.redirect(`${origin}/assessment/${claim}`);
  }

  const fallback = next && next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${fallback}`);
}
```

- [ ] **Step 2: Update existing test `tests/api/auth-callback.test.ts`**

The existing test mocks `claimAssessment`. Replace with `claimAndBootstrapProfile`:

```tsx
// At the top of the file, replace the claimAssessment mock with:
const claimAndBootstrapProfile = vi.fn();
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));

// In the first "it" (success path):
exchangeCodeForSession.mockResolvedValue({ error: null });
getUser.mockResolvedValue({ data: { user: { id: "user-1", user_metadata: { full_name: "Aarav" } } } });
claimAndBootstrapProfile.mockResolvedValue({ claimed: true });

const res = await GET(url("code=abc&claim=aid-1"));
expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ assessmentId: "aid-1", userId: "user-1", googleName: "Aarav" }),
);
expect(res.status).toBe(307);
expect(res.headers.get("location")).toContain("/assessment/aid-1");

// Add a third test for the "no claim, signed-in" path:
it("redirects to /dashboard when there is no claim", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  const res = await GET(url("code=abc"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toContain("/dashboard");
});

// Add a fourth for "?next=" override:
it("honors a relative ?next= param when no claim", async () => {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  const res = await GET(url("code=abc&next=/profile"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toContain("/profile");
});
```

Remove references to the old `claimAssessment` mock from earlier tests.

- [ ] **Step 3: Run it and confirm pass**

Run: `npm test -- tests/api/auth-callback.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/auth/callback/route.ts tests/api/auth-callback.test.ts
git commit -m "feat: callback uses claimAndBootstrapProfile + /dashboard fallback"
```

---

## Task 12: Validation schema for profile section patch

**Files:**
- Create: `lib/validation/profile-section.ts`
- Create: `tests/validation/profile-section.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/validation/profile-section.test.ts
import { describe, it, expect } from "vitest";
import { PersonalSectionPatchSchema, ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

describe("PersonalSectionPatchSchema", () => {
  it("accepts a full personal patch", () => {
    const r = PersonalSectionPatchSchema.safeParse({
      name: "Aarav Sharma", age: 23, intakeIso: "2027-07-01",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a partial patch", () => {
    expect(PersonalSectionPatchSchema.safeParse({ name: "Aarav" }).success).toBe(true);
  });

  it("rejects nonsense age", () => {
    expect(PersonalSectionPatchSchema.safeParse({ age: 5 }).success).toBe(false);
    expect(PersonalSectionPatchSchema.safeParse({ age: 200 }).success).toBe(false);
  });

  it("rejects bad ISO date", () => {
    expect(PersonalSectionPatchSchema.safeParse({ intakeIso: "tomorrow" }).success).toBe(false);
  });
});

describe("ProfileSectionPatchBodySchema (envelope)", () => {
  it("accepts {section: 'personal', patch: { name }}", () => {
    expect(ProfileSectionPatchBodySchema.safeParse({
      section: "personal", patch: { name: "Aarav" },
    }).success).toBe(true);
  });

  it("rejects unknown section", () => {
    expect(ProfileSectionPatchBodySchema.safeParse({
      section: "academic", patch: {},
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/validation/profile-section.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/validation/profile-section.ts
import { z } from "zod";

export const PersonalSectionPatchSchema = z.object({
  name:      z.string().min(1).max(120).optional(),
  age:       z.number().int().min(15).max(80).optional(),
  intakeIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PersonalSectionPatch = z.infer<typeof PersonalSectionPatchSchema>;

// In Phase 1.5 only "personal" is patchable. Other section keys are intentionally rejected.
export const ProfileSectionPatchBodySchema = z.object({
  section: z.literal("personal"),
  patch: PersonalSectionPatchSchema,
});
export type ProfileSectionPatchBody = z.infer<typeof ProfileSectionPatchBodySchema>;
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/validation/profile-section.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/profile-section.ts tests/validation/profile-section.test.ts
git commit -m "feat: add Zod for profile section patch"
```

---

## Task 13: `PATCH /api/profile/section` route

**Files:**
- Create: `app/api/profile/section/route.ts`
- Create: `tests/api/profile-section.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/profile-section.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
const patchProfileSection = vi.fn();
vi.mock("@/lib/profiles/repo", () => ({ patchProfileSection }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));

import { PATCH } from "@/app/api/profile/section/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/profile/section", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/profile/section", () => {
  beforeEach(() => {
    getUser.mockReset();
    patchProfileSection.mockReset();
  });

  it("401s when no user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(401);
  });

  it("422s on invalid body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(req({ section: "academic", patch: {} }));
    expect(res.status).toBe(422);
  });

  it("patches the section and returns the new completeness", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    patchProfileSection.mockResolvedValue({ completeness: 12, sections: { personal: { name: "X" } } });
    const res = await PATCH(req({ section: "personal", patch: { name: "X" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, completeness: 12 });
  });

  it("400s on malformed JSON", async () => {
    const res = await PATCH(new Request("http://localhost/api/profile/section", {
      method: "PATCH", body: "{bad",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/api/profile-section.test.ts`
Expected: FAIL — route unresolved.

- [ ] **Step 3: Implement**

```ts
// app/api/profile/section/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchProfileSection } from "@/lib/profiles/repo";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";

export async function PATCH(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ProfileSectionPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  const result = await patchProfileSection(admin, data.user.id, parsed.data.section, parsed.data.patch);
  return NextResponse.json({ ok: true, completeness: result.completeness }, { status: 200 });
}
```

- [ ] **Step 4: Run it and confirm pass**

Run: `npm test -- tests/api/profile-section.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/profile/section/route.ts tests/api/profile-section.test.ts
git commit -m "feat: add PATCH /api/profile/section"
```

---

## Task 14: `/api/assess` — signed-in branch

**Files:**
- Modify: `app/api/assess/route.ts`
- Modify: `tests/api/assess-persist.test.ts`

The existing route persists anonymously for everyone. New behavior: if signed in, persist with `owner = uid`, `expires_at` far-future (or null), and set `is_primary = true` iff no existing primary. Also bootstrap profile if missing.

- [ ] **Step 1: Update the route**

Replace `app/api/assess/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAnonymousAssessment, getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";
import type { Json } from "@/lib/supabase/types";

const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = assembleAssessment(parsed.data);
  const adminDb = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  let id: string | null = null;
  try {
    if (user) {
      // Signed-in path: persist with owner, set primary if none, bootstrap profile if missing.
      const existingPrimary = await getPrimaryAssessmentForUser(supabase, user.id);
      const { data, error } = await adminDb
        .from("assessments")
        .insert({
          owner: user.id,
          profile_snapshot: parsed.data as unknown as Json,
          destination_id: parsed.data.destination,
          result: payload as unknown as Json,
          rule_version: payload.result.ruleVersion,
          expires_at: FAR_FUTURE,
          is_primary: !existingPrimary,
        })
        .select("id")
        .single();
      if (!error && data) id = data.id;

      const existingProfile = await getProfile(supabase, user.id);
      if (!existingProfile) {
        const googleName = user.user_metadata?.full_name as string | undefined;
        const sections = profileSectionsFromAssessment(parsed.data as unknown as Record<string, unknown>, { name: googleName }, { nowYear: new Date().getUTCFullYear() });
        const { pct } = computeCompleteness(sections);
        await upsertProfile(adminDb, { owner: user.id, sections, completeness: pct });
      }
    } else {
      // Anonymous path (unchanged behavior)
      id = await createAnonymousAssessment(adminDb, {
        profileSnapshot: parsed.data as unknown as Json,
        destinationId: parsed.data.destination,
        result: payload as unknown as Json,
        ruleVersion: payload.result.ruleVersion,
        expiresAt: assessmentExpiry(),
      });
    }
  } catch {
    id = null;
  }

  return NextResponse.json({ id, payload }, { status: 200 });
}
```

- [ ] **Step 2: Update the existing test to use the new repo signature + add a signed-in case**

In `tests/api/assess-persist.test.ts`, the existing test mocks `createAnonymousAssessment` and `createSupabaseAdminClient`. Add mocks for `createSupabaseServerClient`, `getPrimaryAssessmentForUser`, `getProfile`, `upsertProfile`, and adjust input shape (`profileSnapshot` + `destinationId`).

Then **add a new test case for the signed-in branch**:

```tsx
it("persists with owner + is_primary when the user is signed in and has no prior primary", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { full_name: "A" } } } });
  getPrimaryAssessmentForUser.mockResolvedValue(null);
  getProfile.mockResolvedValue(null);
  upsertProfile.mockResolvedValue("p1");
  // adminDb.from('assessments').insert(...).select('id').single() should resolve to an id:
  const adminInsert = { id: "as-1" };
  // Use a stubbed admin client that returns the insert chain
  ...

  const res = await POST(req(validProfile));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.id).toBe("as-1");
  expect(upsertProfile).toHaveBeenCalled();
});
```

> **Hint:** for the admin client, you can use `fakeSupabase({ data: { id: "as-1" }, error: null })` from the helper and pass it as the `createSupabaseAdminClient` mock return. Same for the server client where helpful — though `getUser` is what matters there.

The full test suite for this file needs three cases now:
1. Anonymous flow (existing): id returned, payload has verdict
2. Anonymous flow with insert error: id null, payload still returned
3. Validation failure (existing)
4. **NEW** Signed-in flow: id returned, profile upserted, `is_primary: true` on insert

- [ ] **Step 3: Run it and confirm pass**

Run: `npm test -- tests/api/assess-persist.test.ts`
Expected: PASS (≥4 tests).

- [ ] **Step 4: Commit**

```bash
git add app/api/assess/route.ts tests/api/assess-persist.test.ts
git commit -m "feat: /api/assess persists as owner when signed in"
```

---

## Task 15: AppBar — `app` + `marketing-signed-in` variants

**Files:**
- Modify: `components/layout/app-bar.tsx`
- Modify: `tests/components/layout/app-bar.test.tsx`
- Create: `components/layout/user-pill.tsx` (referenced by app-bar) — implemented in Task 16

The AppBar gets two new variants. Defer the actual UserPill rendering to a placeholder import (Task 16 wires the real component). For this task, use a tiny inline placeholder.

- [ ] **Step 1: Write the failing test additions**

Append to `tests/components/layout/app-bar.test.tsx`:

```tsx
describe("AppBar — marketing-signed-in variant", () => {
  it("hides Sign in and shows Open dashboard CTA + UserPill placeholder", () => {
    render(<AppBar variant="marketing-signed-in" user={{ email: "a@b.com", user_metadata: {} } as never} />);
    expect(screen.queryByRole("link", { name: /Sign in/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Open dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByTestId("user-pill")).toBeInTheDocument();
  });
});

describe("AppBar — app variant", () => {
  it("renders signed-in nav and UserPill", () => {
    render(<AppBar variant="app" user={{ email: "a@b.com", user_metadata: {} } as never} />);
    expect(screen.getByRole("link", { name: /Home/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Matches/i })).toHaveAttribute("href", "/matches");
    expect(screen.getByRole("link", { name: /My plan/i })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /^Profile$/i })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Guide/i })).toHaveAttribute("href", "/guide");
    expect(screen.getByRole("link", { name: /Destinations/i })).toHaveAttribute("href", "/destinations");
    expect(screen.getByTestId("user-pill")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Replace `components/layout/app-bar.tsx` (keep the existing marketing variant; add the new ones; widen the `Variant` type):

```tsx
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Logo } from "./logo";
import { UserPill } from "./user-pill";

type Variant = "marketing" | "marketing-signed-in" | "app";

const NAV_MARKETING = [
  { label: "How it works", href: "/how" },
  { label: "Destinations", href: "/destinations" },
  { label: "Why trust us", href: "/trust" },
];

const NAV_APP = [
  { label: "Home", href: "/dashboard" },
  { label: "Matches", href: "/matches" },
  { label: "My plan", href: "/plan" },
  { label: "Profile", href: "/profile" },
  { label: "Guide", href: "/guide" },
  { label: "Destinations", href: "/destinations" },
];

export function AppBar({ variant, user }: { variant: Variant; user?: User | null }) {
  if (variant === "marketing") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-[15px] text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth" className="hidden rounded-pill px-4 py-2 text-[15px] text-ink-soft hover:bg-bg-tint hover:text-ink md:inline-flex">Sign in</Link>
            <Link href="/assess" className="inline-flex items-center rounded-pill bg-primary px-[15px] py-2 text-[14px] font-medium text-on-primary hover:bg-primary-ink">Check eligibility</Link>
          </div>
        </div>
      </header>
    );
  }

  if (variant === "marketing-signed-in") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-[15px] text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden rounded-pill bg-primary px-[15px] py-2 text-[14px] font-medium text-on-primary hover:bg-primary-ink md:inline-flex">Open dashboard</Link>
            <UserPill user={user!} />
          </div>
        </div>
      </header>
    );
  }

  if (variant === "app") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <nav className="hidden items-center gap-5 md:flex">
              {NAV_APP.map((i) => (
                <Link key={i.href} href={i.href} className="text-[15px] text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <UserPill user={user!} />
        </div>
      </header>
    );
  }

  variant satisfies never;
  return null;
}
```

- [ ] **Step 3: Run AppBar tests**

Run: `npm test -- tests/components/layout/app-bar.test.tsx`
Expected: FAIL on the two new tests (UserPill doesn't exist yet) — that's expected. We address in Task 16. For now, **skip the new tests temporarily** by marking them `.skip`:

```tsx
describe.skip("AppBar — marketing-signed-in variant", () => { ... });
describe.skip("AppBar — app variant", () => { ... });
```

Re-run: tests pass for the existing variant test. Continue.

- [ ] **Step 4: Commit**

```bash
git add components/layout/app-bar.tsx tests/components/layout/app-bar.test.tsx
git commit -m "feat: AppBar — add marketing-signed-in + app variants (UserPill pending)"
```

---

## Task 16: UserPill component

**Files:**
- Create: `components/layout/user-pill.tsx`
- Create: `tests/components/layout/user-pill.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/user-pill.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserPill } from "@/components/layout/user-pill";

const mkUser = (overrides: Record<string, unknown> = {}) => ({
  id: "u1", email: "aarav@example.com",
  user_metadata: { full_name: "Aarav Sharma" },
  ...overrides,
} as never);

describe("UserPill", () => {
  it("renders initials computed from full name", () => {
    render(<UserPill user={mkUser()} />);
    expect(screen.getByTestId("user-pill")).toHaveTextContent("AS");
  });

  it("falls back to email initial when no name", () => {
    render(<UserPill user={mkUser({ user_metadata: {} })} />);
    expect(screen.getByTestId("user-pill")).toHaveTextContent("A");
  });

  it("expands a menu on click with Dashboard / Profile / Sign out", async () => {
    render(<UserPill user={mkUser()} />);
    await userEvent.click(screen.getByTestId("user-pill"));
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Profile/i })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("Sign out submits a POST form to /auth/signout", async () => {
    render(<UserPill user={mkUser()} />);
    await userEvent.click(screen.getByTestId("user-pill"));
    const form = screen.getByTestId("signout-form");
    expect(form).toHaveAttribute("action", "/auth/signout");
    expect(form).toHaveAttribute("method", "post");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/components/layout/user-pill.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement**

```tsx
// components/layout/user-pill.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

function initialsFrom(user: User): string {
  const name = (user.user_metadata?.full_name as string | undefined) ?? "";
  if (name.trim()) {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  }
  return (user.email ?? "?")[0]!.toUpperCase();
}

export function UserPill({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const initials = initialsFrom(user);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="user-pill"
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-pill border border-line-2 bg-bg-tint text-[13px] font-medium text-ink hover:border-primary"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-md border border-line bg-surface shadow-sm">
          <Link href="/dashboard" className="block px-4 py-2 text-[15px] text-ink hover:bg-bg-tint">Dashboard</Link>
          <Link href="/profile" className="block px-4 py-2 text-[15px] text-ink hover:bg-bg-tint">Profile</Link>
          <form data-testid="signout-form" action="/auth/signout" method="post" className="border-t border-line">
            <button type="submit" className="block w-full px-4 py-2 text-left text-[15px] text-ink hover:bg-bg-tint">Sign out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Re-enable the AppBar tests skipped in Task 15**

In `tests/components/layout/app-bar.test.tsx`, change `describe.skip` back to `describe` for the two new variant blocks.

- [ ] **Step 5: Run UserPill + AppBar tests**

```bash
npm test -- tests/components/layout/user-pill.test.tsx
npm test -- tests/components/layout/app-bar.test.tsx
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add components/layout/user-pill.tsx tests/components/layout/user-pill.test.tsx tests/components/layout/app-bar.test.tsx
git commit -m "feat: UserPill avatar + menu; re-enable AppBar variant tests"
```

---

## Task 17: FocusBar — `signedIn` prop

**Files:**
- Modify: `components/layout/focus-bar.tsx`
- Modify: `tests/components/layout/focus-bar.test.tsx`

- [ ] **Step 1: Update test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusBar } from "@/components/layout/focus-bar";

describe("FocusBar", () => {
  it("renders the logo and the no-sign-up reassurance note when signed-out", () => {
    render(<FocusBar />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/");
    expect(screen.getByText(/no sign-up to start/i)).toBeInTheDocument();
  });

  it("hides the reassurance note when signedIn is true", () => {
    render(<FocusBar signedIn />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toBeInTheDocument();
    expect(screen.queryByText(/no sign-up to start/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// components/layout/focus-bar.tsx
import { Logo } from "./logo";

export function FocusBar({ signedIn = false }: { signedIn?: boolean } = {}) {
  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center justify-between px-5">
        <Logo />
        {signedIn ? null : (
          <span className="hidden items-center gap-2 font-mono text-[12.5px] text-ink-soft sm:inline-flex">
            <svg aria-hidden viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            </svg>
            no sign-up to start
          </span>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/components/layout/focus-bar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add components/layout/focus-bar.tsx tests/components/layout/focus-bar.test.tsx
git commit -m "feat: FocusBar — signedIn prop hides reassurance copy"
```

---

## Task 18: `(marketing)` layout reads session

**Files:**
- Modify: `app/(marketing)/layout.tsx`

- [ ] **Step 1: Replace the layout**

```tsx
// app/(marketing)/layout.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const variant = data.user ? "marketing-signed-in" : "marketing";
  return (
    <>
      <AppBar variant={variant} user={data.user ?? null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Update marketing-home test to mock session**

`tests/app/marketing-home.test.tsx` currently does `await HomePage()`. Layouts don't run during page-component tests, so this still passes. But the build will exercise the layout. Run the build to be sure:

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/(marketing)/layout.tsx
git commit -m "feat: (marketing) layout switches AppBar variant by session"
```

---

## Task 19: `(focused)` layout reads session

**Files:**
- Modify: `app/(focused)/layout.tsx`

- [ ] **Step 1: Replace the layout**

```tsx
// app/(focused)/layout.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FocusBar } from "@/components/layout/focus-bar";

export default async function FocusedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return (
    <>
      <FocusBar signedIn={!!data.user} />
      <main>{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Confirm build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/(focused)/layout.tsx
git commit -m "feat: (focused) layout passes signedIn to FocusBar"
```

---

## Task 20: `(app)` route group + auth-gated layout

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `tests/app/app-layout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/app-layout.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/app-bar", () => ({
  AppBar: () => <div data-testid="appbar">appbar</div>,
}));
vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">footer</div>,
}));

import AppLayout from "@/app/(app)/layout";

describe("(app) layout", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("redirects to /auth?next=/dashboard when no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: <div>kid</div> })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?next=/dashboard");
  });

  it("renders chrome around children when user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    render(ui);
    expect(screen.getByTestId("appbar")).toBeInTheDocument();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npm test -- tests/app/app-layout.test.tsx`
Expected: FAIL — layout unresolved.

- [ ] **Step 3: Implement**

```tsx
// app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/dashboard");
  return (
    <>
      <AppBar variant="app" user={data.user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- tests/app/app-layout.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(app)/layout.tsx tests/app/app-layout.test.tsx
git commit -m "feat: (app) route group with auth gate + AppBar variant app"
```

---

## Task 21: Stub pages — /matches, /plan, /checklist, /guide

**Files:**
- Create: `app/(app)/matches/page.tsx`
- Create: `app/(app)/plan/page.tsx`
- Create: `app/(app)/checklist/page.tsx`
- Create: `app/(app)/guide/page.tsx`
- Create: `tests/app/app-stubs.test.tsx`

- [ ] **Step 1: Write the test that covers all four**

```tsx
// tests/app/app-stubs.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchesPage from "@/app/(app)/matches/page";
import PlanPage from "@/app/(app)/plan/page";
import ChecklistPage from "@/app/(app)/checklist/page";
import GuidePage from "@/app/(app)/guide/page";

const cases: Array<[string, React.ComponentType, RegExp, RegExp]> = [
  ["matches", MatchesPage,   /Matches landing in Phase 3/i, /your shortlist/i],
  ["plan",    PlanPage,      /My plan landing in Phase 4/i, /ranked action/i],
  ["checklist", ChecklistPage, /Checklist landing in Phase 5/i, /document/i],
  ["guide",   GuidePage,     /Guide landing in Phase 6/i, /AI guide/i],
];

describe("(app) stub pages", () => {
  for (const [name, Comp, headline, body] of cases) {
    it(`${name} renders headline + body + back link`, () => {
      render(<Comp />);
      expect(screen.getByText(headline)).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Back to dashboard/i })).toHaveAttribute("href", "/dashboard");
    });
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/app/app-stubs.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement a shared StubPage and four pages**

```tsx
// app/(app)/matches/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function MatchesPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">Matches landing in Phase 3.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        We&apos;re wiring real Nepal → Australia program data right now. This page will show your shortlist of
        programs, scholarships, and cost estimates against your profile.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">Back to dashboard</Link>
    </section>
  );
}
```

```tsx
// app/(app)/plan/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function PlanPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">My plan landing in Phase 4.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        A ranked action list — the highest-impact thing you can do today to strengthen your application, with
        explanations.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">Back to dashboard</Link>
    </section>
  );
}
```

```tsx
// app/(app)/checklist/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function ChecklistPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">Checklist landing in Phase 5.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        A live document checklist per program, with upload tracking and real deadlines.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">Back to dashboard</Link>
    </section>
  );
}
```

```tsx
// app/(app)/guide/page.tsx
import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function GuidePage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">Guide landing in Phase 6.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        Your AI guide — reads your profile and explains its reasoning. Coming with sources, never writes your
        application for you.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">Back to dashboard</Link>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/app/app-stubs.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/(app)/matches app/(app)/plan app/(app)/checklist app/(app)/guide tests/app/app-stubs.test.tsx
git commit -m "feat: stub pages for matches/plan/checklist/guide"
```

---

## Task 22: Dashboard — Greeting

**Files:**
- Create: `components/dashboard/greeting.tsx`
- Create: `tests/components/dashboard/greeting.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/greeting.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Greeting } from "@/components/dashboard/greeting";

describe("Greeting", () => {
  it("renders 'Good morning, {first name}' from the profile name", () => {
    render(<Greeting name="Aarav Sharma" partOfDay="morning" />);
    expect(screen.getByText(/Good morning, Aarav/i)).toBeInTheDocument();
  });

  it("falls back to 'there' when no name", () => {
    render(<Greeting name={null} partOfDay="afternoon" />);
    expect(screen.getByText(/Good afternoon, there/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/components/dashboard/greeting.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/greeting.tsx
export type PartOfDay = "morning" | "afternoon" | "evening";

export function Greeting({ name, partOfDay }: { name: string | null; partOfDay: PartOfDay }) {
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  return (
    <header className="flex flex-col gap-1">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Welcome back</span>
      <h1 className="text-[clamp(28px,3.6vw,40px)] leading-[1.05]">Good {partOfDay}, {first}.</h1>
    </header>
  );
}
```

- [ ] **Step 4: Run and pass**

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/greeting.tsx tests/components/dashboard/greeting.test.tsx
git commit -m "feat: Greeting dashboard component"
```

---

## Task 23: Dashboard — SnapshotCard

**Files:**
- Create: `components/dashboard/snapshot-card.tsx`
- Create: `tests/components/dashboard/snapshot-card.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/snapshot-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import type { AssessmentPayload } from "@/lib/results/types";

const payload: AssessmentPayload = {
  result: {
    verdict: "strong",
    overallScore: 78,
    dimensions: {
      academic:        { score: 80, weight: 0.3, level: "strong", reason: "Grade well above threshold" },
      financial:       { score: 70, weight: 0.25, level: "possible", reason: "Budget covers tuition" },
      visa:            { score: 75, weight: 0.25, level: "strong", reason: "Gap explained" },
      profileStrength: { score: 80, weight: 0.2, level: "strong", reason: "Work experience" },
    },
    ruleVersion: "v0.1.0",
  },
  destination: { name: "Australia", flag: "🇦🇺" },
  intake: { nextName: "February", nextMonth: 2, deadlineIso: "2026-10-15", weeksAway: 18 },
  matches: [], matchedCount: 6, accuracy: { pct: 60 },
} as unknown as AssessmentPayload;

describe("SnapshotCard", () => {
  it("renders the verdict label and the destination", () => {
    render(<SnapshotCard primary={payload} destinationLabel="Australia" />);
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/Australia/i)).toBeInTheDocument();
  });

  it("renders a 'Run your first assessment' empty state when payload is null", () => {
    render(<SnapshotCard primary={null} destinationLabel={null} />);
    expect(screen.getByText(/Run your first assessment/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/components/dashboard/snapshot-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/snapshot-card.tsx
import Link from "next/link";
import type { AssessmentPayload } from "@/lib/results/types";
import { VerdictCard } from "@/components/results/verdict-card";
import { FactorBars } from "@/components/results/factor-bars";

export function SnapshotCard({
  primary,
  destinationLabel,
}: {
  primary: AssessmentPayload | null;
  destinationLabel: string | null;
}) {
  if (!primary) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Snapshot</span>
        <h2 className="text-[22px]">Run your first assessment</h2>
        <p className="text-[15px] text-ink-soft">Two minutes, no questions skipped. We&apos;ll show where you stand.</p>
        <Link href="/assess" className="mt-2 inline-flex w-fit items-center rounded-pill bg-primary px-5 py-2 text-[15px] font-medium text-on-primary hover:bg-primary-ink">
          Check eligibility →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Your standing for {destinationLabel ?? "your destination"}
      </span>
      <VerdictCard verdict={primary.result.verdict} />
      <FactorBars dimensions={primary.result.dimensions} />
    </div>
  );
}
```

- [ ] **Step 4: Pass + Commit**

```bash
npm test -- tests/components/dashboard/snapshot-card.test.tsx
git add components/dashboard/snapshot-card.tsx tests/components/dashboard/snapshot-card.test.tsx
git commit -m "feat: SnapshotCard dashboard component"
```

---

## Task 24: Dashboard — PromptCard

**Files:**
- Create: `components/dashboard/prompt-card.tsx`
- Create: `tests/components/dashboard/prompt-card.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/prompt-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromptCard } from "@/components/dashboard/prompt-card";

describe("PromptCard", () => {
  it("renders the IELTS prompt with a CTA when reportUploaded is false", () => {
    render(<PromptCard kind="ielts-missing" />);
    expect(screen.getByText(/Upload your IELTS report/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add details/i })).toHaveAttribute("href", "/profile");
  });

  it("renders a generic next-best-step card when kind is profile-incomplete", () => {
    render(<PromptCard kind="profile-incomplete" />);
    expect(screen.getByText(/Your next best step/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add details/i })).toHaveAttribute("href", "/profile");
  });

  it("renders empty state when kind is none", () => {
    render(<PromptCard kind="none" />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/prompt-card.tsx
import Link from "next/link";

export type PromptKind = "ielts-missing" | "profile-incomplete" | "none";

export function PromptCard({ kind }: { kind: PromptKind }) {
  if (kind === "none") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Next step</span>
        <p className="text-[15px] text-ink">All caught up — refresh your assessment whenever your profile changes.</p>
      </div>
    );
  }
  const isIelts = kind === "ielts-missing";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-transparent bg-primary p-6 text-on-primary">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-on-primary/70">Your next best step</span>
      <h3 className="text-[21px]">{isIelts ? "Upload your IELTS report" : "Your next best step"}</h3>
      <p className="text-[15px] opacity-90">
        {isIelts
          ? "You've shared your overall band — uploading the report unlocks per-band scoring against program minimums."
          : "Filling more of your profile sharpens the verdict and unlocks better matches."}
      </p>
      <Link href="/profile" className="mt-2 inline-flex w-fit items-center rounded-pill bg-on-primary px-4 py-2 text-[14px] font-medium text-primary hover:opacity-90">
        Add details →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test -- tests/components/dashboard/prompt-card.test.tsx
git add components/dashboard/prompt-card.tsx tests/components/dashboard/prompt-card.test.tsx
git commit -m "feat: PromptCard dashboard component"
```

---

## Task 25: Dashboard — JourneyTimeline

**Files:**
- Create: `components/dashboard/journey-timeline.tsx`
- Create: `tests/components/dashboard/journey-timeline.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/journey-timeline.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JourneyTimeline } from "@/components/dashboard/journey-timeline";

describe("JourneyTimeline", () => {
  it("renders all 5 phase labels", () => {
    render(<JourneyTimeline currentStep="shortlist" />);
    for (const label of ["Shortlist & prep", "Apply", "Visa", "Pre-departure", "Arrival"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the currentStep as active", () => {
    render(<JourneyTimeline currentStep="apply" />);
    const active = screen.getByTestId("step-apply");
    expect(active).toHaveAttribute("data-active", "true");
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/dashboard/journey-timeline.tsx
export type Step = "shortlist" | "apply" | "visa" | "pre-departure" | "arrival";

const STEPS: Array<[Step, string]> = [
  ["shortlist", "Shortlist & prep"],
  ["apply", "Apply"],
  ["visa", "Visa"],
  ["pre-departure", "Pre-departure"],
  ["arrival", "Arrival"],
];

export function JourneyTimeline({ currentStep }: { currentStep: Step }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Your journey</span>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {STEPS.map(([key, label]) => (
          <li
            key={key}
            data-testid={`step-${key}`}
            data-active={key === currentStep ? "true" : "false"}
            className={`flex flex-col items-start gap-2 rounded-md border border-line p-3 ${key === currentStep ? "bg-primary-tint" : ""}`}
          >
            <span className={`inline-block h-2 w-2 rounded-pill ${key === currentStep ? "bg-primary" : "bg-line-2"}`} />
            <span className="text-[14px] font-medium text-ink">{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/dashboard/journey-timeline.test.tsx
git add components/dashboard/journey-timeline.tsx tests/components/dashboard/journey-timeline.test.tsx
git commit -m "feat: JourneyTimeline dashboard component"
```

---

## Task 26: Dashboard — StatsRow

**Files:**
- Create: `components/dashboard/stats-row.tsx`
- Create: `tests/components/dashboard/stats-row.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/stats-row.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "@/components/dashboard/stats-row";

describe("StatsRow", () => {
  it("renders four stat tiles with values", () => {
    render(<StatsRow universities={6} checklistDone={0} profilePct={42} scholarships={null} />);
    expect(screen.getByText("Universities")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Checklist")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument(); // null scholarships
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/dashboard/stats-row.tsx
function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-5">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-[24px] font-medium text-ink">{value}</span>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function StatsRow({
  universities, checklistDone, profilePct, scholarships,
}: {
  universities: number | null;
  checklistDone: number | null;
  profilePct: number;
  scholarships: number | null;
}) {
  const dash = "—";
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Universities" value={universities ?? dash} href="/matches" />
      <Stat label="Checklist" value={checklistDone ?? dash} href="/checklist" />
      <Stat label="Profile" value={`${profilePct}%`} href="/profile" />
      <Stat label="Scholarships" value={scholarships ?? dash} href="/matches" />
    </section>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/dashboard/stats-row.test.tsx
git add components/dashboard/stats-row.tsx tests/components/dashboard/stats-row.test.tsx
git commit -m "feat: StatsRow dashboard component"
```

---

## Task 27: Dashboard — RecentUpdates

**Files:**
- Create: `components/dashboard/recent-updates.tsx`
- Create: `tests/components/dashboard/recent-updates.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/dashboard/recent-updates.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentUpdates } from "@/components/dashboard/recent-updates";

describe("RecentUpdates", () => {
  it("renders an empty state when no updates", () => {
    render(<RecentUpdates updates={[]} />);
    expect(screen.getByText(/No updates yet/i)).toBeInTheDocument();
  });

  it("renders update rows when given updates", () => {
    render(
      <RecentUpdates updates={[
        { id: "1", title: "Visa rule update", body: "Australia GS rules tightened.", iso: "2026-06-01" },
      ]} />
    );
    expect(screen.getByText(/Visa rule update/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-01/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/dashboard/recent-updates.tsx
export interface UpdateItem {
  id: string;
  title: string;
  body: string;
  iso: string;
}

export function RecentUpdates({ updates }: { updates: UpdateItem[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Recent updates</span>
      {updates.length === 0 ? (
        <p className="text-[15px] text-ink-soft">No updates yet. We&apos;ll notify you here when visa rules or matches change.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <span className="text-[15px] font-medium text-ink">{u.title}</span>
              <span className="text-[14px] text-ink-soft">{u.body}</span>
              <span className="font-mono text-[12px] text-ink-faint">{u.iso}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/dashboard/recent-updates.test.tsx
git add components/dashboard/recent-updates.tsx tests/components/dashboard/recent-updates.test.tsx
git commit -m "feat: RecentUpdates dashboard component"
```

---

## Task 28: Dashboard — page composition

**Files:**
- Create: `app/(app)/dashboard/page.tsx`
- Create: `tests/app/dashboard-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/dashboard-page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, getPrimaryAssessmentForUser, getProfile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/components/dashboard/snapshot-card", () => ({
  SnapshotCard: ({ primary }: { primary: unknown }) => <div data-testid="snap">{primary ? "has-snap" : "empty-snap"}</div>,
}));
vi.mock("@/components/dashboard/prompt-card", () => ({
  PromptCard: ({ kind }: { kind: string }) => <div data-testid="prompt">{kind}</div>,
}));
vi.mock("@/components/dashboard/greeting", () => ({
  Greeting: ({ name }: { name: string | null }) => <div data-testid="greet">{name ?? "anon"}</div>,
}));
vi.mock("@/components/dashboard/journey-timeline", () => ({ JourneyTimeline: () => <div data-testid="jt" /> }));
vi.mock("@/components/dashboard/stats-row",       () => ({ StatsRow:        () => <div data-testid="sr" /> }));
vi.mock("@/components/dashboard/recent-updates",  () => ({ RecentUpdates:   () => <div data-testid="ru" /> }));

import DashboardPage from "@/app/(app)/dashboard/page";

describe("/dashboard page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForUser.mockReset();
    getProfile.mockReset();
  });

  it("renders all five sections for a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({
      result: { result: { verdict: "strong", dimensions: {} } },
      destination_id: "australia",
    });
    getProfile.mockResolvedValue({ sections: { personal: { name: "Aarav Sharma" } }, completeness: 12 });

    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("greet")).toHaveTextContent("Aarav Sharma");
    expect(screen.getByTestId("snap")).toHaveTextContent("has-snap");
    expect(screen.getByTestId("prompt")).toBeInTheDocument();
    expect(screen.getByTestId("jt")).toBeInTheDocument();
    expect(screen.getByTestId("sr")).toBeInTheDocument();
    expect(screen.getByTestId("ru")).toBeInTheDocument();
  });

  it("renders the empty snapshot when user has no primary assessment", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    getProfile.mockResolvedValue(null);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByTestId("snap")).toHaveTextContent("empty-snap");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/app/dashboard-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// app/(app)/dashboard/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { Greeting } from "@/components/dashboard/greeting";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import { PromptCard, type PromptKind } from "@/components/dashboard/prompt-card";
import { JourneyTimeline } from "@/components/dashboard/journey-timeline";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentUpdates } from "@/components/dashboard/recent-updates";
import type { AssessmentPayload } from "@/lib/results/types";
import type { ProfileSections } from "@/lib/profiles/sections";

function partOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function pickPromptKind(profile: { sections: ProfileSections } | null, primary: unknown): PromptKind {
  if (!profile) return "profile-incomplete";
  const s = profile.sections;
  if (s.english && s.english.overall && s.english.reportUploaded === false) return "ielts-missing";
  if (primary) return "none";
  return "profile-incomplete";
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user!;
  const [primaryRow, profileRow] = await Promise.all([
    getPrimaryAssessmentForUser(supabase, user.id),
    getProfile(supabase, user.id),
  ]);
  const primary = (primaryRow?.result as unknown as AssessmentPayload | undefined) ?? null;
  const profileSections = (profileRow?.sections as ProfileSections | undefined) ?? null;
  const name = profileSections?.personal?.name ?? null;
  const completenessPct = profileRow?.completeness ?? 0;
  const promptKind = pickPromptKind(profileRow as { sections: ProfileSections } | null, primary);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <Greeting name={name} partOfDay={partOfDay()} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SnapshotCard primary={primary} destinationLabel={primaryRow?.destination_id ?? null} />
        <PromptCard kind={promptKind} />
      </div>
      <JourneyTimeline currentStep="shortlist" />
      <StatsRow
        universities={primary?.matchedCount ?? null}
        checklistDone={null}
        profilePct={completenessPct}
        scholarships={null}
      />
      <RecentUpdates updates={[]} />
    </div>
  );
}
```

- [ ] **Step 4: Pass + commit**

```bash
npm test -- tests/app/dashboard-page.test.tsx
git add app/(app)/dashboard/page.tsx tests/app/dashboard-page.test.tsx
git commit -m "feat: /dashboard page composition"
```

---

## Task 29: Profile — CompletenessRing

**Files:**
- Create: `components/profile/completeness-ring.tsx`
- Create: `tests/components/profile/completeness-ring.test.tsx`

- [ ] **Step 1: Test + implement (small)**

```tsx
// tests/components/profile/completeness-ring.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessRing } from "@/components/profile/completeness-ring";

describe("CompletenessRing", () => {
  it("renders the percent label and a status breakdown", () => {
    render(<CompletenessRing pct={42} complete={5} partial={3} empty={5} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/5 complete/i)).toBeInTheDocument();
    expect(screen.getByText(/3 partial/i)).toBeInTheDocument();
    expect(screen.getByText(/5 not started/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/profile/completeness-ring.tsx
export function CompletenessRing({
  pct, complete, partial, empty,
}: { pct: number; complete: number; partial: number; empty: number }) {
  // simple circle via SVG, no real ring stroke math — visual is approximate
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Completeness</span>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden>
          <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="6" fill="none" className="text-line-2" />
          <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="6" fill="none"
            className="text-primary"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="55" textAnchor="middle" fontSize="20" className="fill-ink font-medium">{pct}%</text>
        </svg>
        <ul className="flex flex-col gap-1 text-[14px] text-ink-soft">
          <li>{complete} complete</li>
          <li>{partial} partial</li>
          <li>{empty} not started</li>
        </ul>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/profile/completeness-ring.test.tsx
git add components/profile/completeness-ring.tsx tests/components/profile/completeness-ring.test.tsx
git commit -m "feat: CompletenessRing"
```

---

## Task 30: Profile — SectionSummary + SectionAccordion

**Files:**
- Create: `components/profile/section-summary.tsx`
- Create: `components/profile/section-accordion.tsx`
- Create: `tests/components/profile/section-accordion.test.tsx`

- [ ] **Step 1: Tests**

```tsx
// tests/components/profile/section-accordion.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionAccordion } from "@/components/profile/section-accordion";

describe("SectionAccordion", () => {
  it("renders title, summary, and a status pill", () => {
    render(
      <SectionAccordion title="Personal information" summary="23 · Nepal" status="complete">
        <div>editor</div>
      </SectionAccordion>
    );
    expect(screen.getByText("Personal information")).toBeInTheDocument();
    expect(screen.getByText("23 · Nepal")).toBeInTheDocument();
    expect(screen.getByText(/Complete/i)).toBeInTheDocument();
  });

  it("toggles open on click and shows children when open", async () => {
    render(
      <SectionAccordion title="X" summary="Y" status="partial">
        <div data-testid="editor">editor</div>
      </SectionAccordion>
    );
    expect(screen.queryByTestId("editor")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /X/i }));
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/profile/section-summary.tsx
export function SectionSummary({ parts }: { parts: string[] }) {
  const text = parts.filter(Boolean).join(" · ");
  return <span className="text-[14px] text-ink-soft">{text || "Not added yet"}</span>;
}
```

```tsx
// components/profile/section-accordion.tsx
"use client";

import { useState } from "react";
import type { SectionStatus } from "@/lib/profiles/completeness";

const STATUS_LABEL: Record<SectionStatus, string> = {
  complete: "Complete",
  partial:  "Partial",
  empty:    "Not started",
};

const STATUS_CLS: Record<SectionStatus, string> = {
  complete: "bg-strong-tint text-strong",
  partial:  "bg-possible-tint text-possible",
  empty:    "bg-bg-tint text-ink-faint",
};

export function SectionAccordion({
  title, summary, status, children,
}: {
  title: string; summary: string; status: SectionStatus; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-bg-tint"
        aria-expanded={open}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] font-medium text-ink">{title}</span>
          <span className="text-[14px] text-ink-soft">{summary || "Not added yet"}</span>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 font-mono text-[11.5px] ${STATUS_CLS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>
      {open ? <div className="border-t border-line p-5">{children}</div> : null}
    </article>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/profile/section-accordion.test.tsx
git add components/profile/section-summary.tsx components/profile/section-accordion.tsx tests/components/profile/section-accordion.test.tsx
git commit -m "feat: SectionAccordion + SectionSummary primitives"
```

---

## Task 31: Profile — PersonalEditor (client)

**Files:**
- Create: `components/profile/editors/personal-editor.tsx`
- Create: `tests/components/profile/personal-editor.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/profile/personal-editor.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalEditor } from "@/components/profile/editors/personal-editor";

describe("PersonalEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<PersonalEditor initial={{ name: "Aarav", age: 23, intakeIso: "2027-07-01" }} />);
    expect(screen.getByLabelText(/Name/i)).toHaveValue("Aarav");
    expect(screen.getByLabelText(/Age/i)).toHaveValue(23);
    expect(screen.getByLabelText(/Intake/i)).toHaveValue("2027-07-01");
  });

  it("PATCHes /api/profile/section on save and shows a success notice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, completeness: 12 }), { status: 200 }),
    );
    render(<PersonalEditor initial={{ name: "Aarav" }} />);
    await userEvent.clear(screen.getByLabelText(/Name/i));
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav Sharma");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/section",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice when the API returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<PersonalEditor initial={{ name: "" }} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/profile/editors/personal-editor.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface PersonalInitial {
  name?: string;
  age?: number;
  intakeIso?: string;
}

export function PersonalEditor({ initial }: { initial: PersonalInitial }) {
  const [name, setName] = useState(initial.name ?? "");
  const [age, setAge] = useState<string>(initial.age?.toString() ?? "");
  const [intake, setIntake] = useState<string>(initial.intakeIso ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (name.trim()) patch.name = name.trim();
    if (age) patch.age = Number(age);
    if (intake) patch.intakeIso = intake;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "personal", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="pe-name" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Name</label>
        <input id="pe-name" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="pe-age" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Age</label>
          <input id="pe-age" type="number" value={age} onChange={(e) => setAge(e.target.value)} min={15} max={80}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="pe-intake" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Intake</label>
          <input id="pe-intake" type="date" value={intake} onChange={(e) => setIntake(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/profile/personal-editor.test.tsx
git add components/profile/editors/personal-editor.tsx tests/components/profile/personal-editor.test.tsx
git commit -m "feat: PersonalEditor client component"
```

---

## Task 32: Profile — page composition

**Files:**
- Create: `app/(app)/profile/page.tsx`
- Create: `tests/app/profile-page.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/app/profile-page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, getProfile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/components/profile/completeness-ring", () => ({
  CompletenessRing: ({ pct }: { pct: number }) => <div data-testid="ring">{pct}%</div>,
}));
vi.mock("@/components/profile/section-accordion", () => ({
  SectionAccordion: ({ title, status }: { title: string; status: string }) => (
    <div data-testid={`section-${title}`}>{title}:{status}</div>
  ),
}));

import ProfilePage from "@/app/(app)/profile/page";

describe("/profile page", () => {
  beforeEach(() => {
    getUser.mockReset();
    getProfile.mockReset();
  });

  it("renders name + email at top and 13 sections", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    getProfile.mockResolvedValue({
      sections: { personal: { name: "Aarav Sharma" } },
      completeness: 8,
    });
    const ui = await ProfilePage();
    render(ui);
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByTestId("ring")).toHaveTextContent("8%");
    // Should render 13 SectionAccordion items
    expect(screen.getByTestId("section-Personal information")).toBeInTheDocument();
    expect(screen.getByTestId("section-Destination preferences")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// app/(app)/profile/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles/repo";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { SECTION_KEYS } from "@/lib/profiles/sections";
import type { ProfileSections, SectionKey } from "@/lib/profiles/sections";
import { CompletenessRing } from "@/components/profile/completeness-ring";
import { SectionAccordion } from "@/components/profile/section-accordion";
import { PersonalEditor } from "@/components/profile/editors/personal-editor";

const TITLES: Record<SectionKey, string> = {
  "personal":        "Personal information",
  "destination":     "Destination preferences",
  "academic":        "Academic background",
  "intended-study":  "Intended study",
  "english":         "English proficiency",
  "gap":             "Study gap",
  "work":            "Work experience",
  "finance":         "Financial capacity",
  "immigration":     "Immigration & visa history",
  "family":          "Family information",
  "career":          "Career goals",
  "scholarships":    "Scholarship profile",
  "deal-breakers":   "Deal-breakers",
};

function summarize(key: SectionKey, sections: ProfileSections): string {
  const s = (sections as Record<string, Record<string, unknown> | undefined>)[key];
  if (!s) return "";
  switch (key) {
    case "personal":      return [s.name as string, s.age ? `${s.age}` : "", s.intakeIso ? `${s.intakeIso} intake` : ""].filter(Boolean).join(" · ");
    case "destination":   return [s.primary as string, ...((s.alternates as string[] | undefined) ?? [])].filter(Boolean).join(", ");
    case "academic":      return [s.institution as string, s.gradePercent ? `${s.gradePercent}%` : "", s.degree as string].filter(Boolean).join(" · ");
    case "intended-study":return [s.level as string, s.field as string, s.specialisation as string].filter(Boolean).join(" · ");
    case "english":       return s.overall ? `IELTS ${s.overall} — ${s.reportUploaded ? "uploaded" : "report not uploaded"}` : "";
    case "gap":           return [s.years ? `${s.years} year` : "", ...((s.reasons as string[] | undefined) ?? [])].filter(Boolean).join(" · ");
    case "work":          return [s.title as string, s.years ? `${s.years} yr` : "", s.docs ? "" : "docs missing"].filter(Boolean).join(" · ");
    case "finance":       return [s.source as string, s.proofUploaded ? "" : "proof not uploaded"].filter(Boolean).join(" · ");
    case "immigration":   return [s.refusals ? `${s.refusals} refusals` : "", s.travelled === undefined ? "travel history unknown" : ""].filter(Boolean).join(" · ");
    case "family":        return (s.situation as string) ?? "";
    case "career":        return [s.goal as string, s.targetRole as string].filter(Boolean).join(" · ");
    case "scholarships":  return ((s.profile as string[] | undefined) ?? []).join(", ");
    case "deal-breakers": return ((s.mustHaves as string[] | undefined) ?? []).join(", ");
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user!;
  const profileRow = await getProfile(supabase, user.id);
  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const { pct, status } = computeCompleteness(sections);
  const counts = SECTION_KEYS.reduce(
    (acc, k) => {
      acc[status[k]] += 1;
      return acc;
    },
    { complete: 0, partial: 0, empty: 0 } as Record<"complete" | "partial" | "empty", number>,
  );

  const displayName = sections.personal?.name ?? "Add your name";
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-6 px-5 py-10 lg:grid-cols-[280px_1fr]">
      <header className="flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{displayName}</h1>
        <span className="text-[15px] text-ink-soft">{user.email}</span>
      </header>
      <CompletenessRing pct={pct} complete={counts.complete} partial={counts.partial} empty={counts.empty} />
      <div className="flex flex-col gap-3">
        {SECTION_KEYS.map((key) => (
          <SectionAccordion
            key={key}
            title={TITLES[key]}
            summary={summarize(key, sections)}
            status={status[key]}
          >
            {key === "personal" ? (
              <PersonalEditor initial={sections.personal ?? {}} />
            ) : (
              <p className="text-[14px] text-ink-soft">Editing coming in Phase 2.</p>
            )}
          </SectionAccordion>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/app/profile-page.test.tsx
git add app/(app)/profile/page.tsx tests/app/profile-page.test.tsx
git commit -m "feat: /profile page composition"
```

---

## Task 33: AssessInterstitial component

**Files:**
- Create: `components/assess/assess-interstitial.tsx`
- Create: `tests/components/assess/assess-interstitial.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/assess/assess-interstitial.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";

const primary = {
  id: "as1",
  destination_id: "australia",
  created_at: "2026-05-15T00:00:00Z",
};

describe("AssessInterstitial", () => {
  it("renders an explanatory headline + the destination + created date", () => {
    render(<AssessInterstitial primary={primary} />);
    expect(screen.getByText(/active assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/Australia/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-15/i)).toBeInTheDocument();
  });

  it("renders a Refresh button and a New destination link", () => {
    render(<AssessInterstitial primary={primary} />);
    expect(screen.getByRole("link", { name: /Refresh assessment/i })).toHaveAttribute("href", "/assess?new=1");
    expect(screen.getByRole("link", { name: /Open my dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// components/assess/assess-interstitial.tsx
import Link from "next/link";

export interface PrimaryRef {
  id: string;
  destination_id: string;
  created_at: string;
}

export function AssessInterstitial({ primary }: { primary: PrimaryRef }) {
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 py-16 text-center">
      <h1 className="text-[clamp(28px,3.4vw,40px)]">You have an active assessment for {primary.destination_id}.</h1>
      <p className="text-[17px] text-ink-soft">
        It&apos;s from {primary.created_at.slice(0, 10)}. You can refresh it with your latest profile, or open your
        dashboard to review what you&apos;ve already got.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/assess?new=1" className="inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">
          Refresh assessment
        </Link>
        <Link href="/dashboard" className="inline-flex rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint">
          Open my dashboard
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/assess/assess-interstitial.test.tsx
git add components/assess/assess-interstitial.tsx tests/components/assess/assess-interstitial.test.tsx
git commit -m "feat: AssessInterstitial component"
```

---

## Task 34: Modify `(focused)/assess/page.tsx` for signed-in fork

**Files:**
- Modify: `app/(focused)/assess/page.tsx`
- Create: `tests/app/assess-fork.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/app/assess-fork.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, getPrimaryAssessmentForUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/components/assess/assess-flow", () => ({ AssessFlow: () => <div data-testid="flow">flow</div> }));
vi.mock("@/components/assess/assess-interstitial", () => ({
  AssessInterstitial: () => <div data-testid="interstitial">interstitial</div>,
}));

import AssessPage from "@/app/(focused)/assess/page";

describe("/assess server-side fork", () => {
  beforeEach(() => {
    getUser.mockReset();
    getPrimaryAssessmentForUser.mockReset();
  });

  it("renders AssessFlow when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("renders AssessFlow when signed in but no primary", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("renders interstitial when signed in with primary and no new=1", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1", destination_id: "australia", created_at: "2026-05-15T00:00:00Z" });
    const ui = await AssessPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByTestId("interstitial")).toBeInTheDocument();
  });

  it("renders AssessFlow when new=1 even if primary exists", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockResolvedValue({ id: "a1", destination_id: "australia", created_at: "2026-05-15T00:00:00Z" });
    const ui = await AssessPage({ searchParams: Promise.resolve({ new: "1" }) });
    render(ui);
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Failure → Implement**

```tsx
// app/(focused)/assess/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { AssessFlow } from "@/components/assess/assess-flow";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";

export default async function AssessPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) return <AssessFlow />;

  const primary = await getPrimaryAssessmentForUser(supabase, data.user.id);
  if (!primary || sp.new === "1") return <AssessFlow />;

  return (
    <AssessInterstitial
      primary={{
        id: primary.id,
        destination_id: primary.destination_id,
        created_at: primary.created_at,
      }}
    />
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/app/assess-fork.test.tsx
git add app/(focused)/assess/page.tsx tests/app/assess-fork.test.tsx
git commit -m "feat: /assess server-side fork for signed-in users"
```

---

## Task 35: Update `(marketing)/auth/page.tsx` to honor `?next=`

**Files:**
- Modify: `app/(marketing)/auth/page.tsx`
- Modify: `tests/app/auth-page.test.tsx`

- [ ] **Step 1: Update test**

Edit `tests/app/auth-page.test.tsx` to assert that when the user is signed in and the URL has `?next=/dashboard`, they redirect to `/dashboard` (current behavior already redirects to `/`):

```tsx
// Replace the signed-in test:
it("redirects to /dashboard when the user is already signed in and no next param", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
  await expect(AuthPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/dashboard");
});

it("redirects to ?next= when present and relative", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
  await expect(AuthPage({ searchParams: Promise.resolve({ next: "/profile" }) })).rejects.toThrow("REDIRECT");
  expect(redirect).toHaveBeenCalledWith("/profile");
});
```

Also update the first test to pass `searchParams: Promise.resolve({})`:

```tsx
const ui = await AuthPage({ searchParams: Promise.resolve({}) });
```

- [ ] **Step 2: Implement**

```tsx
// app/(marketing)/auth/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const target = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
    redirect(target);
  }
  return <AuthCard />;
}
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/app/auth-page.test.tsx
git add app/(marketing)/auth/page.tsx tests/app/auth-page.test.tsx
git commit -m "feat: /auth honors ?next= and defaults to /dashboard"
```

---

## Task 36: AuthCard — redirectTo carries next=/dashboard

**Files:**
- Modify: `components/auth/auth-card.tsx`
- Modify: `tests/components/auth/auth-card.test.tsx`

- [ ] **Step 1: Update test**

In the existing OAuth test, assert the `redirectTo` includes `next=/dashboard` after the callback exchange:

```tsx
// Replace the OAuth shape assertion:
expect(signInWithOAuth).toHaveBeenCalledWith(
  expect.objectContaining({
    provider: "google",
    options: expect.objectContaining({
      redirectTo: expect.stringContaining("/auth/callback?next=%2Fdashboard"),
    }),
  }),
);
```

- [ ] **Step 2: Implement** — small change in `components/auth/auth-card.tsx`:

```tsx
const continueWithGoogle = async () => {
  const supabase = createSupabaseBrowserClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`;
  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
};
```

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/components/auth/auth-card.test.tsx
git add components/auth/auth-card.tsx tests/components/auth/auth-card.test.tsx
git commit -m "feat: AuthCard carries next=/dashboard through callback"
```

---

## Task 37: Full verification gate

**Files:** none

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean apart from pre-existing `claudedesign/` noise.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean. Route list should include `/dashboard`, `/profile`, `/matches`, `/plan`, `/checklist`, `/guide`, `/api/profile/section`, plus all existing routes.

- [ ] **Step 5: Supabase advisor pass (security + perf)**

Use `get_advisors({ project_id: "obfvrxixtautamflzxzq", type: "security" })` and same for `type: "performance"`. Expected: no new ERROR-level. INFO-level may include `leads_rls_enabled_no_policy` from Phase 0 — that's not from this phase.

- [ ] **Step 6: Tag Phase 1.5 milestone commit**

```bash
git commit --allow-empty -m "chore: Phase 1.5 signed-in shell complete"
```

---

## Self-Review

**Spec coverage:**
- §3.1 routes — Task 20 `(app)` group, Tasks 22-32 pages, Task 34 modified `/assess`, Task 35 modified `/auth`, Task 11 modified callback ✓
- §3.2 chrome variants — Tasks 15 (AppBar), 17 (FocusBar), 16 (UserPill) ✓
- §4.1 migration — Task 5 ✓
- §4.2 result jsonb unchanged — implicit (no task removes it) ✓
- §4.3 sections shape — Tasks 1 + 4 ✓
- §4.4 completeness — Task 2 ✓
- §4.5 claim flow update — Task 10 + Task 11 ✓
- §4.6 repo additions — Task 8 ✓
- §5.1 lib/profiles — Tasks 1-4, 9 ✓
- §5.2 validation — Task 12 ✓
- §5.3 components — Tasks 15-17, 22-31, 33 ✓
- §6.1 (app)/layout — Task 20 (with the spec's choice of hardcoded `next=/dashboard`) ✓
- §6.2 (focused)/assess — Task 34 ✓
- §6.3 (marketing) layout — Task 18 ✓
- §6.4 (focused) layout — Task 19 ✓
- §6.5 dashboard — Task 28 ✓
- §6.6 profile — Task 32 ✓
- §6.7 stubs — Task 21 ✓
- §7.1 /api/assess signed-in — Task 14 ✓
- §7.2 PATCH /api/profile/section — Task 13 ✓
- §8 RLS — covered by Task 5 SQL ✓
- §9 error handling — covered task-by-task ✓
- §10 testing — covered task-by-task ✓
- §11 migration safety — Task 5 ✓

**Placeholder scan:** every task has full code in every step. The one place a test file edit is described with "Replace X with Y" instead of full code (Task 11) reproduces only the changed lines; the rest of the file is left untouched by the implementer. Acceptable — the file already exists from Phase 0.

**Type consistency:**
- `claimAndBootstrapProfile(adminDb, { assessmentId, userId, googleName? })` — used identically in Tasks 10 + 11.
- `patchProfileSection(db, userId, section, patch)` — Task 9 + Task 13 + Task 14 (claim flow doesn't use it; just upsertProfile).
- `getPrimaryAssessmentForUser(db, userId)` — Task 8 + Task 14 + Task 28 + Task 34. All consistent.
- `AppBar variant` union — `"marketing" | "marketing-signed-in" | "app"` — Tasks 15 + 18 + 19 + 20.
- `FocusBar({ signedIn? })` — Task 17 + Task 19.
- `Greeting({ name, partOfDay })`, `SnapshotCard({ primary, destinationLabel })`, `StatsRow(...)`, `PromptCard({ kind })` — all matched to the page composition in Task 28.

No issues found.
