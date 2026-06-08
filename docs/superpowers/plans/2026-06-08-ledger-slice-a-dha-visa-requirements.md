# Ledger slice A — DHA visa requirements → checklist + plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 21 Category-A findings of the four Subclass 500 document pillars (CoE, OSHC, financial-evidence coverage, Genuine Student) into the shipped checklist + plan generators via a new sourced data module, so the guidance is provenance-backed and accurate — with zero scorer impact.

**Architecture:** A new pure data module (`lib/data/source/au-student-visa-requirements.ts`) holds four `Provenanced` records whose `provenance.findingRefs` back the findings. One registry line brings it under the registry-driven reconcile/schema/flip-status CI. `FLIP_STATUS=1` derives `status:"used"` from those refs (never hand-edited). The checklist + plan generators consume the module. No `lib/scoring/*` import → `golden-assessments.json` stays byte-identical.

**Tech Stack:** TypeScript (strict), Zod, vitest 4.x, the slice-kit harness (`docs/research-briefs/_tools/`).

**Spec:** `docs/superpowers/specs/2026-06-08-ledger-slice-a-dha-visa-requirements-design.md`

**Branch:** `ledger-slice-a-dha-visa-requirements` (already created; spec committed). All work lands here, then `git merge --ff-only` to master.

**Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Use explicit `git add <paths>`, never `git add -A`. Every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify | Add `AuStudentVisaRequirement` interface |
| `lib/data/source/au-student-visa-requirements.ts` | Create | The 4 sourced pillar records |
| `lib/data/schema/au-student-visa-requirements.schema.ts` | Create | Zod schema for the module |
| `lib/data/schema/registry.ts` | Modify | One import pair + one `DataModuleEntry` |
| `docs/research-briefs/findings/A.jsonl` | Modify | `value_status` on 21 findings; `status`/`used_by` via flip-status |
| `lib/checklist/generator.ts` | Modify | CoE/OSHC notes + `SourceLine`; financial note adds travel |
| `tests/checklist/generator.test.ts` | Modify | New cases: CoE/OSHC sourcing, financial travel |
| `lib/plan/generator.ts` | Modify | New AU-gated "Genuine Student answers" item |
| `tests/plan/generator.test.ts` | Modify | New cases: GS item present for AU / absent otherwise |
| `docs/PROJECT_STATUS.md` | Modify | Slice-A entry + ledger math |

The data tests (`tests/data/{reconcile-modules,schema,flip-status.run,findings-integrity}.test.ts`) are **registry-driven** — they iterate `DATA_MODULES` and need no new file.

**Commits:** (1) sourced layer, (2) checklist, (3) plan, (4) PROJECT_STATUS. Then ff-merge.

---

## Task 1: Add the `AuStudentVisaRequirement` type

**Files:**
- Modify: `lib/data/types.ts` (append near the other `Provenanced` fact interfaces, e.g. after `AuVisaFact`)

- [ ] **Step 1: Add the interface**

```ts
/**
 * A DHA Subclass 500 student-visa documentary requirement (visa-documents
 * category A) — one of the four application pillars (CoE, OSHC, financial-evidence
 * coverage, Genuine Student). `summary` is the student-facing note the checklist/
 * plan generators render; the GS record additionally carries the four questions,
 * the word limit, and the date GS took effect. Fact-only — no scorer reads it;
 * machine-checked against the findings.
 */
export interface AuStudentVisaRequirement extends Provenanced {
  id: "coe" | "oshc" | "financial-coverage" | "genuine-student";
  label: string;               // short human label
  summary: string;             // student-facing note text
  questions?: string[];        // genuine-student only — the four GS questions
  responseLimitWords?: number; // genuine-student only — 150 (backs A.021)
  appliesSince?: string;       // genuine-student only — ISO date GS took effect (A.016)
  source: string;              // canonical DHA URL for the SourceLine
  lastVerified?: string;       // ISO date
}
```

- [ ] **Step 2: Typecheck (no consumers yet, must stay clean)**

Run: `npm run typecheck`
Expected: clean (a new exported interface compiles on its own).

*(No standalone test — this type is exercised by the schema test in Task 3 and reconcile in Task 6. Committed together as the sourced layer in Task 8.)*

---

