# Per-program Document Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-program document checklist (`/checklist/[programId]`) that maps a program's requirements to the documents in the user's vault, marking what they have vs. still need — answering "what documents do I need now?" and "what comes after my offer?".

**Architecture:** A pure rule-derived generator (`lib/checklist/generator.ts`, mirroring `lib/plan/generator.ts`) turns a `Program` + profile sections + the set of uploaded document kinds into ordered `ChecklistItem[]`. Presentational components render them, grouped by **stage** (now / after-offer). Thin async page shells fetch data and delegate to the presentational `ChecklistView` / `ChecklistLanding` (so the testable logic lives in pure functions + render-testable components; no supabase-mock harness). No migration, no scoring touched — a pure view over existing tables.

**Tech Stack:** Next.js 14+ App Router (server components), TypeScript strict, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-08-per-program-checklist-design.md`

---

## Conventions (read once)

- **Branch:** do all work on `per-program-checklist`. Per-task commits. Final task ff-merges to `master`, pushes, deletes the branch, then logs status.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Use explicit `git add <paths>` — never `git add -A`.
- Every commit message ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run `npm run typecheck` after each implementation step; it must stay clean.
- The upload affordance for a missing item is a **deep-link** to `/documents` ("Upload in documents ↗") — NOT an embedded `DocumentCard`. (Per user guard: clarity over upload UX; embedding risks bulky rows. Embedding is a deferred fast-follow.)

- [ ] **Task 0: Create the branch**

Run:
```bash
git checkout -b per-program-checklist
```

---

### Task 1: Checklist types

**Files:**
- Create: `lib/checklist/types.ts`

- [ ] **Step 1: Write the types file** (declarations only — no test needed)

```ts
import type { DocumentKind, DocumentKindMeta } from "@/lib/documents/types";

export type ChecklistStage = "now" | "after-offer";
export type ChecklistRequirement = "required" | "recommended";
export type ChecklistStatus = "have" | "missing" | "info";

/** Maps directly onto the SourceLine component's props. */
export interface ChecklistSource {
  url: string;
  lastVerified?: string;
}

export interface ChecklistItem {
  key: string;                          // stable id (tests + React keys)
  kind: DocumentKind | null;            // null = informational, no vault binding
  label: string;
  group: DocumentKindMeta["group"];     // identity | academic | english | financial | employment | visa | other
  stage: ChecklistStage;
  requirement: ChecklistRequirement;
  status: ChecklistStatus;              // have/missing when kind != null; "info" when kind == null
  note?: string;
  source?: ChecklistSource;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (no usages yet).

- [ ] **Step 3: Commit**

```bash
git add lib/checklist/types.ts
git commit -m "Add checklist item types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The generator (the heart — TDD)

**Files:**
- Create: `lib/checklist/generator.ts`
- Test: `tests/checklist/generator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/checklist/generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateChecklist } from "@/lib/checklist/generator";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

const baseProgram: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};
const noKinds = new Set<DocumentKind>();
const keys = (items: ChecklistItem[]) => items.map((i) => i.key);
const byKey = (items: ChecklistItem[], k: string) => items.find((i) => i.key === k);

