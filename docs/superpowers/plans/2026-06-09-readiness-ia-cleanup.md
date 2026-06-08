# Readiness IA cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three product-clarity fixes to the checklist + plan — (A) split the after-offer checklist into **Documents** + **Visa lodgement steps**, (B) replace the "Bring this" chip with **Step**/**Note** and drop the requirement pill on `kind:null` info items, (C) group the plan into **Your next steps** + **Visa preparation** (Genuine Student first).

**Architecture:** Pure product/IA. The checklist is request-time (generator + components, no storage), so A/B are generator/component/type edits. The plan is persisted but grouped at render time from `kind` via a new `VISA_PREP_KINDS` const — no DB/migration. No scoring, no sourced data, no findings, no ledger.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React, Tailwind, vitest + @testing-library/react. Git via the Bash tool. Branch `readiness-ia-cleanup` (created; spec committed `1d91dc4`).

**Spec:** `docs/superpowers/specs/2026-06-09-readiness-ia-cleanup-design.md` (approved 2026-06-09).

**Constraints (user, 2026-06-09):** no data/finding/ledger changes; no scoring; no DB/migration; no content rewrite (notes/bodies unchanged); no checklist↔plan de-dupe yet — IA + chip clarity only. AHPRA chip = **Note**.

---

## File Structure

**Create:**
- `lib/plan/phases.ts` — `VISA_PREP_KINDS` (ordered) + `isVisaPrep` / `visaPrepOrder`.
- `tests/checklist/checklist-item.test.tsx` — unit-tests the chip/pill logic.

**Modify:**
- `lib/checklist/types.ts` — add `ChecklistInfoKind` + `infoKind?` on `ChecklistItem`.
- `lib/checklist/generator.ts` — set `infoKind` on every `kind:null` item.
- `components/checklist/checklist-item.tsx` — Step/Note chip; suppress requirement pill for `kind:null`.
- `components/checklist/checklist-stage-section.tsx` — render from a `blocks` prop.
- `components/checklist/checklist-view.tsx` — compute blocks (topical for now; Documents/Steps for after-offer).
- `components/plan/plan-list.tsx` — two sections (Your next steps + Visa preparation).
- `tests/checklist/generator.test.ts` — `infoKind` assertions.
- `tests/checklist/checklist-view.test.tsx` — after-offer split labels.
- `tests/components/plan/plan-list.test.tsx` — visa-prep section + ordering.
- `docs/PROJECT_STATUS.md` — actual test count + cleanup bullet.

---

## Task 1: Part B — Step/Note chip + pill suppression

**Files:**
- Modify: `lib/checklist/types.ts`
- Modify: `lib/checklist/generator.ts`
- Modify: `components/checklist/checklist-item.tsx`
- Modify: `tests/checklist/generator.test.ts`
- Create: `tests/checklist/checklist-item.test.tsx`

- [ ] **Step 1: Add the `infoKind` type**

In `lib/checklist/types.ts`, add the type alias after `ChecklistStatus` (line 5) and the field on `ChecklistItem`:

```ts
export type ChecklistStatus = "have" | "missing" | "info";
export type ChecklistInfoKind = "step" | "note";
```

In the `ChecklistItem` interface, add after `source?` (last field):

```ts
  source?: ChecklistSource;
  infoKind?: ChecklistInfoKind; // set when kind === null; drives the Step/Note chip
```

- [ ] **Step 2: Write the failing generator test**

In `tests/checklist/generator.test.ts`, add two cases before the final `});`:

```ts
  it("tags kind:null info items with infoKind (step for after-offer process, note for now-stage reference)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "scholarship-dependent" } }, uploadedKinds: noKinds });
    const expectInfo = (key: string, infoKind: "step" | "note") =>
      expect(byKey(items, key)).toMatchObject({ kind: null, status: "info", infoKind });
    expectInfo("doc-preparation", "note");
    expectInfo("fin-nrb-remittance", "note");
    expectInfo("fin-scholarship", "note");
    expectInfo("noc-application", "step");
    expectInfo("biometrics", "step");
    expectInfo("police-certificate", "step");
    expect(byKey(items, "passport")?.infoKind).toBeUndefined(); // documents carry no infoKind
  });

  it("tags the AHPRA info item as note", () => {
    const items = generateChecklist({ program: { ...baseProgram, field: "nursing" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "ahpra")).toMatchObject({ kind: null, status: "info", infoKind: "note" });
  });
```

