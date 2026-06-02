# MyVisa — Plan 1: Foundation + Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project, configure the design system, and build the fully tested scoring engine + data layer + callout rules. After this plan, the codebase compiles, every business rule is unit-tested, and the foundation is in place for Plan 2 (UI) and Plan 3 (auth/deploy).

**Architecture:** Next.js 14 App Router with TypeScript strict mode. Pure-function business logic in `lib/`. Static TypeScript data files for MVP (Nepal source, Australia destination). Vitest for unit tests. Tailwind config carries the exact design tokens from the spec.

**Tech Stack:** Next.js 14, TypeScript 5, Tailwind CSS 3, Zod, Vitest, @testing-library/react (for later use).

**Spec reference:** `docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md`

---

## Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.eslintrc.json`

- [ ] **Step 1: Scaffold with create-next-app**

Run from project root:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm --no-turbopack
```

When prompted "would you like to use --src-dir?" → No. "Would you like to use Turbopack?" → No (for stability).

Expected: creates `app/`, `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`.

- [ ] **Step 2: Set TypeScript strict mode**

Open `tsconfig.json` and ensure `compilerOptions` includes:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 3: Verify build works**

Run:
```bash
npm run build
```

Expected: build succeeds, output shows "Compiled successfully."

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 project with TypeScript strict"
```

---

## Task 2: Configure Tailwind with design tokens

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace tailwind.config.ts with design tokens**

Overwrite `tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-tint": "var(--bg-tint)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        primary: "var(--primary)",
        "primary-ink": "var(--primary-ink)",
        "primary-tint": "var(--primary-tint)",
        "primary-tint-2": "var(--primary-tint-2)",
        "on-primary": "var(--on-primary)",
        accent: "var(--accent)",
        "accent-tint": "var(--accent-tint)",
        strong: "var(--strong)",
        "strong-tint": "var(--strong-tint)",
        possible: "var(--possible)",
        "possible-tint": "var(--possible-tint)",
        reach: "var(--reach)",
        "reach-tint": "var(--reach-tint)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        pill: "999px",
      },
      transitionTimingFunction: {
        calm: "cubic-bezier(.22, .61, .36, 1)",
      },
      maxWidth: {
        wrap: "1120px",
        narrow: "720px",
      },
      keyframes: {
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        rise: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        fade: "fade 0.5s cubic-bezier(.22,.61,.36,1) both",
        rise: "rise 0.55s cubic-bezier(.22,.61,.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Replace globals.css with design token CSS variables**

Overwrite `app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root,
[data-theme="light"] {
  --bg: #f6f5f1;
  --bg-tint: #efeee8;
  --surface: #fffefb;
  --surface-2: #faf9f5;
  --ink: #1d1c19;
  --ink-soft: #56544d;
  --ink-faint: #8a877d;
  --line: #1d1c190f;
  --line-2: #1d1c191a;
  --primary: #0f5e54;
  --primary-ink: #0c4a42;
  --primary-tint: #0f5e5414;
  --primary-tint-2: #0f5e5424;
  --on-primary: #fcfdfb;
  --accent: #b07d22;
  --accent-tint: #b07d2218;
  --strong: #1f6d4a;
  --strong-tint: #1f6d4a16;
  --possible: #b07d22;
  --possible-tint: #b07d2216;
  --reach: #b1503a;
  --reach-tint: #b1503a16;
}

[data-theme="dark"] {
  --bg: #111210;
  --bg-tint: #181915;
  --surface: #1a1b17;
  --surface-2: #201f1b;
  --ink: #ece9e0;
  --ink-soft: #a8a59b;
  --ink-faint: #76736a;
  --line: #ffffff12;
  --line-2: #ffffff20;
  --primary: #4eb39f;
  --primary-ink: #6fc4b2;
  --primary-tint: #4eb39f1f;
  --primary-tint-2: #4eb39f30;
  --on-primary: #08231f;
  --accent: #d6a24a;
  --accent-tint: #d6a24a22;
  --strong: #5bbd8c;
  --strong-tint: #5bbd8c20;
  --possible: #d6a24a;
  --possible-tint: #d6a24a20;
  --reach: #d8775f;
  --reach-tint: #d8775f20;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 17px;
  line-height: 1.6;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 {
  font-weight: 500;
  line-height: 1.18;
  letter-spacing: -0.012em;
  margin: 0;
  text-wrap: balance;
}

p { margin: 0; text-wrap: pretty; }
a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; }

::selection { background: var(--primary-tint-2); }

* { scrollbar-width: thin; scrollbar-color: var(--line-2) transparent; }
```

- [ ] **Step 3: Wire fonts in layout.tsx**

Overwrite `app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MyVisa — Honest answers for studying abroad",
  description:
    "Trust-first study-abroad assessments for international students. Real chances, transparent reasoning, no consultancy fees.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Replace app/page.tsx placeholder**

Overwrite `app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-narrow px-7 py-20">
      <h1 className="text-4xl">MyVisa</h1>
      <p className="mt-4 text-ink-soft">Foundation in place. Wizard coming in Plan 2.</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify dev server renders with correct colors**

Run:
```bash
npm run dev
```

Open `http://localhost:3000`. Expected: warm paper background (`#f6f5f1`), Hanken Grotesk font, "MyVisa" headline visible.

Stop the server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure Tailwind with design tokens and fonts"
```

---

## Task 3: Install testing stack (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json` (add scripts and devDeps)
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install Vitest and testing-library**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Create tests/setup.ts**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to package.json**

In `package.json`, under `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 5: Write smoke test**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 1 passed, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: install Vitest with testing-library"
```

---

## Task 4: Define profile and assessment types

**Files:**
- Create: `lib/scoring/types.ts`
- Create: `lib/validation/profile.ts`
- Create: `tests/validation/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/validation/profile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ProfileSchema } from "@/lib/validation/profile";

describe("ProfileSchema", () => {
  const validProfile = {
    homeCountry: "Nepal",
    educationLevel: "bachelors",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: 2025,
    gapReasons: [],
    englishStatus: "taken",
    englishScore: 7.0,
    destination: "australia",
    budget: 4500000,
    budgetCurrency: "NPR",
    fundingSource: "education-loan",
    goal: "permanent-residency",
  };

  it("accepts a valid profile", () => {
    const result = ProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-range grade", () => {
    const result = ProfileSchema.safeParse({ ...validProfile, grade: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid education level", () => {
    const result = ProfileSchema.safeParse({ ...validProfile, educationLevel: "phd" });
    expect(result.success).toBe(false);
  });

  it("requires gapReasons when there is a gap", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      graduationYear: 2020,
      gapReasons: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows empty gapReasons when there is no gap", () => {
    const result = ProfileSchema.safeParse({
      ...validProfile,
      graduationYear: 2026,
      gapReasons: [],
    });
    expect(result.success).toBe(true);
  });

  it("allows englishScore to be omitted when status is not 'taken'", () => {
    const { englishScore: _omit, ...rest } = validProfile;
    void _omit;
    const result = ProfileSchema.safeParse({
      ...rest,
      englishStatus: "not-taken",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Install zod**

```bash
npm install zod
```

- [ ] **Step 3: Create lib/scoring/types.ts**

```ts
export type EducationLevel = "higher-secondary" | "bachelors" | "masters";