describe("generateChecklist", () => {
  it("always requires passport + national id (identity, now)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "passport")).toMatchObject({ kind: "passport", stage: "now", requirement: "required", group: "identity", status: "missing" });
    expect(byKey(items, "national-id")?.requirement).toBe("required");
  });

  it("requires bachelor's transcript for a masters program, not a master's transcript", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "bachelors-transcript")).toMatchObject({ requirement: "required", stage: "now" });
    expect(keys(items)).not.toContain("masters-transcript");
  });

  it("requires +2 and SLC for a bachelors program", () => {
    const items = generateChecklist({ program: { ...baseProgram, level: "bachelors" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "plus-two")?.requirement).toBe("required");
    expect(byKey(items, "slc-see")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("bachelors-transcript");
  });

  it("marks an uploaded kind as have", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: new Set<DocumentKind>(["passport"]) });
    expect(byKey(items, "passport")?.status).toBe("have");
    expect(byKey(items, "national-id")?.status).toBe("missing");
  });

  it("states the program's English requirement and sources it", () => {
    const eng = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "english");
    expect(eng?.requirement).toBe("required");
    expect(eng?.note).toContain("IELTS 6.5");
    expect(eng?.note).toContain("each band ≥ 6");
    expect(eng?.source?.url).toBe("https://example.edu/it");
  });

  it("defaults the English kind to the student's test when known", () => {
    const items = generateChecklist({ program: baseProgram, sections: { english: { test: "pte" } }, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.kind).toBe("pte");
  });

  it("adds nursing deltas: band-7 note + AHPRA info item", () => {
    const items = generateChecklist({ program: { ...baseProgram, field: "nursing" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.note).toContain("each band ≥ 7");
    expect(byKey(items, "ahpra")).toMatchObject({ kind: null, status: "info", group: "academic" });
  });

  it("self-funded → bank statement required, no sponsor income", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("fin-sponsor");
  });

  it("parents-family → bank statement + sponsor income required", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "parents-family" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("required");
  });

  it("education-loan → loan sanction required, bank recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-bank")?.requirement).toBe("recommended");
  });

  it("mixed → bank + loan required, sponsor recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "mixed" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("recommended");
  });

  it("scholarship-dependent → informational award-letter item (kind null)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "scholarship-dependent" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-scholarship")).toMatchObject({ kind: null, status: "info", requirement: "required" });
  });

  it("unknown funding → general proof-of-funds bank item with the DHA figure", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.requirement).toBe("required");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });

  it("attaches the DHA source to the first required financial item only", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.source?.url).toContain("immi.homeaffairs.gov.au");
    expect(byKey(items, "fin-bank")?.source).toBeUndefined();
  });

  it("adds the AL3 seasoning note by default; omits it for L2", () => {
    const l3 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(l3, "fin-bank")?.note).toContain("Level 3");
    const l2 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds, nepalAssessmentLevel: "L2" });
    expect(byKey(l2, "fin-bank")?.note).not.toContain("Level 3");
  });

  it("adds employment docs when work title is set", () => {
    const items = generateChecklist({ program: baseProgram, sections: { work: { title: "Analyst" } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")).toBeTruthy();
    expect(byKey(items, "salary-slip")).toBeTruthy();
  });

  it("adds an employment letter for a study gap even with no job (no salary slip)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { gap: { years: 2 } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")?.note).toContain("study gap");
    expect(keys(items)).not.toContain("salary-slip");
  });

  it("omits employment docs when neither work nor gap applies", () => {
    expect(keys(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }))).not.toContain("employment-letter");
  });

  it("places all visa documents in the after-offer stage, required", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    for (const k of ["offer-letter", "coe", "oshc", "medical"]) {
      expect(byKey(items, k)?.stage).toBe("after-offer");
      expect(byKey(items, k)?.requirement).toBe("required");
    }
  });
});
```

- [ ] **Step 2: Run the tests — verify they FAIL**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/checklist/generator" (module not created yet).

- [ ] **Step 3: Write the generator**

Create `lib/checklist/generator.ts`:

```ts
import type { Program } from "@/lib/programs/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { DocumentKind } from "@/lib/documents/types";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { NEPAL_L3_BANK_SEASONING_MONTHS } from "@/lib/programs/policy";
import type {
  ChecklistItem,
  ChecklistRequirement,
  ChecklistSource,
  ChecklistStatus,
} from "./types";

export interface ChecklistInputs {
  program: Program;
  sections: ProfileSections;
  uploadedKinds: Set<DocumentKind>;
  nepalAssessmentLevel?: "L2" | "L3";
}