## Task 2: Author the data module

**Files:**
- Create: `lib/data/source/au-student-visa-requirements.ts`

- [ ] **Step 1: Write the module**

```ts
import type { AuStudentVisaRequirement } from "@/lib/data/types";

/**
 * DHA Subclass 500 student-visa documentary requirements (visa-documents
 * category A): the four application pillars — Confirmation of Enrolment, Overseas
 * Student Health Cover, the financial-evidence coverage rules, and the Genuine
 * Student requirement. Prose rules consumed by the checklist + plan generators for
 * sourced, accurate guidance. Fact-only — no scorer reads it; machine-checked
 * against findings A.002–A.022 (see provenance.findingRefs).
 *
 * The CoE record's headline source is the DHA web-evidentiary-tool (A.002); the
 * UoW/ACU/UTS findings (A.118–A.122) corroborate a CoE's contents and issuance.
 * `financial-coverage` sources the coverage *requirement* (travel/living/tuition),
 * not the AUD 29,710 figure itself — that stays sourced via AU_DHA_LIVING_CAPACITY_AUD
 * (A.015/B.002).
 */
const DHA_EVIDENTIARY = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";

export const AU_STUDENT_VISA_REQUIREMENTS: AuStudentVisaRequirement[] = [
  {
    id: "coe",
    label: "Confirmation of Enrolment (CoE)",
    summary:
      "Issued after you accept your offer and pay the tuition deposit. Your CoE shows your course start/end dates and fees. You'll need it for your student visa application.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.002", "A.118", "A.119", "A.120", "A.121", "A.122"],
      source: DHA_EVIDENTIARY,
      note: "DHA requires a CoE for all intended courses; provider findings corroborate contents and issuance conditions.",
    },
  },
  {
    id: "oshc",
    label: "Overseas Student Health Cover (OSHC)",
    summary:
      "Required for the visa. Cover must start at least a week before your course and run for your full stay; include the insurer name and policy dates in your application.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.006", "A.007", "A.008", "A.009", "A.010"],
      source: DHA_EVIDENTIARY,
    },
  },
  {
    id: "financial-coverage",
    label: "Financial evidence coverage",
    summary:
      "Your financial evidence must cover travel, living costs, and tuition for you and any accompanying family members.",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.011", "A.012", "A.013"],
      source: DHA_EVIDENTIARY,
      note: "Coverage requirement only; the AUD 29,710 living figure is sourced via AU_DHA_LIVING_CAPACITY_AUD (A.015/B.002).",
    },
  },
  {
    id: "genuine-student",
    label: "Genuine Student answers",
    summary:
      "Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement, answered as four written questions.",
    questions: [
      "Your current circumstances — ties to family, community, employment, and your economic situation.",
      "Why you want to study this course in Australia with this provider, and your understanding of the course and living here.",
      "How completing the course will benefit you.",
      "Any other relevant information you want to include.",
    ],
    responseLimitWords: 150,
    appliesSince: "2024-03-23",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.016", "A.017", "A.018", "A.019", "A.020", "A.021", "A.022"],
      source: DHA_EVIDENTIARY,
      note: "Four GS questions (A.017–A.020), 150-word limit (A.021), GS since 2024-03-23 (A.016), extra question for prior-visa/onshore applicants (A.022).",
    },
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. (`responseLimitWords: 150` is the scalar leaf the reconcile value-fidelity check will match against structured finding A.021.)

---

## Task 3: Write the Zod schema

**Files:**
- Create: `lib/data/schema/au-student-visa-requirements.schema.ts`

- [ ] **Step 1: Write the schema** (mirrors `au-visa-facts.schema.ts`)

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-student-visa-requirements.ts. Guards the
 * id enum, non-empty label/summary, the GS-only optional fields, the http(s)
 * source, ISO dates, unique ids, and provenance (>=1 findingRef).
 */
const AuStudentVisaRequirementSchema = z.object({
  id: z.enum(["coe", "oshc", "financial-coverage", "genuine-student"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  questions: z.array(z.string().min(1)).optional(),
  responseLimitWords: z.number().int().positive().optional(),
  appliesSince: IsoDate.optional(),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuStudentVisaRequirementsSchema = z
  .array(AuStudentVisaRequirementSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU student-visa-requirement ids must be unique",
  });
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

---

## Task 4: Register the module (and watch reconcile go RED)

**Files:**
- Modify: `lib/data/schema/registry.ts`

- [ ] **Step 1: Add the import pair** (near the other source-module imports, after the `AU_VISA_FACTS` import block)

```ts
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { AuStudentVisaRequirementsSchema } from "@/lib/data/schema/au-student-visa-requirements.schema";
```

- [ ] **Step 2: Append the entry** to the `DATA_MODULES` array (after the `AU_VISA_FACTS` entry)

```ts
  {
    category: "A",
    exportName: "AU_STUDENT_VISA_REQUIREMENTS",
    data: AU_STUDENT_VISA_REQUIREMENTS,
    schema: AuStudentVisaRequirementsSchema,
    recordLabel: "au-student-visa-requirements",
    subRecordKeys: [],
    recordInterface: "AuStudentVisaRequirement",
  },
