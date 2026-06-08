# Ledger slice G — DHA biometrics readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire finding A.031 (after lodging, the Immi App needs the biometrics letter whose Visa Lodgement Number starts with "AUI") into the checklist + plan — a new after-offer info item and an AU-gated plan action — reusing the structured C.123 (participation) + C.127 (VFS Kathmandu fee) read-only. Every phrase finding-backed, no scorer touched, **no C-category churn**.

**Architecture:** A new single-record sourced module (`lib/data/source/au-biometrics.ts`, no `kind` discriminator) is registered and A.031 flipped to `used`; two server-side generators compose copy from it, and both **read-only reuse** the already-`used` C.123 + C.127 records from `au-health-biometric-facts.ts`. The checklist item carries a **source-display guard** — its SourceLine points at the C.127 fee/biometrics page (the most concrete claim), not A.031. Mirrors slice F's reuse pattern. No client component, no scoring change.

**Tech Stack:** TypeScript (strict), Zod, vitest 4.1.8, the slice-kit reconcile harness.

---

## Pre-flight (already done — do NOT redo)

- Branch `ledger-slice-g-biometrics` exists and is checked out.
- Spec committed: `c927300` (initial) + `a9a0677` (review tweak — warmer plan title "after you lodge").
- This plan doc is committed on the branch ahead of the code commits.

## Standing rules (every task)

- **Run commands via the Bash tool** (bash) — `FLIP_STATUS=1 npx …` and `node << 'EOF'` heredocs assume bash.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Explicit `git add <paths>`, **never** `git add -A`.
- **Every commit** ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never hand-edit `status`** in `A.jsonl` — `FLIP_STATUS` derives it. **A.029 + A.030 stay `pending`** (use-later) — do not touch them.
- **C is read-only:** do NOT edit `docs/research-briefs/findings/C.jsonl` or `lib/data/source/au-health-biometric-facts.ts`. C.123 + C.127 are reused by import only; the diff review must show **zero C churn**.
- Both generators **already import** `AU_HEALTH_BIOMETRIC_FACTS` (for C.092) — this slice adds only the `AU_BIOMETRICS` import; do not duplicate the existing one.
- The fee is interpolated as `Number(BIOMETRICS_FEE.value).toLocaleString()` (the record types `value` as `number | boolean`; `Number(...)` makes the `.toLocaleString()` unambiguous and gives the "2,365" thousands separator). Tests assert it with the **locale-tolerant** `/2[,.]?365/` (mirrors the existing 29,710 assertions).
- LF→CRLF git warnings on new files are benign (Windows normalization).

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify (after :752) | Add `AuBiometrics` record interface (no `kind`) |
| `lib/data/source/au-biometrics.ts` | Create | The 1 sourced record + provenance |
| `lib/data/schema/au-biometrics.schema.ts` | Create | Zod runtime guard |
| `lib/data/schema/registry.ts` | Modify (imports :78 + 1 entry :624) | Register the module |
| `docs/research-briefs/findings/A.jsonl` | Modify (1 line, A.031) | `value_status:"prose-only"` → `FLIP_STATUS` `status:"used"` |
| `lib/checklist/generator.ts` | Modify (:12, :75, :225) | New `biometrics` info item (reuse C.123/C.127, source guard) |
| `tests/checklist/generator.test.ts` | Modify (+1 test) | Assert the item + the source guard |
| `lib/plan/generator.ts` | Modify (:11, :44, :200) | New `prepare-biometrics` action (reuse C.123/C.127) |
| `tests/plan/generator.test.ts` | Modify (+2 tests) | Assert present/absent gating |
| `docs/PROJECT_STATUS.md` | Modify | Test count + slice-G bullet |
| `docs/research-briefs/findings-ledger.md` | Regenerate | `build-ledger.js` snapshot |

---

## Task 1: Sourced data layer

**Files:** `lib/data/types.ts:752`, create `au-biometrics.ts` + `.schema.ts`, `registry.ts:78,624`, `A.jsonl` (A.031).

