# Ledger slice C — Nepal source-of-funds / remittance readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire findings B.012–B.016 (the NRB remittance pathway + a one-line NOC definition) into the checklist + plan so the finance surfaces state *how a Nepali bank legally releases foreign currency for study* — every phrase finding-backed, no scorer touched.

**Architecture:** A new sourced data module (`lib/data/source/nepal-source-of-funds.ts`, 5 records, `kind`-discriminated) is registered in the data registry, its findings flipped to `used` via the slice-kit; two server-side generators (`checklist`, `plan`) compose copy from it. Mirrors slice B (`au-financial-evidence.ts`) exactly. No client component, no scoring change.

**Tech Stack:** TypeScript (strict), Zod, vitest 4.1.8, the slice-kit reconcile harness (`docs/research-briefs/_tools/`).

---

## Pre-flight (already done — do NOT redo)

- Branch `ledger-slice-c-source-of-funds` exists and is checked out.
- Spec committed: `a42989c` + label tweak `cbb0996`.
- This plan doc is committed on the branch ahead of the code commits.

## Standing rules (every task)

- **Run commands via the Bash tool** (bash) — `FLIP_STATUS=1 npx …` and `node << 'EOF'` heredocs assume bash.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Use explicit `git add <paths>`, **never** `git add -A`.
- **Every commit** ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never hand-edit `status`** in `B.jsonl` — `FLIP_STATUS` derives it.
- LF→CRLF git warnings on new files are benign (Windows normalization).

## File structure (what each touched file is responsible for)

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify (after :655) | Add `NepalSourceOfFunds` record interface |
| `lib/data/source/nepal-source-of-funds.ts` | Create | The 5 sourced records + provenance |
| `lib/data/schema/nepal-source-of-funds.schema.ts` | Create | Zod runtime guard for the module |
| `lib/data/schema/registry.ts` | Modify (imports + 1 entry) | Register the module so `tests/data/` covers it |
| `docs/research-briefs/findings/B.jsonl` | Modify (5 lines) | `value_status:"prose-only"` then `FLIP_STATUS`-derived `status:"used"` |
| `lib/checklist/generator.ts` | Modify | New `fin-nrb-remittance` info item |
| `tests/checklist/generator.test.ts` | Modify (+1 test) | Assert the new item |
| `lib/plan/generator.ts` | Modify | New `prepare-fund-remittance` action |
| `tests/plan/generator.test.ts` | Modify (+3 tests) | Assert present/absent gating |
| `docs/PROJECT_STATUS.md` | Modify | Test count + slice-C bullet |
| `docs/research-briefs/findings-ledger.md` | Regenerate | `build-ledger.js` snapshot |

---

## Task 1: Sourced data layer

**Files:**
- Modify: `lib/data/types.ts:655`
- Create: `lib/data/source/nepal-source-of-funds.ts`
- Create: `lib/data/schema/nepal-source-of-funds.schema.ts`
- Modify: `lib/data/schema/registry.ts:66,148`
- Modify: `docs/research-briefs/findings/B.jsonl` (B.012–B.016)

- [ ] **Step 1: Add the `NepalSourceOfFunds` interface to `lib/data/types.ts`**

Anchor on the end of the `AuFinancialEvidence` interface (its `// canonical DHA URL` comment is unique). Replace:

```ts
  source: string; // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

with:

```ts
  source: string; // canonical DHA URL
  lastVerified?: string; // ISO date
}

/**
 * The Nepal-side source-of-funds / remittance pathway (finance category B). How a
 * Nepali bank legally releases foreign currency for study: the NOC + institution
 * documents it requires, the NRB living-expense remittance, and the MoEST-portal
 * approval check — plus a one-line definition of what an NOC is. Distinguished by
 * `kind`. `summary` is the phrase the plan/checklist render; `label` is the short
 * checklist label. Fact-only — no scorer reads it; machine-checked against
 * findings B.012–B.016.
 */