```

- [ ] **Step 3: Run the schema test (should PASS — the data is shape-valid)**

Run: `npx vitest run tests/data/schema.test.ts`
Expected: PASS, including `A: AU_STUDENT_VISA_REQUIREMENTS parses under its schema`.

- [ ] **Step 4: Run reconcile to verify it FAILS for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: FAIL with `REF_NOT_USED au-student-visa-requirements[coe] -> A.002 (status=pending)` (and similar for all 21) — the module references findings that are still `pending`. This RED proves the wiring is real; Tasks 5–6 turn it green.

---

## Task 5: Set `value_status` on the 21 integrated findings

**Files:**
- Modify: `docs/research-briefs/findings/A.jsonl` (via a one-off script; the script file is NOT committed)

- [ ] **Step 1: Create the one-off script** `tmp-set-vs.js` at the repo root

```js
const fs = require("node:fs");
const file = "docs/research-briefs/findings/A.jsonl";
// 20 prose-only rule findings; A.021 is the one structured value (150 words).
const PROSE = new Set([
  "A.002", "A.118", "A.119", "A.120", "A.121", "A.122",
  "A.006", "A.007", "A.008", "A.009", "A.010",
  "A.011", "A.012", "A.013",
  "A.016", "A.017", "A.018", "A.019", "A.020", "A.022",
]);
const raw = fs.readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const trailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
const body = trailingBlank ? lines.slice(0, -1) : lines;
let n = 0;
const out = body.map((line) => {
  if (!line.trim()) return line;
  const f = JSON.parse(line);
  if (PROSE.has(f.id)) { f.value_status = "prose-only"; n++; return JSON.stringify(f); }
  if (f.id === "A.021") { f.value = 150; f.value_type = "number"; f.unit = "words"; f.value_status = "structured"; n++; return JSON.stringify(f); }
  return line; // untouched verbatim
});
fs.writeFileSync(file, out.join(eol) + (trailingBlank ? eol : ""), "utf8");
console.log(`value_status set on ${n} findings (expected 21)`);
```

- [ ] **Step 2: Run it**

Run: `node tmp-set-vs.js`
Expected: `value_status set on 21 findings (expected 21)`

- [ ] **Step 3: Validate the findings still pass the finding schema**

Run: `npx vitest run tests/data/findings-integrity.test.ts`
Expected: PASS (A.021 is now a valid `structured` finding with `value:150, value_type:"number"`; the other 20 are valid `prose-only`).

- [ ] **Step 4: Delete the one-off script (do not commit it)**

Run (PowerShell): `Remove-Item tmp-set-vs.js`

---

## Task 6: Derive the used set from code (flip-status) → GREEN

**Files:**
- Modify: `docs/research-briefs/findings/A.jsonl` (rewritten by the runner — `status`/`used_by` only)

- [ ] **Step 1: Run the write-mode flip-status runner**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
(PowerShell equivalent: `$env:FLIP_STATUS=1; npx vitest run tests/data/flip-status.run.test.ts; Remove-Item Env:FLIP_STATUS`)
Expected: logs `flip-status: files=1 promoted=21 demoted=0 rewired=0 refused=0 refToRejected=0`.

- [ ] **Step 2: Inspect the diff — only the 21 A findings changed**

Run: `git --no-pager diff --stat docs/research-briefs/findings/`
Expected: only `A.jsonl` changed. Spot-check `git --no-pager diff docs/research-briefs/findings/A.jsonl` shows each of the 21 now has `"status":"used"` + `"used_by":["au-student-visa-requirements[<id>]…"]` and the `value_status` set in Task 5; no other finding touched.

- [ ] **Step 3: Run the full data suite → GREEN**

Run: `npx vitest run tests/data/`
Expected: PASS — reconcile clean (`report.used` up by 21), schema parses, flip-status normal-mode clean (no promote/demote/refuse/rewire), findings-integrity clean.

- [ ] **Step 4: Confirm the ledger moved by exactly this slice**

Run: `node docs/research-briefs/_tools/build-ledger.js` then `node docs/research-briefs/_tools/list-pending.js A`
Expected: category A shows `used` 12 → 33, `pending` 110 → 89 (0 rejected).

---

## Task 7: Adversarial drift check (confirm a guard bites)

**Files:** none committed — temporary mutation only.

- [ ] **Step 1: Mutate the one structured value**

In `lib/data/source/au-student-visa-requirements.ts`, change `responseLimitWords: 150` to `responseLimitWords: 151`.

- [ ] **Step 2: Run reconcile — expect VALUE_DRIFT**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: FAIL with `VALUE_DRIFT au-student-visa-requirements[genuine-student] -> A.021 expected 150 not in [...]`.

- [ ] **Step 3: Revert the mutation**

Restore `responseLimitWords: 150`. Run `npx vitest run tests/data/reconcile-modules.test.ts` → PASS.

---

## Task 8: Commit the sourced layer (commit 1)

- [ ] **Step 1: Typecheck + data suite green**

Run: `npm run typecheck` (clean), then `npx vitest run tests/data/` (PASS).

- [ ] **Step 2: Stage exactly the sourced-layer files + commit**

```bash
git add lib/data/types.ts lib/data/source/au-student-visa-requirements.ts lib/data/schema/au-student-visa-requirements.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/A.jsonl
git status --short   # MUST show only the WIP trio unstaged; tmp-set-vs.js must be gone
git commit -m "$(cat <<'EOF'
feat(data): source DHA visa requirements (slice A) into a registered module

