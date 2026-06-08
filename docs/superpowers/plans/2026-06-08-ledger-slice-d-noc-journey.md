# Ledger slice D — MoEST NOC document journey — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire findings B.017–B.024 (the MoEST NOC application journey — six required documents + two process steps) into the checklist + plan so the surfaces answer *"how do I get the NOC?"* — every phrase finding-backed, no scorer touched.

**Architecture:** A new sourced data module (`lib/data/source/nepal-noc-journey.ts`, 8 records, `kind`-discriminated) is registered in the data registry, its findings flipped to `used` via the slice-kit; two server-side generators (`checklist`, `plan`) compose copy from it. Mirrors slice C (`nepal-source-of-funds.ts`) exactly. No client component, no scoring change. B.025–B.026 (NOC portal contacts) stay `pending` (use-later).

**Tech Stack:** TypeScript (strict), Zod, vitest 4.1.8, the slice-kit reconcile harness (`docs/research-briefs/_tools/`).

---

## Pre-flight (already done — do NOT redo)

- Branch `ledger-slice-d-noc-journey` exists and is checked out.
- Spec committed: `3eed72d` + copy tweak `b12f167`.
- This plan doc is committed on the branch ahead of the code commits.

## Standing rules (every task)

- **Run commands via the Bash tool** (bash) — `FLIP_STATUS=1 npx …` and `node << 'EOF'` heredocs assume bash.
- **Never stage the WIP trio:** `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`. Use explicit `git add <paths>`, **never** `git add -A`.
- **Every commit** ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never hand-edit `status`** in `B.jsonl` — `FLIP_STATUS` derives it. **B.025–B.026 stay `pending`** (use-later) — do not touch them.
- LF→CRLF git warnings on new files are benign (Windows normalization).

## File structure (what each touched file is responsible for)

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/data/types.ts` | Modify (after :678) | Add `NepalNocJourney` record interface |
| `lib/data/source/nepal-noc-journey.ts` | Create | The 8 sourced records + provenance |
| `lib/data/schema/nepal-noc-journey.schema.ts` | Create | Zod runtime guard for the module |
| `lib/data/schema/registry.ts` | Modify (imports :72 + 1 entry :577) | Register the module so `tests/data/` covers it |
| `docs/research-briefs/findings/B.jsonl` | Modify (8 lines) | `value_status:"prose-only"` then `FLIP_STATUS`-derived `status:"used"` |
| `lib/checklist/generator.ts` | Modify | New after-offer `noc-application` visa info item + `oxfordAnd` |
| `tests/checklist/generator.test.ts` | Modify (+1 test) | Assert the new item |
| `lib/plan/generator.ts` | Modify | New `apply-for-noc` action + `oxfordAnd` |
| `tests/plan/generator.test.ts` | Modify (+2 tests) | Assert present/absent gating |
| `docs/PROJECT_STATUS.md` | Modify | Test count + slice-D bullet |
| `docs/research-briefs/findings-ledger.md` | Regenerate | `build-ledger.js` snapshot |

---

## Task 1: Sourced data layer

**Files:**
- Modify: `lib/data/types.ts:678`
- Create: `lib/data/source/nepal-noc-journey.ts`
- Create: `lib/data/schema/nepal-noc-journey.schema.ts`
- Modify: `lib/data/schema/registry.ts:72,577`
- Modify: `docs/research-briefs/findings/B.jsonl` (B.017–B.024)

- [ ] **Step 1: Add the `NepalNocJourney` interface to `lib/data/types.ts`**

Anchor on the end of the `NepalSourceOfFunds` interface (its `// canonical NRB / MoEST URL` comment is unique). Replace:

```ts
  source: string; // canonical NRB / MoEST URL
  lastVerified?: string; // ISO date
}
```

with:

```ts
  source: string; // canonical NRB / MoEST URL
  lastVerified?: string; // ISO date
}

/**
 * The MoEST No Objection Certificate (NOC) application journey (finance category B).
 * The sequel to NepalSourceOfFunds: once the student knows the bank needs an NOC,
 * how to get one — the documents the MoEST portal requires and the two process steps
 * (online submission, in-person originals check). Distinguished by `kind`. `summary`
 * is the phrase the plan/checklist render; `label` is the short checklist label.
 * Fact-only — no scorer reads it; machine-checked against findings B.017–B.024.
 */
export interface NepalNocJourney extends Provenanced {
  id:
    | "noc-doc-citizenship"
    | "noc-doc-academic"
    | "noc-doc-guardian"
    | "noc-doc-previous"
    | "noc-doc-transcript"
    | "noc-doc-offer"
    | "noc-step-online"
    | "noc-step-visit";
  kind: "required-document" | "process-step";
  label: string; // short, for the checklist item
  summary: string; // full phrase rendered by plan/checklist
  source: string; // canonical MoEST URL
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create `lib/data/source/nepal-noc-journey.ts`**

```ts
import type { NepalNocJourney } from "@/lib/data/types";

/**
 * Nepal MoEST No Objection Certificate (NOC) application journey (finance category
 * B). The sequel to nepal-source-of-funds.ts: once the student knows the bank needs
 * an NOC, this is how to get one — the six documents the MoEST portal requires (a
 * citizenship certificate, an academic certificate, guardian citizenship, any
 * previous NOC, an academic transcript, and the admission/offer/I-20 letter) and the
 * two process steps (online submission, then an in-person visit with all originals
 * once the application is verified). Prose rules consumed by the plan + checklist
 * generators. Fact-only — no scorer reads it; machine-checked against findings
 * B.017–B.024 (see provenance.findingRefs).
 *
 * `required-document` summaries are article-first so they concatenate into an
 * Oxford-"and" list; `process-step` summaries are standalone sentences.
 */
const MOEST_NOC = "https://noc.moest.gov.np/";
const MOEST_NOC_LOGIN = "https://noc.moest.gov.np/login";
const MOEST_FAQ = "https://moest.gov.np/pages/faq/";

export const NEPAL_NOC_JOURNEY: NepalNocJourney[] = [
  {
    id: "noc-doc-citizenship",
    kind: "required-document",
    label: "Citizenship certificate",
    summary: "a citizenship certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.017"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists a citizenship certificate as a required document.",
    },
  },
  {
    id: "noc-doc-academic",
    kind: "required-document",
    label: "Academic certificate",
    summary: "an academic certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.018"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists an academic certificate as a required document.",
    },
  },
  {
    id: "noc-doc-guardian",
    kind: "required-document",
    label: "Guardian citizenship",
    summary: "your guardian's citizenship certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.019"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists guardian citizenship as a required document.",
    },
  },
  {
    id: "noc-doc-previous",
    kind: "required-document",
    label: "Previous NOC",
    summary: "any previous NOC you already hold",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.020"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists an old NOC as a required document when the applicant already has one.",
    },
  },
  {
    id: "noc-doc-transcript",
    kind: "required-document",
    label: "Academic transcript",
    summary: "an academic transcript of your +2, PCL, or equivalent",
    source: MOEST_NOC_LOGIN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.021"],
      source: MOEST_NOC_LOGIN,
      note: "MoEST NOC login page lists an academic transcript of +2, PCL, or equivalence as a required document.",
    },
  },
  {
    id: "noc-doc-offer",
    kind: "required-document",
    label: "Offer / I-20 letter",
    summary: "your admission, offer, acceptance, or I-20 letter",
    source: MOEST_NOC_LOGIN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.022"],
      source: MOEST_NOC_LOGIN,
      note: "MoEST NOC login page lists an admission, offer, acceptance, or I-20 letter as a required document.",
    },
  },
  {
    id: "noc-step-online",
    kind: "process-step",
    label: "Online submission",
    summary: "You can submit the foreign-study permit application online through the MoEST portal.",
    source: MOEST_FAQ,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.023"],
      source: MOEST_FAQ,
      note: "MoEST says foreign-study permit applications can be submitted online.",
    },
  },
  {
    id: "noc-step-visit",
    kind: "process-step",
    label: "In-person originals check",
    summary:
      "Once your application is verified, MoEST messages you a visit date and time; attend in person with all your original documents.",
    source: MOEST_FAQ,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.024"],
      source: MOEST_FAQ,
      note: "MoEST says applicants who receive a visit date/time message must attend with all original documents.",
    },
  },
];
```

- [ ] **Step 3: Create `lib/data/schema/nepal-noc-journey.schema.ts`**

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/nepal-noc-journey.ts. Guards the id + kind
 * enums, non-empty label/summary, the http(s) source, ISO lastVerified, unique ids,
 * and provenance (>=1 findingRef).
 */
const NepalNocJourneyRecordSchema = z.object({
  id: z.enum([
    "noc-doc-citizenship",
    "noc-doc-academic",
    "noc-doc-guardian",
    "noc-doc-previous",
    "noc-doc-transcript",
    "noc-doc-offer",
    "noc-step-online",
    "noc-step-visit",
  ]),
  kind: z.enum(["required-document", "process-step"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const NepalNocJourneySchema = z
  .array(NepalNocJourneyRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Nepal NOC journey ids must be unique",
  });
```

