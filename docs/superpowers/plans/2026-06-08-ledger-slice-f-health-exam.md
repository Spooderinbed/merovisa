# Ledger slice F — DHA health-exam readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire findings A.033/A.035/A.036/A.038 (DHA health-exam readiness) into the checklist + plan — enriching the existing `medical` item and adding an AU-gated plan action — reusing the structured C.092 for the 12-month validity. Every phrase finding-backed, no scorer touched, **no C-category churn**.

**Architecture:** A new sourced module (`lib/data/source/au-health-exam.ts`, 4 records, `kind`-discriminated) is registered and its findings flipped to `used`; two server-side generators compose copy from it, and both **read-only reuse** the already-`used` C.092 record from `au-health-biometric-facts.ts` for the 12-month figure. Mirrors slice E. No client component, no scoring change.

**Tech Stack:** TypeScript (strict), Zod, vitest 4.1.8, the slice-kit reconcile harness.

---

## Pre-flight (already done — do NOT redo)

- Branch `ledger-slice-f-health-exam` exists and is checked out.
- Spec committed: `246f76c`.
- This plan doc is committed on the branch ahead of the code commits.

## Standing rules (every task)

- **Run commands via the Bash tool** (bash) — `FLIP_STATUS=1 npx …` and `node << 'EOF'` heredocs assume bash.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Explicit `git add <paths>`, **never** `git add -A`.
- **Every commit** ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never hand-edit `status`** in `A.jsonl` — `FLIP_STATUS` derives it. **A.034 + A.037 stay `pending`** (use-later) — do not touch them.
- **C is read-only:** do NOT edit `docs/research-briefs/findings/C.jsonl` or `lib/data/source/au-health-biometric-facts.ts`. C.092 is reused by import only; the diff review must show **zero C churn**.
- Both generators **already define** `oxfordAnd` and already import `AU_DOCUMENT_PREPARATION` — this slice adds `AU_HEALTH_EXAM` + `AU_HEALTH_BIOMETRIC_FACTS` imports; do not duplicate existing ones.
- LF→CRLF git warnings on new files are benign (Windows normalization).

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify (after :729) | Add `AuHealthExam` record interface |
| `lib/data/source/au-health-exam.ts` | Create | The 4 sourced records + provenance |
| `lib/data/schema/au-health-exam.schema.ts` | Create | Zod runtime guard |
| `lib/data/schema/registry.ts` | Modify (imports :76 + 1 entry :608) | Register the module |
| `docs/research-briefs/findings/A.jsonl` | Modify (4 lines) | `value_status:"prose-only"` → `FLIP_STATUS` `status:"used"` |
| `lib/checklist/generator.ts` | Modify (:10, :65, :210) | Enrich the existing `medical` note (reuse C.092) |
| `tests/checklist/generator.test.ts` | Modify (+1 test) | Assert the enriched note |
| `lib/plan/generator.ts` | Modify (:9, :40, :185) | New `prepare-health-exam` action (reuse C.092) |
| `tests/plan/generator.test.ts` | Modify (+2 tests) | Assert present/absent gating |
| `docs/PROJECT_STATUS.md` | Modify | Test count + slice-F bullet |
| `docs/research-briefs/findings-ledger.md` | Regenerate | `build-ledger.js` snapshot |

---

## Task 1: Sourced data layer

**Files:** `lib/data/types.ts:729`, create `au-health-exam.ts` + `.schema.ts`, `registry.ts:76,608`, `A.jsonl` (A.033/A.035/A.036/A.038).

- [ ] **Step 1: Add the `AuHealthExam` interface to `lib/data/types.ts`**