New au-student-visa-requirements module (CoE, OSHC, financial coverage, Genuine
Student) backs 21 Category-A findings via provenance.findingRefs; FLIP_STATUS
promoted them to used (A: 12 -> 33). Schema + one registry line bring it under the
reconcile/schema/flip-status CI. No scorer touched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
(On Windows PowerShell, use a single-quoted here-string `@'...'@` for the `-m` body, ASCII only.)

Expected: one commit; `git status --short` shows only `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`.

---

## Task 9: Checklist — write the failing tests (RED)

**Files:**
- Modify: `tests/checklist/generator.test.ts` (append inside the `describe("generateChecklist", …)` block)

- [ ] **Step 1: Add the cases**

```ts
  it("sources the CoE item from DHA and states you need it for the visa", () => {
    const coe = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "coe");
    expect(coe?.note).toContain("student visa application");
    expect(coe?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("enriches the OSHC item with start timing + full duration and sources it", () => {
    const oshc = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "oshc");
    expect(oshc?.note).toContain("at least a week");
    expect(oshc?.note?.toLowerCase()).toContain("full");
    expect(oshc?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("states travel in the financial coverage note (still names the DHA figure)", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.note?.toLowerCase()).toContain("travel");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });
```

- [ ] **Step 2: Run them — expect FAIL (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: the three new cases FAIL — current CoE note is "After you accept and pay your deposit." (no "student visa application"), OSHC note is "Before you lodge the visa." (no "at least a week"), and the financial note has no "travel".

---

## Task 10: Checklist — implement (GREEN)

**Files:**
- Modify: `lib/checklist/generator.ts`

- [ ] **Step 1: Import the module + add a lookup helper** (after the existing imports, near `DHA_SOURCE`)

```ts
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";

const VISA_REQ = Object.fromEntries(AU_STUDENT_VISA_REQUIREMENTS.map((r) => [r.id, r]));
const reqSource = (id: string): ChecklistSource | undefined => {
  const r = VISA_REQ[id];
  return r ? { url: r.source, lastVerified: r.lastVerified } : undefined;
};
```

- [ ] **Step 2: Enrich the financial note** — replace the `dhaNote` line (currently `const dhaNote = \`DHA expects evidence covering AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living + ${tuition}.\`;`)

```ts
  const dhaNote = `DHA expects evidence covering your travel, at least AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living costs, and ${tuition} (plus costs for any accompanying family members).`;
```

- [ ] **Step 3: Source CoE + OSHC from the records** — in the `// VISA (after-offer)` block, replace the `coe` and `oshc` `add(...)` calls

```ts
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["coe"]!.summary, source: reqSource("coe") });
  add({ key: "oshc", kind: "oshc", label: "Overseas Student Health Cover (OSHC)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["oshc"]!.summary, source: reqSource("oshc") });
```

- [ ] **Step 4: Run the checklist tests — expect PASS (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: PASS (new cases pass; the existing "after-offer stage" and financial-source/29710 cases still pass — the financial item keeps its existing `DHA_SOURCE`, and the note still contains 29,710).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

---

## Task 11: Commit the checklist change (commit 2)

- [ ] **Step 1: Stage + commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git status --short   # only the WIP trio unstaged
git commit -m "$(cat <<'EOF'
feat(checklist): source CoE/OSHC + add travel to the financial note (slice A)

CoE and OSHC items now render the DHA-sourced summary with a SourceLine; the
financial note states travel coverage. Notes trace to au-student-visa-requirements
(findings A.002/A.006/A.011-A.013). No scorer touched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Plan — write the failing tests (RED)

**Files:**
- Modify: `tests/plan/generator.test.ts` (append inside the `describe("generatePlan", …)` block)

- [ ] **Step 1: Add the cases**

```ts
  it("adds the Genuine Student answers item for an Australian primary destination", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const gs = items.find((i) => i.kind === "prepare-gs-answers");
    expect(gs).toBeTruthy();
    expect(gs?.impact).toBe("high");
    expect(gs?.title).toContain("Genuine Student");
    expect(gs?.body).toContain("150 words");
  });

  it("does not add the Genuine Student item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-gs-answers")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-gs-answers")).toBe(false);
  });
```

- [ ] **Step 2: Run them — expect FAIL (RED)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: the AU case FAILS (no `prepare-gs-answers` kind exists yet); the absence case passes vacuously.

---

## Task 13: Plan — implement (GREEN)

**Files:**
- Modify: `lib/plan/generator.ts`

- [ ] **Step 1: Import the module** (after the existing imports)

```ts
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
```

- [ ] **Step 2: Add the AU-gated GS item** — insert after the `// POLICY (Nepal AL3)` block (before `// WORK + CAREER`)

```ts
  // GENUINE STUDENT (Australian student-visa requirement)
  if (inputs.primaryDestinationId === "australia") {
    const gs = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "genuine-student")!;
    out.push({
      kind: "prepare-gs-answers",
      impact: "high",
      title: "Prepare your Genuine Student answers",
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer four questions — your current circumstances and ties, why this course and provider, how it benefits you, and anything else relevant — each in ${gs.responseLimitWords} words or less. Draft your answers early; they anchor your whole application.`,
      timeEstimate: "2-4 hours",
    });
  }