- [ ] **Step 4: Register the module in `lib/data/schema/registry.ts`**

(a) Add the import pair after the `NEPAL_SOURCE_OF_FUNDS` imports (:71-72). Replace:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NepalSourceOfFundsSchema } from "@/lib/data/schema/nepal-source-of-funds.schema";
```

with:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NepalSourceOfFundsSchema } from "@/lib/data/schema/nepal-source-of-funds.schema";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { NepalNocJourneySchema } from "@/lib/data/schema/nepal-noc-journey.schema";
```

(b) Append the entry after the `NEPAL_SOURCE_OF_FUNDS` entry (the last one, ending :577 before the `];` at :578). Replace:

```ts
    recordLabel: "nepal-source-of-funds",
    subRecordKeys: [],
    recordInterface: "NepalSourceOfFunds",
  },
];
```

with:

```ts
    recordLabel: "nepal-source-of-funds",
    subRecordKeys: [],
    recordInterface: "NepalSourceOfFunds",
  },
  {
    // Slice D — MoEST No Objection Certificate (NOC) application journey (finance
    // category B). The sequel to nepal-source-of-funds: the six documents the MoEST
    // portal requires + the two process steps (online submission, in-person originals
    // check). Prose rules backing findings B.017–B.024, consumed by the plan +
    // checklist generators. Fact-only: no scorer reads it.
    category: "B",
    exportName: "NEPAL_NOC_JOURNEY",
    data: NEPAL_NOC_JOURNEY,
    schema: NepalNocJourneySchema,
    recordLabel: "nepal-noc-journey",
    subRecordKeys: [],
    recordInterface: "NepalNocJourney",
  },
];
```

- [ ] **Step 5: Run reconcile to verify it fails for the right reason (RED)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: **FAIL** with `REF_NOT_USED nepal-noc-journey[noc-doc-citizenship] -> B.017 (status=pending)` (and the same for B.018–B.024). This proves the new module's findingRefs are detected but the findings are not yet `used`.

- [ ] **Step 6: Set `value_status:"prose-only"` on B.017–B.024 (EOL-safe, target lines only)**

Run:

```bash
node << 'EOF'
const fs = require('fs');
const p = 'docs/research-briefs/findings/B.jsonl';
let t = fs.readFileSync(p, 'utf8');
for (const id of ['B.017','B.018','B.019','B.020','B.021','B.022','B.023','B.024']) {
  const re = new RegExp('("id":"' + id.replace('.', '\\.') + '"[^\\n]*?"value_status":)"unset"');
  if (!re.test(t)) throw new Error('no unset match for ' + id);
  t = t.replace(re, '$1"prose-only"');
}
fs.writeFileSync(p, t);
console.log('set prose-only on B.017-B.024');
EOF
```

