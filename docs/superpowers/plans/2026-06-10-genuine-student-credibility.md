# Genuine Student credibility module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a gov-sourced Genuine Student credibility module — a results-page panel (20 rows across 5 collapsible sections) plus plan + checklist enrichment — from 49 already-triaged government findings.

**Architecture:** Mirrors slice K (`nepal-refusal-recovery`) exactly: one sourced data module (`lib/data/source/au-genuine-student.ts`) validated by a Zod schema and registered in `DATA_MODULES`, reconciled against findings, rendered by a presentational panel. The panel uses native `<details>`/`<summary>` (no client state) for collapsible sections. Findings flip pending→used via the existing FLIP_STATUS runner — which this plan first teaches to clear the human-owned `triage` field on promotion (this is the first slice to integrate triaged findings).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Zod, React Server/Client components (Next.js App Router), Tailwind v4, vitest + Testing Library. Finding tooling is plain CommonJS under `docs/research-briefs/_tools/`.

---

## Source URL constants (used throughout — define once in the data module)

```
IMMI_GS        = https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement
IMMI_WET       = https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool
DIRECTION_106  = https://immi.homeaffairs.gov.au/Visa-subsite/files/direction-no-106.pdf
IMMI_SSVF      = https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework
STUDY_AUSTRALIA= https://www.studyaustralia.gov.au/en/tools-and-resources/news/new-genuine-student-requirement
IMMI_485       = https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485
IMMI_ENGLISH   = https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language
```

`VERIFIED = "2026-06-10"` — the date these gov pages were re-read during Phase 2a triage (slice-K single-date convention).

## File Structure

- **Create** `lib/data/source/au-genuine-student.ts` — the 20-row sourced module (`AU_GENUINE_STUDENT`).
- **Create** `lib/data/schema/au-genuine-student.schema.ts` — `GenuineStudentSchema` (Zod).
- **Create** `components/results/genuine-student.tsx` — the `GenuineStudent` panel (native `<details>`).
- **Create** `tests/components/genuine-student.test.tsx` — panel render + copy-lock.
- **Modify** `lib/data/types.ts` — add `GenuineStudentFact` interface.
- **Modify** `lib/data/schema/registry.ts` — import + one `DATA_MODULES` entry.
- **Modify** `lib/analytics/events.ts` — add `"genuine-student"` to `SourceSurface`.
- **Modify** `tests/analytics/events.test.ts` — extend the `SourceSurface` type-pin.
- **Modify** `components/results/results.tsx` — render `<GenuineStudent />` after `<RefusalRecovery />`.
- **Modify** `lib/plan/generator.ts` — rebuild the `prepare-gs-answers` body.
- **Modify** `lib/checklist/generator.ts` — add the `gs-responses` after-offer step.
- **Modify** `lib/checklist/plan-links.ts` — map `gs-responses → prepare-gs-answers`.
- **Modify** `docs/research-briefs/_tools/flip-status.js` — add `applyChange` (clears triage on promote).
- **Modify** `tests/data/flip-status.test.ts` — unit-test `applyChange`.
- **Modify** `tests/data/flip-status.run.test.ts` — use `applyChange` in the JSONL rewrite.
- **Modify** `docs/research-briefs/findings/{C,E,F}.jsonl` — 49 findings flip pending→used, triage cleared (mechanical, via FLIP_STATUS=1).
- **Modify** `tests/plan/generator.test.ts`, `tests/checklist/generator.test.ts`, `tests/checklist/plan-links.test.ts` — pin the new copy/rows.

---

## Task 1: Teach flip-status to clear triage on promotion

This is the first slice to promote triaged findings. `flip-status` sets `status:"used"` but leaves `triage`/`triage_reason`, which the finding schema forbids on non-pending rows (the suite would go red). Add a pure `applyChange` helper that clears triage when a row becomes `used`, and route the JSONL rewrite through it.

**Files:**
- Modify: `docs/research-briefs/_tools/flip-status.js`
- Test: `tests/data/flip-status.test.ts`
- Modify: `tests/data/flip-status.run.test.ts:91-100` (rewrite to use the helper)

- [ ] **Step 1: Write the failing test**

In `tests/data/flip-status.test.ts`, add `applyChange` to the import from `flip-status.js` and append:

```ts
describe("applyChange (JSONL row rewrite)", () => {
  it("clears triage + triage_reason when a finding is promoted to used", () => {
    const out = applyChange(
      { id: "X.1", status: "pending", claim: "c", triage: "ready", triage_reason: "r" },
      { status: "used", used_by: ["au-genuine-student[0]"] },
    );
    expect(out.status).toBe("used");
    expect(out.used_by).toEqual(["au-genuine-student[0]"]);
    expect("triage" in out).toBe(false);
    expect("triage_reason" in out).toBe(false);
    expect(out.claim).toBe("c"); // untouched fields survive
  });

  it("removes used_by on demotion and never resurrects triage", () => {
    const out = applyChange({ id: "X.2", status: "used", used_by: ["m"] }, { status: "pending" });
    expect(out.status).toBe("pending");
    expect("used_by" in out).toBe(false);
    expect("triage" in out).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/data/flip-status.test.ts`
Expected: FAIL — `applyChange is not a function` (not exported yet).

- [ ] **Step 3: Implement `applyChange`**

In `docs/research-briefs/_tools/flip-status.js`, add the function and export it:

```js
/**
 * Apply one computed change to a finding object, returning a new object with the
 * same key order (minimal-diff JSONL rewrite). Promotion to `used` clears the
 * human-owned triage fields — they are only valid while status is `pending`
 * (docs/research-briefs/_tools/finding-schema.js), so a used row must not carry them.
 */
function applyChange(finding, change) {
  const f = { ...finding };
  f.status = change.status;
  if (change.used_by) f.used_by = change.used_by;
  else delete f.used_by;
  if (change.status === "used") {
    delete f.triage;
    delete f.triage_reason;
  }
  return f;
}

module.exports = { computeFlips, componentMap, isRejected, sameRefs, applyChange };
```