```

- [ ] **Step 3: Run the plan tests — expect PASS (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: PASS (`body` contains "150 words"; item present for `australia`, absent for `null`/`canada`). The existing "stable order" test still passes.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

---

## Task 14: Commit the plan change (commit 3)

- [ ] **Step 1: Stage + commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git status --short   # only the WIP trio unstaged
git commit -m "$(cat <<'EOF'
feat(plan): add AU-gated Genuine Student answers action (slice A)

New high-impact plan item walks the four GS questions (<=150 words each), emitted
only for an Australian primary destination. Sourced from au-student-visa-requirements
(findings A.016-A.022). No scorer touched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Update PROJECT_STATUS (commit 4)

**Files:**
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Add a slice entry** to the "Data integration & scorer-wiring" section (after the most recent bullet)

```markdown
- **Ledger slice A — DHA visa requirements → checklist + plan (merged 2026-06-08).** Spec `docs/superpowers/specs/2026-06-08-ledger-slice-a-dha-visa-requirements-design.md`, plan `docs/superpowers/plans/2026-06-08-ledger-slice-a-dha-visa-requirements.md`. First Ledger-by-slice integration: a new sourced module `lib/data/source/au-student-visa-requirements.ts` (4 pillar records — CoE, OSHC, financial coverage, Genuine Student) backs 21 Category-A findings; `FLIP_STATUS` promoted them (A: used 12 → 33, pending 110 → 89, 0 rejected). The checklist now sources the CoE/OSHC items (SourceLine) and states travel in the financial note; a new AU-gated high-impact plan item walks the four Genuine Student answers (≤150 words). Four-state tagging: 21 used, 7 use-later by slice boundary (under-18 welfare A.003–A.005, dependant school costs A.014, English exemption/floor A.023–A.024 — floor already ships via J1.003, processing time A.032). No scorer touched; `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
```