Expected: prints `set prose-only on B.017-B.024`. (The non-greedy `[^\n]*?` keeps each match on its own line and changes only the `value_status` field — `cluster_triage`/`dup_group` on the G13 lines B.017–B.020 and every EOL stay untouched. **B.025–B.026 are not in the list and stay `unset`/`pending`.**)

- [ ] **Step 7: Derive `status:"used"` via flip-status (never hand-edited)**

Run: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`
Expected: **PASS**; B.017–B.024 now carry `status:"used"` + `used_by` (`nepal-noc-journey[<id>]`).

- [ ] **Step 8: Confirm the B.jsonl diff touched only the eight findings**

Run: `git diff --stat docs/research-briefs/findings/B.jsonl` then `git diff docs/research-briefs/findings/B.jsonl`
Expected: `--stat` shows **8 insertions(+) / 8 deletions(-)**; each changed line is one of B.017–B.024 and now has `"status":"used"`, a `"used_by"`, and `"value_status":"prose-only"`. **B.025 and B.026 must be unchanged (`status:"pending"`).** No other finding changed.

- [ ] **Step 9: Run the full data suite to verify GREEN**

Run: `npx vitest run tests/data/`
Expected: **PASS** — reconcile clean (`used` +8, 0 orphans, 0 drift, 0 open-conflict-uses), schema parses, flip-status normal-mode clean, findings-integrity + registry-integrity green.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/nepal-noc-journey.ts lib/data/schema/nepal-noc-journey.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/B.jsonl
git commit -F - << 'EOF'
feat(data): source the MoEST NOC application journey (B.017–B.024)

New NepalNocJourney module + Zod schema + registry entry: the six documents the
MoEST portal requires for a No Objection Certificate (citizenship, academic
certificate, guardian citizenship, previous NOC, academic transcript, offer/I-20
letter) plus the two process steps (online submission, in-person originals
check). value_status:"prose-only" + FLIP_STATUS derives status:"used". B.025–B.026
(portal contacts) stay pending (use-later). No scorer reads it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Checklist consumption

**Files:**
- Modify: `lib/checklist/generator.ts:8,39,161`
- Test: `tests/checklist/generator.test.ts` (append one `it`)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("generateChecklist", …)` block (after the last `it`, before the closing `});`):

```ts
  it("adds the after-offer NOC application item with the MoEST documents + steps (B.017–B.024)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    const noc = byKey(items, "noc-application");
    expect(noc).toMatchObject({
      kind: null, status: "info", group: "visa", stage: "after-offer", requirement: "required",
      label: "No Objection Certificate (NOC)",
    });
    expect(noc?.note).toContain("No Objection Certificate");
    expect(noc?.note).toContain("academic transcript");
    expect(noc?.note).toContain("original documents");
    expect(noc?.source?.url).toContain("moest.gov.np");
  });
```

- [ ] **Step 2: Run it to verify it fails (RED)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "NOC application"`
Expected: **FAIL** — `byKey(items, "noc-application")` is `undefined`, so `toMatchObject` throws.

- [ ] **Step 3: Add the import** to `lib/checklist/generator.ts` after the `NEPAL_SOURCE_OF_FUNDS` import (:8). Replace:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
```

with:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
```

- [ ] **Step 4: Add the `oxfordAnd` helper + NOC consts** after the `SOF_REMITTANCE_NOTE` const (:39). Replace:

```ts
const SOF_REMITTANCE_NOTE =
  `${SOF_DEF.summary} Before releasing foreign currency, your bank requires ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ")}. ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ")}`;
```

with:

```ts
const SOF_REMITTANCE_NOTE =
  `${SOF_DEF.summary} Before releasing foreign currency, your bank requires ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ")}. ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ")}`;