- [ ] **Step 1: Add the `AuBiometrics` interface to `lib/data/types.ts`**

Anchor on the end of the `AuHealthExam` interface (its `summary` comment "process = full sentence; validity = the 6-month nuance fragment" is unique — this avoids the multi-match pitfall). Replace:

```ts
  kind: "process" | "validity";
  label: string; // short, inline
  summary: string; // process = full sentence; validity = the 6-month nuance fragment
  source: string; // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

with:

```ts
  kind: "process" | "validity";
  label: string; // short, inline
  summary: string; // process = full sentence; validity = the 6-month nuance fragment
  source: string; // canonical DHA URL
  lastVerified?: string; // ISO date
}

/**
 * DHA biometrics readiness for Nepal→Australia applicants (logistics category A). A
 * single sourced fact: after lodging, the Australian Immi App requires the biometrics
 * letter whose Visa Lodgement Number starts with "AUI" (A.031). `summary` is the
 * sentence the plan/checklist render. The Nepal-side participation (C.123) and VFS
 * Kathmandu fee (C.127) are NOT here — they are reused read-only from
 * au-health-biometric-facts. Fact-only — no scorer reads it; machine-checked against
 * A.031. Single-record module (no `kind` discriminator).
 */
export interface AuBiometrics extends Provenanced {
  id: "immi-app-biometrics-letter";
  label: string;     // short, inline
  summary: string;   // the full sentence rendered by plan/checklist
  source: string;    // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create `lib/data/source/au-biometrics.ts`**

```ts
import type { AuBiometrics } from "@/lib/data/types";

/**
 * DHA biometrics-readiness fact (logistics category A) for an Australian student-visa
 * applicant: after lodging, the Australian Immi App requires the biometrics letter
 * whose Visa Lodgement Number starts with "AUI" (A.031, a single record). The
 * Nepal-side biometrics facts — Nepal's inclusion in the program (C.123) and the VFS
 * Kathmandu collection fee (C.127) — are reused read-only from au-health-biometric-
 * facts, not duplicated here. Fact-only — no scorer reads it; machine-checked against
 * finding A.031 (see provenance.findingRefs).
 */
const DHA_IMMI_APP =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/biometrics/australian-immi-app";

export const AU_BIOMETRICS: AuBiometrics[] = [
  {
    id: "immi-app-biometrics-letter",
    label: "Immi App biometrics letter",
    summary:
      "After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'.",
    source: DHA_IMMI_APP,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.031"],
      source: DHA_IMMI_APP,
      note: "DHA: the Australian Immi App requires the biometrics letter with a Visa Lodgement Number that starts with AUI.",
    },
  },
];
```

(`'AUI'` is single-quoted inside the double-quoted `summary` — no escaping. "After you lodge" is a faithful rendering of A.031: a "Visa Lodgement Number" implies lodgement has occurred.)

- [ ] **Step 3: Create `lib/data/schema/au-biometrics.schema.ts`**

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-biometrics.ts. Guards the id enum, non-empty
 * label/summary, the http(s) source, ISO lastVerified, unique ids, and provenance
 * (>=1 findingRef). Single-record module — no kind discriminator.
 */
const AuBiometricsRecordSchema = z.object({
  id: z.enum(["immi-app-biometrics-letter"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuBiometricsSchema = z
  .array(AuBiometricsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU biometrics ids must be unique",
  });
```

- [ ] **Step 4: Register the module in `lib/data/schema/registry.ts`**

(a) Add the import pair after the `AU_HEALTH_EXAM` imports (:77-78). Replace:

```ts
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AuHealthExamSchema } from "@/lib/data/schema/au-health-exam.schema";
```

with:

```ts
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AuHealthExamSchema } from "@/lib/data/schema/au-health-exam.schema";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
import { AuBiometricsSchema } from "@/lib/data/schema/au-biometrics.schema";
```

(b) Append the entry after the `AU_HEALTH_EXAM` entry (ending :624 before `];` at :625). Replace:

```ts
    recordLabel: "au-health-exam",
    subRecordKeys: [],
    recordInterface: "AuHealthExam",
  },
];
```

with:

```ts
    recordLabel: "au-health-exam",
    subRecordKeys: [],
    recordInterface: "AuHealthExam",
  },
  {
    // Slice G — DHA biometrics readiness (logistics category A): after lodging, the
    // Immi App needs the biometrics letter whose Visa Lodgement Number starts with
    // "AUI" (A.031, a single record). Surfaced in the checklist + plan alongside Nepal's
    // inclusion in the biometrics program (C.123) and the VFS Kathmandu collection fee
    // (C.127), both reused read-only from au-health-biometric-facts. Fact-only: no
    // scorer reads it.
    category: "A",
    exportName: "AU_BIOMETRICS",
    data: AU_BIOMETRICS,
    schema: AuBiometricsSchema,
    recordLabel: "au-biometrics",
    subRecordKeys: [],
    recordInterface: "AuBiometrics",
  },
];
```

- [ ] **Step 5: Run reconcile to verify it fails for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: **FAIL** with `REF_NOT_USED au-biometrics[immi-app-biometrics-letter] -> A.031 (status=pending)`.

- [ ] **Step 6: Set `value_status:"prose-only"` on A.031 (EOL-safe, that line only)**

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/A.jsonl';
let t = fs.readFileSync(p, 'utf8');
const re = /("id":"A\.031"[^\n]*?"value_status":)"unset"/;
if (!re.test(t)) throw new Error('no unset match for A.031');
t = t.replace(re, '$1"prose-only"');
fs.writeFileSync(p, t);
console.log('set prose-only on A.031');
EOF
```