export type GradeSystem =
  | "percentage-nepal"
  | "cgpa-4"
  | "percentage-india"
  | "cgpa-10"
  | "cgpa-5"
  | "percentage";

export type FieldOfStudy =
  | "computer-science"
  | "business"
  | "nursing"
  | "engineering"
  | "hospitality"
  | "accounting"
  | "data-science"
  | "education"
  | "agriculture"
  | "law"
  | "arts"
  | "other";

export type EnglishStatus = "not-taken" | "booked" | "taken";

export type Destination =
  | "australia"
  | "canada"
  | "uk"
  | "germany"
  | "usa"
  | "ireland"
  | "not-sure";

export type FundingSource =
  | "self-funded"
  | "parents-family"
  | "education-loan"
  | "mixed"
  | "scholarship-dependent";

export type Goal =
  | "permanent-residency"
  | "lowest-cost"
  | "highest-ranked"
  | "fastest-admission"
  | "best-employment"
  | "research";

export type Currency = "NPR" | "USD";

export type GapReason =
  | "worked"
  | "retook-exams"
  | "health-family"
  | "started-something"
  | "preparing";

export interface StudentProfile {
  homeCountry: string;
  educationLevel: EducationLevel;
  gradeSystem: GradeSystem;
  grade: number;
  fieldOfStudy: FieldOfStudy;
  graduationYear: number;
  gapReasons: GapReason[];
  englishStatus: EnglishStatus;
  englishScore?: number;
  destination: Destination;
  budget: number;
  budgetCurrency: Currency;
  fundingSource: FundingSource;
  goal: Goal;
}

export type Verdict = "strong" | "possible" | "reach";

export interface DimensionScore {
  value: number;
  factors: Array<{
    label: string;
    influence: "positive" | "neutral" | "risk";
    detail: string;
  }>;
}

export interface AssessmentResult {
  verdict: Verdict;
  weighted: number;
  dimensions: {
    academic: DimensionScore;
    financial: DimensionScore;
    visa: DimensionScore;
    profileStrength: DimensionScore;
  };
  ruleVersion: string;
  computedAt: string;
}
```

- [ ] **Step 4: Create lib/validation/profile.ts**

```ts
import { z } from "zod";