/** Join phrases as "a, b, and c" (Oxford "and"). */
function oxfordAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}

const NOC_PRIMARY = NEPAL_NOC_JOURNEY.find((r) => r.id === "noc-doc-citizenship")!; // MoEST portal → item source
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
const NOC_NOTE =
  "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, " +
  "and your bank needs it before releasing tuition or living expenses. " +
  `The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ${NOC_STEPS}`;
```

- [ ] **Step 5: Add the item** in the VISA group, immediately after the `offer-letter` item (:161). Replace:

```ts
  add({ key: "offer-letter", kind: "offer-letter", label: "University offer letter", group: "visa", stage: "after-offer", requirement: "required", note: "Issued when a university accepts you." });
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["coe"]!.summary, source: reqSource("coe") });
```

with:

```ts
  add({ key: "offer-letter", kind: "offer-letter", label: "University offer letter", group: "visa", stage: "after-offer", requirement: "required", note: "Issued when a university accepts you." });
  add({
    key: "noc-application",
    kind: null,
    label: "No Objection Certificate (NOC)",
    group: "visa",
    stage: "after-offer",
    requirement: "required",
    note: NOC_NOTE,
    source: { url: NOC_PRIMARY.source, lastVerified: NOC_PRIMARY.lastVerified },
  });
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["coe"]!.summary, source: reqSource("coe") });
```

(`add()` sets `status` via `statusFor(kind, …)`; `kind:null` → `"info"`. The NOC needs the offer (B.022), so placing it right after `offer-letter` leads the after-offer sequence.)

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `npx vitest run tests/checklist/generator.test.ts -t "NOC application"`
Expected: **PASS**.

- [ ] **Step 7: Run the full checklist suite (no regression)**

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: **PASS** (all cases — the "places all visa documents in the after-offer stage" case checks only offer-letter/coe/oshc/medical, so the new item doesn't break it).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/checklist/generator.ts tests/checklist/generator.test.ts
git commit -F - << 'EOF'
feat(checklist): add the after-offer NOC application item (B.017–B.024)

A new visa-group info item ("No Objection Certificate (NOC)") composing the MoEST
NOC journey from NEPAL_NOC_JOURNEY — the required documents (Oxford-and joined)
and the two process steps — placed right after the offer letter. Sourced to MoEST.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Plan consumption

**Files:**
- Modify: `lib/plan/generator.ts:7,24,27,142`
- Test: `tests/plan/generator.test.ts` (append two `it`s)

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("generatePlan", …)` block (before the closing `});`):

```ts
  it("adds the apply-for-NOC item for an Australian primary destination (B.017–B.024)", () => {
    const items = generatePlan({ sections: {}, primaryDestinationId: "australia", matches: [], policy });
    const noc = items.find((i) => i.kind === "apply-for-noc");
    expect(noc).toBeTruthy();
    expect(noc?.impact).toBe("medium");
    expect(noc?.title).toContain("NOC");
    expect(noc?.body).toContain("academic transcript");
    expect(noc?.body).toContain("original documents");
    expect(noc?.body).toContain("MoEST");
  });

  it("does not add the apply-for-NOC item for a non-AU or unset destination", () => {
    const none = generatePlan({ sections: {}, primaryDestinationId: null, matches: [], policy });
    expect(none.some((i) => i.kind === "apply-for-noc")).toBe(false);
    const canada = generatePlan({ sections: {}, primaryDestinationId: "canada", matches: [], policy });
    expect(canada.some((i) => i.kind === "apply-for-noc")).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `npx vitest run tests/plan/generator.test.ts -t "apply-for-NOC"`
Expected: the "adds…" case **FAILS** (`noc` is `undefined`); the "does not add…" case passes vacuously (item never exists yet).

- [ ] **Step 3: Add the import** to `lib/plan/generator.ts` after the `NEPAL_SOURCE_OF_FUNDS` import (:7). Replace:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
```