- [ ] **Step 2: Update the snapshot test count** — find the `**Tests:**` line near the top and bump it by the number of new cases added (5: three checklist + two plan). Adjust the number to match the actual `npm test` total from Task 16.

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): log Ledger slice A (DHA visa requirements)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Full verification gate + integrate

- [ ] **Step 1: Hard gate — run everything**

```bash
npm run typecheck
npx vitest run tests/data/
npm test
node docs/research-briefs/_tools/build-ledger.js
```
Expected: typecheck clean; `tests/data/` green (reconcile OK, schema, flip normal-mode clean); full suite green; ledger shows A used=33 / pending=89.

- [ ] **Step 2: Prove goldens are byte-identical**

Run: `git --no-pager diff --stat tests/scoring/__fixtures__/golden-assessments.json`
Expected: **empty output** (no diff). If anything appears, stop — a scorer path was touched; investigate before merging.

- [ ] **Step 3 (best-effort, non-gating): browser smoke**

If the environment allows, drive a Nepal→AU `/checklist/[programId]` (enriched CoE/OSHC + SourceLines; financial note mentions travel) and `/plan` (GS-answers item). Signed-in routes are OAuth-gated and the dev-session seam was removed, so this typically falls back to the `Results`/checklist/plan composition unit tests — note which was used. This NEVER blocks the merge; the automated gate above is authoritative.

- [ ] **Step 4: Confirm only intended files changed across the branch**

Run: `git --no-pager diff --stat master...HEAD`
Expected: the spec, this plan, the 4 module/schema/registry/types files, `A.jsonl`, the two generators + their tests, and `PROJECT_STATUS.md`. The WIP trio must NOT appear.

- [ ] **Step 5: Fast-forward merge, push, delete branch**

```bash
git checkout master
git merge --ff-only ledger-slice-a-dha-visa-requirements
git push origin master
git branch -d ledger-slice-a-dha-visa-requirements
```

- [ ] **Step 6: Report** the merge to the user (commits, ledger movement A 12→33, goldens byte-identical) and await the next lane steer. Do not auto-start another slice.

---

## Self-review (writing-plans)

- **Spec coverage:** §2 disposition ledger → Tasks 5–6 (21 used) + Task 15 (records the 7 use-later); §4 module → Tasks 1–2; §5 checklist → Tasks 9–10; §6 plan → Tasks 12–13; §7 finding edits/flip → Tasks 5–6; §8 schema/registry → Tasks 3–4; §9 tests → Tasks 7, 9, 12; §10 hard gate → Task 16; §11 commit plan → Tasks 8, 11, 14, 15 + 16. All covered.
- **Type consistency:** `AuStudentVisaRequirement` fields (`id`, `summary`, `responseLimitWords`, `source`, `provenance`) are used identically in the module (Task 2), schema (Task 3), registry `recordInterface` (Task 4), and generators (`VISA_REQ["coe"]!.summary`, `reqSource(...)`, `gs.responseLimitWords` — Tasks 10, 13). Plan item `kind:"prepare-gs-answers"` matches between implementation (Task 13) and tests (Task 12).
- **Placeholder scan:** every code/test/command step contains literal content; no TBD/TODO. The one-off `tmp-set-vs.js` is fully written and explicitly deleted before commit.
- **No-scorer guarantee:** no task imports `lib/scoring/*`; Task 16 Step 2 asserts the golden diff is empty.