export const ProfileSchema = z
  .object({
    homeCountry: z.string().min(1),
    educationLevel: z.enum(["higher-secondary", "bachelors", "masters"]),
    gradeSystem: z.enum([
      "percentage-nepal",
      "cgpa-4",
      "percentage-india",
      "cgpa-10",
      "cgpa-5",
      "percentage",
    ]),
    grade: z.number().min(0).max(100),
    fieldOfStudy: z.enum([
      "computer-science",
      "business",
      "nursing",
      "engineering",
      "hospitality",
      "accounting",
      "data-science",
      "education",
      "agriculture",
      "law",
      "arts",
      "other",
    ]),
    graduationYear: z.number().int().min(2010).max(2030),
    gapReasons: z.array(
      z.enum([
        "worked",
        "retook-exams",
        "health-family",
        "started-something",
        "preparing",
      ]),
    ),
    englishStatus: z.enum(["not-taken", "booked", "taken"]),
    englishScore: z.number().min(4).max(9).optional(),
    destination: z.enum([
      "australia",
      "canada",
      "uk",
      "germany",
      "usa",
      "ireland",
      "not-sure",
    ]),
    budget: z.number().positive(),
    budgetCurrency: z.enum(["NPR", "USD"]),
    fundingSource: z.enum([
      "self-funded",
      "parents-family",
      "education-loan",
      "mixed",
      "scholarship-dependent",
    ]),
    goal: z.enum([
      "permanent-residency",
      "lowest-cost",
      "highest-ranked",
      "fastest-admission",
      "best-employment",
      "research",
    ]),
  })
  .refine(
    (data) => {
      const currentYear = new Date().getFullYear();
      const gap = currentYear - data.graduationYear;
      if (gap > 0 && data.gapReasons.length === 0) return false;
      return true;
    },
    {
      message: "gapReasons required when graduation year implies a gap",
      path: ["gapReasons"],
    },
  )
  .refine(
    (data) => {
      if (data.englishStatus === "taken" && data.englishScore === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "englishScore required when englishStatus is 'taken'",
      path: ["englishScore"],
    },
  );

export type Profile = z.infer<typeof ProfileSchema>;
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all profile tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: define profile and assessment types with Zod validation"
```

---

## Task 5: Build academic fit scoring dimension

**Files:**
- Create: `lib/scoring/academic.ts`
- Create: `tests/scoring/academic.test.ts`

The academic dimension scores 0-100 based on the student's grade vs. typical admission thresholds for their field at the destination. For MVP (Nepal → Australia), thresholds are field-dependent.

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/academic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreAcademic } from "@/lib/scoring/academic";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreAcademic", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreAcademic(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for higher grades", () => {
    const low = scoreAcademic({ ...baseProfile, grade: 55 });
    const high = scoreAcademic({ ...baseProfile, grade: 85 });
    expect(high.value).toBeGreaterThan(low.value);
  });

  it("returns a positive factor for strong grades", () => {
    const result = scoreAcademic({ ...baseProfile, grade: 85 });
    expect(result.factors.some((f) => f.influence === "positive")).toBe(true);
  });

  it("returns a risk factor for low grades", () => {
    const result = scoreAcademic({ ...baseProfile, grade: 50 });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });

  it("penalises competitive fields slightly more", () => {
    const csScore = scoreAcademic({ ...baseProfile, fieldOfStudy: "computer-science", grade: 65 });
    const artsScore = scoreAcademic({ ...baseProfile, fieldOfStudy: "arts", grade: 65 });
    expect(artsScore.value).toBeGreaterThanOrEqual(csScore.value);
  });

  it("masters level scores higher than bachelors at same grade", () => {
    const bachelors = scoreAcademic({ ...baseProfile, educationLevel: "bachelors", grade: 70 });
    const masters = scoreAcademic({ ...baseProfile, educationLevel: "masters", grade: 70 });
    expect(masters.value).toBeGreaterThanOrEqual(bachelors.value);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/academic.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/scoring/academic'`.

- [ ] **Step 3: Implement scoreAcademic**

Create `lib/scoring/academic.ts`:
```ts
import type { DimensionScore, StudentProfile, FieldOfStudy } from "./types";

const FIELD_COMPETITIVENESS: Record<FieldOfStudy, number> = {
  "computer-science": 0.95,
  "data-science": 0.95,
  engineering: 0.9,
  business: 0.85,
  nursing: 0.85,
  accounting: 0.8,
  law: 0.85,
  education: 0.75,
  hospitality: 0.7,
  agriculture: 0.7,
  arts: 0.7,
  other: 0.8,
};

const LEVEL_BONUS: Record<StudentProfile["educationLevel"], number> = {
  "higher-secondary": -5,
  bachelors: 0,
  masters: 6,
};

export function scoreAcademic(profile: StudentProfile): DimensionScore {
  const fieldDifficulty = FIELD_COMPETITIVENESS[profile.fieldOfStudy];
  // Normalise grade to 0-100 baseline (percentage-nepal already in %).
  const normalisedGrade = profile.grade;
  // Higher field difficulty -> threshold shifts up.
  const baseline = 60 + (fieldDifficulty - 0.7) * 40;
  const delta = normalisedGrade - baseline;
  const raw = 50 + delta * 1.4 + LEVEL_BONUS[profile.educationLevel];
  const value = Math.max(0, Math.min(100, Math.round(raw)));

  const factors: DimensionScore["factors"] = [];

  if (normalisedGrade >= baseline + 8) {
    factors.push({
      label: `Strong grade (${normalisedGrade}%)`,
      influence: "positive",
      detail: `Above the typical threshold for ${humanField(profile.fieldOfStudy)}.`,
    });
  } else if (normalisedGrade <= baseline - 8) {
    factors.push({
      label: `Grade below threshold`,
      influence: "risk",
      detail: `Most ${humanField(profile.fieldOfStudy)} programs in Australia expect ${Math.round(
        baseline,
      )}%+.`,
    });
  } else {
    factors.push({
      label: `Grade within range`,
      influence: "neutral",
      detail: `Around the typical threshold for ${humanField(profile.fieldOfStudy)}.`,
    });
  }

  if (profile.educationLevel === "masters") {
    factors.push({
      label: "Master's degree completed",
      influence: "positive",
      detail: "Postgraduate level strengthens academic standing.",
    });
  }

  return { value, factors };
}

function humanField(f: FieldOfStudy): string {
  const map: Record<FieldOfStudy, string> = {
    "computer-science": "Computer Science",
    "data-science": "Data Science",
    business: "Business",
    nursing: "Nursing",
    engineering: "Engineering",
    hospitality: "Hospitality",
    accounting: "Accounting",
    education: "Education",
    agriculture: "Agriculture",
    law: "Law",
    arts: "Arts",
    other: "this field",
  };
  return map[f];
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/scoring/academic.test.ts
```

Expected: all academic tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: academic fit scoring dimension with field competitiveness"
```

---

## Task 6: Build financial readiness scoring dimension

**Files:**
- Create: `lib/scoring/financial.ts`
- Create: `tests/scoring/financial.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/financial.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreFinancial } from "@/lib/scoring/financial";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000, // NPR 45 lakh ≈ USD 33k at 135 NPR/USD
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreFinancial", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreFinancial(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for larger budgets", () => {
    const low = scoreFinancial({ ...baseProfile, budget: 2000000 });
    const high = scoreFinancial({ ...baseProfile, budget: 8000000 });
    expect(high.value).toBeGreaterThan(low.value);
  });

  it("handles USD budget input equivalently to NPR", () => {
    const npr = scoreFinancial({ ...baseProfile, budget: 4500000, budgetCurrency: "NPR" });
    const usd = scoreFinancial({ ...baseProfile, budget: 33000, budgetCurrency: "USD" });
    expect(Math.abs(npr.value - usd.value)).toBeLessThanOrEqual(3);
  });

  it("rewards parents-family funding over scholarship-dependent", () => {
    const family = scoreFinancial({ ...baseProfile, fundingSource: "parents-family" });
    const scholarship = scoreFinancial({ ...baseProfile, fundingSource: "scholarship-dependent" });
    expect(family.value).toBeGreaterThan(scholarship.value);
  });

  it("flags scholarship-dependent as a risk factor", () => {
    const result = scoreFinancial({ ...baseProfile, fundingSource: "scholarship-dependent" });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });

  it("flags a low budget as a risk factor", () => {
    const result = scoreFinancial({ ...baseProfile, budget: 1500000 });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/financial.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoreFinancial**

Create `lib/scoring/financial.ts`:
```ts
import type { DimensionScore, StudentProfile, FundingSource } from "./types";

// Typical yearly total (tuition + living) in USD for destination.
const TYPICAL_YEARLY_USD: Record<string, { min: number; max: number }> = {
  australia: { min: 30000, max: 55000 },
  canada: { min: 25000, max: 45000 },
  uk: { min: 28000, max: 50000 },
  germany: { min: 12000, max: 22000 },
  usa: { min: 40000, max: 75000 },
  ireland: { min: 25000, max: 40000 },
  "not-sure": { min: 25000, max: 45000 },
};

const FUNDING_RELIABILITY: Record<FundingSource, number> = {
  "self-funded": 0.95,
  "parents-family": 0.9,
  "education-loan": 0.8,
  mixed: 0.85,
  "scholarship-dependent": 0.55,
};

const NPR_PER_USD = 135;

export function scoreFinancial(profile: StudentProfile): DimensionScore {
  const budgetUsd =
    profile.budgetCurrency === "USD" ? profile.budget : profile.budget / NPR_PER_USD;
  const typical = TYPICAL_YEARLY_USD[profile.destination] ?? TYPICAL_YEARLY_USD["not-sure"]!;
  const midpoint = (typical.min + typical.max) / 2;
  const ratio = budgetUsd / midpoint;

  // Ratio of 1.0 → baseline 70. Higher ratio adds points, lower subtracts.
  const baseFromBudget = 70 + (ratio - 1) * 35;
  const reliability = FUNDING_RELIABILITY[profile.fundingSource];
  const reliabilityAdjustment = (reliability - 0.8) * 50;
  const value = Math.max(0, Math.min(100, Math.round(baseFromBudget + reliabilityAdjustment)));

  const factors: DimensionScore["factors"] = [];

  if (budgetUsd < typical.min) {
    factors.push({
      label: `Budget below typical range`,
      influence: "risk",
      detail: `Typical year in ${humanDest(profile.destination)} costs USD ${typical.min.toLocaleString()}–${typical.max.toLocaleString()}.`,
    });
  } else if (budgetUsd > typical.max) {
    factors.push({
      label: `Budget above typical range`,
      influence: "positive",
      detail: `Comfortably covers ${humanDest(profile.destination)} costs.`,
    });
  } else {
    factors.push({
      label: `Budget within typical range`,
      influence: "neutral",
      detail: `Aligned with typical ${humanDest(profile.destination)} costs.`,
    });
  }

  if (profile.fundingSource === "scholarship-dependent") {
    factors.push({
      label: "Scholarship-dependent funding",
      influence: "risk",
      detail: "Outcome depends on receiving scholarships — adds uncertainty to visa case.",
    });
  } else if (profile.fundingSource === "self-funded") {
    factors.push({
      label: "Self-funded",
      influence: "positive",
      detail: "Strongest funding signal for visa officers.",
    });
  } else if (profile.fundingSource === "education-loan") {
    factors.push({
      label: "Education loan",
      influence: "neutral",
      detail: "Acceptable funding when sanction letter is documented.",
    });
  }

  return { value, factors };
}

function humanDest(d: StudentProfile["destination"]): string {
  const map: Record<StudentProfile["destination"], string> = {
    australia: "Australia",
    canada: "Canada",
    uk: "the UK",
    germany: "Germany",
    usa: "the USA",
    ireland: "Ireland",
    "not-sure": "your destination",
  };
  return map[d];
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/scoring/financial.test.ts
```

Expected: all financial tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: financial readiness scoring dimension"
```

---

## Task 7: Build visa case strength scoring dimension

**Files:**
- Create: `lib/scoring/visa.ts`
- Create: `tests/scoring/visa.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/visa.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreVisa } from "@/lib/scoring/visa";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

const currentYear = new Date().getFullYear();

describe("scoreVisa", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreVisa(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("scores higher for recent graduates than for long gaps", () => {
    const recent = scoreVisa({ ...baseProfile, graduationYear: currentYear, gapReasons: [] });
    const longGap = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 6,
      gapReasons: ["worked"],
    });
    expect(recent.value).toBeGreaterThan(longGap.value);
  });

  it("scores higher when gap is explained by work", () => {
    const explained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["worked"],
    });
    const unexplained = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 2,
      gapReasons: ["health-family"],
    });
    expect(explained.value).toBeGreaterThan(unexplained.value);
  });

  it("rewards IELTS at or above 6.5 for Australia", () => {
    const low = scoreVisa({ ...baseProfile, englishScore: 6.0 });
    const ok = scoreVisa({ ...baseProfile, englishScore: 7.0 });
    expect(ok.value).toBeGreaterThan(low.value);
  });

  it("flags long unexplained gap as risk", () => {
    const result = scoreVisa({
      ...baseProfile,
      graduationYear: currentYear - 5,
      gapReasons: ["health-family"],
    });
    expect(result.factors.some((f) => f.influence === "risk")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/visa.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoreVisa**

Create `lib/scoring/visa.ts`:
```ts
import type { DimensionScore, GapReason, StudentProfile } from "./types";

const GAP_REASON_WEIGHT: Record<GapReason, number> = {
  worked: 0.9,
  "retook-exams": 0.75,
  preparing: 0.7,
  "started-something": 0.85,
  "health-family": 0.5,
};

const ENGLISH_THRESHOLD_BY_DEST: Record<string, number> = {
  australia: 6.5,
  canada: 6.5,
  uk: 6.5,
  germany: 6.0,
  usa: 6.5,
  ireland: 6.5,
  "not-sure": 6.5,
};

export function scoreVisa(profile: StudentProfile): DimensionScore {
  const currentYear = new Date().getFullYear();
  const gap = Math.max(0, currentYear - profile.graduationYear);

  // Start with 80 baseline; penalise for gap length.
  let score = 80;
  if (gap === 0) {
    score += 8;
  } else if (gap <= 2) {
    score -= 6;
  } else if (gap <= 5) {
    score -= 14;
  } else {
    score -= 22;
  }

  // Gap reason mitigation: average the weights of selected reasons.
  if (gap > 0 && profile.gapReasons.length > 0) {
    const avgWeight =
      profile.gapReasons.reduce((sum, r) => sum + GAP_REASON_WEIGHT[r], 0) /
      profile.gapReasons.length;
    score += (avgWeight - 0.7) * 25;
  }

  // English: only adjusts if status is "taken".
  const threshold = ENGLISH_THRESHOLD_BY_DEST[profile.destination] ?? 6.5;
  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    const englishDelta = profile.englishScore - threshold;
    score += englishDelta * 10;
  } else if (profile.englishStatus === "not-taken") {
    score -= 8;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));

  const factors: DimensionScore["factors"] = [];

  if (gap === 0) {
    factors.push({
      label: "Recent graduate",
      influence: "positive",
      detail: "No gap — strong timing signal for visa.",
    });
  } else if (gap <= 2 && profile.gapReasons.includes("worked")) {
    factors.push({
      label: `${gap}-year gap explained by work`,
      influence: "neutral",
      detail: "Documented employment mitigates gap concerns.",
    });
  } else if (gap > 5) {
    factors.push({
      label: `${gap}-year gap`,
      influence: "risk",
      detail: "Long gaps face extra scrutiny — strong documentation required.",
    });
  } else if (gap > 0) {
    factors.push({
      label: `${gap}-year gap`,
      influence:
        profile.gapReasons.some((r) => r === "worked" || r === "started-something")
          ? "neutral"
          : "risk",
      detail: "Gap requires a clear explanation in your SOP.",
    });
  }

  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= threshold) {
      factors.push({
        label: `IELTS ${profile.englishScore.toFixed(1)}`,
        influence: "positive",
        detail: `Meets the ${threshold} threshold for ${profile.destination}.`,
      });
    } else {
      factors.push({
        label: `IELTS ${profile.englishScore.toFixed(1)}`,
        influence: "risk",
        detail: `Below the ${threshold} threshold for ${profile.destination}.`,
      });
    }
  } else if (profile.englishStatus === "not-taken") {
    factors.push({
      label: "No English test taken",
      influence: "risk",
      detail: "Required for student visa — book a test to strengthen your case.",
    });
  }

  return { value, factors };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/scoring/visa.test.ts
```

Expected: all visa tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: visa case strength scoring dimension"
```

---

## Task 8: Build profile strength scoring dimension

**Files:**
- Create: `lib/scoring/profile-strength.ts`
- Create: `tests/scoring/profile-strength.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/profile-strength.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreProfileStrength } from "@/lib/scoring/profile-strength";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("scoreProfileStrength", () => {
  it("returns a score between 0 and 100", () => {
    const result = scoreProfileStrength(baseProfile);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
  });

  it("masters score higher than higher-secondary", () => {
    const hs = scoreProfileStrength({ ...baseProfile, educationLevel: "higher-secondary" });
    const masters = scoreProfileStrength({ ...baseProfile, educationLevel: "masters" });
    expect(masters.value).toBeGreaterThan(hs.value);
  });

  it("work-gap reasons add to profile strength", () => {
    const noWork = scoreProfileStrength({ ...baseProfile, gapReasons: [] });
    const withWork = scoreProfileStrength({
      ...baseProfile,
      graduationYear: new Date().getFullYear() - 1,
      gapReasons: ["worked"],
    });
    expect(withWork.value).toBeGreaterThanOrEqual(noWork.value);
  });

  it("acknowledges work experience as positive", () => {
    const result = scoreProfileStrength({
      ...baseProfile,
      graduationYear: new Date().getFullYear() - 1,
      gapReasons: ["worked"],
    });
    expect(result.factors.some((f) => f.influence === "positive" && /work/i.test(f.label))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/profile-strength.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoreProfileStrength**

Create `lib/scoring/profile-strength.ts`:
```ts
import type { DimensionScore, StudentProfile } from "./types";

export function scoreProfileStrength(profile: StudentProfile): DimensionScore {
  let score = 55;

  if (profile.educationLevel === "masters") score += 18;
  else if (profile.educationLevel === "bachelors") score += 8;

  const hasWork = profile.gapReasons.includes("worked");
  const hasOwnVenture = profile.gapReasons.includes("started-something");
  if (hasWork) score += 10;
  if (hasOwnVenture) score += 6;

  if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
    if (profile.englishScore >= 7.5) score += 8;
    else if (profile.englishScore >= 7.0) score += 5;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));

  const factors: DimensionScore["factors"] = [];

  if (profile.educationLevel === "masters") {
    factors.push({
      label: "Master's degree",
      influence: "positive",
      detail: "Postgraduate level strengthens profile.",
    });
  } else if (profile.educationLevel === "higher-secondary") {
    factors.push({
      label: "Higher secondary only",
      influence: "neutral",
      detail: "A completed bachelor's would significantly improve standing.",
    });
  }

  if (hasWork) {
    factors.push({
      label: "Work experience",
      influence: "positive",
      detail: "Documented employment strengthens both profile and visa case.",
    });
  }

  if (
    profile.englishStatus === "taken" &&
    profile.englishScore !== undefined &&
    profile.englishScore >= 7.5
  ) {
    factors.push({
      label: `Strong English (${profile.englishScore.toFixed(1)})`,
      influence: "positive",
      detail: "High IELTS opens up more selective programs.",
    });
  }

  return { value, factors };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/scoring/profile-strength.test.ts
```

Expected: all profile-strength tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: profile strength scoring dimension"
```

---

## Task 9: Build verdict mapping

**Files:**
- Create: `lib/scoring/verdict.ts`
- Create: `tests/scoring/verdict.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/verdict.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapVerdict } from "@/lib/scoring/verdict";

describe("mapVerdict", () => {
  it("returns 'strong' when weighted >= 72 and all dimensions >= 50", () => {
    const v = mapVerdict({ weighted: 78, dimensions: [75, 70, 80, 72] });
    expect(v).toBe("strong");
  });

  it("returns 'possible' when weighted in [50, 72) and all dimensions >= 30", () => {
    const v = mapVerdict({ weighted: 60, dimensions: [55, 60, 65, 50] });
    expect(v).toBe("possible");
  });

  it("returns 'reach' when weighted < 50", () => {
    const v = mapVerdict({ weighted: 42, dimensions: [40, 45, 50, 40] });
    expect(v).toBe("reach");
  });

  it("returns 'possible' (not 'strong') if any single dimension is below 50", () => {
    const v = mapVerdict({ weighted: 75, dimensions: [85, 85, 85, 45] });
    expect(v).toBe("possible");
  });

  it("returns 'reach' if any single dimension is below 30", () => {
    const v = mapVerdict({ weighted: 60, dimensions: [70, 70, 70, 25] });
    expect(v).toBe("reach");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/verdict.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement mapVerdict**

Create `lib/scoring/verdict.ts`:
```ts
import type { Verdict } from "./types";

export interface VerdictInput {
  weighted: number;
  dimensions: [number, number, number, number];
}

export function mapVerdict(input: VerdictInput): Verdict {
  const minDimension = Math.min(...input.dimensions);

  if (minDimension < 30) return "reach";
  if (input.weighted >= 72 && minDimension >= 50) return "strong";
  if (input.weighted >= 50 && minDimension >= 30) return "possible";
  return "reach";
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/scoring/verdict.test.ts
```

Expected: all verdict tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: verdict mapping with banded thresholds"
```

---

## Task 10: Compose scoring engine

**Files:**
- Create: `lib/scoring/engine.ts`
- Create: `tests/scoring/engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scoring/engine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: 2025,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4500000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("runAssessment", () => {
  it("returns a complete assessment with verdict and four dimensions", () => {
    const result = runAssessment(baseProfile);
    expect(["strong", "possible", "reach"]).toContain(result.verdict);
    expect(result.weighted).toBeGreaterThanOrEqual(0);
    expect(result.weighted).toBeLessThanOrEqual(100);
    expect(result.dimensions.academic.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.financial.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.visa.value).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.profileStrength.value).toBeGreaterThanOrEqual(0);
  });

  it("uses the documented weights (academic 30, financial 25, visa 25, profileStrength 20)", () => {
    const result = runAssessment(baseProfile);
    const manual =
      result.dimensions.academic.value * 0.3 +
      result.dimensions.financial.value * 0.25 +
      result.dimensions.visa.value * 0.25 +
      result.dimensions.profileStrength.value * 0.2;
    expect(Math.abs(result.weighted - Math.round(manual))).toBeLessThanOrEqual(1);
  });

  it("includes a rule version and timestamp", () => {
    const result = runAssessment(baseProfile);
    expect(result.ruleVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(() => new Date(result.computedAt)).not.toThrow();
  });

  it("returns 'strong' for a clearly qualified profile", () => {
    const strong = runAssessment({
      ...baseProfile,
      grade: 85,
      englishScore: 7.5,
      budget: 6500000,
      fundingSource: "self-funded",
      educationLevel: "masters",
      graduationYear: new Date().getFullYear(),
    });
    expect(strong.verdict).toBe("strong");
  });

  it("returns 'reach' for a clearly under-qualified profile", () => {
    const reach = runAssessment({
      ...baseProfile,
      grade: 48,
      englishStatus: "not-taken",
      englishScore: undefined,
      budget: 1200000,
      fundingSource: "scholarship-dependent",
      graduationYear: 2018,
      gapReasons: ["health-family"],
    });
    expect(reach.verdict).toBe("reach");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/scoring/engine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement engine**

Create `lib/scoring/engine.ts`:
```ts
import type { AssessmentResult, StudentProfile } from "./types";
import { scoreAcademic } from "./academic";
import { scoreFinancial } from "./financial";
import { scoreVisa } from "./visa";
import { scoreProfileStrength } from "./profile-strength";
import { mapVerdict } from "./verdict";

const RULE_VERSION = "v0.1.0";

const WEIGHTS = {
  academic: 0.3,
  financial: 0.25,
  visa: 0.25,
  profileStrength: 0.2,
} as const;

export function runAssessment(profile: StudentProfile): AssessmentResult {
  const academic = scoreAcademic(profile);
  const financial = scoreFinancial(profile);
  const visa = scoreVisa(profile);
  const profileStrength = scoreProfileStrength(profile);

  const weighted = Math.round(
    academic.value * WEIGHTS.academic +
      financial.value * WEIGHTS.financial +
      visa.value * WEIGHTS.visa +
      profileStrength.value * WEIGHTS.profileStrength,
  );

  const verdict = mapVerdict({
    weighted,
    dimensions: [academic.value, financial.value, visa.value, profileStrength.value],
  });

  return {
    verdict,
    weighted,
    dimensions: { academic, financial, visa, profileStrength },
    ruleVersion: RULE_VERSION,
    computedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run all scoring tests**

```bash
npm test -- tests/scoring/
```

Expected: every scoring test passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scoring engine composes four dimensions with verdict mapping"
```

---

## Task 11: Build static data — fields of study and source country (Nepal)

**Files:**
- Create: `lib/data/types.ts`
- Create: `lib/data/fields-of-study.ts`
- Create: `lib/data/source/nepal.ts`

- [ ] **Step 1: Create lib/data/types.ts**

```ts
import type { FieldOfStudy, GradeSystem } from "@/lib/scoring/types";

export interface SourceCountryData {
  id: string;
  name: string;
  flag: string;
  gradeSystems: GradeSystem[];
  defaultGradeSystem: GradeSystem;
  testCenters: {
    ielts: string[];
  };
  source: string;
  lastVerified: string;
}

export interface DestinationCountryData {
  id: string;
  name: string;
  flag: string;
  tuitionRangeUsd: { min: number; max: number };
  livingRangeUsd: { min: number; max: number };
  englishThreshold: number;
  visaProcessingWeeks: { min: number; max: number };
  intakes: Array<{ name: string; month: number; deadlineWeeksBefore: number }>;
  source: string;
  lastVerified: string;
}

export interface UniversityData {
  id: string;
  country: string;
  name: string;
  city: string;
  rankingTier: 1 | 2 | 3;
  fieldsOffered: FieldOfStudy[];
  tuitionUsdPerYear: { min: number; max: number };
  minGradePercent: number;
  minEnglishScore: number;
  source: string;
  lastVerified: string;
}

export interface FieldOfStudyData {
  id: FieldOfStudy;
  label: string;
  iconKey: string;
}
```

- [ ] **Step 2: Create lib/data/fields-of-study.ts**

```ts
import type { FieldOfStudyData } from "./types";

export const FIELDS_OF_STUDY: FieldOfStudyData[] = [
  { id: "computer-science", label: "Computer Science / IT", iconKey: "cpu" },
  { id: "business", label: "Business / Management", iconKey: "briefcase" },
  { id: "nursing", label: "Nursing / Health Sciences", iconKey: "heart" },
  { id: "engineering", label: "Engineering", iconKey: "wrench" },
  { id: "hospitality", label: "Hospitality / Hotel Management", iconKey: "coffee" },
  { id: "accounting", label: "Accounting / Finance", iconKey: "coins" },
  { id: "data-science", label: "Data Science / AI", iconKey: "spark" },
  { id: "education", label: "Education", iconKey: "cap" },
  { id: "agriculture", label: "Agriculture", iconKey: "leaf" },
  { id: "law", label: "Law", iconKey: "scale" },
  { id: "arts", label: "Arts / Social Sciences", iconKey: "palette" },
  { id: "other", label: "Other", iconKey: "more" },
];
```

- [ ] **Step 3: Create lib/data/source/nepal.ts**

```ts
import type { SourceCountryData } from "../types";

export const NEPAL: SourceCountryData = {
  id: "nepal",
  name: "Nepal",
  flag: "🇳🇵",
  gradeSystems: ["percentage-nepal", "cgpa-4"],
  defaultGradeSystem: "percentage-nepal",
  testCenters: {
    ielts: ["British Council, Kathmandu", "IDP, Kathmandu", "IDP, Pokhara"],
  },
  source: "https://www.britishcouncil.org.np/exam/ielts",
  lastVerified: "2026-06-02",
};
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: static data for fields of study and Nepal source country"
```

---

## Task 12: Build destination data — Australia + universities

**Files:**
- Create: `lib/data/destination/australia.ts`
- Create: `lib/data/universities/au.ts`

- [ ] **Step 1: Create lib/data/destination/australia.ts**

```ts
import type { DestinationCountryData } from "../types";

export const AUSTRALIA: DestinationCountryData = {
  id: "australia",
  name: "Australia",
  flag: "🇦🇺",
  tuitionRangeUsd: { min: 22000, max: 45000 },
  livingRangeUsd: { min: 14000, max: 22000 },
  englishThreshold: 6.5,
  visaProcessingWeeks: { min: 4, max: 8 },
  intakes: [
    { name: "February", month: 2, deadlineWeeksBefore: 16 },
    { name: "July", month: 7, deadlineWeeksBefore: 16 },
  ],
  source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
  lastVerified: "2026-06-02",
};
```

- [ ] **Step 2: Create lib/data/universities/au.ts**

```ts
import type { UniversityData } from "../types";

// MVP: 10 representative Australian universities across tiers and fields.
// Hand-verified from each university's international admissions page on 2026-06-02.
export const AU_UNIVERSITIES: UniversityData[] = [
  {
    id: "unimelb",
    country: "australia",
    name: "University of Melbourne",
    city: "Melbourne",
    rankingTier: 1,
    fieldsOffered: ["computer-science", "data-science", "business", "engineering", "law", "arts", "education"],
    tuitionUsdPerYear: { min: 35000, max: 48000 },
    minGradePercent: 80,
    minEnglishScore: 6.5,
    source: "https://study.unimelb.edu.au/",
    lastVerified: "2026-06-02",
  },
  {
    id: "usyd",
    country: "australia",
    name: "University of Sydney",
    city: "Sydney",
    rankingTier: 1,
    fieldsOffered: ["computer-science", "business", "engineering", "nursing", "law", "arts"],
    tuitionUsdPerYear: { min: 34000, max: 46000 },
    minGradePercent: 78,
    minEnglishScore: 6.5,
    source: "https://www.sydney.edu.au/study.html",
    lastVerified: "2026-06-02",
  },
  {
    id: "unsw",
    country: "australia",
    name: "UNSW Sydney",
    city: "Sydney",
    rankingTier: 1,
    fieldsOffered: ["computer-science", "data-science", "engineering", "business", "accounting"],
    tuitionUsdPerYear: { min: 33000, max: 46000 },
    minGradePercent: 75,
    minEnglishScore: 6.5,
    source: "https://www.unsw.edu.au/study",
    lastVerified: "2026-06-02",
  },
  {
    id: "monash",
    country: "australia",
    name: "Monash University",
    city: "Melbourne",
    rankingTier: 1,
    fieldsOffered: ["computer-science", "business", "engineering", "nursing", "education"],
    tuitionUsdPerYear: { min: 30000, max: 44000 },
    minGradePercent: 72,
    minEnglishScore: 6.5,
    source: "https://www.monash.edu/study",
    lastVerified: "2026-06-02",
  },
  {
    id: "uq",
    country: "australia",
    name: "University of Queensland",
    city: "Brisbane",
    rankingTier: 1,
    fieldsOffered: ["computer-science", "business", "engineering", "nursing", "agriculture"],
    tuitionUsdPerYear: { min: 29000, max: 43000 },
    minGradePercent: 72,
    minEnglishScore: 6.5,
    source: "https://study.uq.edu.au/",
    lastVerified: "2026-06-02",
  },
  {
    id: "rmit",
    country: "australia",
    name: "RMIT University",
    city: "Melbourne",
    rankingTier: 2,
    fieldsOffered: ["computer-science", "business", "engineering", "hospitality", "accounting", "arts"],
    tuitionUsdPerYear: { min: 25000, max: 38000 },
    minGradePercent: 65,
    minEnglishScore: 6.5,
    source: "https://www.rmit.edu.au/study-with-us",
    lastVerified: "2026-06-02",
  },
  {
    id: "deakin",
    country: "australia",
    name: "Deakin University",
    city: "Melbourne",
    rankingTier: 2,
    fieldsOffered: ["computer-science", "business", "nursing", "engineering", "education"],
    tuitionUsdPerYear: { min: 24000, max: 36000 },
    minGradePercent: 65,
    minEnglishScore: 6.5,
    source: "https://www.deakin.edu.au/courses",
    lastVerified: "2026-06-02",
  },
  {
    id: "latrobe",
    country: "australia",
    name: "La Trobe University",
    city: "Melbourne",
    rankingTier: 2,
    fieldsOffered: ["business", "nursing", "education", "agriculture", "arts"],
    tuitionUsdPerYear: { min: 22000, max: 34000 },
    minGradePercent: 60,
    minEnglishScore: 6.0,
    source: "https://www.latrobe.edu.au/study",
    lastVerified: "2026-06-02",
  },
  {
    id: "torrens",
    country: "australia",
    name: "Torrens University Australia",
    city: "Adelaide",
    rankingTier: 3,
    fieldsOffered: ["business", "hospitality", "accounting", "arts"],
    tuitionUsdPerYear: { min: 18000, max: 28000 },
    minGradePercent: 55,
    minEnglishScore: 6.0,
    source: "https://www.torrens.edu.au/",
    lastVerified: "2026-06-02",
  },
  {
    id: "fed",
    country: "australia",
    name: "Federation University Australia",
    city: "Ballarat",
    rankingTier: 3,
    fieldsOffered: ["computer-science", "business", "nursing", "education", "engineering"],
    tuitionUsdPerYear: { min: 17000, max: 26000 },
    minGradePercent: 55,
    minEnglishScore: 6.0,
    source: "https://federation.edu.au/",
    lastVerified: "2026-06-02",
  },
];
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: static data for Australia destination and universities"
```

---

## Task 13: Build callout rules engine

**Files:**
- Create: `lib/callouts/types.ts`
- Create: `lib/callouts/rules.ts`
- Create: `tests/callouts/rules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/callouts/rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { evaluateWizardCallouts } from "@/lib/callouts/rules";
import type { StudentProfile } from "@/lib/scoring/types";

const partial = (overrides: Partial<StudentProfile>): Partial<StudentProfile> => ({
  homeCountry: "Nepal",
  destination: "australia",
  fieldOfStudy: "computer-science",
  educationLevel: "bachelors",
  ...overrides,
});

const currentYear = new Date().getFullYear();

describe("evaluateWizardCallouts", () => {
  it("returns a long-gap callout when graduation was 6+ years ago", () => {
    const callouts = evaluateWizardCallouts(
      partial({ graduationYear: currentYear - 6 }) as StudentProfile,
      "graduationYear",
    );
    expect(callouts.some((c) => /5 years/i.test(c.message))).toBe(true);
  });

  it("returns an IELTS callout when score is below 6.5 and destination is Australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({
        englishStatus: "taken",
        englishScore: 6.0,
        destination: "australia",
      }) as StudentProfile,
      "english",
    );
    expect(callouts.some((c) => /6\.5\+/i.test(c.message))).toBe(true);
  });

  it("returns no English callout when IELTS is 7.0 and destination is Australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({
        englishStatus: "taken",
        englishScore: 7.0,
        destination: "australia",
      }) as StudentProfile,
      "english",
    );
    expect(callouts).toHaveLength(0);
  });

  it("returns a nursing-specific callout for nursing + australia", () => {
    const callouts = evaluateWizardCallouts(
      partial({ fieldOfStudy: "nursing", destination: "australia" }) as StudentProfile,
      "fieldOfStudy",
    );
    expect(callouts.some((c) => /AHPRA/i.test(c.message))).toBe(true);
  });

  it("returns a scholarship-friendly callout when funding is scholarship-dependent", () => {
    const callouts = evaluateWizardCallouts(
      partial({ fundingSource: "scholarship-dependent" }) as StudentProfile,
      "budget",
    );
    expect(callouts.some((c) => /scholarship/i.test(c.message))).toBe(true);
  });

  it("returns multi-country comparison callout when destination is 'not-sure'", () => {
    const callouts = evaluateWizardCallouts(
      partial({ destination: "not-sure" }) as StudentProfile,
      "destination",
    );
    expect(callouts.some((c) => /compare/i.test(c.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/callouts/rules.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create lib/callouts/types.ts**

```ts
export type CalloutStep =
  | "homeCountry"
  | "education"
  | "fieldOfStudy"
  | "graduationYear"
  | "english"
  | "destination"
  | "budget"
  | "goal";

export type CalloutTone = "info" | "warn" | "positive";

export interface Callout {
  id: string;
  step: CalloutStep;
  tone: CalloutTone;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}
```

- [ ] **Step 4: Create lib/callouts/rules.ts**

```ts
import type { StudentProfile } from "@/lib/scoring/types";
import type { Callout, CalloutStep } from "./types";

export function evaluateWizardCallouts(
  profile: Partial<StudentProfile>,
  step: CalloutStep,
): Callout[] {
  const callouts: Callout[] = [];
  const currentYear = new Date().getFullYear();

  if (step === "fieldOfStudy") {
    if (profile.fieldOfStudy === "nursing" && profile.destination === "australia") {
      callouts.push({
        id: "nursing-ahpra",
        step,
        tone: "info",
        message:
          "Nursing has AHPRA registration requirements. We'll include these in your checklist.",
      });
    }
    if (
      (profile.fieldOfStudy === "computer-science" ||
        profile.fieldOfStudy === "data-science") &&
      profile.destination === "australia"
    ) {
      callouts.push({
        id: "cs-competitive",
        step,
        tone: "info",
        message:
          "CS and Data Science are competitive — grades and English matter more. We'll factor this in.",
      });
    }
  }

  if (step === "graduationYear" && profile.graduationYear !== undefined) {
    const gap = currentYear - profile.graduationYear;
    if (gap >= 6) {
      callouts.push({
        id: "long-gap",
        step,
        tone: "warn",
        message:
          "Gaps over 5 years face extra scrutiny. Documented work experience during this period strengthens your case significantly.",
      });
    } else if (gap >= 3) {
      callouts.push({
        id: "moderate-gap",
        step,
        tone: "info",
        message: `A ${gap}-year gap needs a clear explanation for visa purposes. We'll help you frame this.`,
      });
    }
  }

  if (step === "english") {
    if (profile.englishStatus === "taken" && profile.englishScore !== undefined) {
      if (profile.englishScore < 6.5 && profile.destination === "australia") {
        callouts.push({
          id: "ielts-low-au",
          step,
          tone: "warn",
          message:
            "Most Australian universities require 6.5+. You can retake at British Council, Kathmandu.",
          actionLabel: "Find test dates",
          actionHref: "https://www.britishcouncil.org.np/exam/ielts/dates-fees-locations",
        });
      }
    } else if (profile.englishStatus === "not-taken") {
      callouts.push({
        id: "ielts-not-taken",
        step,
        tone: "info",
        message:
          "No score yet? We'll show you what you'd need and where to book in Kathmandu.",
      });
    }
  }

  if (step === "destination" && profile.destination === "not-sure") {
    callouts.push({
      id: "destination-undecided",
      step,
      tone: "info",
      message:
        "Great — we'll compare countries against your profile and show you where you stand best.",
    });
  }

  if (step === "budget") {
    if (profile.fundingSource === "scholarship-dependent") {
      callouts.push({
        id: "scholarship-friendly",
        step,
        tone: "info",
        message:
          "Scholarship-dependent is fine — we'll flag scholarship-friendly universities in your matches.",
      });
    }
    if (profile.budget !== undefined && profile.destination === "australia") {
      const budgetUsd =
        profile.budgetCurrency === "USD" ? profile.budget : profile.budget / 135;
      if (budgetUsd < 26000) {
        callouts.push({
          id: "budget-tight-au",
          step,
          tone: "warn",
          message:
            "Australian living costs alone are ~USD 14k–22k/yr. Consider scholarships or loan support.",
        });
      }
    }
  }

  return callouts;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/callouts/rules.test.ts
```

Expected: all callout tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: smart callout rules for wizard steps"
```

---

## Task 14: Add utility helpers

**Files:**
- Create: `lib/utils.ts`
- Create: `tests/utils.test.ts`

- [ ] **Step 1: Install clsx + tailwind-merge**

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 2: Write the failing test**

Create `tests/utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cn, formatNpr, formatUsd, yearsBetween } from "@/lib/utils";

describe("cn", () => {
  it("merges class names with tailwind precedence", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-ink", undefined, false && "hidden", "text-ink-soft")).toBe("text-ink-soft");
  });
});

describe("formatNpr", () => {
  it("formats with Nepali lakh notation under 1 crore", () => {
    expect(formatNpr(4500000)).toBe("NPR 45 lakh");
  });

  it("formats with crore notation at or above 1 crore", () => {
    expect(formatNpr(15000000)).toBe("NPR 1.5 crore");
  });
});

describe("formatUsd", () => {
  it("formats with k suffix above 1000", () => {
    expect(formatUsd(33000)).toBe("USD 33k");
  });
});

describe("yearsBetween", () => {
  it("returns positive integers for past graduations", () => {
    const now = new Date().getFullYear();
    expect(yearsBetween(now - 3)).toBe(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/utils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement utilities**

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNpr(amount: number): string {
  if (amount >= 10000000) {
    const crore = amount / 10000000;
    const display = crore % 1 === 0 ? crore.toFixed(0) : crore.toFixed(1);
    return `NPR ${display} crore`;
  }
  const lakh = Math.round(amount / 100000);
  return `NPR ${lakh} lakh`;
}

export function formatUsd(amount: number): string {
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `USD ${k}k`;
  }
  return `USD ${amount}`;
}

export function yearsBetween(pastYear: number, reference?: number): number {
  const ref = reference ?? new Date().getFullYear();
  return Math.max(0, ref - pastYear);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/utils.test.ts
```

Expected: all utility tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: utility helpers — cn, formatNpr, formatUsd, yearsBetween"
```

---

## Task 15: Add env template + Supabase client stubs

**Files:**
- Create: `.env.example`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/types.ts`

This task creates the Supabase wiring files but does not yet require a working Supabase connection — Plan 3 will create tables and apply migrations. We install the SDK and lay the groundwork now so Plan 2 can build UI against typed stubs.

- [ ] **Step 1: Install Supabase SDK**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create .env.example**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-only Supabase service role (used for privileged operations)
SUPABASE_SERVICE_ROLE_KEY=

# Sentry (Plan 3)
SENTRY_DSN=

# PostHog (Plan 3)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

- [ ] **Step 3: Create lib/supabase/types.ts (placeholder)**

```ts
// Generated types will replace this after Plan 3 schema is applied.
// Run `supabase gen types typescript` once tables exist.

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
```

- [ ] **Step 4: Create lib/supabase/client.ts (browser)**

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Create lib/supabase/server.ts (server components / route handlers)**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a server component — safe to ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Verify build (env stubs are fine because clients are not yet invoked)**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Supabase client scaffolding and env template"
```

---

## Task 16: Add CI guardrails (typecheck, lint, test on push)

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (add `typecheck` script)

- [ ] **Step 1: Add typecheck script**

In `package.json`, under `"scripts"`, add:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
```

- [ ] **Step 3: Run all checks locally**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: add GitHub Actions workflow for typecheck, lint, test, build"
```

---

## Task 17: Verify end-to-end engine on the persona

**Files:**
- Create: `tests/integration/aarav.test.ts`

This integration test runs the scoring engine on the canonical persona (Aarav: Nepal, BSc CS, 72%, IELTS 7.0, 1-year gap with work, Australia, NPR 45 lakh, education loan, PR goal) and asserts the high-level behaviour.

- [ ] **Step 1: Write the integration test**

Create `tests/integration/aarav.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runAssessment } from "@/lib/scoring/engine";
import { ProfileSchema } from "@/lib/validation/profile";
import type { StudentProfile } from "@/lib/scoring/types";

describe("Aarav persona", () => {
  const aarav: StudentProfile = {
    homeCountry: "Nepal",
    educationLevel: "bachelors",
    gradeSystem: "percentage-nepal",
    grade: 72,
    fieldOfStudy: "computer-science",
    graduationYear: new Date().getFullYear() - 1,
    gapReasons: ["worked"],
    englishStatus: "taken",
    englishScore: 7.0,
    destination: "australia",
    budget: 4500000,
    budgetCurrency: "NPR",
    fundingSource: "education-loan",
    goal: "permanent-residency",
  };

  it("validates the persona profile", () => {
    expect(ProfileSchema.safeParse(aarav).success).toBe(true);
  });

  it("produces a 'possible' verdict (CS at UniMelb is a stretch but realistic)", () => {
    const result = runAssessment(aarav);
    expect(result.verdict).toBe("possible");
  });

  it("returns factors that mention the work-explained gap", () => {
    const result = runAssessment(aarav);
    const allFactors = [
      ...result.dimensions.academic.factors,
      ...result.dimensions.financial.factors,
      ...result.dimensions.visa.factors,
      ...result.dimensions.profileStrength.factors,
    ];
    expect(allFactors.some((f) => /work/i.test(f.label) || /work/i.test(f.detail))).toBe(true);
  });

  it("reports a rule version and ISO timestamp", () => {
    const result = runAssessment(aarav);
    expect(result.ruleVersion).toBe("v0.1.0");
    expect(Date.parse(result.computedAt)).not.toBeNaN();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- tests/integration/aarav.test.ts
```

Expected: all persona tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: every test in the project passes. Confirm count is roughly 30+ tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: integration test for Aarav persona end-to-end"
```

---

## Task 18: Wire up GitHub remote and push

**Files:** None (git operations only)

This task creates the GitHub repository and pushes the local commits.

- [ ] **Step 1: Create a private repo on GitHub**

Use `gh` CLI (the user has GitHub connected):
```bash
gh repo create merovisa --private --source=. --remote=origin --description="MyVisa — trust-first study-abroad platform for international students"
```

If `gh` is not available, create the repo manually via the GitHub UI, then:
```bash
git remote add origin https://github.com/<username>/merovisa.git
```

- [ ] **Step 2: Push main branch**

```bash
git push -u origin main
```

Expected: push succeeds, CI workflow triggers on GitHub.

- [ ] **Step 3: Verify CI runs green**

Run:
```bash
gh run watch
```

Or check the Actions tab on GitHub. Expected: all jobs (typecheck, lint, test, build) pass.

- [ ] **Step 4: No commit needed (this task only configures git remote)**

---

## Done

After this plan:

- Next.js 14 app compiles with strict TypeScript
- Design tokens are in Tailwind config and global CSS
- Hanken Grotesk + IBM Plex Mono load via `next/font`
- Vitest test suite covers profile validation, every scoring dimension, verdict mapping, scoring engine composition, callout rules, utility helpers, and the Aarav persona integration test
- Static data files for Nepal (source), Australia (destination), 10 universities, and 12 fields of study — every entry carries `source` + `lastVerified`
- Supabase client scaffolding is in place (no live tables yet — Plan 3 handles schema)
- CI runs typecheck, lint, tests, and build on every push
- Code lives on GitHub with green CI

**Plan 2** will build the wizard UI, transition animation, and results page on top of this foundation. **Plan 3** will add Supabase schema, RLS, auth, monitoring, and Vercel deployment.
