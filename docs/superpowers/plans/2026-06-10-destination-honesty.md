# Destination Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the wizard implying unsupported destinations work, and stop results silently
substituting Australia when the profile says otherwise.

**Architecture:** One source of truth (`SUPPORTED_DESTINATIONS` in `lib/scoring/types.ts`)
consumed by three guards: wizard option rendering + step completeness, a 422 guard in
`/api/assess`, and a destination gate in the `Results` component (notice instead of
assessment for unsupported; framing notice for "not-sure"). No engine/goldens changes.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-10-destination-honesty-design.md`

**Branch:** `destination-honesty` → ff-merge to master. Never stage the WIP trio
(`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`).

---

### Task 1: Supported-destination source of truth

**Files:**
- Modify: `lib/scoring/types.ts` (after the `DESTINATIONS` block, ~line 42)
- Test: `tests/scoring/destination-support.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  DESTINATIONS,
  SUPPORTED_DESTINATIONS,
  isDestinationSupported,
} from "@/lib/scoring/types";

describe("destination support", () => {
  it("supports exactly australia today", () => {
    expect(SUPPORTED_DESTINATIONS).toEqual(["australia"]);
  });

  it("isDestinationSupported is true only for supported destinations", () => {
    expect(isDestinationSupported("australia")).toBe(true);
    for (const d of DESTINATIONS.filter((d) => d !== "australia")) {
      expect(isDestinationSupported(d)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scoring/destination-support.test.ts`
Expected: FAIL — `SUPPORTED_DESTINATIONS` has no export.

- [ ] **Step 3: Write minimal implementation** (in `lib/scoring/types.ts`, directly under the `Destination` type)

```ts
/**
 * Corridors the product actually covers end-to-end (data + results + checklist).
 * The wizard, /api/assess, and the Results gate all read this — "not-sure" is
 * allowed as delegation but is not a supported corridor.
 */
export const SUPPORTED_DESTINATIONS = ["australia"] as const;
export type SupportedDestination = (typeof SUPPORTED_DESTINATIONS)[number];

export function isDestinationSupported(d: Destination): d is SupportedDestination {
  return (SUPPORTED_DESTINATIONS as readonly Destination[]).includes(d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scoring/destination-support.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/types.ts tests/scoring/destination-support.test.ts
git commit -m "feat(scoring-types): SUPPORTED_DESTINATIONS source of truth (australia only)"
```

---

### Task 2: Wizard destination step — disabled "Coming soon" options + completeness guard

**Files:**
- Modify: `components/ui/option-card.tsx` (add `disabled` prop)
- Modify: `components/wizard/steps/destination-step.tsx`
- Modify: `components/wizard/step-meta.ts` (destination case)
- Test: `tests/components/wizard/destination-step.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DestinationStep } from "@/components/wizard/steps/destination-step";
import { isStepComplete } from "@/components/wizard/step-meta";

function renderStep(setField = vi.fn()) {
  render(<DestinationStep profile={{}} setField={setField} callouts={null} />);
  return setField;
}

describe("destination step honesty", () => {
  it("renders unsupported destinations disabled with a coming-soon note", () => {
    renderStep();
    for (const label of ["Canada", "UK", "Germany", "USA", "Ireland"]) {
      const option = screen.getByRole("radio", { name: new RegExp(label) });
      expect(option).toBeDisabled();
    }
    expect(screen.getAllByText("Coming soon")).toHaveLength(5);
  });

  it("keeps Australia and not-sure selectable", () => {
    const setField = renderStep();
    fireEvent.click(screen.getByRole("radio", { name: /Australia/ }));
    expect(setField).toHaveBeenCalledWith({ destination: "australia" });
    fireEvent.click(screen.getByRole("radio", { name: /Not sure yet/ }));
    expect(setField).toHaveBeenCalledWith({ destination: "not-sure" });
  });

  it("does not select an unsupported destination on click", () => {
    const setField = renderStep();
    fireEvent.click(screen.getByRole("radio", { name: /Canada/ }));
    expect(setField).not.toHaveBeenCalled();
  });

  it("step completeness rejects unsupported destinations (stale drafts)", () => {
    expect(isStepComplete("destination", { destination: "canada" })).toBe(false);
    expect(isStepComplete("destination", { destination: "australia" })).toBe(true);
    expect(isStepComplete("destination", { destination: "not-sure" })).toBe(true);
    expect(isStepComplete("destination", {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/wizard/destination-step.test.tsx`
Expected: FAIL — options not disabled, no "Coming soon" text, completeness returns true for canada.

- [ ] **Step 3: Implement**

`components/ui/option-card.tsx` — add `disabled` (full updated component):

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OptionCardProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  description?: string;
  icon?: ReactNode;
  multi?: boolean;
  disabled?: boolean;
}

export function OptionCard({ label, selected, onSelect, description, icon, multi = false, disabled = false }: OptionCardProps) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150 ease-calm",
        selected ? "border-primary bg-primary-tint" : "border-line-2 bg-surface hover:bg-surface-2",
        disabled && "cursor-not-allowed border-line-2 bg-surface-2 opacity-60 hover:bg-surface-2",
      )}
    >
      {icon ? <span className="shrink-0 text-ink-soft">{icon}</span> : null}
      <span className="flex-1">
        <span className={cn("block", disabled ? "text-ink-soft" : "text-ink")}>{label}</span>
        {description ? <span className="block text-[15px] text-ink-soft">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center border text-[11px] text-on-primary transition-colors",
          multi ? "rounded-[6px]" : "rounded-pill",
          selected ? "border-primary bg-primary" : "border-line-2",
        )}
      >
        {selected ? (multi ? "✓" : <span className="size-2 rounded-pill bg-on-primary" />) : null}
      </span>
    </button>
  );
}
```

`components/wizard/steps/destination-step.tsx` (full updated file):

```tsx
"use client";

import type { Destination } from "@/lib/scoring/types";
import { isDestinationSupported } from "@/lib/scoring/types";
import { OptionCard } from "@/components/ui/option-card";
import { StepShell } from "@/components/wizard/step-shell";
import type { StepProps } from "./types";

const DESTINATIONS: Array<{ value: Destination; label: string }> = [
  { value: "australia", label: "Australia" },
  { value: "canada", label: "Canada" },
  { value: "uk", label: "UK" },
  { value: "germany", label: "Germany" },
  { value: "usa", label: "USA" },
  { value: "ireland", label: "Ireland" },
  { value: "not-sure", label: "Not sure yet — help me decide" },
];

function isSelectable(value: Destination): boolean {
  return isDestinationSupported(value) || value === "not-sure";
}

export function DestinationStep({ profile, setField, callouts }: StepProps) {
  return (
    <StepShell
      eyebrow="Step 7"
      title="Where do you want to go?"
      subtext="We fully cover Nepal → Australia today — more destinations are on the way. Pick Australia, or let us show you where you fit best."
      callouts={callouts}
    >
      <div role="radiogroup" aria-label="Destination" className="flex flex-col gap-3">
        {DESTINATIONS.map((d) => {
          const selectable = isSelectable(d.value);
          return (
            <OptionCard
              key={d.value}
              label={d.label}
              selected={profile.destination === d.value}
              onSelect={() => setField({ destination: d.value })}
              disabled={!selectable}
              description={selectable ? undefined : "Coming soon"}
            />
          );
        })}
      </div>
    </StepShell>
  );
}
```

`components/wizard/step-meta.ts` — replace the destination case:

```ts
    case "destination":
      return (
        Boolean(p.destination) &&
        (isDestinationSupported(p.destination!) || p.destination === "not-sure")
      );
```

and add to the imports at the top:

```ts
import { isDestinationSupported } from "@/lib/scoring/types";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/wizard/destination-step.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/option-card.tsx components/wizard/steps/destination-step.tsx components/wizard/step-meta.ts tests/components/wizard/destination-step.test.tsx
git commit -m "feat(wizard): disable unsupported destinations with coming-soon note"
```

---

### Task 3: /api/assess rejects unsupported destinations (defense in depth)

**Files:**
- Modify: `app/api/assess/route.ts` (after `ProfileSchema.safeParse`, ~line 36)
- Test: `tests/api/assess.test.ts` (extend — this file is NOT the WIP-trio integration file)

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```ts
  it("returns 422 for an unsupported destination (no silent Australia fallback)", async () => {
    const res = await POST(req({ ...validProfile, destination: "canada" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/destination/i);
  });

  it("accepts not-sure as explicit delegation", async () => {
    const res = await POST(req({ ...validProfile, destination: "not-sure" }));
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/assess.test.ts`
Expected: the new canada case FAILS (route returns 200 today); not-sure case passes.

- [ ] **Step 3: Implement** — in `app/api/assess/route.ts`, import the helper and add the guard directly after the 422 schema branch:

```ts
import { isDestinationSupported } from "@/lib/scoring/types";
```

```ts
  const dest = parsed.data.destination;
  if (!isDestinationSupported(dest) && dest !== "not-sure") {
    return NextResponse.json(
      { error: `Destination not supported yet: ${dest}` },
      { status: 422 },
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/assess.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/assess/route.ts tests/api/assess.test.ts
git commit -m "feat(api): 422 for unsupported destinations on /api/assess"
```

---

### Task 4: Results gate — honest notice instead of silent Australia

**Files:**
- Create: `components/results/destination-notice.tsx`
- Modify: `components/results/results.tsx`
- Modify: `components/assess/assess-flow.tsx` (pass `destination`)
- Modify: `app/(focused)/assessment/[id]/page.tsx` (pass `destination`)
- Test: `tests/components/results/results-destination.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Results } from "@/components/results/results";
import { assembleAssessment } from "@/lib/results/assemble";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 6.5,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "parents-family",
  goal: "permanent-residency",
};

const payload = assembleAssessment(baseProfile, new Date("2026-06-10"));

describe("Results destination gate", () => {
  it("unsupported destination: shows the honest notice, no Australia assessment", () => {
    render(<Results payload={payload} destination="canada" />);
    expect(screen.getByText("We don't cover Nepal → Canada yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See where you stand for Australia/ })).toHaveAttribute("href", "/assess?new=1");
    // No silent fallback: none of the Australia readout renders.
    expect(screen.queryByText(/CURRENT POLICY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/University matches/i)).not.toBeInTheDocument();
  });

  it("not-sure: renders the assessment plus an explicit Australia framing notice", () => {
    render(<Results payload={payload} destination="not-sure" />);
    expect(screen.getByText(/Australia is the only corridor we fully cover today/)).toBeInTheDocument();
    expect(screen.getByText(/CURRENT POLICY/i)).toBeInTheDocument();
  });

  it("australia: renders the assessment with no destination notice", () => {
    render(<Results payload={payload} destination="australia" />);
    expect(screen.queryByText(/We don't cover/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Australia is the only corridor/)).not.toBeInTheDocument();
    expect(screen.getByText(/CURRENT POLICY/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/results/results-destination.test.tsx`
Expected: FAIL — `Results` has no `destination` prop; typecheck/render errors.

- [ ] **Step 3: Implement**

`components/results/destination-notice.tsx` (new):

```tsx
import Link from "next/link";
import type { Destination } from "@/lib/scoring/types";
import { DESTINATION_LABELS } from "@/lib/labels";

/** Full-page honest stop: we don't cover this corridor — no Australia fallback. */
export function UnsupportedDestinationNotice({ destination }: { destination: Destination }) {
  const country = DESTINATION_LABELS[destination];
  return (
    <section className="rounded-lg border border-line-2 bg-surface p-6">
      <p className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Destination coverage</p>
      <h1 className="mt-2 text-[26px] leading-snug text-ink">
        We don&apos;t cover Nepal → {country} yet.
      </h1>
      <p className="mt-3 text-ink-soft">
        We only publish guidance we can verify against official sources, and {country} isn&apos;t
        there yet. Australia is the corridor we fully cover today.
      </p>
      <Link
        href="/assess?new=1"
        className="mt-5 inline-flex items-center rounded-pill bg-primary px-5 py-2.5 text-on-primary"
      >
        See where you stand for Australia →
      </Link>
    </section>
  );
}

/** Framing line for "not sure yet" — we resolved the delegation to Australia, say so. */
export function NotSureFramingNotice() {
  return (
    <section className="rounded-lg border border-line-2 bg-surface px-5 py-4">
      <p className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Destination</p>
      <p className="mt-1 text-ink-soft">
        You asked us to suggest a destination. Australia is the only corridor we fully cover
        today, so this readout shows where you stand for Nepal → Australia.
      </p>
    </section>
  );
}
```

`components/results/results.tsx` — add the prop and gate (signature + top of JSX):

```tsx
import type { Destination } from "@/lib/scoring/types";
import { isDestinationSupported } from "@/lib/scoring/types";
import { UnsupportedDestinationNotice, NotSureFramingNotice } from "./destination-notice";
```

```tsx
export function Results({
  payload,
  destination,
  mode = "anonymous",
  assessmentId = null,
}: {
  payload: AssessmentPayload;
  destination: Destination;
  mode?: "anonymous" | "owned";
  assessmentId?: string | null;
}) {
  const conversionRef = useRef<HTMLDivElement>(null);
  const scrollToConversion = () =>
    conversionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const owned = mode === "owned";

  if (!isDestinationSupported(destination) && destination !== "not-sure") {
    return (
      <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
        <UnsupportedDestinationNotice destination={destination} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
      {destination === "not-sure" ? <NotSureFramingNotice /> : null}
      <VerdictCard verdict={payload.result.verdict} />
      {/* …rest unchanged… */}
```

`components/assess/assess-flow.tsx` — results phase passes the destination:

```tsx
  if (phase === "results" && payload && profile) {
    return (
      <Results
        payload={payload}
        destination={profile.destination}
        mode={signedIn ? "owned" : "anonymous"}
        assessmentId={assessmentId}
      />
    );
  }
```

`app/(focused)/assessment/[id]/page.tsx` — pass the stored corridor:

```tsx
import type { Destination } from "@/lib/scoring/types";
```

```tsx
  const payload = row.result as unknown as AssessmentPayload;
  return <Results payload={payload} destination={row.destination_id as Destination} mode="owned" />;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/results/results-destination.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/results/destination-notice.tsx components/results/results.tsx components/assess/assess-flow.tsx "app/(focused)/assessment/[id]/page.tsx" tests/components/results/results-destination.test.tsx
git commit -m "feat(results): honest unsupported-destination notice — no silent Australia fallback"
```

---

### Task 5: Gate + docs + merge

- [ ] **Step 1: Full verification**

Run: `npm run typecheck` → expected: clean.
Run: `npm run lint` → expected: clean.
Run: `npx vitest run` → expected: full suite green (the perpetually-dirty WIP integration
test runs in whatever state the working tree has it — do not modify it).
Run: `git diff master --stat -- docs/research-briefs lib/data/source tests/scoring/__fixtures__/golden-assessments.json lib/scoring/financial.ts lib/data/policy/funding-reliability.ts`
→ expected: empty (product-slice gate).

- [ ] **Step 2: Visual smoke via preview** — wizard step 7 shows disabled "Coming soon"
options; full run with not-sure shows framing notice; direct render of a canada assessment
(if any) shows the notice.

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`** — add the slice to the log (what shipped,
gate result), and note the audit doc + agreed fix order landing.

- [ ] **Step 4: Commit docs, ff-merge, push**

```bash
git add docs/PROJECT_STATUS.md docs/audits docs/superpowers/specs/2026-06-10-destination-honesty-design.md docs/superpowers/plans/2026-06-10-destination-honesty.md
git commit -m "docs(destination-honesty): spec + plan + visual audit report"
git checkout master && git merge --ff-only destination-honesty && git push
```

(PowerShell `git push` may spuriously exit 255 — verify by the `master -> master` ref line.)