const DHA_SOURCE: ChecklistSource = {
  url: AU_DHA_LIVING_CAPACITY_AUD.provenance.source,
  lastVerified: AU_DHA_LIVING_CAPACITY_AUD.provenance.lastVerified,
};

function statusFor(kind: DocumentKind | null, uploaded: Set<DocumentKind>): ChecklistStatus {
  if (kind === null) return "info";
  return uploaded.has(kind) ? "have" : "missing";
}

export function generateChecklist(inputs: ChecklistInputs): ChecklistItem[] {
  const { program, sections, uploadedKinds } = inputs;
  const level = inputs.nepalAssessmentLevel ?? "L3";
  const items: ChecklistItem[] = [];
  const add = (it: Omit<ChecklistItem, "status">) =>
    items.push({ ...it, status: statusFor(it.kind, uploadedKinds) });

  // IDENTITY (now)
  add({ key: "passport", kind: "passport", label: "Passport bio page", group: "identity", stage: "now", requirement: "required" });
  add({ key: "national-id", kind: "national-id", label: "Citizenship / National ID", group: "identity", stage: "now", requirement: "required" });
  add({ key: "birth-certificate", kind: "birth-certificate", label: "Birth certificate", group: "identity", stage: "now", requirement: "recommended" });

  // ACADEMIC (now, by level)
  if (program.level === "bachelors") {
    add({ key: "plus-two", kind: "plus-two", label: "+2 / Higher Secondary", group: "academic", stage: "now", requirement: "required" });
    add({ key: "slc-see", kind: "slc-see", label: "SLC / SEE certificate", group: "academic", stage: "now", requirement: "required" });
  } else {
    if (program.level === "doctorate") {
      add({ key: "masters-transcript", kind: "masters-transcript", label: "Master's transcript", group: "academic", stage: "now", requirement: "required" });
    }
    add({ key: "bachelors-transcript", kind: "bachelors-transcript", label: "Bachelor's transcript", group: "academic", stage: "now", requirement: "required" });
    add({ key: "plus-two", kind: "plus-two", label: "+2 / Higher Secondary", group: "academic", stage: "now", requirement: "recommended" });
    add({ key: "slc-see", kind: "slc-see", label: "SLC / SEE certificate", group: "academic", stage: "now", requirement: "recommended" });
  }

  // ENGLISH (now)
  const testKind: DocumentKind =
    sections.english?.test === "pte" ? "pte" : sections.english?.test === "toefl" ? "toefl" : "ielts";
  const isNursing = program.field === "nursing";
  let englishNote: string;
  if (program.minEnglish != null) {
    const band = program.minEnglishBand != null ? `, each band ≥ ${program.minEnglishBand}` : "";
    englishNote = `This program lists ${testKind.toUpperCase()} ${program.minEnglish}${band}.`;
  } else {
    englishNote = "Most Australian programs require an English test for both admission and the visa.";
  }
  if (isNursing) englishNote += " Nursing programs typically require each band ≥ 7.";
  add({
    key: "english",
    kind: testKind,
    label: testKind === "ielts" ? "IELTS scorecard (or PTE / TOEFL)" : testKind === "pte" ? "PTE Academic scorecard" : "TOEFL iBT report",
    group: "english", stage: "now", requirement: "required",
    note: englishNote,
    source: program.source ? { url: program.source, lastVerified: program.lastVerified || undefined } : undefined,
  });
  if (isNursing) {
    add({ key: "ahpra", kind: null, label: "AHPRA registration", group: "academic", stage: "now", requirement: "required", note: "Nursing programs require registration with the Australian Health Practitioner Regulation Agency (AHPRA)." });
  }

  // FINANCIAL (now, by funding source)
  const tuition = program.tuitionMin != null ? `AUD ${program.tuitionMin.toLocaleString()}` : "first-year tuition";
  const dhaNote = `DHA expects evidence covering AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living + ${tuition}.`;
  const seasoning = level === "L3" ? ` Under Nepal Assessment Level 3, season your balance for ${NEPAL_L3_BANK_SEASONING_MONTHS} months with source-of-funds evidence.` : "";
  const financeNote = dhaNote + seasoning;
  let financeNoteAttached = false;
  const addFinance = (key: string, kind: DocumentKind | null, label: string, requirement: ChecklistRequirement) => {
    const isFirstRequired = requirement === "required" && !financeNoteAttached;
    if (isFirstRequired) financeNoteAttached = true;
    add({
      key, kind, label, group: "financial", stage: "now", requirement,
      note: isFirstRequired ? financeNote : undefined,
      source: isFirstRequired ? DHA_SOURCE : undefined,
    });
  };
  switch (sections.finance?.source) {
    case "self-funded":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      break;
    case "parents-family":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      addFinance("fin-sponsor", "sponsor-income", "Sponsor income (tax return)", "required");
      break;
    case "education-loan":
      addFinance("fin-loan", "loan-sanction", "Education loan sanction letter", "required");
      addFinance("fin-bank", "bank-statement", "Bank statement", "recommended");
      break;
    case "mixed":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      addFinance("fin-loan", "loan-sanction", "Education loan sanction letter", "required");
      addFinance("fin-sponsor", "sponsor-income", "Sponsor income (tax return)", "recommended");
      break;
    case "scholarship-dependent":
      addFinance("fin-scholarship", null, "Scholarship / sponsorship award letter", "required");
      addFinance("fin-bank", "bank-statement", "Bank statement (living-cost gap)", "recommended");
      break;
    default:
      addFinance("fin-bank", "bank-statement", "Proof of funds (bank statement, loan sanction, or sponsor income)", "required");
  }

  // EMPLOYMENT (now, conditional)
  const hasWork = !!sections.work?.title;
  const hasGap = (sections.gap?.years ?? 0) >= 1;
  if (hasWork || hasGap) {
    add({
      key: "employment-letter", kind: "employment-letter", label: "Employment letter", group: "employment", stage: "now", requirement: "recommended",
      note: hasGap ? "Evidence for your study gap (employment letter, salary slips)." : "Strengthens admissions and your Genuine Student narrative.",
    });
    if (hasWork) {
      add({ key: "salary-slip", kind: "salary-slip", label: "Salary slips", group: "employment", stage: "now", requirement: "recommended" });
    }
  }

  // VISA (after-offer)
  add({ key: "offer-letter", kind: "offer-letter", label: "University offer letter", group: "visa", stage: "after-offer", requirement: "required", note: "Issued when a university accepts you." });
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: "After you accept and pay your deposit." });
  add({ key: "oshc", kind: "oshc", label: "Overseas Student Health Cover (OSHC)", group: "visa", stage: "after-offer", requirement: "required", note: "Before you lodge the visa." });
  add({ key: "medical", kind: "medical", label: "Panel medical exam", group: "visa", stage: "after-offer", requirement: "required", note: "When DHA requests it." });

  return items;
}
```

- [ ] **Step 4: Run the tests — verify they PASS**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: PASS (all ~20). Then `npm run typecheck` — clean.

- [ ] **Step 5: Adversarial drift check**

Temporarily change `const isNursing = program.field === "nursing";` to `= false;`. Run the generator test.
Expected: the "nursing deltas" test FAILS. Revert the change; re-run — PASS. (Confirms the guard bites.)

- [ ] **Step 6: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -m "Add per-program checklist generator (rule-derived, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ChecklistItem component (TDD)

**Files:**
- Create: `components/checklist/checklist-item.tsx`
- Test: `tests/checklist/checklist-item.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/checklist/checklist-item.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistItem } from "@/components/checklist/checklist-item";
import type { ChecklistItem as Item } from "@/lib/checklist/types";