Anchor on the end of the `AuDocumentPreparation` interface (its `// canonical DHA URL` comment is unique). Replace:

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
 * DHA health-examination readiness for Nepal→Australia applicants (logistics category
 * A). What the visa health examination involves: where it must be done (a DHA-approved
 * panel physician or clinic, outside Australia), who pays (the applicant, directly),
 * the My Health Declarations option to complete it before lodging, and the
 * health-undertaking validity exception. Distinguished by `kind`; `summary` is the
 * phrase the plan/checklist render. The 12-month base validity is NOT here — it is
 * reused from the structured C.092 (au-health-biometric-facts). Fact-only — no scorer
 * reads it; machine-checked against A.033, A.035, A.036, A.038.
 */
export interface AuHealthExam extends Provenanced {
  id:
    | "panel-physician-overseas"
    | "cost-paid-to-clinic"
    | "mhd-before-lodging"
    | "undertaking-validity";
  kind: "process" | "validity";
  label: string;     // short, inline
  summary: string;   // process = full sentence; validity = the 6-month nuance fragment
  source: string;    // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create `lib/data/source/au-health-exam.ts`**

```ts
import type { AuHealthExam } from "@/lib/data/types";

/**
 * DHA health-examination readiness facts (logistics category A) for an Australian
 * student-visa applicant. Three process rules (A.036 panel physician/clinic overseas,
 * A.038 cost paid directly, A.033 My Health Declarations before lodging) and the
 * 6-month health-undertaking validity (A.035), consumed by the checklist + plan
 * generators. The 12-month base validity is reused from C.092 (au-health-biometric-
 * facts), not duplicated here. Fact-only — no scorer reads it; machine-checked against
 * findings A.033, A.035, A.036, A.038 (see provenance.findingRefs).
 *
 * `process` summaries are standalone sentences (joined by a space); the `validity`
 * summary is a fragment designed to append after the 12-month base.
 */
const DHA_HEALTH_ARRANGE =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/arrange-your-health-examinations";
const DHA_FORM_26 = "https://immi.homeaffairs.gov.au/form-listing/forms/26.pdf";
const DHA_HEALTH_WHEN =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/when-to-have-health-examinations";
const DHA_HEALTH_AFTER =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/after-your-health-examinations";

export const AU_HEALTH_EXAM: AuHealthExam[] = [
  {
    id: "panel-physician-overseas",
    kind: "process",
    label: "Panel physician (overseas)",
    summary: "Outside Australia, the examination must be done by a DHA-approved panel physician or clinic.",
    source: DHA_HEALTH_ARRANGE,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.036"],
      source: DHA_HEALTH_ARRANGE,
      note: "DHA: outside Australia, health examinations must be done by an approved panel physician or clinic.",
    },
  },
  {
    id: "cost-paid-to-clinic",
    kind: "process",
    label: "Cost paid to clinic",
    summary: "You pay the panel physician or clinic directly.",
    source: DHA_FORM_26,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.038"],
      source: DHA_FORM_26,
      note: "Form 26: the costs of health examinations are paid directly to the panel physician or clinic by the applicant.",
    },
  },
  {
    id: "mhd-before-lodging",
    kind: "process",
    label: "My Health Declarations",
    summary: "If your visa is eligible, the My Health Declarations service lets you complete it before you lodge.",
    source: DHA_HEALTH_WHEN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.033"],
      source: DHA_HEALTH_WHEN,
      note: "DHA: My Health Declarations lets eligible applicants complete health examinations before submitting the visa application.",
    },
  },
  {
    id: "undertaking-validity",
    kind: "validity",
    label: "Health-undertaking validity",
    summary: "6 months if DHA asks you to sign a health undertaking.",
    source: DHA_HEALTH_AFTER,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.035"],
      source: DHA_HEALTH_AFTER,
      note: "DHA: if a health undertaking is signed, the health-assessment validity is 6 months.",
    },
  },
];
```

- [ ] **Step 3: Create `lib/data/schema/au-health-exam.schema.ts`**

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-health-exam.ts. Guards the id + kind enums,
 * non-empty label/summary, the http(s) source, ISO lastVerified, unique ids, and
 * provenance (>=1 findingRef).
 */
const AuHealthExamRecordSchema = z.object({
  id: z.enum([
    "panel-physician-overseas",
    "cost-paid-to-clinic",
    "mhd-before-lodging",
    "undertaking-validity",
  ]),
  kind: z.enum(["process", "validity"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuHealthExamSchema = z
  .array(AuHealthExamRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU health-exam ids must be unique",
  });
```

- [ ] **Step 4: Register the module in `lib/data/schema/registry.ts`**

(a) Add the import pair after the `AU_DOCUMENT_PREPARATION` imports (:75-76). Replace:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AuDocumentPreparationSchema } from "@/lib/data/schema/au-document-preparation.schema";
```

with:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AuDocumentPreparationSchema } from "@/lib/data/schema/au-document-preparation.schema";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AuHealthExamSchema } from "@/lib/data/schema/au-health-exam.schema";
```

(b) Append the entry after the `AU_DOCUMENT_PREPARATION` entry (ending :607 before `];` at :609). Replace:

```ts
    recordLabel: "au-document-preparation",
    subRecordKeys: [],
    recordInterface: "AuDocumentPreparation",
  },
];
```

with:

```ts
    recordLabel: "au-document-preparation",
    subRecordKeys: [],
    recordInterface: "AuDocumentPreparation",
  },
  {
    // Slice F — DHA health-examination readiness (logistics category A): where the
    // exam is done (panel physician/clinic overseas), who pays, My Health Declarations
    // before lodging, and the 6-month health-undertaking validity. Backs A.033/A.035/
    // A.036/A.038, consumed by the plan + checklist generators (12-month base validity
    // reused from C.092). Fact-only: no scorer reads it.
    category: "A",
    exportName: "AU_HEALTH_EXAM",
    data: AU_HEALTH_EXAM,
    schema: AuHealthExamSchema,
    recordLabel: "au-health-exam",
    subRecordKeys: [],
    recordInterface: "AuHealthExam",
  },
];
```

- [ ] **Step 5: Run reconcile to verify it fails for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: **FAIL** with `REF_NOT_USED au-health-exam[panel-physician-overseas] -> A.036 (status=pending)` (and the same for A.038, A.033, A.035).

- [ ] **Step 6: Set `value_status:"prose-only"` on the four findings (EOL-safe, target lines only)**

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/A.jsonl';
let t = fs.readFileSync(p, 'utf8');
for (const id of ['A.033','A.035','A.036','A.038']) {
  const re = new RegExp('("id":"' + id.replace('.', '\\.') + '"[^\\n]*?"value_status":)"unset"');
  if (!re.test(t)) throw new Error('no unset match for ' + id);
  t = t.replace(re, '$1"prose-only"');
}
fs.writeFileSync(p, t);
console.log('set prose-only on A.033,A.035,A.036,A.038');
EOF
```