Expected: prints the confirmation. The literal `"value_status":` token will not match the earlier `"status":` field. **A.029 + A.030 are not touched and stay `unset`/`pending`.**

- [ ] **Step 7: Derive `status:"used"` via flip-status**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
Expected: **PASS**; A.031 now carries `status:"used"` + `used_by` (`au-biometrics[immi-app-biometrics-letter]`).

- [ ] **Step 8: Confirm the diffs — only A.031 moved, A.029/A.030 untouched, ZERO C churn**

```bash
git diff --stat docs/research-briefs/findings/A.jsonl
echo "--- C must be empty (no churn) ---"
git diff --stat docs/research-briefs/findings/C.jsonl lib/data/source/au-health-biometric-facts.ts
```

Expected: `A.jsonl` shows **1 insertion(+) / 1 deletion(-)** (A.031 now `status:"used"` + `used_by` + `value_status:"prose-only"`); **A.029 + A.030 unchanged (`status:"pending"`)**. The C line prints **nothing** (no C.jsonl change, no au-health-biometric-facts.ts change).

- [ ] **Step 9: Full data suite GREEN**

Run: `npx vitest run tests/data/`
Expected: **PASS** — reconcile clean (`used` +1, 0 orphans, 0 drift, 0 open-conflict-uses), schema parses, flip-status normal-mode clean, findings/registry integrity green.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/au-biometrics.ts lib/data/schema/au-biometrics.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/A.jsonl
git commit -F - << 'EOF'
feat(data): source DHA biometrics readiness (A.031)

New single-record AuBiometrics module + Zod schema + registry entry: after lodging,
the Australian Immi App requires the biometrics letter whose Visa Lodgement Number
starts with "AUI". value_status:"prose-only" + FLIP_STATUS derives status:"used".
The Nepal-side participation (C.123) + VFS Kathmandu fee (C.127) are reused read-only,
not re-wired; A.029/A.030 (ABCC locations) stay pending (use-later). No scorer, no
C-category churn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Checklist consumption (new `biometrics` info item)

**Files:** `lib/checklist/generator.ts:12,75,225`, `tests/checklist/generator.test.ts` (append one `it`).

- [ ] **Step 1: Write the failing test**