export interface NepalSourceOfFunds extends Provenanced {
  id:
    | "noc-definition"
    | "noc-requirement"
    | "institution-documents"
    | "living-expense-remittance"
    | "forex-portal-confirmation";
  kind: "definition" | "bank-requirement" | "remittance-mechanism";
  label: string; // short, for the checklist item
  summary: string; // full phrase rendered by plan/checklist
  source: string; // canonical NRB / MoEST URL
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create `lib/data/source/nepal-source-of-funds.ts`**

```ts
import type { NepalSourceOfFunds } from "@/lib/data/types";

/**
 * Nepal source-of-funds / remittance readiness (finance category B). How a Nepali
 * bank legally releases foreign currency for study under Nepal Rastra Bank (NRB)
 * rules: the No Objection Certificate (NOC) + institution documents the bank
 * requires, the NRB-set living-expense amount banks may remit, and the MoEST-portal
 * approval check before forex release — plus a one-line definition of what an NOC
 * is. Prose rules consumed by the plan + checklist generators for sourced "how do I
 * move the money from Nepal?" guidance. Fact-only — no scorer reads it;
 * machine-checked against findings B.012–B.016 (see provenance.findingRefs).
 *
 * `bank-requirement` summaries are written article-first so they concatenate with
 * "and" into a natural sentence; `remittance-mechanism` summaries are standalone
 * sentences; the `definition` leads the checklist note.
 */
const NRB_STUDY =
  "https://www.nrb.org.np/2020/11/%E0%A4%89%E0%A4%9A%E0%A5%8D%E0%A4%9A-%E0%A4%B6%E0%A4%BF%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE-%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%AF%E0%A4%A8%E0%A4%95%E0%A4%BE-%E0%A4%B2%E0%A4%BE%E0%A4%97/";
const NRB_ANNUAL = "https://www.nrb.org.np/contents/uploads/2024/03/Annual-Report-2022-23-English.pdf";
const MOEST_NOC = "https://noc.moest.gov.np/";

export const NEPAL_SOURCE_OF_FUNDS: NepalSourceOfFunds[] = [
  {
    id: "noc-definition",
    kind: "definition",
    label: "What an NOC is",
    summary:
      "A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad.",
    source: MOEST_NOC,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.016"],
      source: MOEST_NOC,
      note: "The MoEST NOC portal defines an NOC as a No Objection Certificate granted by the Government of Nepal for Nepalese students to study abroad.",
    },
  },
  {
    id: "noc-requirement",
    kind: "bank-requirement",
    label: "No Objection Certificate",
    summary: "a No Objection Certificate from Nepal's education ministry",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.012"],
      source: NRB_STUDY,
      note: "NRB: sending money abroad for higher study requires a No Objection Certificate from the education ministry.",
    },
  },
  {
    id: "institution-documents",
    kind: "bank-requirement",
    label: "Institution documents",
    summary: "an institution letter, brochure, invoice, I-20, or equivalent document",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.013"],
      source: NRB_STUDY,
      note: "NRB: also requires an institution letter, brochure, invoice, I-20, or an equivalent institution-issued document.",
    },
  },
  {
    id: "living-expense-remittance",
    kind: "remittance-mechanism",
    label: "NRB living-expense remittance",
    summary:
      "Banks may remit the living-expense amount Nepal Rastra Bank sets when your institution's documents don't state living expenses.",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.014"],
      source: NRB_STUDY,
      note: "NRB: banks may send the NRB-determined living-expense amount when the institution documents do not state living expenses.",
    },
  },
  {
    id: "forex-portal-confirmation",
    kind: "remittance-mechanism",
    label: "MoEST portal confirmation",
    summary:
      "Banks release foreign-exchange facilities after confirming your foreign-study approval on the MoEST portal.",
    source: NRB_ANNUAL,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.015"],
      source: NRB_ANNUAL,
      note: "NRB's 2022/23 annual report: BFIs can provide foreign-exchange facilities after confirming foreign-study approval details on the MoEST portal.",
    },
  },
];
```

- [ ] **Step 3: Create `lib/data/schema/nepal-source-of-funds.schema.ts`**

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-source-of-funds.ts. Guards the id +
 * kind enums, non-empty label/summary, the http(s) source, ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const NepalSourceOfFundsRecordSchema = z.object({
  id: z.enum([
    "noc-definition",
    "noc-requirement",
    "institution-documents",
    "living-expense-remittance",
    "forex-portal-confirmation",
  ]),
  kind: z.enum(["definition", "bank-requirement", "remittance-mechanism"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalSourceOfFundsSchema = z
  .array(NepalSourceOfFundsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal source-of-funds ids must be unique",
  });
```

- [ ] **Step 4: Register the module in `lib/data/schema/registry.ts`**

(a) Add the import pair after the `AU_TUITION_PAYMENT_FACTS` imports (the last module import, :69-70). Replace:

```ts
import { AU_TUITION_PAYMENT_FACTS } from "@/lib/data/source/au-tuition-payment-facts";
import { AuTuitionPaymentFactsSchema } from "@/lib/data/schema/au-tuition-payment-facts.schema";
```

with:

```ts
import { AU_TUITION_PAYMENT_FACTS } from "@/lib/data/source/au-tuition-payment-facts";
import { AuTuitionPaymentFactsSchema } from "@/lib/data/schema/au-tuition-payment-facts.schema";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NepalSourceOfFundsSchema } from "@/lib/data/schema/nepal-source-of-funds.schema";
```

(b) Append the entry at the end of `DATA_MODULES` (the `AU_TUITION_PAYMENT_FACTS` entry is last). Replace:

```ts
    recordLabel: "au-tuition-payment-facts",
    subRecordKeys: [],
    recordInterface: "AuTuitionPaymentFact",
  },
];
```

with:

```ts
    recordLabel: "au-tuition-payment-facts",
    subRecordKeys: [],
    recordInterface: "AuTuitionPaymentFact",
  },
  {
    // Slice C — Nepal source-of-funds / remittance readiness (finance category B).
    // How a Nepali bank legally releases foreign currency for study: the NOC +
    // institution documents it requires, the NRB living-expense remittance, and the
    // MoEST-portal approval check — plus a one-line NOC definition. Prose rules
    // backing findings B.012–B.016, consumed by the plan + checklist generators.
    // Fact-only: no scorer reads it.
    category: "B",
    exportName: "NEPAL_SOURCE_OF_FUNDS",
    data: NEPAL_SOURCE_OF_FUNDS,
    schema: NepalSourceOfFundsSchema,
    recordLabel: "nepal-source-of-funds",
    subRecordKeys: [],
    recordInterface: "NepalSourceOfFunds",
  },
];
```

- [ ] **Step 5: Run reconcile to verify it fails for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: **FAIL** with `REF_NOT_USED nepal-source-of-funds[noc-definition] -> B.016 (status=pending)` (and the same for B.012–B.015). This proves the new module's findingRefs are detected but the findings are not yet `used`.

- [ ] **Step 6: Set `value_status:"prose-only"` on B.012–B.016 (EOL-safe, target lines only)**

Run:

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/B.jsonl';
let t = fs.readFileSync(p, 'utf8');
for (const id of ['B.012', 'B.013', 'B.014', 'B.015', 'B.016']) {
  const re = new RegExp('("id":"' + id.replace('.', '\\.') + '"[^\\n]*?"value_status":)"unset"');
  if (!re.test(t)) throw new Error('no unset match for ' + id);
  t = t.replace(re, '$1"prose-only"');
}
fs.writeFileSync(p, t);
console.log('set prose-only on B.012-B.016');
EOF
```