Expected: prints the confirmation. The literal `"value_status":` token will not match the earlier `"status":` field. **A.034 + A.037 are not in the list and stay `unset`/`pending`.**

- [ ] **Step 7: Derive `status:"used"` via flip-status**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
Expected: **PASS**; A.033/A.035/A.036/A.038 now carry `status:"used"` + `used_by` (`au-health-exam[<id>]`).

- [ ] **Step 8: Confirm the diffs — only 4 A-lines moved, A.034/A.037 untouched, ZERO C churn**

```bash
git diff --stat docs/research-briefs/findings/A.jsonl
echo "--- C must be empty (no churn) ---"
git diff --stat docs/research-briefs/findings/C.jsonl lib/data/source/au-health-biometric-facts.ts
```

Expected: `A.jsonl` shows **4 insertions(+) / 4 deletions(-)** (A.033/A.035/A.036/A.038 now `status:"used"` + `used_by` + `value_status:"prose-only"`); **A.034 + A.037 unchanged (`status:"pending"`)**. The C line prints **nothing** (no C.jsonl change, no au-health-biometric-facts.ts change).

- [ ] **Step 9: Full data suite GREEN**

Run: `npx vitest run tests/data/`
Expected: **PASS** — reconcile clean (`used` +4, 0 orphans, 0 drift, 0 open-conflict-uses), schema parses, flip-status normal-mode clean, findings/registry integrity green.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/au-health-exam.ts lib/data/schema/au-health-exam.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/A.jsonl
git commit -F - << 'EOF'
feat(data): source DHA health-exam readiness (A.033, A.035, A.036, A.038)