(Replace the existing `module.exports` line.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/data/flip-status.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Route the runner's rewrite through `applyChange`**

In `tests/data/flip-status.run.test.ts`, import the helper and replace the inline mutation in `applyChanges` (lines ~91–100). Change the import line:

```ts
import { computeFlips as flipImpl, applyChange as applyChangeImpl } from "../../docs/research-briefs/_tools/flip-status.js";
```

Add the typed alias next to `computeFlips`:

```ts
const applyChange = applyChangeImpl as unknown as (finding: Finding, change: Change) => Finding;
```

Replace the `.map` body:

```ts
    const processed = body.map((line) => {
      if (!line.trim()) return line;
      const f = JSON.parse(line) as Finding;
      const ch = changedById[f.id];
      if (!ch) return line; // verbatim
      return JSON.stringify(applyChange(f, ch));
    });
```

- [ ] **Step 6: Verify the runner still parses and the normal-mode guard is green**

Run: `npx vitest run tests/data/flip-status.run.test.ts`
Expected: PASS — "the committed used set already matches code" (no drift yet; we have not added the module).

- [ ] **Step 7: Commit**

```bash
git add docs/research-briefs/_tools/flip-status.js tests/data/flip-status.test.ts tests/data/flip-status.run.test.ts
git commit -F <message-file>
```
Message: `feat(slice-kit): flip-status clears triage when promoting a finding to used`

---

## Task 2: Genuine Student data layer (type + schema + module + registry) and flip the 49 findings

Produces the sourced module, registers it, and flips its 49 findings pending→used (triage cleared by Task 1's helper). Committed together so the data suite is green at the commit.

**Files:**
- Modify: `lib/data/types.ts` (add `GenuineStudentFact`)
- Create: `lib/data/schema/au-genuine-student.schema.ts`
- Create: `lib/data/source/au-genuine-student.ts`
- Modify: `lib/data/schema/registry.ts`
- Modify (mechanical): `docs/research-briefs/findings/{C,E,F}.jsonl`

- [ ] **Step 1: Add the `GenuineStudentFact` interface**

Append to `lib/data/types.ts` (after `NepalRefusalRecovery`, ~line 867):

```ts
/**
 * Genuine Student credibility module (slice GS, category F + cross-category E/C/I refs).
 * Prose-only rows explaining the Australian Genuine Student test: what it is, the questions,
 * the MD106 weighing factors, post-study honesty, and evidence/English red flags. `section`
 * groups rows into the panel's five `<details>` blocks. Fact-only — no scorer reads it;
 * machine-checked against findings (see provenance.findingRefs). Rendered by
 * components/results/genuine-student.tsx after RefusalRecovery.
 */
export interface GenuineStudentFact extends Provenanced {
  id: string; // slug, e.g. "gs-since-2024"
  section: "what-it-is" | "the-questions" | "how-weighed" | "post-study" | "evidence";
  label: string;   // short source label — rendered as the row's link text
  summary: string; // the rendered sentence
  source: string;  // canonical gov URL shown as the row's link
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create the schema**

Create `lib/data/schema/au-genuine-student.schema.ts`:

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-genuine-student.ts. Guards a free-slug id, the
 * section enum, non-empty label/summary, an http(s) source, optional ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const GenuineStudentRecordSchema = z.object({
  id: z.string().min(1),
  section: z.enum(["what-it-is", "the-questions", "how-weighed", "post-study", "evidence"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const GenuineStudentSchema = z
  .array(GenuineStudentRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Genuine Student ids must be unique",
  });
```

- [ ] **Step 3: Create the data module (all 20 rows)**

Create `lib/data/source/au-genuine-student.ts`:

```ts
import type { GenuineStudentFact } from "@/lib/data/types";

/**
 * Genuine Student credibility module (slice GS). Gov-sourced explanation of the Australian
 * Genuine Student requirement, in five sections. Every row links to its primary gov page;
 * provenance.findingRefs lists every backing finding (multi-source rows display one URL and
 * carry the rest in findingRefs — the slice-G/I source-display pattern). I.008 (clause 500.212,
 * the genuine-applicant rule) rides in the PR row's findingRefs as the genuineness anchor; it
 * is already `used` by nepal-refusal-recovery. Fact-only: no scorer reads it.
 */
const IMMI_GS =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement";
const IMMI_WET = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";
const DIRECTION_106 = "https://immi.homeaffairs.gov.au/Visa-subsite/files/direction-no-106.pdf";
const IMMI_SSVF =
  "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework";
const STUDY_AUSTRALIA =
  "https://www.studyaustralia.gov.au/en/tools-and-resources/news/new-genuine-student-requirement";
const IMMI_485 = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485";
const IMMI_ENGLISH = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language";
const VERIFIED = "2026-06-10";

export const AU_GENUINE_STUDENT: GenuineStudentFact[] = [
  // ── What it is ──────────────────────────────────────────────────────────────
  {
    id: "gs-since-2024",
    section: "what-it-is",
    label: "Genuine Student",
    summary:
      "Every student visa lodged on or after 23 March 2024 is assessed on the Genuine Student requirement — it replaced the old Genuine Temporary Entrant test.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.001", "F.002", "C.005"], source: IMMI_GS },
  },
  {
    id: "gs-format",
    section: "what-it-is",
    label: "Genuine Student",
    summary:
      "You answer in the application form itself — 150 words or less per question, in English. DHA prefers in-form answers over a separate statement.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.004", "E.006", "F.003", "E.007", "C.133", "E.005"],
      source: IMMI_GS,
      note: "Format corroborated by the Web Evidentiary Tool findings (F.003/F.004/C.133); displayed source is the GS page.",
    },
  },
  {
    id: "gs-extra-question",
    section: "what-it-is",
    label: "Evidentiary tool",
    summary:
      "There's an additional question if you've held a student visa before, or you're applying in Australia from a non-student visa.",
    source: IMMI_WET,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.005", "C.135", "C.136"], source: IMMI_WET },
  },
  // ── The questions you'll answer ───────────────────────────────────────────────
  {
    id: "gs-q-circumstances",
    section: "the-questions",
    label: "Genuine Student",
    summary:
      "Your current circumstances — your ties to family, community, employment and your economic situation.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.006"], source: IMMI_GS },
  },
  {
    id: "gs-q-why-course",
    section: "the-questions",
    label: "Genuine Student",
    summary:
      "Why this course, in Australia, with this provider — and what you understand about the course's requirements and about studying and living in Australia.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.007", "F.008"], source: IMMI_GS },
  },
  {
    id: "gs-q-benefit",
    section: "the-questions",
    label: "Genuine Student",
    summary: "How completing the course will benefit you.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.009"], source: IMMI_GS },
  },
  // ── How officers actually weigh it (Direction 106) ───────────────────────────
  {
    id: "md106-not-checklist",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Direction 106 tells decision makers not to treat the factors as a checklist — your circumstances are weighed as a whole.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.014", "F.010"], source: DIRECTION_106 },
  },
  {
    id: "md106-ties",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Your personal ties to Nepal — family, community, employment — and your economic circumstances relative to Australia.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.018", "F.019"], source: DIRECTION_106 },
  },
  {
    id: "md106-research",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "How much you actually know: the course, the provider, living arrangements — the depth of your research counts.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.020", "F.021"], source: DIRECTION_106 },
  },
  {
    id: "md106-home-course",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Whether a similar course is available at home or in the region, and your reasons for studying it in Australia instead.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.017", "E.010"],
      source: DIRECTION_106,
      note: "E.010 (GS page) corroborates the home-course consideration; displayed source is Direction 106.",
    },
  },
  {
    id: "md106-course-value",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Whether the course fits your past study or work — reasonable career changes are accepted — and the pay you could expect with the qualification at home or elsewhere.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.023", "F.024", "E.011"],
      source: DIRECTION_106,
      note: "E.011 (GS page) corroborates the remuneration factor; displayed source is Direction 106.",
    },
  },
  {
    id: "md106-history",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Your immigration history counts: previous visa applications and refusal circumstances (Australia and other countries), compliance with visa conditions, and — if you've held a student visa — logical course progression.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.025", "F.011", "F.012", "F.026"], source: DIRECTION_106 },
  },
  {
    id: "md106-scrutiny",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Closer scrutiny is flagged for: a field unrelated to your past study or work, inconsistencies in the application, study that looks like maintaining residence, and patterns of changing, deferring or gapping courses.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.015", "F.016", "F.022", "F.027"], source: DIRECTION_106 },
  },
  {
    id: "ssvf-evidence-level",
    section: "how-weighed",
    label: "SSVF",
    summary:
      "Under the Simplified Student Visa Framework, documentation expectations also depend on your provider's evidence level — which is based on the student visas linked to that institution.",
    source: IMMI_SSVF,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["C.007", "C.008"],
      source: IMMI_SSVF,
      note: "C.008 (evidence-levels page) rides in findingRefs; displayed source is the SSVF page.",
    },
  },
  // ── Post-study honesty ────────────────────────────────────────────────────────
  {
    id: "gs-pr-not-disqualifying",
    section: "post-study",
    label: "Genuine Student",
    summary:
      "Wanting to apply for permanent residence later does not count against you — as long as your study plan and stay are genuine under the visa rules. Post-study pathways exist, but only for those who are eligible.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["C.006", "I.008", "F.013", "E.012"],
      source: IMMI_GS,
      note: "I.008 (clause 500.212, genuine applicant for entry and stay as a student) anchors the genuineness clause; already used by nepal-refusal-recovery.",
    },
  },
  {
    id: "gs-say-it-straight",
    section: "post-study",
    label: "Study Australia",
    summary:
      "Study Australia says the requirement removed the old confusion about whether you can express a desire to migrate.",
    source: STUDY_AUSTRALIA,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.034"], source: STUDY_AUSTRALIA },
  },
  {
    id: "gs-485-reality",
    section: "post-study",
    label: "Subclass 485",
    summary:
      "The Temporary Graduate visa (485) lets you live, work and study in Australia temporarily after graduating — but applicants must generally be 35 or under, and since 1 July 2024 you can't apply for a student visa from inside Australia while holding it.",
    source: IMMI_485,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.035", "F.036", "F.037", "F.038"],
      source: IMMI_485,
      note: "Spans several DHA 485 pages; displayed source is the 485 overview.",
    },
  },
  // ── Evidence & what not to trust ─────────────────────────────────────────────
  {
    id: "gs-evidence-weight",
    section: "evidence",
    label: "Genuine Student",
    summary:
      "DHA gives more weight to answers supported by evidence — attach your documents in ImmiAccount along with your responses.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.009", "E.008"], source: IMMI_GS },
  },
  {
    id: "gs-online-tests",
    section: "evidence",
    label: "English requirement",
    summary: "DHA does not accept English tests delivered completely online.",
    source: IMMI_ENGLISH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.013"], source: IMMI_ENGLISH },
  },
  {
    id: "gs-test-validity",
    section: "evidence",
    label: "English requirement",
    summary:
      "English test results from on or before 6 August 2025 can be used as visa evidence until 6 August 2028, depending on the visa.",
    source: IMMI_ENGLISH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.014"], source: IMMI_ENGLISH },
  },
];
```

- [ ] **Step 4: Register the module**

In `lib/data/schema/registry.ts`, add the import (near the other source imports, after the `NEPAL_REFUSAL_RECOVERY` import block):

```ts
import { AU_GENUINE_STUDENT } from "@/lib/data/source/au-genuine-student";
import { GenuineStudentSchema } from "@/lib/data/schema/au-genuine-student.schema";
```

And append this entry to the `DATA_MODULES` array (after the `NEPAL_REFUSAL_RECOVERY` entry, before the closing `];`):

```ts
  {
    // Slice GS — Genuine Student credibility module (category F, with cross-category E/C/I
    // refs). 20 prose rows / 49 findings: what GS is, the four questions, the MD106 weighing
    // factors, post-study honesty, and evidence + English red flags. I.008 (clause 500.212)
    // rides in findingRefs as the genuine-applicant anchor (already used by nepal-refusal-
    // recovery). Rendered after RefusalRecovery on the results page. Fact-only: no scorer reads it.
    category: "F",
    exportName: "AU_GENUINE_STUDENT",
    data: AU_GENUINE_STUDENT,
    schema: GenuineStudentSchema,
    recordLabel: "au-genuine-student",
    subRecordKeys: [],
    recordInterface: "GenuineStudentFact",
  },
```

- [ ] **Step 5: Typecheck and validate the schema**

Run: `npm run typecheck`
Expected: clean.
Run: `npx vitest run tests/data/schema.test.ts`
Expected: PASS (the new module validates against `GenuineStudentSchema`).

- [ ] **Step 6: Confirm reconcile is RED before the flip (the findings are still pending)**

Run: `npx vitest run tests/data/reconcile-modules.test.ts`
Expected: FAIL — findingRefs like `F.001` are `pending`, not `used`. This proves the reconcile guard has teeth; the flip in the next step fixes it.

- [ ] **Step 7: Flip the 49 findings pending→used (triage cleared by Task 1)**

Run (PowerShell):
```powershell
$env:FLIP_STATUS=1; npx vitest run tests/data/flip-status.run.test.ts; $env:FLIP_STATUS=$null
```
(bash: `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`)

Expected console line: `flip-status: files=3 promoted=49 demoted=0 rewired=1 refused=0 refToRejected=0`
- `promoted=49` — the C/E/F findings now `used`.
- `rewired=1` — I.008's `used_by` gains the new `au-genuine-student[...]` path (it was already used by the refusal module).
- `refused=0`, `refToRejected=0` — **must be zero**; non-zero means a conflict or a rejected ref and the run must stop for investigation.

- [ ] **Step 8: Verify the whole data suite is green**

Run: `npx vitest run tests/data/`
Expected: PASS — `schema`, `reconcile-modules`, `findings-integrity` (triage cleared on the 49, so no "triage on non-pending" errors), `freshness`, and the normal-mode `flip-status.run` guard (no drift) all green.

- [ ] **Step 9: Verify goldens are byte-identical**

Run: `npx vitest run tests/scoring/`
Expected: PASS — no scorer reads this module, so `golden-assessments.json` is untouched.

- [ ] **Step 10: Commit**

```bash
git add lib/data/types.ts lib/data/schema/au-genuine-student.schema.ts lib/data/source/au-genuine-student.ts lib/data/schema/registry.ts docs/research-briefs/findings/C.jsonl docs/research-briefs/findings/E.jsonl docs/research-briefs/findings/F.jsonl
git commit -F <message-file>
```
Message: `feat(gs-slice): sourced Genuine Student module + flip 49 findings used`

---

## Task 3: Genuine Student results panel (collapsible) + wire into results

**Files:**
- Modify: `lib/analytics/events.ts` (add `"genuine-student"` surface)
- Modify: `tests/analytics/events.test.ts` (extend the surface type-pin)
- Create: `components/results/genuine-student.tsx`
- Test: `tests/components/genuine-student.test.tsx`
- Modify: `components/results/results.tsx`

- [ ] **Step 1: Add the analytics surface**

In `lib/analytics/events.ts`, extend the `SourceSurface` union:

```ts
export type SourceSurface =
  | "factor-bars"
  | "refusal-recovery"
  | "cost-to-apply"
  | "checklist"
  | "matches"
  | "genuine-student";
```

- [ ] **Step 2: Update the surface type-pin test**

In `tests/analytics/events.test.ts`, update the `source_link_clicked.surface` `expectTypeOf(...).toEqualTypeOf<...>()` assertion to include the new member:

```ts
    expectTypeOf<AnalyticsEvents["source_link_clicked"]["surface"]>().toEqualTypeOf<
      "factor-bars" | "refusal-recovery" | "cost-to-apply" | "checklist" | "matches" | "genuine-student"
    >();
```

- [ ] **Step 3: Write the failing panel test**

Create `tests/components/genuine-student.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenuineStudent } from "@/components/results/genuine-student";

describe("GenuineStudent", () => {
  it("renders the five section headings", () => {
    render(<GenuineStudent />);
    expect(screen.getByText("The Genuine Student test (Australia)")).toBeInTheDocument();
    expect(screen.getByText("What it is")).toBeInTheDocument();
    expect(screen.getByText("The questions you'll answer")).toBeInTheDocument();
    expect(screen.getByText("How officers actually weigh it")).toBeInTheDocument();
    expect(screen.getByText("Post-study honesty")).toBeInTheDocument();
    expect(screen.getByText("Evidence & what not to trust")).toBeInTheDocument();
  });

  it("copy-locks the two trust-sensitive lines verbatim", () => {
    render(<GenuineStudent />);
    expect(
      screen.getByText(
        "Wanting to apply for permanent residence later does not count against you — as long as your study plan and stay are genuine under the visa rules. Post-study pathways exist, but only for those who are eligible.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("General context for the Australian Genuine Student requirement, not legal advice."),
    ).toBeInTheDocument();
  });

  it("links rows to their government sources", () => {
    render(<GenuineStudent />);
    expect(screen.getAllByRole("link", { name: "Direction 106" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("direction-no-106.pdf"),
    );
    expect(screen.getByRole("link", { name: "Study Australia" })).toHaveAttribute(
      "href",
      expect.stringContaining("studyaustralia.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Subclass 485" })).toHaveAttribute(
      "href",
      expect.stringContaining("temporary-graduate-485"),
    );
  });

  it("renders the first section open and the rest collapsed", () => {
    const { container } = render(<GenuineStudent />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(5);
    expect(details[0]?.hasAttribute("open")).toBe(true);
    expect(details[1]?.hasAttribute("open")).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/components/genuine-student.test.tsx`
Expected: FAIL — cannot resolve `@/components/results/genuine-student`.

- [ ] **Step 5: Create the panel**

Create `components/results/genuine-student.tsx`:

```tsx
import { AU_GENUINE_STUDENT } from "@/lib/data/source/au-genuine-student";
import type { GenuineStudentFact } from "@/lib/data/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

const SECTIONS: { id: GenuineStudentFact["section"]; heading: string }[] = [
  { id: "what-it-is", heading: "What it is" },
  { id: "the-questions", heading: "The questions you'll answer" },
  { id: "how-weighed", heading: "How officers actually weigh it" },
  { id: "post-study", heading: "Post-study honesty" },
  { id: "evidence", heading: "Evidence & what not to trust" },
];

const DISCLAIMER = "General context for the Australian Genuine Student requirement, not legal advice.";

/**
 * Genuine Student credibility panel — gov-sourced explanation of the Australian GS test,
 * in five collapsible sections (native <details>, first open). Mirrors RefusalRecovery's
 * calm-authority shell. Purely presentational; every row links to its gov source through
 * SourceAnchor (surface "genuine-student"). No personal odds, no scoring.
 */
export function GenuineStudent() {
  return (
    <aside className="flex flex-col gap-3 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        The Genuine Student test (Australia)
      </span>

      <div className="flex flex-col gap-2">
        {SECTIONS.map((section, i) => (
          <details
            key={section.id}
            open={i === 0}
            className="group border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[11px] uppercase tracking-wide text-ink-faint marker:content-['']">
              {section.heading}
              <span className="transition-transform duration-200 ease-calm group-open:rotate-90" aria-hidden>
                &rsaquo;
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {AU_GENUINE_STUDENT.filter((r) => r.section === section.id).map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span>{r.summary}</span>
                  <SourceAnchor
                    surface="genuine-student"
                    href={r.source}
                    title={r.lastVerified ? `verified ${r.lastVerified}` : undefined}
                    className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
                  >
                    {r.label}
                  </SourceAnchor>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-faint">{DISCLAIMER}</p>
    </aside>
  );
}
```

- [ ] **Step 6: Run the panel test to verify it passes**

Run: `npx vitest run tests/components/genuine-student.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Wire the panel into results, after RefusalRecovery**

In `components/results/results.tsx`, add the import next to the other results imports:

```ts
import { GenuineStudent } from "./genuine-student";
```

And render it immediately after `<RefusalRecovery />`:

```tsx
      <RefusalRecovery />
      <GenuineStudent />
```

- [ ] **Step 8: Run the analytics + results tests**

Run: `npx vitest run tests/analytics/ tests/components/`
Expected: PASS — the surface type-pin matches, the panel renders.

- [ ] **Step 9: Commit**

```bash
git add lib/analytics/events.ts tests/analytics/events.test.ts components/results/genuine-student.tsx tests/components/genuine-student.test.tsx components/results/results.tsx
git commit -F <message-file>
```
Message: `feat(gs-slice): collapsible Genuine Student panel on results, after refusal`

---

## Task 4: Plan body enrichment + checklist step + plan-link

**Files:**
- Modify: `lib/plan/generator.ts`
- Modify: `tests/plan/generator.test.ts`
- Modify: `lib/checklist/generator.ts`
- Modify: `tests/checklist/generator.test.ts`
- Modify: `lib/checklist/plan-links.ts`
- Modify: `tests/checklist/plan-links.test.ts`

- [ ] **Step 1: Update the `prepare-gs-answers` body (failing test first)**

In `tests/plan/generator.test.ts`, find the assertion on the `prepare-gs-answers` item body and update it (or add one) to pin the new copy:

```ts
    const gs = plan.find((p) => p.kind === "prepare-gs-answers")!;
    expect(gs.body).toContain("150 words or less, in English");
    expect(gs.body).toContain(
      "wanting permanent residence later doesn't count against you as long as you're a genuine student",
    );
```

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: FAIL on the new substring (body still has the old copy).

- [ ] **Step 2: Rebuild the body**

In `lib/plan/generator.ts`, replace the `prepare-gs-answers` `body` (the block under `// GENUINE STUDENT`, ~lines 178–188):

```ts
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer short questions in the visa form — your circumstances and ties, why this course and this provider, and how it benefits you — each in ${gs.responseLimitWords} words or less, in English. Answers backed by evidence carry more weight, and wanting permanent residence later doesn't count against you as long as you're a genuine student. Draft yours early; they anchor your whole application.`,
```

(The `gs` const and `responseLimitWords` are already in scope from `AU_STUDENT_VISA_REQUIREMENTS`; `responseLimitWords` is 150.)

Run: `npx vitest run tests/plan/generator.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the checklist `gs-responses` step (failing test first)**

In `tests/checklist/generator.test.ts`, add (the `generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() })` call shape is the one used in `tests/checklist/plan-links.test.ts:24` — reuse whatever fixture/builder this file already imports):

```ts
  it("includes the Genuine Student responses step after offer", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    const gs = items.find((i) => i.key === "gs-responses")!;
    expect(gs.stage).toBe("after-offer");
    expect(gs.group).toBe("visa");
    expect(gs.kind).toBeNull();
    expect(gs.infoKind).toBe("step");
    expect(gs.source?.url).toContain("genuine-student-requirement");
  });
```

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: FAIL — no `gs-responses` item.

- [ ] **Step 4: Emit the checklist step**

In `lib/checklist/generator.ts`, add the import near the other data-module imports:

```ts
import { AU_GENUINE_STUDENT } from "@/lib/data/source/au-genuine-student";
```

Add a module-derived source const near the other `const ... = ....find(...)` declarations at the top of the file:

```ts
const GS_SOURCE = AU_GENUINE_STUDENT.find((r) => r.id === "gs-format")!; // IMMI_GS page
```

In the `// VISA (after-offer)` block, add the step immediately after the `oshc` `add({...})` call:

```ts
  add({
    key: "gs-responses",
    kind: null,
    label: "Genuine Student responses",
    group: "visa",
    stage: "after-offer",
    requirement: "required",
    infoKind: "step",
    note: "Short answers in the visa form — 150 words each, in English. Attach supporting evidence in ImmiAccount; evidence-backed answers carry more weight.",
    source: { url: GS_SOURCE.source, lastVerified: GS_SOURCE.lastVerified },
  });
```

Run: `npx vitest run tests/checklist/generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the plan-links exact-match lock (failing test first)**

`tests/checklist/plan-links.test.ts` has an exact-match `toEqual` lock (around line 46) that enumerates the whole map — it will fail the moment a new key is added, by design. Update that block to include the new mapping and retitle it from "three" to "four":

```ts
  it("covers the four after-offer step rows and the translations note", () => {
    expect(CHECKLIST_PLAN_LINKS).toEqual({
      "noc-application": "apply-for-noc",
      biometrics: "prepare-biometrics",
      "police-certificate": "prepare-police-certificate",
      "doc-preparation": "translate-certify-documents",
      "gs-responses": "prepare-gs-answers",
    });
  });
```

The file's other guards need no edit: "maps only checklist keys the generator actually emits" passes once Step 4 emits `gs-responses`; "maps only info rows" passes because the row's `kind` is null; "targets only real plan kinds" passes because `prepare-gs-answers` is in `VISA_PREP_KINDS` (`lib/plan/phases.ts:8`).

Run: `npx vitest run tests/checklist/plan-links.test.ts`
Expected: FAIL — the `toEqual` sees the real map still missing `gs-responses`.

- [ ] **Step 6: Add the plan-link mapping**

In `lib/checklist/plan-links.ts`, add to `CHECKLIST_PLAN_LINKS`:

```ts
  "gs-responses": "prepare-gs-answers",
```

- [ ] **Step 7: Verify `prepare-gs-answers` is a declared plan kind**

Open `lib/plan/phases.ts` and confirm `prepare-gs-answers` appears in the phase ordering (the plan-links comment requires values to be declared kinds). It is already emitted by the generator and ordered by the plan selector; if for any reason it is absent from `phases.ts`, add it to the visa-prep phase group in the same position the generator emits it. No code change expected.

Run: `npx vitest run tests/checklist/plan-links.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts lib/checklist/generator.ts tests/checklist/generator.test.ts lib/checklist/plan-links.ts tests/checklist/plan-links.test.ts
git commit -F <message-file>
```
Message: `feat(gs-slice): enrich plan GS body + checklist GS step mirrored to the plan`

---

## Task 5: Full gate, browser verification, and status

**Files:**
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck`  — Expected: clean.
Run: `npm run lint`       — Expected: clean.
Run: `npm test`           — Expected: all green; suite count up from 917 by the new tests.

- [ ] **Step 2: Browser-verify the panel on anonymous results**

Start the dev server (preview_start "dev"). Run the wizard to an Australia result (or open an existing assessment). Confirm: the "The Genuine Student test (Australia)" panel renders directly after the refusal panel; the first section ("What it is") is open and the other four are collapsed; expanding "How officers actually weigh it" shows the MD106 rows; a source link opens its gov page in a new tab. Capture a screenshot for the report.

- [ ] **Step 3: Update PROJECT_STATUS.md**

Add a slice bullet to the "Phase 2 / current focus" area summarizing: the GS module (20 rows / 49 findings flipped used, I.008 cross-ref), the collapsible results panel, the plan + checklist enrichment, the flip-status triage-clear, the two user copy tweaks, and the suite delta. Move the GS item out of the open backlog and mark slice ③ (working-with-agents gov core) as next.

- [ ] **Step 4: Commit and push**

```bash
git add docs/PROJECT_STATUS.md
git commit -F <message-file>   # docs(status): record GS credibility slice
git push origin master
```
Verify the push prints the `X..Y master -> master` ref line.

---

## Self-Review

**1. Spec coverage:**
- Decision 1 (sourced module, prose rows, cross-category refs) → Task 2.
- Decision 2 (results panel after RefusalRecovery, collapsible `<details>`, first open) → Task 3.
- Decision 3 (`SourceAnchor` surface `"genuine-student"`) → Task 3 Steps 1–2, used in Step 5.
- Decision 4 (plan body enrichment, no new kind) → Task 4 Steps 1–2.
- Decision 5 (checklist `gs-responses` step + plan-link mirror) → Task 4 Steps 3–6.
- Decision 6 (49 flip used, triage cleared; I.008 untouched; F.040/F.041/F.055 stay pending) → Task 1 (clear mechanism) + Task 2 Step 7. F.040/F.041/F.055 are never referenced in the data module, so the flip leaves them pending — verified implicitly by `promoted=49`.
- AC1 (registry walk, goldens) → Task 2 Steps 5–9. AC2 (flip 49, I.008 untouched) → Task 2 Step 7. AC3 (panel sections, SourceAnchor, copy-lock) → Task 3 Steps 3–6. AC4 (generator/checklist pins) → Task 4. AC5 (SourceSurface) → Task 3 Steps 1–2. AC6 (gate + browser) → Task 5.

**2. Placeholder scan:** No "TBD"/"handle edge cases". Every code step shows complete code. The one soft reference — Task 4 Step 3's "existing test inputs in this file" — is unavoidable without inlining the file's fixture; the engineer copies the `generateChecklist(...)` shape already used by neighbouring tests in the same file. Task 4 Step 7 is a verify-only step (expected no change) and says so.

**3. Type consistency:** Interface `GenuineStudentFact` (types.ts) = schema record (au-genuine-student.schema.ts) = `recordInterface: "GenuineStudentFact"` (registry) = panel import. Data export `AU_GENUINE_STUDENT` consistent across module, registry, panel, checklist generator. Component `GenuineStudent` ≠ type `GenuineStudentFact` (no name clash). Surface string `"genuine-student"` identical in events.ts, the type-pin test, and the panel's `SourceAnchor`. `applyChange` signature identical in flip-status.js, the unit test, and the run-test alias.