Expected: prints `set prose-only on B.012-B.016`. (The regex stays on each finding's single line, so all other lines and every EOL are untouched.)

- [ ] **Step 7: Derive `status:"used"` via flip-status (never hand-edited)**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
Expected: **PASS**; B.012–B.016 now carry `status:"used"` + `used_by` (`nepal-source-of-funds[<id>]`).

- [ ] **Step 8: Confirm the B.jsonl diff touched only the five findings**

Run: `git diff --stat docs/research-briefs/findings/B.jsonl` then `git diff docs/research-briefs/findings/B.jsonl`
Expected: `--stat` shows **5 insertions(+) / 5 deletions(-)**; each changed line is one of B.012–B.016 and now has `"status":"used"`, a `"used_by"`, and `"value_status":"prose-only"`. No other finding changed.

- [ ] **Step 9: Run the full data suite to verify GREEN**

Run: `npx vitest run tests/data/`
Expected: **PASS** — reconcile clean (`used` +5, 0 orphans, 0 drift, 0 open-conflict-uses), schema parses, flip-status normal-mode clean, findings-integrity + registry-integrity green.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/nepal-source-of-funds.ts lib/data/schema/nepal-source-of-funds.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/B.jsonl
git commit -F - << 'EOF'
feat(data): source the Nepal remittance pathway (B.012–B.016)

New NepalSourceOfFunds module + Zod schema + registry entry: the NRB rules for
releasing foreign currency for study (NOC + institution documents required, NRB
living-expense remittance, MoEST-portal confirmation) plus a one-line NOC
definition. value_status:"prose-only" + FLIP_STATUS derives status:"used".
No scorer reads it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Checklist consumption

**Files:**
- Modify: `lib/checklist/generator.ts:7,32,126`
- Test: `tests/checklist/generator.test.ts` (append one `it`)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("generateChecklist", …)` block (after the last `it`, before the closing `});`):

```ts
  it("adds the NRB remittance info item naming NOC + institution docs (B.012–B.016)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const remit = byKey(items, "fin-nrb-remittance");
    expect(remit).toMatchObject({
      kind: null, status: "info", group: "financial", stage: "now", label: "NOC + institution documents",
    });
    expect(remit?.note).toContain("No Objection Certificate");
    expect(remit?.note).toContain("institution letter");
    expect(remit?.note).toContain("Nepal Rastra Bank");
    expect(remit?.note).toContain("MoEST portal");
    expect(remit?.note).toContain("grants Nepalese students to study abroad");
    expect(remit?.source?.url).toContain("nrb.org.np");
  });
