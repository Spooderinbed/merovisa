# Ledger slice E — DHA document preparation (translation + certified copies) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire findings A.026–A.028 (translation rules) + A.041–A.042 (certified-copy rules) into the checklist + plan so the document surfaces state *how to make Nepali-language documents acceptable to DHA* — every phrase finding-backed, certification scoped to the named identity documents, no scorer touched.

**Architecture:** A new sourced data module (`lib/data/source/au-document-preparation.ts`, 5 records, `kind`-discriminated) is registered in the data registry, its findings flipped to `used` via the slice-kit; two server-side generators (`checklist`, `plan`) compose copy from it. Mirrors slices C/D. No client component, no scoring change. A.040 (plain passport copy), the apostille pair (A.092/A.093), and the Nepal-side verification/equivalence cluster stay `pending` (use-later).

**Tech Stack:** TypeScript (strict), Zod, vitest 4.1.8, the slice-kit reconcile harness (`docs/research-briefs/_tools/`).

---

## Pre-flight (already done — do NOT redo)

- Branch `ledger-slice-e-document-preparation` exists and is checked out.
- Spec committed: `8e011d9` + label tweak `630eb17`.
- This plan doc is committed on the branch ahead of the code commits.

## Standing rules (every task)

- **Run commands via the Bash tool** (bash) — `FLIP_STATUS=1 npx …` and `node << 'EOF'` heredocs assume bash.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Use explicit `git add <paths>`, **never** `git add -A`.
- **Every commit** ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never hand-edit `status`** in `A.jsonl` — `FLIP_STATUS` derives it. **A.040 stays `pending`** (use-later) — do not touch it.
- Both generators **already define** a private `oxfordAnd` — **reuse it; do not add a second copy** (would be a duplicate-identifier compile error).
- LF→CRLF git warnings on new files are benign (Windows normalization).

## File structure (what each touched file is responsible for)

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify (after :703) | Add `AuDocumentPreparation` record interface |
| `lib/data/source/au-document-preparation.ts` | Create | The 5 sourced records + provenance |
| `lib/data/schema/au-document-preparation.schema.ts` | Create | Zod runtime guard for the module |
| `lib/data/schema/registry.ts` | Modify (imports :74 + 1 entry :593) | Register the module so `tests/data/` covers it |
| `docs/research-briefs/findings/A.jsonl` | Modify (5 lines) | `value_status:"prose-only"` then `FLIP_STATUS`-derived `status:"used"` |
| `lib/checklist/generator.ts` | Modify | New identity `doc-preparation` info item (reuse `oxfordAnd`) |
| `tests/checklist/generator.test.ts` | Modify (+1 test) | Assert the new item |
| `lib/plan/generator.ts` | Modify | New `translate-certify-documents` action (reuse `oxfordAnd`) |
| `tests/plan/generator.test.ts` | Modify (+2 tests) | Assert present/absent gating |
| `docs/PROJECT_STATUS.md` | Modify | Test count + slice-E bullet |
| `docs/research-briefs/findings-ledger.md` | Regenerate | `build-ledger.js` snapshot |

---

## Task 1: Sourced data layer

**Files:**
- Modify: `lib/data/types.ts:703`
- Create: `lib/data/source/au-document-preparation.ts`
- Create: `lib/data/schema/au-document-preparation.schema.ts`
- Modify: `lib/data/schema/registry.ts:74,593`
- Modify: `docs/research-briefs/findings/A.jsonl` (A.026–A.028, A.041, A.042)

- [ ] **Step 1: Add the `AuDocumentPreparation` interface to `lib/data/types.ts`**

Anchor on the end of the `NepalNocJourney` interface (its `// canonical MoEST URL` comment is unique). Replace:

```ts
  source: string; // canonical MoEST URL
  lastVerified?: string; // ISO date
}
```

with:

```ts
  source: string; // canonical MoEST URL
  lastVerified?: string; // ISO date
}

/**
 * DHA document-preparation rules for Nepal→Australia applicants (logistics category
 * A). How Nepali-language documents are made acceptable to DHA: three translation
 * rules (translate non-English documents, submit original + translation, list an
 * overseas translator's details) and two certified-copy rules (birth certificate,
 * national identity card). Distinguished by `kind`. `summary` is the phrase the
 * plan/checklist render — translation-rule summaries are full sentences; certified-copy
 * summaries are bare document nouns so the generators frame them as "certified copies
 * of some identity documents, including …" (certification stays scoped to those named
 * documents). Fact-only — no scorer reads it; machine-checked against A.026–A.028,
 * A.041–A.042.
 */
export interface AuDocumentPreparation extends Provenanced {
  id:
    | "translate-non-english"
    | "submit-original-and-translation"
    | "overseas-translator-details"
    | "certified-copy-birth-certificate"
    | "certified-copy-national-id";
  kind: "translation-rule" | "certified-copy";
  label: string; // short, for the checklist item
  summary: string; // translation-rule = full sentence; certified-copy = bare document noun
  source: string; // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create `lib/data/source/au-document-preparation.ts`**

```ts
import type { AuDocumentPreparation } from "@/lib/data/types";

/**
 * DHA document-preparation rules (logistics category A) for making Nepali-language
 * documents acceptable to an Australian student-visa application. Three translation
 * rules (A.026–A.028) and two certified-copy rules (A.041–A.042), consumed by the
 * checklist + plan generators. Fact-only — no scorer reads it; machine-checked against
 * findings A.026–A.028, A.041–A.042 (see provenance.findingRefs).
 *
 * `translation-rule` summaries are standalone sentences (joined by a space).
 * `certified-copy` summaries are bare document nouns so the generators can frame them
 * as "certified copies of some identity documents, including your …" — keeping
 * certification scoped to those named identity documents rather than implying every
 * translated document must be certified.
 */
const DHA_POPULAR = "https://immi.homeaffairs.gov.au/help-support/popular-questions";
const DHA_VISITOR = "https://immi.homeaffairs.gov.au/check-twice-submit-once/visitor-visa";
const DHA_EVIDENTIARY = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";

export const AU_DOCUMENT_PREPARATION: AuDocumentPreparation[] = [
  {
    id: "translate-non-english",
    kind: "translation-rule",
    label: "Translate non-English documents",
    summary: "Any document not in English must be translated into English.",
    source: DHA_POPULAR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.026"],
      source: DHA_POPULAR,
      note: "DHA popular-questions page: all documents not in English must be translated into English.",
    },
  },
  {
    id: "submit-original-and-translation",
    kind: "translation-rule",
    label: "Original + translation",
    summary: "Submit both the original document and its English translation.",
    source: DHA_POPULAR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.027"],
      source: DHA_POPULAR,
      note: "DHA popular-questions page: both the original non-English document and the translation must be submitted.",
    },
  },
  {
    id: "overseas-translator-details",
    kind: "translation-rule",
    label: "Overseas translator details",
    summary:
      "If your translator is outside Australia, include their full name, address, phone number, and qualifications.",
    source: DHA_VISITOR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.028"],
      source: DHA_VISITOR,
      note: "DHA visa-document guidance: a translator outside Australia must provide full name, address, phone number, and qualifications in the source language.",
    },
  },
  {
    id: "certified-copy-birth-certificate",
    kind: "certified-copy",
    label: "Certified birth certificate",
    summary: "birth certificate",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.041"],
      source: DHA_EVIDENTIARY,
      note: "DHA student-document checklist: include a certified copy of your birth certificate where you have one.",
    },
  },
  {
    id: "certified-copy-national-id",
    kind: "certified-copy",
    label: "Certified national ID",
    summary: "national identity card",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.042"],
      source: DHA_EVIDENTIARY,
      note: "DHA student-document checklist: include a certified copy of your national identity card where you have one.",
    },
  },
];
```

- [ ] **Step 3: Create `lib/data/schema/au-document-preparation.schema.ts`**

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-document-preparation.ts. Guards the id + kind
 * enums, non-empty label/summary, the http(s) source, ISO lastVerified, unique ids,
 * and provenance (>=1 findingRef).
 */
const AuDocumentPreparationRecordSchema = z.object({
  id: z.enum([
    "translate-non-english",
    "submit-original-and-translation",
    "overseas-translator-details",
    "certified-copy-birth-certificate",
    "certified-copy-national-id",
  ]),
  kind: z.enum(["translation-rule", "certified-copy"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const AuDocumentPreparationSchema = z
  .array(AuDocumentPreparationRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "AU document-preparation ids must be unique",
  });
```