const base: Item = { key: "passport", kind: "passport", label: "Passport bio page", group: "identity", stage: "now", requirement: "required", status: "missing" };

describe("ChecklistItem", () => {
  it("shows an upload link for a missing item with a kind", () => {
    render(<ul><ChecklistItem item={base} /></ul>);
    expect(screen.getByText("Passport bio page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload in documents/i })).toHaveAttribute("href", "/documents");
  });
  it("marks a have item and shows no upload link", () => {
    render(<ul><ChecklistItem item={{ ...base, status: "have" }} /></ul>);
    expect(screen.getByText(/Have/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upload/i })).not.toBeInTheDocument();
  });
  it("shows a Recommended tag for recommended items", () => {
    render(<ul><ChecklistItem item={{ ...base, requirement: "recommended" }} /></ul>);
    expect(screen.getByText(/Recommended/i)).toBeInTheDocument();
  });
  it("renders a SourceLine when the item has a source", () => {
    render(<ul><ChecklistItem item={{ ...base, source: { url: "https://immi.homeaffairs.gov.au/x", lastVerified: "2026-06-07" } }} /></ul>);
    expect(screen.getByRole("link", { name: /immi\.homeaffairs\.gov\.au/i })).toBeInTheDocument();
  });
  it("renders an info item (kind null) with no upload link", () => {
    render(<ul><ChecklistItem item={{ ...base, key: "ahpra", kind: null, label: "AHPRA registration", status: "info" }} /></ul>);
    expect(screen.getByText("AHPRA registration")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upload/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run tests/checklist/checklist-item.test.tsx`
Expected: FAIL — cannot resolve `@/components/checklist/checklist-item`.

- [ ] **Step 3: Write the component**

Create `components/checklist/checklist-item.tsx`:

```tsx
import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { SourceLine } from "@/components/results/source-line";

const STATUS_LABEL: Record<Item["status"], string> = { have: "Have", missing: "Needed", info: "Bring this" };

export function ChecklistItem({ item }: { item: Item }) {
  const isHave = item.status === "have";
  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 ${isHave ? "border-primary bg-surface" : "border-line bg-bg-tint"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-ink">{isHave ? "✓ " : ""}{item.label}</span>
        <div className="flex items-center gap-2">
          {item.requirement === "recommended" && (
            <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
              Recommended
            </span>
          )}
          <span className={`font-mono text-[11px] uppercase tracking-wide ${isHave ? "text-strong" : "text-ink-faint"}`}>
            {STATUS_LABEL[item.status]}
          </span>
        </div>
      </div>
      {item.note && <p className="text-[13px] text-ink-soft">{item.note}</p>}
      {item.source && <SourceLine url={item.source.url} lastVerified={item.source.lastVerified} />}
      {item.status === "missing" && item.kind && (
        <a href="/documents" className="text-[12.5px] text-primary hover:underline">Upload in documents ↗</a>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run tests/checklist/checklist-item.test.tsx`
Expected: PASS (5). Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add components/checklist/checklist-item.tsx tests/checklist/checklist-item.test.tsx
git commit -m "Add ChecklistItem component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ChecklistStageSection + ChecklistView (TDD)

**Files:**
- Create: `components/checklist/checklist-stage-section.tsx`
- Create: `components/checklist/checklist-view.tsx`
- Test: `tests/checklist/checklist-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/checklist/checklist-view.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistView } from "@/components/checklist/checklist-view";
import { generateChecklist } from "@/lib/checklist/generator";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

const program: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};

describe("ChecklistView", () => {
  it("renders both stage headings, the program name, and group labels", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    render(<ChecklistView program={program} university={null} items={items} />);
    expect(screen.getByRole("heading", { name: "Master of IT" })).toBeInTheDocument();
    expect(screen.getByText("What you need now")).toBeInTheDocument();
    expect(screen.getByText("After your offer")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run tests/checklist/checklist-view.test.tsx`
Expected: FAIL — cannot resolve `@/components/checklist/checklist-view`.

- [ ] **Step 3: Write both components**

Create `components/checklist/checklist-stage-section.tsx`:

```tsx
import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { GROUP_LABELS, GROUPS } from "@/lib/documents/types";
import { ChecklistItem } from "./checklist-item";

export function ChecklistStageSection({ title, subtitle, items }: { title: string; subtitle: string; items: Item[] }) {
  if (items.length === 0) return null;
  const groupsPresent = GROUPS.filter((g) => items.some((i) => i.group === g));
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium text-ink">{title}</h2>
        <p className="text-[14px] text-ink-soft">{subtitle}</p>
      </div>
      {groupsPresent.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{GROUP_LABELS[g]}</span>
          <ul className="flex flex-col gap-2">
            {items.filter((i) => i.group === g).map((i) => <ChecklistItem key={i.key} item={i} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

Create `components/checklist/checklist-view.tsx`:

```tsx
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program, University } from "@/lib/programs/types";
import { ChecklistStageSection } from "./checklist-stage-section";

export function ChecklistView({ program, university, items }: { program: Program; university: University | null; items: ChecklistItem[] }) {
  const now = items.filter((i) => i.stage === "now");
  const later = items.filter((i) => i.stage === "after-offer");
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
          Document checklist{university ? ` · ${university.name}` : ""}
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{program.name}</h1>
      </header>
      <ChecklistStageSection title="What you need now" subtitle="Gather these to apply and to build your visa case." items={now} />
      <ChecklistStageSection title="After your offer" subtitle="You'll add these once a university offers you a place." items={later} />
    </div>
  );
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run tests/checklist/checklist-view.test.tsx`
Expected: PASS. Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add components/checklist/checklist-stage-section.tsx components/checklist/checklist-view.tsx tests/checklist/checklist-view.test.tsx
git commit -m "Add ChecklistStageSection + ChecklistView (stage-driven layout)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The `/checklist/[programId]` page (thin shell)

**Files:**
- Create: `app/(app)/checklist/[programId]/page.tsx`

> No unit test: this is thin async wiring (auth + fetch + delegate). The logic is covered by Task 2/4. Verification is `npm run typecheck` + the suite.

- [ ] **Step 1: Write the page**

Create `app/(app)/checklist/[programId]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getProgram, listAllUniversities } from "@/lib/programs/repo";
import { getProfile } from "@/lib/profiles/repo";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { generateChecklist } from "@/lib/checklist/generator";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import type { DocumentKind } from "@/lib/documents/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import { ChecklistView } from "@/components/checklist/checklist-view";

export default async function ProgramChecklistPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  const program = await getProgram(supabase, programId);
  if (!program) notFound();

  const [universities, profile, docs] = await Promise.all([
    listAllUniversities(supabase),
    getProfile(supabase, user.id),
    listDocumentsForUser(supabase, user.id),
  ]);
  const university = universities.find((u) => u.id === program.universityId) ?? null;
  const sections = (profile?.sections ?? {}) as ProfileSections;
  const uploadedKinds = new Set<DocumentKind>(docs.map((d) => d.kind));

  const items = generateChecklist({ program, sections, uploadedKinds, nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
  return <ChecklistView program={program} university={university} items={items} />;
}
```

> **Convention check:** match the project's other `(app)` pages for the `params` / `headers()` shape. The documents page awaits `headers()`, so this assumes async (Next 15). If `getProfile`'s signature differs (e.g. returns a typed row), adapt `profile?.sections`. Confirm via `npm run typecheck`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. (Fix any signature mismatch — e.g. `params` not being a Promise on this Next version, or `getProfile` return shape.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/checklist/[programId]/page.tsx"
git commit -m "Add /checklist/[programId] page (thin shell over generator + view)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Bare `/checklist` landing (TDD on the component)

**Files:**
- Create: `components/checklist/checklist-landing.tsx`
- Modify: `app/(app)/checklist/page.tsx` (replace the `redirect("/documents")` stub)
- Test: `tests/checklist/checklist-landing.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/checklist/checklist-landing.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistLanding } from "@/components/checklist/checklist-landing";

describe("ChecklistLanding", () => {
  it("lists shortlisted programs with checklist links", () => {
    render(<ChecklistLanding shortlisted={[{ id: "p1", name: "Master of IT" }]} />);
    expect(screen.getByRole("link", { name: /Master of IT/i })).toHaveAttribute("href", "/checklist/p1");
  });
  it("shows a matches CTA when nothing is shortlisted", () => {
    render(<ChecklistLanding shortlisted={[]} />);
    expect(screen.getByRole("link", { name: /Browse matches/i })).toHaveAttribute("href", "/matches");
  });
  it("always links to the documents vault", () => {
    render(<ChecklistLanding shortlisted={[]} />);
    expect(screen.getByRole("link", { name: /documents vault/i })).toHaveAttribute("href", "/documents");
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run tests/checklist/checklist-landing.test.tsx`
Expected: FAIL — cannot resolve `@/components/checklist/checklist-landing`.

- [ ] **Step 3: Write the component**

Create `components/checklist/checklist-landing.tsx`:

```tsx
export function ChecklistLanding({ shortlisted }: { shortlisted: { id: string; name: string }[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Document checklist</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Pick a program to see its checklist</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Each program has its own checklist — what you need now, and what comes after your offer.
        </p>
      </header>

      {shortlisted.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shortlisted.map((p) => (
            <li key={p.id}>
              <a href={`/checklist/${p.id}`} className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 hover:border-primary">
                <span className="text-[15px] text-ink">{p.name}</span>
                <span className="text-[13px] text-primary">View checklist →</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-bg-tint p-5">
          <p className="text-[15px] text-ink">You haven't shortlisted any programs yet.</p>
          <a href="/matches" className="rounded-pill bg-primary px-4 py-2 text-[14px] text-white hover:opacity-90">Browse matches</a>
        </div>
      )}

      <a href="/documents" className="text-[13px] text-primary hover:underline">Go to your documents vault →</a>
    </div>
  );
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run tests/checklist/checklist-landing.test.tsx`
Expected: PASS (3).

- [ ] **Step 5: Replace the bare page stub**

Replace the entire contents of `app/(app)/checklist/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { listShortlistForUser } from "@/lib/matches/repo";
import { listAllPrograms } from "@/lib/programs/repo";
import { ChecklistLanding } from "@/components/checklist/checklist-landing";

export default async function ChecklistLandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  const [shortlist, programs] = await Promise.all([
    listShortlistForUser(supabase, user.id),
    listAllPrograms(supabase),
  ]);
  const ids = new Set(shortlist.map((s) => s.programId));
  const shortlisted = programs.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
  return <ChecklistLanding shortlisted={shortlisted} />;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` — clean.
```bash
git add components/checklist/checklist-landing.tsx tests/checklist/checklist-landing.test.tsx "app/(app)/checklist/page.tsx"
git commit -m "Add /checklist landing (shortlist picker + matches CTA + vault link)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Link ProgramCard → checklist (TDD)

**Files:**
- Modify: `components/matches/program-card.tsx`
- Test: `tests/components/matches/program-card.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to the `describe("ProgramCard", …)` block in `tests/components/matches/program-card.test.tsx` (before its closing `});`):

```tsx
  it("links to the program's document checklist", () => {
    render(<ProgramCard match={m} isShortlisted={false} />);
    expect(screen.getByRole("link", { name: /Document checklist/i })).toHaveAttribute("href", "/checklist/p1");
  });
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run tests/components/matches/program-card.test.tsx`
Expected: FAIL — no "Document checklist" link yet.

- [ ] **Step 3: Add the link**

In `components/matches/program-card.tsx`, inside the footer's left `<div className="flex flex-col gap-0.5">`, add the checklist link immediately after the existing source `<a>` (so the column reads: provenance · source link · checklist link):

```tsx
          <a
            href={`/checklist/${p.id}`}
            className="text-[12.5px] text-primary hover:underline"
          >
            Document checklist →
          </a>
```

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run tests/components/matches/program-card.test.tsx`
Expected: PASS (all, incl. the new one). Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add components/matches/program-card.tsx tests/components/matches/program-card.test.tsx
git commit -m "Link program cards to their document checklist

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification, merge, status log

**Files:**
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Full gate**

Run, all must be green / clean:
```bash
npm run typecheck
npm run lint
npx vitest run
```
Expected: typecheck clean; lint 0 problems; full suite green (≈ +30 new checklist tests).

- [ ] **Step 2: Goldens byte-identical**

Run:
```bash
git diff --stat tests/scoring/golden-assessments.json
```
Expected: **empty** (no scoring path touched). If non-empty, STOP — something wired into scoring by mistake; investigate before proceeding.

- [ ] **Step 3: Confirm the WIP trio is untouched**

Run: `git status -sb`
Expected: the only staged/committed files this slice are the checklist files + program-card + PROJECT_STATUS. `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/` remain modified/untracked and UNstaged.

- [ ] **Step 4: Update PROJECT_STATUS.md**

In the §"Phase 5 (documents)" block, move the per-program checklist from "Remaining" to shipped, and add a `/checklist` row to the "what works" table. Concretely: change the "Remaining (the documents/checklist slice)" bullet to note it shipped (date + the generator/landing/route), and update the `/guide` stub row's parenthetical (`/checklist` no longer just redirects — it's the landing + per-program view). Add the test count delta to the snapshot/Tests lines.

- [ ] **Step 5: Commit the status log**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "Log the per-program checklist slice (status)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge, push, delete branch**

```bash
git checkout master
git merge --ff-only per-program-checklist
git push origin master
git branch -d per-program-checklist
git status -sb
git log --oneline -8
```
Expected: fast-forward; `master...origin/master` in sync; WIP trio still unstaged.

---

## Self-Review (against the spec)

**Spec coverage:**
- §2 pure view / no migration → no migration task exists ✓; scholarship/AHPRA as `kind: null` info items ✓ (Task 2).
- §3 generator + rule set → Task 2 (all branches: identity, academic-by-level, english, financial-by-funding-source, employment, visa-after-offer) ✓.
- §3.2 nursing deltas → Task 2 nursing test + AHPRA item ✓.
- §3.3 sourcing honesty → DHA source on first required financial item; English source = program.source; AHPRA no fabricated source ✓.
- §4 stage-driven layout → Task 4 (ChecklistView splits now/after-offer; requirement is a quiet tag in Task 3) ✓.
- §5 route + nav → Task 5 ([programId] page), Task 6 (landing), Task 7 (ProgramCard link); dashboard stat already → /checklist (Task 8 verify) ✓.
- §6 upload affordance → deep-link default (Task 3); embedding deferred ✓ (honors the user's "clarity over upload UX" guard).
- §8 TDD → generator + component + view + landing tests ✓.
- §9 verification → Task 8 (typecheck/lint/suite/goldens/WIP-trio) ✓.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ChecklistItem`/`ChecklistSource`/`ChecklistInputs` defined in Task 1/2 and used identically in Tasks 3–6; `generateChecklist` signature stable; `ChecklistSource` = `{ url, lastVerified? }` matches `SourceLine` props; item `key`s referenced in tests (`fin-bank`, `ahpra`, `english`, …) match the generator.

**Known adaptation point:** Task 5's `params: Promise<…>` and `getProfile` return shape must match this Next/repo version — flagged inline; `npm run typecheck` is the gate.