- [ ] **Step 3: Run the generator test to verify it fails**

Run: `npx vitest run tests/checklist/generator.test.ts -t "infoKind"`
Expected: FAIL — `infoKind` is `undefined` on every info item.

- [ ] **Step 4: Set `infoKind` in the generator**

In `lib/checklist/generator.ts`, add the `infoKind` field to each `kind:null` item (insert directly after each item's `requirement:` line, except for `addFinance` which is handled by a `kind === null` expression):

- **doc-preparation** block — after `requirement: "required",` add `infoKind: "note",`
- **ahpra** — rewrite the single-line `add({ ... })` to include `infoKind: "note",` (e.g. after `requirement: "required",`)
- **addFinance** helper — inside its `add({ ... })`, add `infoKind: kind === null ? "note" : undefined,` (so `fin-scholarship` gets "note"; document finance items get none)
- **fin-nrb-remittance** block — after `requirement: "required",` add `infoKind: "note",`
- **noc-application** block — after `requirement: "required",` add `infoKind: "step",`
- **biometrics** block — after `requirement: "required",` add `infoKind: "step",`
- **police-certificate** block — after `requirement: "recommended", // ...` add `infoKind: "step",`

For example, the `addFinance` `add()` becomes:

```ts
    add({
      key, kind, label, group: "financial", stage: "now", requirement,
      note: isFirstRequired ? financeNote : undefined,
      source: isFirstRequired ? DHA_SOURCE : undefined,
      infoKind: kind === null ? "note" : undefined,
    });
```

- [ ] **Step 5: Run the generator test to verify it passes**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: PASS (all checklist generator cases).

- [ ] **Step 6: Write the failing component test**

Create `tests/checklist/checklist-item.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistItem } from "@/components/checklist/checklist-item";
import type { ChecklistItem as Item } from "@/lib/checklist/types";

const base: Item = {
  key: "x", kind: null, label: "X", group: "visa", stage: "after-offer",
  requirement: "required", status: "info",
};
const renderItem = (item: Item) => render(<ul><ChecklistItem item={item} /></ul>);

describe("ChecklistItem chips", () => {
  it("renders a Step chip for a step info item and no requirement pill (police-certificate shape)", () => {
    renderItem({ ...base, infoKind: "step", requirement: "recommended" });
    expect(screen.getByText("Step")).toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("Bring this")).not.toBeInTheDocument();
  });

  it("renders a Note chip for a note info item", () => {
    renderItem({ ...base, infoKind: "note" });
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByText("Bring this")).not.toBeInTheDocument();
  });

  it("renders Needed + Recommended pill for a recommended document item", () => {
    renderItem({ ...base, kind: "birth-certificate", status: "missing", requirement: "recommended" });
    expect(screen.getByText("Needed")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("renders Have for an uploaded document item", () => {
    renderItem({ ...base, kind: "passport", status: "have", requirement: "required" });
    expect(screen.getByText("Have")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the component test to verify it fails**

Run: `npx vitest run tests/checklist/checklist-item.test.tsx`
Expected: FAIL — current component renders "Bring this" (not "Step"/"Note") and shows the "Recommended" pill on the info item.

- [ ] **Step 8: Update the component**

Replace the `STATUS_LABEL` const and the chip/pill markup in `components/checklist/checklist-item.tsx`:

```tsx
const DOC_STATUS_LABEL: Record<"have" | "missing", string> = { have: "Have", missing: "Needed" };
const INFO_CHIP: Record<NonNullable<Item["infoKind"]>, string> = { step: "Step", note: "Note" };

export function ChecklistItem({ item }: { item: Item }) {
  const isHave = item.status === "have";
  const chip = item.status === "info" ? INFO_CHIP[item.infoKind ?? "note"] : DOC_STATUS_LABEL[item.status];
  return (
    <li className={`flex flex-col gap-1 rounded-lg border p-3 ${isHave ? "border-primary bg-surface" : "border-line bg-bg-tint"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-ink">{isHave ? "✓ " : ""}{item.label}</span>
        <div className="flex items-center gap-2">
          {item.kind !== null && item.requirement === "recommended" && (
            <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
              Recommended
            </span>
          )}
          <span className={`font-mono text-[11px] uppercase tracking-wide ${isHave ? "text-strong" : "text-ink-faint"}`}>
            {chip}
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

(The `item.status === "info"` literal comparison narrows `item.status` to `"have" | "missing"` in the else branch, so `DOC_STATUS_LABEL[item.status]` typechecks.)

- [ ] **Step 9: Run the component test to verify it passes**

Run: `npx vitest run tests/checklist/checklist-item.test.tsx`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 11: Commit Part B**

```bash
git add lib/checklist/types.ts lib/checklist/generator.ts components/checklist/checklist-item.tsx tests/checklist/generator.test.ts tests/checklist/checklist-item.test.tsx
git commit -m "$(cat <<'EOF'
feat(checklist): Step/Note chips for info items; drop the requirement pill on kind:null

Adds infoKind ("step"|"note") to ChecklistItem and tags every kind:null item.
The chip renders Step (after-offer process) or Note (now-stage reference) instead
of "Bring this", and kind:null items no longer show a Recommended/required pill —
the chip + note text carry the meaning.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Never `git add -A`; never stage the WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`).

---

## Task 2: Part A — Split the after-offer checklist into Documents + Visa lodgement steps

**Files:**
- Modify: `components/checklist/checklist-stage-section.tsx`
- Modify: `components/checklist/checklist-view.tsx`
- Modify: `tests/checklist/checklist-view.test.tsx`

- [ ] **Step 1: Update the view test (RED)**

In `tests/checklist/checklist-view.test.tsx`, replace the single test body so it asserts the after-offer split (drop the `"Visa"` assertion):

```ts
  it("renders both stage headings, the program name, topical now-groups, and the after-offer document/step split", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    render(<ChecklistView program={program} university={null} items={items} />);
    expect(screen.getByRole("heading", { name: "Master of IT" })).toBeInTheDocument();
    expect(screen.getByText("What you need now")).toBeInTheDocument();
    expect(screen.getByText("After your offer")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Visa lodgement steps")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the view test to verify it fails**

Run: `npx vitest run tests/checklist/checklist-view.test.tsx`
Expected: FAIL — "Documents"/"Visa lodgement steps" not found (current renders "Visa").

- [ ] **Step 3: Convert the stage section to a blocks renderer**

Replace `components/checklist/checklist-stage-section.tsx` entirely:

```tsx
import type { ChecklistItem as Item } from "@/lib/checklist/types";
import { ChecklistItem } from "./checklist-item";

export interface ChecklistBlock {
  label: string;
  items: Item[];
}

export function ChecklistStageSection({ title, subtitle, blocks }: { title: string; subtitle: string; blocks: ChecklistBlock[] }) {
  const present = blocks.filter((b) => b.items.length > 0);
  if (present.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium text-ink">{title}</h2>
        <p className="text-[14px] text-ink-soft">{subtitle}</p>
      </div>
      {present.map((b) => (
        <div key={b.label} className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{b.label}</span>
          <ul className="flex flex-col gap-2">
            {b.items.map((i) => <ChecklistItem key={i.key} item={i} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Compute blocks in the view**

Replace `components/checklist/checklist-view.tsx` entirely:

```tsx
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program, University } from "@/lib/programs/types";
import { GROUP_LABELS, GROUPS } from "@/lib/documents/types";
import { ChecklistStageSection, type ChecklistBlock } from "./checklist-stage-section";

export function ChecklistView({ program, university, items }: { program: Program; university: University | null; items: ChecklistItem[] }) {
  const now = items.filter((i) => i.stage === "now");
  const later = items.filter((i) => i.stage === "after-offer");

  const nowBlocks: ChecklistBlock[] = GROUPS
    .filter((g) => now.some((i) => i.group === g))
    .map((g) => ({ label: GROUP_LABELS[g], items: now.filter((i) => i.group === g) }));

  const laterBlocks: ChecklistBlock[] = [
    { label: "Documents", items: later.filter((i) => i.kind !== null) },
    { label: "Visa lodgement steps", items: later.filter((i) => i.kind === null) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
          Document checklist{university ? ` · ${university.name}` : ""}
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{program.name}</h1>
      </header>
      <ChecklistStageSection title="What you need now" subtitle="Gather these to apply and to build your visa case." blocks={nowBlocks} />
      <ChecklistStageSection title="After your offer" subtitle="You'll add these once a university offers you a place." blocks={laterBlocks} />
    </div>
  );
}
```

- [ ] **Step 5: Run the view test to verify it passes**

Run: `npx vitest run tests/checklist/checklist-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit Part A**

```bash
git add components/checklist/checklist-view.tsx components/checklist/checklist-stage-section.tsx tests/checklist/checklist-view.test.tsx
git commit -m "$(cat <<'EOF'
feat(checklist): split the after-offer stage into Documents + Visa lodgement steps

ChecklistStageSection becomes a generic labeled-blocks renderer; ChecklistView
computes the blocks — topical groups for "now", and Documents (kind != null) +
Visa lodgement steps (kind == null) for "after your offer".

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Part C — Group the plan into Your next steps + Visa preparation

**Files:**
- Create: `lib/plan/phases.ts`
- Modify: `components/plan/plan-list.tsx`
- Modify: `tests/components/plan/plan-list.test.tsx`

- [ ] **Step 1: Create the phases module**

Create `lib/plan/phases.ts`:

```ts
/**
 * AU visa-preparation plan kinds, in the order to tackle them (Genuine Student leads).
 * Rendered as the "Visa preparation" section, separate from the impact-grouped
 * "Your next steps". A future slice that adds an AU visa-prep action MUST add its kind
 * here so it lands in this section. Render-time grouping — no DB column, no migration.
 */
export const VISA_PREP_KINDS = [
  "prepare-gs-answers",
  "apply-for-noc",
  "translate-certify-documents",
  "prepare-health-exam",
  "prepare-biometrics",
  "prepare-police-certificate",
] as const;

const ORDER = new Map<string, number>(VISA_PREP_KINDS.map((k, i) => [k, i]));
export const isVisaPrep = (kind: string): boolean => ORDER.has(kind);
export const visaPrepOrder = (kind: string): number => ORDER.get(kind) ?? Number.MAX_SAFE_INTEGER;
```

- [ ] **Step 2: Write the failing plan-list tests**

In `tests/components/plan/plan-list.test.tsx`, add a kind-aware factory and two cases. Add after the existing `mk` helper:

```ts
const mkKind = (id: number, kind: string, impact: PlanItemRow["impact"]): PlanItemRow => ({
  ...mk(id, impact, "todo"),
  kind,
});
```

Add these cases inside the `describe` block, before its closing `});`:

```ts
  it("puts visa-prep items under 'Visa preparation' (GS first), leaving non-visa items in 'Your next steps'", () => {
    render(
      <PlanList items={[
        mkKind(1, "prepare-police-certificate", "medium"),
        mkKind(2, "prepare-gs-answers", "high"),
        mkKind(3, "add-grade", "high"),
      ]} />,
    );
    expect(screen.getByText("Visa preparation")).toBeInTheDocument();
    expect(screen.getByText("Your next steps")).toBeInTheDocument();
    expect(screen.getByText(/High impact \(1\)/)).toBeInTheDocument(); // only add-grade; GS moved to visa prep
    const gsTitle = screen.getByText("T2");      // prepare-gs-answers
    const policeTitle = screen.getByText("T1");  // prepare-police-certificate
    expect(gsTitle.compareDocumentPosition(policeTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits 'Visa preparation' when there are no visa-prep items", () => {
    render(<PlanList items={[mkKind(1, "add-grade", "high")]} />);
    expect(screen.queryByText("Visa preparation")).not.toBeInTheDocument();
    expect(screen.getByText("Your next steps")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the plan-list tests to verify they fail**

Run: `npx vitest run tests/components/plan/plan-list.test.tsx -t "Visa preparation"`
Expected: FAIL — no "Visa preparation"/"Your next steps" sections exist yet.

- [ ] **Step 4: Rewrite PlanList with the two sections**

Replace `components/plan/plan-list.tsx` entirely:

```tsx
import type { PlanItemRow } from "@/lib/plan/types";
import { PlanItemCard } from "./plan-item-card";
import { isVisaPrep, visaPrepOrder } from "@/lib/plan/phases";

export function PlanList({ items }: { items: PlanItemRow[] }) {
  const open = items.filter((i) => i.status === "todo");
  const closed = items.filter((i) => i.status !== "todo");

  const visaPrep = open
    .filter((i) => isVisaPrep(i.kind))
    .sort((a, b) => visaPrepOrder(a.kind) - visaPrepOrder(b.kind));
  const rest = open.filter((i) => !isVisaPrep(i.kind));
  const high = rest.filter((i) => i.impact === "high");
  const medium = rest.filter((i) => i.impact === "medium");
  const low = rest.filter((i) => i.impact === "low");

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6 text-center">
        <h2 className="text-[20px]">All caught up</h2>
        <p className="text-[15px] text-ink-soft">
          When you change your profile or rerun your assessment, new actions land here.
        </p>
      </div>
    );
  }

  const renderImpact = (label: string, list: PlanItemRow[]) =>
    list.length === 0 ? null : (
      <section className="flex flex-col gap-3">
        <h3 className="font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
          {label} ({list.length})
        </h3>
        <div className="flex flex-col gap-3">
          {list.map((i) => (
            <PlanItemCard key={i.id} item={i} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="flex flex-col gap-8">
      {rest.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-medium text-ink">Your next steps</h2>
            <p className="text-[14px] text-ink-soft">Profile and case work, ranked by impact.</p>
          </div>
          <div className="flex flex-col gap-6">
            {renderImpact("High impact", high)}
            {renderImpact("Medium impact", medium)}
            {renderImpact("Low impact", low)}
          </div>
        </div>
      ) : null}

      {visaPrep.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-medium text-ink">Visa preparation</h2>
            <p className="text-[14px] text-ink-soft">Australia-specific visa steps, in the order to tackle them.</p>
          </div>
          <div className="flex flex-col gap-3">
            {visaPrep.map((i) => (
              <PlanItemCard key={i.id} item={i} />
            ))}
          </div>
        </div>
      ) : null}

      {closed.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="cursor-pointer font-mono text-[12.5px] uppercase tracking-wide text-ink-faint">
            Closed ({closed.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {closed.map((i) => (
              <PlanItemCard key={i.id} item={i} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the plan-list tests to verify they pass**

Run: `npx vitest run tests/components/plan/plan-list.test.tsx`
Expected: PASS (the two new cases + the two existing cases — the existing kinds `k1`–`k3` are non-visa-prep, so they land in "Your next steps" and the `High impact (1)` / `Medium impact (1)` / `Closed (1)` assertions still hold).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit Part C**

```bash
git add lib/plan/phases.ts components/plan/plan-list.tsx tests/components/plan/plan-list.test.tsx
git commit -m "$(cat <<'EOF'
feat(plan): group actions into Your next steps + Visa preparation (GS first)

AU visa-prep actions (declared in lib/plan/phases.ts) render as a dedicated,
ordered "Visa preparation" section with Genuine Student leading; everything else
stays impact-grouped under "Your next steps". Grouped at render time from kind —
no DB/migration. Impact pills kept per card.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Status

**Files:**
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Get the actual full-suite count**

Run: `npm test`
Expected: all green. Record the total (spec estimate ≈ +6 to +9 over 727).

- [ ] **Step 2: Update PROJECT_STATUS.md**

Bump the test-count line (`**Tests:** NNN passing across 161 test files`) to the actual figure from Step 1. Add a bullet immediately after the slice-H bullet, matching the existing style:

```markdown
- **Readiness IA cleanup — checklist + plan information architecture (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-readiness-ia-cleanup-design.md`, plan `docs/superpowers/plans/2026-06-09-readiness-ia-cleanup.md`. A pure product/IA slice (no data, no findings, no ledger movement, no scoring, no DB). (A) The after-offer checklist now splits into **Documents** + **Visa lodgement steps** (`ChecklistStageSection` became a generic labeled-blocks renderer; the "now" stage stays topical). (B) `kind:null` items gain an explicit `infoKind` and render a **Step** (after-offer process) or **Note** (now-stage reference) chip instead of "Bring this"; the required/recommended pill is suppressed on info items (so police-certificate shows just "Step", its "may ask" conditionality carried by the note). (C) The plan groups into **Your next steps** (impact-grouped) + **Visa preparation** (AU visa-prep actions, declared in `lib/plan/phases.ts`, Genuine Student first), grouped at render time from `kind`. Checklist↔plan de-dupe deferred. `golden-assessments.json` byte-identical; scorer + sourced data untouched.
```

- [ ] **Step 3: Commit status**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
docs: record the readiness IA cleanup in PROJECT_STATUS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Hard gate + ff-merge

**Files:** none modified (verification + git only).

- [ ] **Step 1: Typecheck clean**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full suite green**

Run: `npm test`
Expected: all green; total matches the figure committed in Task 4.

- [ ] **Step 3: No data / findings / ledger movement (the defining guarantee)**

Run: `git --no-pager diff master...HEAD -- "docs/research-briefs/**" "lib/data/source/**"`
Expected: empty (no output).

- [ ] **Step 4: Goldens byte-identical + scorer untouched**

Run: `git --no-pager diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json lib/scoring/financial.ts lib/data/policy/funding-reliability.ts`
Expected: empty.

- [ ] **Step 5: No new migration**

Run: `git --no-pager diff --stat master...HEAD -- supabase/migrations`
Expected: empty (no migration files added).

- [ ] **Step 6: ff-merge to master, push, delete branch**

```bash
git checkout master
git merge --ff-only readiness-ia-cleanup
git push origin master
git branch -d readiness-ia-cleanup
```

Note: PowerShell `git push` may spuriously report exit 255 — verify by the `X..Y master -> master` ref-update line and `## master...origin/master` in-sync, not the exit code.

- [ ] **Step 7: Report**

Report the merge: commit range, test-count delta, and gate results (no-data diff empty, goldens byte-identical, no migration). Then stop and await the user's steer. Natural follow-ups: revisit the deferred checklist↔plan de-dupe now that the IA is clean, or resume the deferred data slices (Nepal-side police A.094–A.103, passport A.043–A.046, apostille A.092/A.093, equivalence) into the cleaner structure.

---

## Self-Review

**Spec coverage:**
- §3 Part A (after-offer split) → Task 2. ✓
- §4 Part B (infoKind + chip + pill suppression) → Task 1. ✓
- §5 Part C (plan phase grouping) → Task 3. ✓
- §8 testing (RED→GREEN per part) → Tasks 1–3 each RED then GREEN. ✓
- §9 verification gate → Task 5 Steps 1–5. ✓
- §10 commit plan (B → A → C → status) → Tasks 1–4. ✓

**Placeholder scan:** none — every code/command step shows actual content. (The test-count figure is resolved at the gate from `npm test`, per the spec.)

**Type consistency:** `ChecklistInfoKind` / `infoKind` used identically in `types.ts`, the generator, the component (`INFO_CHIP: Record<NonNullable<Item["infoKind"]>, string>`), and tests. `VISA_PREP_KINDS` / `isVisaPrep` / `visaPrepOrder` defined in `lib/plan/phases.ts` and imported by `plan-list.tsx` + asserted via behavior in tests. The six `VISA_PREP_KINDS` exactly match the plan generator's AU-gated kinds (`prepare-gs-answers`, `apply-for-noc`, `translate-certify-documents`, `prepare-health-exam`, `prepare-biometrics`, `prepare-police-certificate`). Checklist block labels ("Documents", "Visa lodgement steps") and plan section titles ("Your next steps", "Visa preparation") are identical in components and tests.

**Constraint check:** no `lib/data/source/*`, no `findings/*.jsonl`, no `build-ledger`, no `lib/scoring/*`, no migration in any task — Task 5 Steps 3–5 assert this. Notes/bodies unchanged (only `infoKind` added; chip/section structure changed). De-dupe not attempted. ✓