- [ ] **Step 4: Register the module in `lib/data/schema/registry.ts`**

(a) Add the import pair after the `NEPAL_NOC_JOURNEY` imports (:73-74). Replace:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { NepalNocJourneySchema } from "@/lib/data/schema/nepal-noc-journey.schema";
```

with:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { NepalNocJourneySchema } from "@/lib/data/schema/nepal-noc-journey.schema";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AuDocumentPreparationSchema } from "@/lib/data/schema/au-document-preparation.schema";
```

(b) Append the entry after the `NEPAL_NOC_JOURNEY` entry (the last one, ending :593 before the `];` at :594). Replace:

```ts
    recordLabel: "nepal-noc-journey",
    subRecordKeys: [],
    recordInterface: "NepalNocJourney",
  },
];
```

with:

```ts
    recordLabel: "nepal-noc-journey",
    subRecordKeys: [],
    recordInterface: "NepalNocJourney",
  },
  {
    // Slice E — DHA document-preparation rules (logistics category A). How Nepali-
    // language documents are made acceptable to DHA: three translation rules
    // (A.026–A.028) and two certified-copy rules (A.041–A.042), consumed by the plan
    // + checklist generators. Fact-only: no scorer reads it.
    category: "A",
    exportName: "AU_DOCUMENT_PREPARATION",
    data: AU_DOCUMENT_PREPARATION,
    schema: AuDocumentPreparationSchema,
    recordLabel: "au-document-preparation",
    subRecordKeys: [],
    recordInterface: "AuDocumentPreparation",
  },
];
```

- [ ] **Step 5: Run reconcile to verify it fails for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: **FAIL** with `REF_NOT_USED au-document-preparation[translate-non-english] -> A.026 (status=pending)` (and the same for A.027, A.028, A.041, A.042). This proves the new module's findingRefs are detected but the findings are not yet `used`.

- [ ] **Step 6: Set `value_status:"prose-only"` on the five findings (EOL-safe, target lines only)**

Run:

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/A.jsonl';
let t = fs.readFileSync(p, 'utf8');
for (const id of ['A.026','A.027','A.028','A.041','A.042']) {
  const re = new RegExp('("id":"' + id.replace('.', '\\.') + '"[^\\n]*?"value_status":)"unset"');
  if (!re.test(t)) throw new Error('no unset match for ' + id);
  t = t.replace(re, '$1"prose-only"');
}
fs.writeFileSync(p, t);
console.log('set prose-only on A.026,A.027,A.028,A.041,A.042');
EOF
```

Expected: prints `set prose-only on A.026,A.027,A.028,A.041,A.042`. (The non-greedy `[^\n]*?` keeps each match on its own line and changes only the `value_status` field; `dup_group`/`cluster` and every EOL stay untouched. The literal `"value_status":` token will not match the earlier `"status":` field. **A.040 is not in the list and stays `unset`/`pending`.**)

- [ ] **Step 7: Derive `status:"used"` via flip-status (never hand-edited)**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
Expected: **PASS**; A.026–A.028, A.041, A.042 now carry `status:"used"` + `used_by` (`au-document-preparation[<id>]`).

- [ ] **Step 8: Confirm the A.jsonl diff touched only the five findings**

Run: `git diff --stat docs/research-briefs/findings/A.jsonl` then `git diff docs/research-briefs/findings/A.jsonl`
Expected: `--stat` shows **5 insertions(+) / 5 deletions(-)**; each changed line is one of A.026/A.027/A.028/A.041/A.042 and now has `"status":"used"`, a `"used_by"`, and `"value_status":"prose-only"`. **A.040 must be unchanged (`status:"pending"`).** No other finding changed.

- [ ] **Step 9: Run the full data suite to verify GREEN**

Run: `npx vitest run tests/data/`
Expected: **PASS** — reconcile clean (`used` +5, 0 orphans, 0 drift, 0 open-conflict-uses), schema parses, flip-status normal-mode clean, findings-integrity + registry-integrity green.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/au-document-preparation.ts lib/data/schema/au-document-preparation.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/A.jsonl
git commit -F - << 'EOF'
feat(data): source the DHA document-preparation rules (A.026-A.028, A.041-A.042)

New AuDocumentPreparation module + Zod schema + registry entry: three translation
rules (translate non-English documents, submit original + translation, overseas-
translator details) and two certified-copy rules (birth certificate, national
identity card). value_status:"prose-only" + FLIP_STATUS derives status:"used".
A.040 (plain passport copy) + apostille / Nepal-side verification stay pending
(use-later). No scorer reads it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Checklist consumption

**Files:**
- Modify: `lib/checklist/generator.ts:8,56,73`
- Test: `tests/checklist/generator.test.ts` (append one `it`)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("generateChecklist", …)` block (after the last `it`, before the closing `});`):