Append inside `describe("generateChecklist", …)`, after the last `it` (the `medical` enrich case), before the closing `});`. Anchor (the medical test's end + describe close):

```ts
    expect(med?.source?.url).toContain("immi.homeaffairs.gov.au");
  });
});
```

Replace with:

```ts
    expect(med?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("adds the after-offer biometrics info item; SourceLine points at the C.127 fee page, not A.031 (A.031 + reuse C.123/C.127)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const bio = byKey(items, "biometrics");
    expect(bio).toMatchObject({
      kind: null, status: "info", group: "visa", stage: "after-offer", requirement: "required",
      label: "Biometrics letter",
    });
    expect(bio?.note).toContain("biometrics program");
    expect(bio?.note).toContain("NPR");
    expect(bio?.note).toMatch(/2[,.]?365/); // locale-tolerant (matches the 29,710 assertions)
    expect(bio?.note).toContain("AUI");
    // source-display guard: the visible SourceLine is the fee/biometrics page (C.127), not A.031's Immi App page
    expect(bio?.source?.url).toContain("vfsglobal.com");
  });
});
```

- [ ] **Step 2: Run it to verify it fails (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "biometrics info item"`
Expected: **FAIL** — `bio` is `undefined` (no biometrics item yet).

- [ ] **Step 3: Add the import** to `lib/checklist/generator.ts` after the `AU_HEALTH_BIOMETRIC_FACTS` import (:12). Replace:

```ts
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
```

with:

```ts
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
```

- [ ] **Step 4: Add the biometrics consts** after the `MEDICAL_NOTE` const (:75). Replace:

```ts
const MEDICAL_NOTE =
  `DHA may request a health examination as part of your application. ${HEALTH_EXAM_PROCESS} ` +
  `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit} — ${HEALTH_EXAM_UNDERTAKING}`;
```

with:

```ts
const MEDICAL_NOTE =
  `DHA may request a health examination as part of your application. ${HEALTH_EXAM_PROCESS} ` +
  `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit} — ${HEALTH_EXAM_UNDERTAKING}`;

const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
// Participation framed from C.123 (boolean — stated, not interpolated); the fee value +
// the item SourceLine come from C.127 (the most concrete/falsifiable claim — see the guard below).
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
const BIOMETRICS_NOTE =
  `Nepal takes part in Australia's biometrics program, so you'll give biometrics as part of your visa application. ` +
  `Expect a VFS Global collection fee of about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} at the Kathmandu centre. ` +
  `${BIOMETRICS_LETTER.summary}`;
```

- [ ] **Step 5: Add the biometrics item** after the `medical` item, before `return items;` (:225-227). Replace:

```ts
  add({
    key: "medical", kind: "medical", label: "Panel medical exam",
    group: "visa", stage: "after-offer", requirement: "required",
    note: MEDICAL_NOTE,
    source: { url: HEALTH_EXAM_SOURCE.source, lastVerified: HEALTH_EXAM_SOURCE.lastVerified },
  });

  return items;
```

with:

```ts
  add({
    key: "medical", kind: "medical", label: "Panel medical exam",
    group: "visa", stage: "after-offer", requirement: "required",
    note: MEDICAL_NOTE,
    source: { url: HEALTH_EXAM_SOURCE.source, lastVerified: HEALTH_EXAM_SOURCE.lastVerified },
  });
  add({
    key: "biometrics",
    kind: null,
    label: "Biometrics letter",
    group: "visa",
    stage: "after-offer",
    requirement: "required",
    note: BIOMETRICS_NOTE,
    // SOURCE-DISPLAY GUARD: the note carries three claims from two modules, but the
    // SourceLine shows one URL — point it at the most concrete/falsifiable claim, the
    // C.127 VFS Kathmandu fee/biometrics page, NOT A.031's Immi App page. A.031 stays
    // reconcile-backed via AU_BIOMETRICS (findingRefs), independent of the rendered URL.
    source: { url: BIOMETRICS_FEE.source, lastVerified: BIOMETRICS_FEE.lastVerified },
  });

  return items;
```

> **Rendered note:** "Nepal takes part in Australia's biometrics program, so you'll give biometrics as part of your visa application. Expect a VFS Global collection fee of about NPR 2,365 at the Kathmandu centre. After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'."

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "biometrics info item"`
Expected: **PASS**.

- [ ] **Step 7: Full checklist suite (no regression)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: **PASS** (the "places all visa documents in the after-offer stage" case checks only the four named keys, not `biometrics`).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean. (`Number(BIOMETRICS_FEE.value)` resolves the `number | boolean` union cleanly.)

- [ ] **Step 9: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -F - << 'EOF'
feat(checklist): add the after-offer biometrics info item (A.031 + reuse C.123/C.127)

New kind:null "Biometrics letter" item in the visa group: Nepal's inclusion in the
biometrics program (C.123, framing), the VFS Kathmandu collection fee (C.127, NPR
2,365), and the Immi App "AUI" biometrics letter (A.031). Source-display guard — the
SourceLine points at the C.127 fee/biometrics page (the most concrete claim), not
A.031; A.031 stays reconcile-backed via the module. No C churn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Plan consumption

**Files:** `lib/plan/generator.ts:11,44,200`, `tests/plan/generator.test.ts` (append two `it`s).

- [ ] **Step 1: Write the failing tests**

Append inside `describe("generatePlan", …)`, after the last `it` (the prepare-health-exam "does not add" case), before the closing `});`. Anchor:

```ts
  it("does not add the prepare-health-exam item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-health-exam")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-health-exam")).toBe(false);
  });
});
```

Replace with:

```ts
  it("does not add the prepare-health-exam item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-health-exam")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-health-exam")).toBe(false);
  });

  it("adds the prepare-biometrics item for an Australian primary destination (A.031 + reuse C.123/C.127)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const bio = items.find((i) => i.kind === "prepare-biometrics");
    expect(bio).toBeTruthy();
    expect(bio?.impact).toBe("medium");
    expect(bio?.title).toContain("biometrics");
    expect(bio?.body).toContain("AUI");
    expect(bio?.body).toMatch(/2[,.]?365/); // locale-tolerant fee assertion
  });

  it("does not add the prepare-biometrics item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "prepare-biometrics")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "prepare-biometrics")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `npx vitest run tests/plan/generator.test.ts -t "prepare-biometrics"`
Expected: the "adds…" case **FAILS** (`bio` is `undefined`); the "does not add…" case passes vacuously.

- [ ] **Step 3: Add the import** to `lib/plan/generator.ts` after the `AU_HEALTH_BIOMETRIC_FACTS` import (:11). Replace:

```ts
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
```

with:

```ts
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
```

- [ ] **Step 4: Add the biometrics consts** after the `HEALTH_EXAM_VALIDITY` const (:44). Replace:

```ts
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092
```

with:

```ts
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092
const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
```

- [ ] **Step 5: Add the gated plan item** immediately after the `prepare-health-exam` block, before `// WORK + CAREER` (:197-202). Replace:

```ts
        `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit}, so arrange it early — don't let it hold up your application.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // WORK + CAREER
```

with:

```ts
        `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit}, so arrange it early — don't let it hold up your application.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // DHA BIOMETRICS readiness (after lodgement) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "prepare-biometrics",
      impact: "medium",
      title: "Prepare for biometrics after you lodge",
      body:
        // participation framed from C.123; fee from C.127; the AUI sentence is A.031 verbatim
        `Nepal is in Australia's biometrics program, so you'll give biometrics at a VFS Global centre as part of your visa ` +
        `(collection fee about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} in Kathmandu). ` +
        `${BIOMETRICS_LETTER.summary}`,
      timeEstimate: "After you lodge",
    });
  }

  // WORK + CAREER
```