```

- [ ] **Step 2: Run it to verify it fails (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "NRB remittance"`
Expected: **FAIL** — `byKey(items, "fin-nrb-remittance")` is `undefined`, so `toMatchObject` throws.

- [ ] **Step 3: Add the import** to `lib/checklist/generator.ts` after the `AU_FINANCIAL_EVIDENCE` import (:7). Replace:

```ts
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
```

with:

```ts
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
```

- [ ] **Step 4: Add the module-derived consts** after the `LIVING_COST_INDICATIVE` const (:32). Replace:

```ts
const LIVING_COST_INDICATIVE = AU_FINANCIAL_EVIDENCE.find((e) => e.id === "living-cost-indicative")!;
```

with:

```ts
const LIVING_COST_INDICATIVE = AU_FINANCIAL_EVIDENCE.find((e) => e.id === "living-cost-indicative")!;
const SOF_DEF = NEPAL_SOURCE_OF_FUNDS.find((r) => r.kind === "definition")!;
const SOF_PRIMARY = NEPAL_SOURCE_OF_FUNDS.find((r) => r.id === "noc-requirement")!; // NRB study page → item source
const SOF_REMITTANCE_NOTE =
  `${SOF_DEF.summary} Before releasing foreign currency, your bank requires ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ")}. ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ")}`;
```

- [ ] **Step 5: Add the item** after the funding-source `switch` closes, before the `// EMPLOYMENT` comment (:126-128). Replace:

```ts
    default:
      addFinance("fin-bank", "bank-statement", "Proof of funds (bank statement, loan sanction, or sponsor income)", "required");
  }

  // EMPLOYMENT (now, conditional)
```

with:

```ts
    default:
      addFinance("fin-bank", "bank-statement", "Proof of funds (bank statement, loan sanction, or sponsor income)", "required");
  }

  // Nepal-side remittance readiness (NRB rules) — unconditional reference note.
  add({
    key: "fin-nrb-remittance",
    kind: null,
    label: "NOC + institution documents",
    group: "financial",
    stage: "now",
    requirement: "required",
    note: SOF_REMITTANCE_NOTE,
    source: { url: SOF_PRIMARY.source, lastVerified: SOF_PRIMARY.lastVerified },
  });

  // EMPLOYMENT (now, conditional)
```

(`add()` sets `status` via `statusFor(kind, …)`; `kind:null` → `"info"`. Using `add()` not `addFinance()` keeps the DHA-source-on-first-required-item logic untouched.)

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "NRB remittance"`
Expected: **PASS**.

- [ ] **Step 7: Run the full checklist suite (no regression)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: **PASS** (all cases — the existing "DHA source on first required financial item" case still passes because the new item uses `add()`).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -F - << 'EOF'
feat(checklist): add the Nepal remittance info item (B.012–B.016)

A new unconditional financial-group info item ("NOC + institution documents")
composing the NRB remittance pathway from NEPAL_SOURCE_OF_FUNDS, sourced to NRB.
Added via add() so it bypasses the DHA-source-on-first-required-item logic.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Plan consumption

**Files:**
- Modify: `lib/plan/generator.ts:6,23,83`
- Test: `tests/plan/generator.test.ts` (append three `it`s)

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("generatePlan", …)` block (before the closing `});`):