```ts
  it("adds the document-preparation info item with translation + scoped certified-copy guidance (A.026–A.028, A.041–A.042)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const prep = byKey(items, "doc-preparation");
    expect(prep).toMatchObject({
      kind: null, status: "info", group: "identity", stage: "now", requirement: "required",
      label: "Translations & certified copies",
    });
    expect(prep?.note).toContain("translated into English");
    expect(prep?.note).toContain("outside Australia");
    expect(prep?.note).toContain("certified copies of some identity documents");
    expect(prep?.source?.url).toContain("immi.homeaffairs.gov.au");
  });
```

- [ ] **Step 2: Run it to verify it fails (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "document-preparation"`
Expected: **FAIL** — `byKey(items, "doc-preparation")` is `undefined`, so `toMatchObject` throws.

- [ ] **Step 3: Add the import** to `lib/checklist/generator.ts` after the `NEPAL_NOC_JOURNEY` import (:8). Replace:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
```

with:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
```

- [ ] **Step 4: Add the doc-preparation consts** after the `NOC_NOTE` const closes (:56). The existing `oxfordAnd` (:43) is reused — **do not redefine it**. Replace:

```ts
const NOC_NOTE =
  "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, " +
  "and your bank needs it before releasing tuition or living expenses. " +
  `The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ${NOC_STEPS}`;
```

with:

```ts
const NOC_NOTE =
  "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, " +
  "and your bank needs it before releasing tuition or living expenses. " +
  `The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ${NOC_STEPS}`;

const DOC_PREP = AU_DOCUMENT_PREPARATION;
const DOC_PREP_PRIMARY = DOC_PREP.find((r) => r.id === "translate-non-english")!; // DHA popular-questions → item source
const TRANSLATION_RULES = DOC_PREP.filter((r) => r.kind === "translation-rule").map((r) => r.summary).join(" ");
const CERTIFIED_COPIES = DOC_PREP.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
const DOC_PREP_NOTE =
  `${TRANSLATION_RULES} DHA also asks for certified copies of some identity documents, ` +
  `including your ${oxfordAnd(CERTIFIED_COPIES)}.`;
```

- [ ] **Step 5: Add the item** in the IDENTITY group, immediately after the `birth-certificate` item (:73). Replace:

```ts
  add({ key: "birth-certificate", kind: "birth-certificate", label: "Birth certificate", group: "identity", stage: "now", requirement: "recommended" });
```

with:

```ts
  add({ key: "birth-certificate", kind: "birth-certificate", label: "Birth certificate", group: "identity", stage: "now", requirement: "recommended" });
  add({
    key: "doc-preparation",
    kind: null,
    label: "Translations & certified copies",
    group: "identity",
    stage: "now",
    requirement: "required",
    note: DOC_PREP_NOTE,
    source: { url: DOC_PREP_PRIMARY.source, lastVerified: DOC_PREP_PRIMARY.lastVerified },
  });
```

(`add()` sets `status` via `statusFor(kind, …)`; `kind:null` → `"info"`. Placing it right after `birth-certificate` reads as guidance attached to the identity documents it most concerns. Unconditional — every Nepal→AU applicant has non-English documents.)

> **Rendered note:** "Any document not in English must be translated into English. Submit both the original document and its English translation. If your translator is outside Australia, include their full name, address, phone number, and qualifications. DHA also asks for certified copies of some identity documents, including your birth certificate and national identity card."

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "document-preparation"`
Expected: **PASS**.

- [ ] **Step 7: Run the full checklist suite (no regression)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: **PASS** (all cases — the identity-group assertions in other cases target specific keys like `passport`/`national-id`, so the new item doesn't break them).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -F - << 'EOF'
feat(checklist): add the DHA document-preparation info item (A.026-A.028, A.041-A.042)

A new identity-group info item ("Translations & certified copies") composing the DHA
translation rules from AU_DOCUMENT_PREPARATION plus scoped certified-copy guidance
("certified copies of some identity documents, including your birth certificate and
national identity card"), placed right after the birth certificate. Sourced to DHA.
Certification stays scoped to the named identity documents.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Plan consumption

**Files:**
- Modify: `lib/plan/generator.ts:8,38,167`
- Test: `tests/plan/generator.test.ts` (append two `it`s)

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("generatePlan", …)` block (before the closing `});`):

```ts
  it("adds the translate-and-certify item for an Australian primary destination (A.026–A.028, A.041–A.042)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const prep = items.find((i) => i.kind === "translate-certify-documents");
    expect(prep).toBeTruthy();
    expect(prep?.impact).toBe("medium");
    expect(prep?.title).toContain("Translate");
    expect(prep?.body).toContain("outside Australia");
    expect(prep?.body).toContain("certified copies of some identity documents");
  });

  it("does not add the translate-and-certify item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "translate-certify-documents")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "translate-certify-documents")).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `npx vitest run tests/plan/generator.test.ts -t "translate-and-certify"`
Expected: the "adds…" case **FAILS** (`prep` is `undefined`); the "does not add…" case passes vacuously (item never exists yet).

- [ ] **Step 3: Add the import** to `lib/plan/generator.ts` after the `NEPAL_NOC_JOURNEY` import (:8). Replace:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
```

with:

```ts
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
```

- [ ] **Step 4: Add the `CERTIFIED_COPIES` const** after the `NOC_STEPS` const (:38). The existing `oxfordAnd` (:28) is reused — **do not redefine it**. Replace:

```ts
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
```

with:

```ts
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
const CERTIFIED_COPIES = AU_DOCUMENT_PREPARATION.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
```

- [ ] **Step 5: Add the gated plan item** immediately after the NOC block, before `// WORK + CAREER` (:167-169). Replace:

```ts
      timeEstimate: "1-2 weeks",
    });
  }

  // WORK + CAREER
```

with:

```ts
      timeEstimate: "1-2 weeks",
    });
  }

  // DHA DOCUMENT PREPARATION (translation + certified copies) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "translate-certify-documents",
      impact: "medium",
      title: "Translate and certify your documents",
      body:
        `Translate any non-English document into English and keep both the original and translation. ` +
        `If your translator is outside Australia, include their details. ` +
        `DHA also asks for certified copies of some identity documents, including your ${oxfordAnd(CERTIFIED_COPIES)}.`,
      timeEstimate: "1 week",
    });
  }

  // WORK + CAREER
```

> **Rendered body:** "Translate any non-English document into English and keep both the original and translation. If your translator is outside Australia, include their details. DHA also asks for certified copies of some identity documents, including your birth certificate and national identity card."

- [ ] **Step 6: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts -t "translate-and-certify"`
Expected: **PASS** (both).

- [ ] **Step 7: Run the full plan suite (no regression)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: **PASS** — the existing item-specific cases assert only their own kinds; the "stable order" case uses `primaryDestinationId: null` so `translate-certify-documents` is absent both calls.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -F - << 'EOF'
feat(plan): add the translate-and-certify action (A.026-A.028, A.041-A.042)

New translate-certify-documents PlanItem composing the DHA document-preparation
rules from AU_DOCUMENT_PREPARATION, gated on an Australian primary destination
(mirrors the GS/NOC items). Certification scoped to the named identity documents,
not every translated document.

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
Expected: **all green**. Note the exact `Tests  N passed (N)` total — it should be the prior 711 plus the 3 new cases plus any registry-driven parametrized additions (≈714–715). Use the **actual** number in Step 3; do not guess.

- [ ] **Step 2: Regenerate the ledger**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Then: `git diff docs/research-briefs/findings-ledger.md`
Expected: overall `used` 381 → **386**, `pending` 733 → **728**; category **A** `used` 33 → **38**, `pending` 89 → **84**; clusters **41** (unchanged); the only finding-status moves are A.026/A.027/A.028/A.041/A.042 `pending → used` (A.040 stays `pending`).

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`**

First Read the file (the header line with the test count near the top, and the data-integration section where the slice-A/B/C/D bullets live). Then:

(a) Change the test-count figure (currently "711 passing across 161 test files") to the **actual** count from Step 1, keeping "161 test files" unless `npm test` reports a different file count.

(b) Add this bullet immediately after the existing slice-D bullet:

```markdown
- **Ledger slice E (DHA document preparation):** new `lib/data/source/au-document-preparation.ts` (5 records) wires findings A.026–A.028 (translation rules: translate non-English documents, submit original + translation, overseas-translator details) and A.041–A.042 (certified copies of birth certificate + national identity card) into the checklist (new identity-group `doc-preparation` info item, "Translations & certified copies") and the plan (new `translate-certify-documents` action, AU-primary gated). Certification scoped to the named identity documents. Ledger: overall used 381→386 / pending 733→728; A 33→38. A.040 (plain passport copy) + the apostille / Nepal-side verification cluster remain use-later by slice boundary. No scorer touched.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATUS.md docs/research-briefs/findings-ledger.md
git commit -F - << 'EOF'
docs(slice-e): record document-preparation slice in status + ledger

PROJECT_STATUS slice-E bullet + test count; regenerate findings-ledger.md
(used 381→386, pending 733→728; A 33→38; clusters 41).

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
const p = 'docs/research-briefs/findings/A.jsonl';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(/("id":"A\.041"[^\n]*?"value_status":)"prose-only"/, '$1"unset"');
fs.writeFileSync(p, t);
console.log('mutated A.041 value_status -> unset (status stays used)');
EOF
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **FAIL** with `USED_UNSET A.041`.

Then restore and re-verify:

```bash
git checkout -- docs/research-briefs/findings/A.jsonl
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
git merge --ff-only ledger-slice-e-document-preparation
git push
git branch -d ledger-slice-e-document-preparation
git status -sb
```

Expected: `Fast-forward`; push shows the `X..Y master -> master` ref-update; branch deleted; `## master...origin/master` in sync (only the WIP trio dirty). **Verify the push by the ref-update line + in-sync status, not the exit code** (PowerShell push can spuriously report exit 255).

- [ ] **Step 5: Report at the merge**

Report: the 7 commits; four-state ledger (5 → `used`; 0 rejected / needs-human-call in scope; A.040 + apostille + Nepal-side verification use-later); goldens byte-identical + scorer untouched; suite green (N); ledger A 33→38 (overall 381→386), clusters 41; adversarial `USED_UNSET` confirmed. Then **await the user's steer on the next slice** — do not start a new slice autonomously.

---

## Self-review (writing-plans)

**1. Spec coverage** — every spec section maps to a task: §4 module → Task 1 (steps 1–3); §8 schema+registry → Task 1 (steps 3–4); §7 finding edits → Task 1 (steps 6–7); §5 checklist → Task 2; §6 plan → Task 3; §2 ledger math → Task 4; §9 testing (incl. adversarial) → Tasks 2/3 + Task 5 step 1; §10 verification gate → Task 5 step 2; §11 commit plan → the four code commits + merge. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has an expected result. The only deliberately non-hardcoded value is the PROJECT_STATUS test count (Task 4 step 3), which *must* be read from the actual `npm test` output — instruction is explicit, not a placeholder.

**3. Type consistency** — `AuDocumentPreparation` (interface), `AU_DOCUMENT_PREPARATION` (export), `AuDocumentPreparationSchema` (schema), `recordLabel:"au-document-preparation"`, `recordInterface:"AuDocumentPreparation"` are identical across types/module/schema/registry. The 5 `id` values match between the interface union, the schema enum, and the module records. `kind` values (`translation-rule`/`certified-copy`) match between the interface, the schema enum, the module records, and the generator filters. Item key `doc-preparation` and plan kind `translate-certify-documents` match between generators and tests. `oxfordAnd` is **already defined** in both generators (checklist :43, plan :28) — reused, not redefined (the plan explicitly forbids a second copy). Consistent.

**4. Token cross-check** — the test assertions ("translated into English", "outside Australia", "certified copies of some identity documents", "Translate", "immi.homeaffairs.gov.au") all appear verbatim in the composed `DOC_PREP_NOTE` / plan body / record summaries+sources defined in Tasks 1–3. The checklist note's "translated into English" comes from the A.026 summary; "outside Australia" from A.028; "certified copies of some identity documents" from the generator framing string; the source host from `DHA_POPULAR`. Verified.