with:

```ts
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
```

- [ ] **Step 4: Add the `oxfordAnd` helper** after the `oxfordOr` function closes (:24). Replace:

```ts
  return `${items.slice(0, -1).join(", ")}, or ${last}`;
}
```

with:

```ts
  return `${items.slice(0, -1).join(", ")}, or ${last}`;
}

/** Join phrases as "a, b, and c" (Oxford "and"). */
function oxfordAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}
```

- [ ] **Step 5: Add the NOC consts** after the `SOF_MECHANISMS` const (:27). Replace:

```ts
const SOF_REQUIREMENTS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ");
const SOF_MECHANISMS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ");
```

with:

```ts
const SOF_REQUIREMENTS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ");
const SOF_MECHANISMS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ");
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
```

- [ ] **Step 6: Add the gated plan item** immediately after the GENUINE STUDENT block, before `// WORK + CAREER` (:142-144). Replace:

```ts
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer four questions — your current circumstances and ties, why this course and provider, how it benefits you, and anything else relevant — each in ${gs.responseLimitWords} words or less. Draft your answers early; they anchor your whole application.`,
      timeEstimate: "2-4 hours",
    });
  }

  // WORK + CAREER
```

with:

```ts
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer four questions — your current circumstances and ties, why this course and provider, how it benefits you, and anything else relevant — each in ${gs.responseLimitWords} words or less. Draft your answers early; they anchor your whole application.`,
      timeEstimate: "2-4 hours",
    });
  }

  // NEPAL NOC APPLICATION JOURNEY (MoEST) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "apply-for-noc",
      impact: "medium",
      title: "Apply for your NOC (No Objection Certificate)",
      body:
        `Once your offer arrives, apply for your No Objection Certificate (NOC) — the permit from ` +
        `Nepal's Ministry of Education that your bank needs before it can remit tuition. The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ` +
        `${NOC_STEPS} It can take time, so start as soon as you're accepted.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // WORK + CAREER
```

- [ ] **Step 7: Run the tests to verify they pass (GREEN)**

Run: `npx vitest run tests/plan/generator.test.ts -t "apply-for-NOC"`
Expected: **PASS** (both).

- [ ] **Step 8: Run the full plan suite (no regression)**

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: **PASS** — the existing GS-item cases assert only `prepare-gs-answers` presence/absence and don't constrain other items; the "stable order" case uses `primaryDestinationId: null` so `apply-for-noc` is absent both calls.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -F - << 'EOF'
feat(plan): add the apply-for-NOC action (B.017–B.024)

New apply-for-noc PlanItem composing the MoEST NOC journey from NEPAL_NOC_JOURNEY,
gated on an Australian primary destination (mirrors the Genuine Student item) — the
timed "apply right after your offer" nudge complementing the checklist reference.

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
Expected: **all green**. Note the exact `Tests  N passed (N)` total — it should be the prior 707 plus the 3 new cases plus any registry-driven parametrized additions (≈710–715). Use the **actual** number in Step 3; do not guess.

- [ ] **Step 2: Regenerate the ledger**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Then: `git diff docs/research-briefs/findings-ledger.md`
Expected: overall `used` 373 → **381**, `pending` 741 → **733**; category **B** `used` 92 → **100**, `pending` 43 → **35**; clusters **41** (unchanged); the only finding-status moves are B.017–B.024 `pending → used` (B.025–B.026 stay `pending`).

- [ ] **Step 3: Update `docs/PROJECT_STATUS.md`**

First Read the file (the header line with the test count near the top, and the data-integration section where the slice-A/B/C bullets live). Then:

(a) Change the test-count figure (currently "707 passing across 161 test files") to the **actual** count from Step 1, keeping "161 test files" unless `npm test` reports a different file count.

(b) Add this bullet immediately after the existing slice-C bullet:

```markdown
- **Ledger slice D (MoEST NOC journey):** new `lib/data/source/nepal-noc-journey.ts` (8 records) wires findings B.017–B.024 — the NOC application journey (six required documents: citizenship, academic certificate, guardian citizenship, previous NOC, academic transcript, offer/I-20 letter; plus online submission and the in-person originals check) — into the checklist (new after-offer `noc-application` info item in the visa group) and the plan (new `apply-for-noc` action, AU-primary gated). Ledger: overall used 373→381 / pending 741→733; B 92→100. B.025–B.026 (NOC portal contacts) remain use-later by slice boundary. No scorer touched.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_STATUS.md docs/research-briefs/findings-ledger.md
git commit -F - << 'EOF'
docs(slice-d): record NOC journey slice in status + ledger

PROJECT_STATUS slice-D bullet + test count; regenerate findings-ledger.md
(used 373→381, pending 741→733; B 92→100; clusters 41).

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
t = t.replace(/("id":"B\.020"[^\n]*?"value_status":)"prose-only"/, '$1"unset"');
fs.writeFileSync(p, t);
console.log('mutated B.020 value_status -> unset (status stays used)');
EOF
npx vitest run tests/data/reconcile-modules.test.ts
```

Expected: **FAIL** with `USED_UNSET B.020`.

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
Expected: only the WIP trio dirty (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); **7 commits** ahead of master — spec, copy tweak, plan doc, sourced layer, checklist, plan, status+ledger.

- [ ] **Step 4: Fast-forward merge to master + push + delete branch**

```bash
git checkout master
git merge --ff-only ledger-slice-d-noc-journey
git push
git branch -d ledger-slice-d-noc-journey
git status -sb
```

Expected: `Fast-forward`; push shows the `X..Y master -> master` ref-update; branch deleted; `## master...origin/master` in sync (only the WIP trio dirty). **Verify the push by the ref-update line + in-sync status, not the exit code** (PowerShell push can spuriously report exit 255).

- [ ] **Step 5: Report at the merge**

Report: the 7 commits; four-state ledger (8 → `used`; 0 rejected / needs-human-call in scope; B.025–B.026 use-later); goldens byte-identical + scorer untouched; suite green (N); ledger B 92→100 (overall 373→381), clusters 41; adversarial `USED_UNSET` confirmed. Then **await the user's steer on the next slice** — do not start a new slice autonomously.

---

## Self-review (writing-plans)

**1. Spec coverage** — every spec section maps to a task: §4 module → Task 1 (steps 1–3); §8 schema+registry → Task 1 (steps 3–4); §7 finding edits → Task 1 (steps 6–7); §5 checklist → Task 2; §6 plan → Task 3; §2 ledger math → Task 4; §9 testing (incl. adversarial) → Tasks 2/3 + Task 5 step 1; §10 verification gate → Task 5 step 2; §11 commit plan → the four code commits + merge. No gaps.

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code; every command has an expected result. The only deliberately non-hardcoded value is the PROJECT_STATUS test count (Task 4 step 3), which *must* be read from the actual `npm test` output — instruction is explicit, not a placeholder.

**3. Type consistency** — `NepalNocJourney` (interface), `NEPAL_NOC_JOURNEY` (export), `NepalNocJourneySchema` (schema), `recordLabel:"nepal-noc-journey"`, `recordInterface:"NepalNocJourney"` are identical across types/module/schema/registry. The 8 `id` values match between the interface union, the schema enum, and the module records. `kind` values (`required-document`/`process-step`) match between the interface, the schema enum, the module records, and the generator filters. Item key `noc-application` and plan kind `apply-for-noc` match between generators and tests. `oxfordAnd` is defined in both generators before use. Consistent.

**4. Token cross-check** — the test assertions ("academic transcript", "original documents", "MoEST", "No Objection Certificate", "moest.gov.np") all appear verbatim in the composed `NOC_NOTE` / plan body / record sources defined in Tasks 1–3. Verified.