New AuHealthExam module + Zod schema + registry entry: three process rules (panel
physician/clinic overseas, cost paid directly, My Health Declarations before lodging)
and the 6-month health-undertaking validity. value_status:"prose-only" + FLIP_STATUS
derives status:"used". The 12-month base validity is reused from C.092, not re-wired;
A.034 (dup of C.092) + A.037 (clinic contact) stay pending (use-later). No scorer,
no C-category churn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Checklist consumption (enrich the `medical` item)

**Files:** `lib/checklist/generator.ts:10,65,210`, `tests/checklist/generator.test.ts` (append one `it`).

- [ ] **Step 1: Write the failing test**

Append inside `describe("generateChecklist", …)`, after the last `it` (the `doc-preparation` case), before the closing `});`:

```ts
  it("enriches the medical item with the DHA health-exam process + validity (A.033, A.035, A.036, A.038)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const med = byKey(items, "medical");
    expect(med?.note).toContain("panel physician or clinic");
    expect(med?.note).toContain("My Health Declarations");
    expect(med?.note).toContain("12 months");
    expect(med?.source?.url).toContain("immi.homeaffairs.gov.au");
  });
```

Anchor (the `doc-preparation` test's end + describe close):

```ts
    expect(prep?.source?.url).toContain("immi.homeaffairs.gov.au");
  });
});
```

Replace with the same lines + the new test inserted before the final `});`.

- [ ] **Step 2: Run it to verify it fails (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "enriches the medical item"`
Expected: **FAIL** — the `medical` note is still "When DHA requests it." (no "panel physician or clinic"), and it has no `source`.

- [ ] **Step 3: Add the imports** to `lib/checklist/generator.ts` after the `AU_DOCUMENT_PREPARATION` import (:10). Replace:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
```

with:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
```

- [ ] **Step 4: Add the health-exam consts** after the `DOC_PREP_NOTE` const (:65). Replace:

```ts
const DOC_PREP_NOTE =
  `${TRANSLATION_RULES} DHA also asks for certified copies of some identity documents, ` +
  `including your ${oxfordAnd(CERTIFIED_COPIES)}.`;
```

with:

```ts
const DOC_PREP_NOTE =
  `${TRANSLATION_RULES} DHA also asks for certified copies of some identity documents, ` +
  `including your ${oxfordAnd(CERTIFIED_COPIES)}.`;

const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_UNDERTAKING = AU_HEALTH_EXAM.find((r) => r.id === "undertaking-validity")!.summary;
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092 (structured 12 months)
const HEALTH_EXAM_SOURCE = AU_HEALTH_EXAM.find((r) => r.id === "mhd-before-lodging")!; // DHA health page → item source
const MEDICAL_NOTE =
  `DHA may request a health examination as part of your application. ${HEALTH_EXAM_PROCESS} ` +
  `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit} — ${HEALTH_EXAM_UNDERTAKING}`;
```

- [ ] **Step 5: Enrich the `medical` item** (:210). Replace:

```ts
  add({ key: "medical", kind: "medical", label: "Panel medical exam", group: "visa", stage: "after-offer", requirement: "required", note: "When DHA requests it." });
```

with:

```ts
  add({
    key: "medical", kind: "medical", label: "Panel medical exam",
    group: "visa", stage: "after-offer", requirement: "required",
    note: MEDICAL_NOTE,
    source: { url: HEALTH_EXAM_SOURCE.source, lastVerified: HEALTH_EXAM_SOURCE.lastVerified },
  });
```

(Item key/kind/group/stage/requirement unchanged — still an uploadable `kind:"medical"` item; only the note + source change.)

> **Rendered note:** "DHA may request a health examination as part of your application. Outside Australia, the examination must be done by a DHA-approved panel physician or clinic. You pay the panel physician or clinic directly. If your visa is eligible, the My Health Declarations service lets you complete it before you lodge. Results are generally valid for 12 months — 6 months if DHA asks you to sign a health undertaking."

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "enriches the medical item"`
Expected: **PASS**.

- [ ] **Step 7: Full checklist suite (no regression)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: **PASS** (the "places all visa documents in the after-offer stage" case checks only stage/requirement, which are unchanged).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -F - << 'EOF'
feat(checklist): enrich the medical item with DHA health-exam readiness (A.033/A.035/A.036/A.038)

The existing after-offer medical item's bare note now composes the health-exam
process (panel physician/clinic overseas, cost paid directly, My Health Declarations
before lodging) + validity (12 months reused from C.092, 6 if a health undertaking),
with a DHA source. No new item.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Plan consumption

**Files:** `lib/plan/generator.ts:9,40,185`, `tests/plan/generator.test.ts` (append two `it`s).

- [ ] **Step 1: Write the failing tests**

Append inside `describe("generatePlan", …)`, after the last `it` (the translate-and-certify "does not add" case), before the closing `});`:

```ts
  it("adds the prepare-health-exam item for an Australian primary destination (A.033, A.035, A.036, A.038)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const med = items.find((i) => i.kind === "prepare-health-exam");
    expect(med).toBeTruthy();
    expect(med?.impact).toBe("medium");
    expect(med?.title).toContain("health examination");
    expect(med?.body).toContain("panel physician or clinic");
    expect(med?.body).toContain("12 months");
  });

  it("does not add the prepare-health-exam item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-health-exam")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-health-exam")).toBe(false);
  });
```

Anchor (the translate-and-certify "does not add" test's end + describe close):

```ts
    expect(canada.some((i) => i.kind === "translate-certify-documents")).toBe(false);
  });
});
```

Replace with the same lines + the two new tests inserted before the final `});`.

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `npx vitest run tests/plan/generator.test.ts -t "prepare-health-exam"`
Expected: the "adds…" case **FAILS** (`med` is `undefined`); the "does not add…" case passes vacuously.

- [ ] **Step 3: Add the imports** to `lib/plan/generator.ts` after the `AU_DOCUMENT_PREPARATION` import (:9). Replace:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
```

with:

```ts
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
```

- [ ] **Step 4: Add the health-exam consts** after the `CERTIFIED_COPIES` const (:40). Replace:

```ts
const CERTIFIED_COPIES = AU_DOCUMENT_PREPARATION.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
```

with:

```ts
const CERTIFIED_COPIES = AU_DOCUMENT_PREPARATION.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092
```

- [ ] **Step 5: Add the gated plan item** immediately after the `translate-certify-documents` block, before `// WORK + CAREER` (:182-185). Replace:

```ts
      timeEstimate: "1 week",
    });
  }

  // WORK + CAREER
```

with:

```ts
      timeEstimate: "1 week",
    });
  }

  // DHA HEALTH EXAMINATION readiness — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "prepare-health-exam",
      impact: "medium",
      title: "Prepare for your health examination",
      body:
        `DHA may request a health examination as part of your visa. ${HEALTH_EXAM_PROCESS} ` +
        `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit}, so arrange it early — don't let it hold up your application.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // WORK + CAREER
```

> **Rendered body:** "DHA may request a health examination as part of your visa. Outside Australia, the examination must be done by a DHA-approved panel physician or clinic. You pay the panel physician or clinic directly. If your visa is eligible, the My Health Declarations service lets you complete it before you lodge. Results are generally valid for 12 months, so arrange it early — don't let it hold up your application."

(The panel-physician clause is composed from the same `HEALTH_EXAM_PROCESS` join as the checklist, so "panel physician or clinic" is identical across both surfaces by construction.)

- [ ] **Step 6: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts -t "prepare-health-exam"`
Expected: **PASS** (both).

- [ ] **Step 7: Full plan suite (no regression)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: **PASS** — the "stable order" case uses `primaryDestinationId: null`, so `prepare-health-exam` is absent both calls.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -F - << 'EOF'
feat(plan): add the prepare-health-exam action (A.033/A.035/A.036/A.038)

New prepare-health-exam PlanItem composing the DHA health-exam process from
AU_HEALTH_EXAM + the 12-month validity reused from C.092, gated on an Australian
primary destination (mirrors GS/NOC/translate). "panel physician or clinic" is
composed from the same A.036 summary the checklist uses.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Status + ledger

**Files:** `docs/PROJECT_STATUS.md`, regenerate `docs/research-briefs/findings-ledger.md`.

- [ ] **Step 1: Full suite for the authoritative test count**

Run: `npm test`
Expected: **all green**, ≈ **715 → 719** (+1 checklist, +2 plan, +1 registry-driven). Note the exact total for Step 3.

- [ ] **Step 2: Regenerate the ledger + confirm only A moved**

```bash
node docs/research-briefs/_tools/build-ledger.js
git diff docs/research-briefs/findings-ledger.md
```

Expected: overall `used` 386 → **390**, `pending` 728 → **724**; category **A** `used` 38 → **42**, `pending` 84 → **80**; clusters **41** (unchanged). The only finding-status moves are A.033/A.035/A.036/A.038 `pending → used` — **no C-category row changes** (C.092 already `used`; the `C` row total is unchanged). A.034 + A.037 stay `pending`.

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`**

First Read the file (the test-count header near the top + the slice-E bullet). Then:

(a) Change "715 passing across 161 test files" to the **actual** count from Step 1 (keep "161 test files" unless `npm test` reports otherwise).

(b) Add this bullet immediately after the existing slice-E bullet:

```markdown
- **Ledger slice F — DHA health-exam readiness → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-f-health-exam-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-f-health-exam.md`. New sourced module `lib/data/source/au-health-exam.ts` (4 records, `kind`-discriminated — three process rules: panel physician/clinic outside Australia, cost paid directly to the clinic, My Health Declarations before lodging; plus the 6-month health-undertaking validity) backs findings A.033/A.035/A.036/A.038; `FLIP_STATUS` promoted all four (overall used 386→390, pending 728→724; A 38→42; 0 rejected). The existing after-offer `medical` checklist item is enriched in place (no new item) and a new AU-primary-gated `prepare-health-exam` plan action is added; both reuse the already-`used` structured finding C.092 (`au-health-biometric-facts`) for the 12-month validity — its first user-facing surface, with no C-category churn. Four-state tagging: 4 used, 0 rejected/needs-human-call; A.034 (12-month validity, duplicate of C.092) and A.037 (Nepal Mediciti panel-physician contact) stay use-later, alongside biometrics (A.029–A.031) and police certificate (A.039). No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATUS.md docs/research-briefs/findings-ledger.md
git commit -F - << 'EOF'
docs(slice-f): record health-exam slice in status + ledger

PROJECT_STATUS slice-F bullet + test count; regenerate findings-ledger.md
(used 386→390, pending 728→724; A 38→42; clusters 41). C unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Hard gate + adversarial + ff-merge + report

**Files:** none changed (verification + git ritual).

- [ ] **Step 1: Adversarial mutation — confirm the `USED_UNSET` guard bites**

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/A.jsonl';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/("id":"A\.036"[^\n]*?"value_status":)"prose-only"/, '$1"unset"');
fs.writeFileSync(p, t);
console.log('mutated A.036 value_status -> unset (status stays used)');
EOF
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **FAIL** with `USED_UNSET A.036`.

Then restore and re-verify:

```bash
git checkout -- docs/research-briefs/findings/A.jsonl
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **PASS**.

- [ ] **Step 2: Full hard gate**

Run each; all must pass:
- `npm run typecheck` → clean.
- `npx vitest run tests/data/` → green.
- `npm test` → full suite green.
- `git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` → **empty** (goldens byte-identical).
- `git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` → **empty** (scorer untouched).
- **`git diff master...HEAD -- docs/research-briefs/findings/C.jsonl lib/data/source/au-health-biometric-facts.ts` → empty (NO C churn — C.092 reused read-only).**
- `node docs/research-briefs/_tools/build-ledger.js` then `git status --porcelain docs/research-briefs/findings-ledger.md` → **no output** (ledger current).

- [ ] **Step 3: Confirm branch state**

Run: `git status -sb` then `git log --oneline master..HEAD`
Expected: only the WIP trio dirty; **6 commits** ahead — spec, plan doc, sourced layer, checklist, plan, status+ledger.

- [ ] **Step 4: Fast-forward merge to master + push + delete branch**

```bash
git checkout master
git merge --ff-only ledger-slice-f-health-exam
git push
git branch -d ledger-slice-f-health-exam
git status -sb
```

Expected: `Fast-forward`; push shows the `X..Y master -> master` ref-update; branch deleted; `## master...origin/master` in sync. **Verify the push by the ref-update line + in-sync status, not the exit code.**

- [ ] **Step 5: Report at the merge**

Report: the 6 commits; four-state ledger (4 → `used`; 0 rejected / needs-human-call; A.034 + A.037 use-later; C.092 reused, no C churn); goldens byte-identical + scorer untouched; suite green (N); ledger A 38→42 (overall 386→390), clusters 41; adversarial `USED_UNSET` confirmed. Then **await the user's steer on the next slice** — do not start a new slice autonomously.

---

## Self-review (writing-plans)

**1. Spec coverage** — §4 module → Task 1 (1–3); §8 schema+registry → Task 1 (3–4); §7 finding edits → Task 1 (6–7); §5 checklist (enrich medical, reuse C.092) → Task 2; §6 plan → Task 3; §2 ledger + C-reuse → Task 4; §9 testing + adversarial → Tasks 2/3 + Task 5 step 1; §10 gate (incl. C-untouched) → Task 5 step 2; §11 commit plan → the four code commits + merge. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has an expected result. The only non-hardcoded value is the PROJECT_STATUS test count (Task 4 step 3), read from actual `npm test` output.

**3. Type consistency** — `AuHealthExam` / `AU_HEALTH_EXAM` / `AuHealthExamSchema` / `recordLabel:"au-health-exam"` / `recordInterface:"AuHealthExam"` identical across types/module/schema/registry. The 4 `id` values match interface union ↔ schema enum ↔ records. `kind` (`process`/`validity`) matches interface ↔ schema ↔ records ↔ generator filters. Item key `medical` (unchanged) and plan kind `prepare-health-exam` match generators ↔ tests. `HEALTH_EXAM_VALIDITY.value`/`.unit` typecheck against `AuHealthBiometricFact` (`value:number|boolean`, `unit?:string`). `oxfordAnd` reused, not redefined. `HEALTH_EXAM_*` const names don't collide with E's `CERTIFIED_COPIES`/`DOC_PREP_*`.

**4. Token cross-check** — test assertions ("panel physician or clinic" ← A.036 summary; "My Health Declarations" ← A.033 summary; "12 months" ← C.092 value+unit; "health examination" ← plan title; "immi.homeaffairs.gov.au" ← DHA sources) all appear verbatim in the composed `MEDICAL_NOTE` / plan body / records defined in Tasks 1–3. Verified.