> **Rendered body:** "Nepal is in Australia's biometrics program, so you'll give biometrics at a VFS Global centre as part of your visa (collection fee about NPR 2,365 in Kathmandu). After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'."

(The closing A.031 sentence is `BIOMETRICS_LETTER.summary` verbatim — byte-identical to the checklist note's last sentence, so the "AUI" rule cannot drift across surfaces.)

- [ ] **Step 6: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts -t "prepare-biometrics"`
Expected: **PASS** (both).

- [ ] **Step 7: Full plan suite (no regression)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: **PASS** — the "stable order" case uses `primaryDestinationId: null`, so `prepare-biometrics` is absent both calls.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -F - << 'EOF'
feat(plan): add the prepare-biometrics action (A.031 + reuse C.123/C.127)

New AU-primary-gated prepare-biometrics PlanItem ("Prepare for biometrics after you
lodge") composing Nepal's biometrics-program participation (C.123), the VFS Kathmandu
fee (C.127, NPR 2,365), and the Immi App "AUI" biometrics letter (A.031). The closing
A.031 sentence is shared verbatim with the checklist note (no cross-surface drift).
No C churn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Status + ledger

**Files:** `docs/PROJECT_STATUS.md`, regenerate `docs/research-briefs/findings-ledger.md`.

- [ ] **Step 1: Full suite for the authoritative test count**

Run: `npm test`
Expected: **all green**, ≈ **719 → 723** (+1 checklist, +2 plan, +1 registry-driven). Note the exact total for Step 3.

- [ ] **Step 2: Regenerate the ledger + confirm only A moved**

```bash
node docs/research-briefs/_tools/build-ledger.js
git diff docs/research-briefs/findings-ledger.md
```

Expected: overall `used` 390 → **391**, `pending` 724 → **723**; category **A** `used` 42 → **43**, `pending` 80 → **79**; clusters **41** (unchanged). The only finding-status move is A.031 `pending → used` — **no C-category row changes** (C.123 + C.127 already `used`; the `C` row total is unchanged). A.029 + A.030 stay `pending`.

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`**

First Read the file (the test-count header near the top + the slice-F bullet). Then:

(a) Change the test-count line to the **actual** count from Step 1 (keep "161 test files" unless `npm test` reports otherwise).

(b) Add this bullet immediately after the existing slice-F bullet:

```markdown
- **Ledger slice G — DHA biometrics readiness → checklist + plan (merged 2026-06-09).** Spec `docs/superpowers/specs/2026-06-09-ledger-slice-g-biometrics-design.md`, plan `docs/superpowers/plans/2026-06-09-ledger-slice-g-biometrics.md`. New single-record sourced module `lib/data/source/au-biometrics.ts` backs finding A.031 (after lodging, the Immi App requires the biometrics letter whose Visa Lodgement Number starts with "AUI"); `FLIP_STATUS` promoted it (overall used 390→391, pending 724→723; A 42→43; 0 rejected). A new after-offer `biometrics` checklist info item ("Biometrics letter") and a new AU-primary-gated `prepare-biometrics` plan action ("Prepare for biometrics after you lodge") compose A.031 with two structured facts reused read-only from `au-health-biometric-facts` — Nepal's inclusion in the biometrics program (C.123) and the VFS Kathmandu collection fee (C.127, NPR 2,365) — its first user-facing surface, with no C-category churn. Source-display guard: the checklist item's SourceLine points at the C.127 fee/biometrics page (vfsglobal.com), not A.031, since the visible note carries the fee. Four-state tagging: 1 used, 0 rejected/needs-human-call; A.029/A.030 (Kathmandu/Pokhara ABCC locations) stay use-later as contact/location data. No scorer touched (`financial.ts` + `funding-reliability.ts` untouched); `golden-assessments.json` byte-identical; reconcile/schema/flip-status green.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATUS.md docs/research-briefs/findings-ledger.md
git commit -F - << 'EOF'
docs(slice-g): record biometrics slice in status + ledger

PROJECT_STATUS slice-G bullet + test count; regenerate findings-ledger.md
(used 390→391, pending 724→723; A 42→43; clusters 41). C unchanged.

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
t = t.replace(/("id":"A\.031"[^\n]*?"value_status":)"prose-only"/, '$1"unset"');
fs.writeFileSync(p, t);
console.log('mutated A.031 value_status -> unset (status stays used)');
EOF
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **FAIL** with `USED_UNSET A.031`.

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
- **`git diff master...HEAD -- docs/research-briefs/findings/C.jsonl lib/data/source/au-health-biometric-facts.ts` → empty (NO C churn — C.123 + C.127 reused read-only).**
- `node docs/research-briefs/_tools/build-ledger.js` then `git status --porcelain docs/research-briefs/findings-ledger.md` → **no output** (ledger current).

- [ ] **Step 3: Confirm branch state**

Run: `git status -sb` then `git log --oneline master..HEAD`
Expected: only the WIP trio dirty; **7 commits** ahead — spec, spec review tweak, plan doc, sourced layer, checklist, plan, status+ledger.

- [ ] **Step 4: Fast-forward merge to master + push + delete branch**

```bash
git checkout master
git merge --ff-only ledger-slice-g-biometrics
git push
git branch -d ledger-slice-g-biometrics
git status -sb
```

Expected: `Fast-forward`; push shows the `X..Y master -> master` ref-update; branch deleted; `## master...origin/master` in sync. **Verify the push by the ref-update line + in-sync status, not the exit code** (PowerShell can spuriously report exit 255).

- [ ] **Step 5: Report at the merge**

Report: the 7 commits; four-state ledger (1 → `used`; 0 rejected / needs-human-call; A.029 + A.030 use-later; C.123 + C.127 reused, no C churn); the source-display guard held (checklist SourceLine = vfsglobal.com, asserted by test); goldens byte-identical + scorer untouched; suite green (N); ledger A 42→43 (overall 390→391), clusters 41; adversarial `USED_UNSET A.031` confirmed. Then **await the user's steer on the next slice** — do not start a new slice autonomously.

---

## Self-review (writing-plans)

**1. Spec coverage** — §4 module → Task 1 (1–3); §8 schema+registry → Task 1 (3–4); §7 finding edit → Task 1 (6–7); §5 checklist (new item + source guard, reuse C.123/C.127) → Task 2; §6 plan → Task 3; §2 ledger + C-reuse → Task 4; §9 testing + adversarial → Tasks 2/3 + Task 5 step 1; §10 gate (incl. C-untouched) → Task 5 step 2; §11 commit plan → the four code commits + merge. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has an expected result. The only non-hardcoded value is the PROJECT_STATUS test count (Task 4 step 3), read from actual `npm test` output.

**3. Type consistency** — `AuBiometrics` / `AU_BIOMETRICS` / `AuBiometricsSchema` / `recordLabel:"au-biometrics"` / `recordInterface:"AuBiometrics"` identical across types/module/schema/registry. The single `id` value `immi-app-biometrics-letter` matches interface literal ↔ schema enum ↔ record ↔ both generators' `.find()`. Item key `biometrics` and plan kind `prepare-biometrics` match generators ↔ tests. `BIOMETRICS_FEE` is the `AuHealthBiometricFact` C.127 record (`value:number|boolean`, `unit?:string`); `Number(BIOMETRICS_FEE.value).toLocaleString()` typechecks and renders "2,365". `BIOMETRICS_LETTER.summary` is shared verbatim by both surfaces. No const-name collisions with E's `CERTIFIED_COPIES`/`DOC_PREP_*` or F's `HEALTH_EXAM_*`/`MEDICAL_NOTE`.

**4. Token cross-check** — test assertions all appear verbatim in the composed strings/records: checklist — "biometrics program" ← BIOMETRICS_NOTE first clause; "NPR" + `/2[,.]?365/` ← `${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()}` (C.127 unit "NPR", value 2365); "AUI" ← BIOMETRICS_LETTER.summary; `source.url` "vfsglobal.com" ← C.127.source (`visa.vfsglobal.com/...`). Plan — "biometrics" ← title "Prepare for biometrics after you lodge"; "AUI" ← BIOMETRICS_LETTER.summary; `/2[,.]?365/` ← the fee interpolation. Item shape (`kind:null, status:"info", group:"visa", stage:"after-offer", requirement:"required", label:"Biometrics letter"`) matches the `add()` call in Task 2 step 5. Verified.