```ts
  it("adds the Nepal remittance prep item when a funding source is set (B.012–B.016)", () => {
    const items = generatePlan({ sections: { finance: { source: "self-funded" } }, primaryDestinationId: null, matches: [], policy });
    const remit = items.find((i) => i.kind === "prepare-fund-remittance");
    expect(remit).toBeTruthy();
    expect(remit?.body).toContain("No Objection Certificate");
    expect(remit?.body).toContain("institution letter");
    expect(remit?.body).toContain("Nepal Rastra Bank");
    expect(remit?.body).toContain("MoEST portal");
  });

  it("omits the remittance prep item when no funding source is set", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(items.some((i) => i.kind === "prepare-fund-remittance")).toBe(false);
  });

  it("omits the remittance prep item for scholarship-dependent funding", () => {
    const items = generatePlan({ sections: { finance: { source: "scholarship-dependent" } }, primaryDestinationId: null, matches: [], policy });
    expect(items.some((i) => i.kind === "prepare-fund-remittance")).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `npx vitest run tests/plan/generator.test.ts -t "remittance"`
Expected: the "adds…" case **FAILS** (`remit` is `undefined`); the two "omits…" cases pass vacuously (item never exists yet).

- [ ] **Step 3: Add the import** to `lib/plan/generator.ts` after the `AU_FINANCIAL_EVIDENCE` import (:6). Replace:

```ts
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
```

with:

```ts
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
```

- [ ] **Step 4: Add the module-derived consts** after the `oxfordOr` function closes (:23). Replace:

```ts
  return `${items.slice(0, -1).join(", ")}, or ${last}`;
}
```

with:

```ts
  return `${items.slice(0, -1).join(", ")}, or ${last}`;
}

const SOF_REQUIREMENTS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ");
const SOF_MECHANISMS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ");
```

- [ ] **Step 5: Add the gated plan item** after the `upload-proof-of-funds` block, before `// STUDY GAP` (:83-85). Replace:

```ts
      liftEstimate: "Single biggest lift for visa case strength",
      timeEstimate: "1-3 days",
    });
  }

  // STUDY GAP
```

with:

```ts
      liftEstimate: "Single biggest lift for visa case strength",
      timeEstimate: "1-3 days",
    });
  }

  // NEPAL SOURCE OF FUNDS / REMITTANCE (NRB rules) — once a remittable funding source is declared
  if (s.finance?.source && s.finance.source !== "scholarship-dependent") {
    out.push({
      kind: "prepare-fund-remittance",
      impact: "medium",
      title: "Prepare to release your funds from Nepal",
      body: `Moving money abroad for study runs through Nepal Rastra Bank. Your bank requires ${SOF_REQUIREMENTS}. ${SOF_MECHANISMS}`,
      timeEstimate: "1-2 weeks",
    });
  }

  // STUDY GAP
```

- [ ] **Step 6: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts -t "remittance"`
Expected: **PASS** (all three).

- [ ] **Step 7: Run the full plan suite (no regression)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: **PASS** — existing cases unaffected (they pass `sections` without `finance.source`, so the item is absent; the "stable order" case stays equal).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -F - << 'EOF'
feat(plan): add the Nepal remittance prep action (B.012–B.016)

New prepare-fund-remittance PlanItem composing the NRB remittance pathway from
NEPAL_SOURCE_OF_FUNDS, gated on a declared funding source that isn't pure
scholarship. Nepal-side complement to the DHA-side proof-of-funds action.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Status + ledger

**Files:**
- Modify: `docs/PROJECT_STATUS.md`
- Regenerate: `docs/research-briefs/findings-ledger.md`

- [ ] **Step 1: Run the full suite to get the authoritative test count**

Run: `npm test`
Expected: **all green**. Note the exact `Tests  N passed (N)` total — it should be the prior 702 plus the 4 new cases plus any registry-driven parametrized additions (≈706–708). Use the **actual** number in Step 3; do not guess.

- [ ] **Step 2: Regenerate the ledger**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Then: `git diff docs/research-briefs/findings-ledger.md`
Expected: overall `used` 368 → **373**, `pending` 746 → **741**; category **B** `used` 87 → **92**, `pending` 48 → **43**; clusters **41** (unchanged); the only finding-status moves are B.012–B.016 `pending → used`.

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`**

First Read the file (the header line with the test count near the top, and the data-integration section where the slice-A and slice-B bullets live). Then:

(a) Change the test-count figure (currently "702 passing across 161 test files") to the **actual** count from Step 1, keeping "161 test files" unless `npm test` reports a different file count.

(b) Add this bullet immediately after the existing slice-B bullet:

```markdown
- **Ledger slice C (source-of-funds / remittance):** new `lib/data/source/nepal-source-of-funds.ts` (5 records) wires findings B.012–B.016 — the NRB remittance pathway (NOC + institution documents required, NRB living-expense remittance, MoEST-portal confirmation) plus the NOC definition — into the checklist (new `fin-nrb-remittance` info item, "NOC + institution documents") and the plan (new `prepare-fund-remittance` action). Ledger: overall used 368→373 / pending 746→741; B 87→92. B.017–B.026 (the MoEST NOC document journey) remain use-later by slice boundary. No scorer touched.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATUS.md docs/research-briefs/findings-ledger.md
git commit -F - << 'EOF'
docs(slice-c): record source-of-funds slice in status + ledger

PROJECT_STATUS slice-C bullet + test count; regenerate findings-ledger.md
(used 368→373, pending 746→741; B 87→92; clusters 41).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Hard gate + adversarial + ff-merge + report

**Files:** none changed (verification + git ritual).

- [ ] **Step 1: Adversarial mutation — confirm the `USED_UNSET` guard bites**

Run:

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/B.jsonl';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/("id":"B\.014"[^\n]*?"value_status":)"prose-only"/, '$1"unset"');
fs.writeFileSync(p, t);
console.log('mutated B.014 value_status -> unset (status stays used)');
EOF
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **FAIL** with `USED_UNSET B.014`.

Then restore and re-verify:

```bash
git checkout -- docs/research-briefs/findings/B.jsonl
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **PASS** (restored to `prose-only`).

- [ ] **Step 2: Full hard gate**

Run each; all must pass:
- `npm run typecheck` → clean.
- `npx vitest run tests/data/` → green.
- `npm test` → full suite green.
- `git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` → **empty** (goldens byte-identical).
- `git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` → **empty** (scorer untouched).
- `node docs/research-briefs/_tools/build-ledger.js` then `git status --porcelain docs/research-briefs/findings-ledger.md` → **no output** (ledger already current; no drift).

- [ ] **Step 3: Confirm branch state**

Run: `git status -sb` then `git log --oneline master..HEAD`
Expected: only the WIP trio dirty (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); **7 commits** ahead of master — spec, label tweak, plan doc, sourced layer, checklist, plan, status+ledger.

- [ ] **Step 4: Fast-forward merge to master + push + delete branch**

```bash
git checkout master
git merge --ff-only ledger-slice-c-source-of-funds
git push
git branch -d ledger-slice-c-source-of-funds
git status -sb
```

Expected: `Fast-forward`; push shows the `X..Y master -> master` ref-update; branch deleted; `## master...origin/master` in sync (only the WIP trio dirty). **Verify the push by the ref-update line + in-sync status, not the exit code** (PowerShell push can spuriously report exit 255).

- [ ] **Step 5: Report at the merge**

Report: the 7 commits; four-state ledger (5 → `used`; 0 rejected / use-later / needs-human-call in scope; B.017–B.026 use-later); goldens byte-identical + scorer untouched; suite green (N); ledger B 87→92 (overall 368→373), clusters 41; adversarial `USED_UNSET` confirmed. Then **await the user's steer on the next slice** — do not start a new slice autonomously.

---

## Self-review (writing-plans)

**1. Spec coverage** — every spec section maps to a task: §4 module → Task 1 (steps 1–3); §8 schema+registry → Task 1 (steps 3–4); §7 finding edits → Task 1 (steps 6–7); §5 checklist → Task 2; §6 plan → Task 3; §2 ledger math → Task 4; §9 testing (incl. adversarial) → Tasks 2/3 + Task 5 step 1; §10 verification gate → Task 5 step 2; §11 commit plan → the four commits + merge. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has an expected result. The only deliberately non-hardcoded value is the PROJECT_STATUS test count (Task 4 step 3), which *must* be read from the actual `npm test` output — instruction is explicit, not a placeholder.

**3. Type consistency** — `NepalSourceOfFunds` (interface), `NEPAL_SOURCE_OF_FUNDS` (export), `NepalSourceOfFundsSchema` (schema), `recordLabel:"nepal-source-of-funds"`, `recordInterface:"NepalSourceOfFunds"` are identical across types/module/schema/registry. `kind` values (`definition`/`bank-requirement`/`remittance-mechanism`) match between the interface, the schema enum, the module records, and the generator filters. Item key `fin-nrb-remittance` and plan kind `prepare-fund-remittance` match between generators and tests. Consistent.
