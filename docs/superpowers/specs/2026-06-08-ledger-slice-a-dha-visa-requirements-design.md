# Ledger slice A — DHA student-visa requirements → checklist + plan

**Status:** Design approved 2026-06-08, pending spec review.
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical 9-step, registry-driven process).

---

## 1. Context & goal

Category A of the reconciled findings (`docs/research-briefs/findings/A.jsonl`, 122 findings, 12 used / 110 pending) covers the Australian Subclass 500 student-visa application and the Nepal-side document journey. This slice integrates the **DHA student-visa requirements** sub-cluster — the four pillars of a Subclass 500 application: **Confirmation of Enrolment (CoE), Overseas Student Health Cover (OSHC), financial-evidence coverage, and the Genuine Student (GS) requirement** — into the two already-shipped, rule-derived surfaces that answer the student's "what money + documents do I need?" question:

- `lib/checklist/generator.ts` (per-program document checklist), and
- `lib/plan/generator.ts` (impact-ranked action plan).

**Goal:** make the existing CoE/OSHC/financial checklist items *sourced* (provenance + `SourceLine`) and *more accurate* (DHA's timing/coverage rules), and add one high-impact plan action for the GS answers — with every shipped value provably traced to a `used` finding and machine-checked by the reconcile harness in CI.

**Non-goal / guarantee:** **no scoring code is touched.** Neither generator imports `lib/scoring/*`, so `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. This slice pays no golden-regeneration tax.

---

## 2. Scope — the slice and its four-state disposition ledger

The DHA-visa-requirements cluster is **28** of the 110 A-pending findings. Every cluster member gets an explicit disposition; the four-state vocabulary maps onto the existing slice-kit exactly (`used` = `status:"used"`; `rejected:<reason>` = the reason rides in the status string; `use-later` = left `pending` and named here as the scope boundary; `needs-human-call` = `pending` + flagged, and `flip-status` auto-refuses unresolved contradictions).

### Wired → `used` (21)

| Pillar | Findings | Consuming surface |
|---|---|---|
| **CoE** | A.002, A.118, A.119, A.120, A.121, A.122 | Checklist `coe` item → enriched note + `SourceLine` |
| **OSHC** | A.006, A.007, A.008, A.009, A.010 | Checklist `oshc` item → enriched note + `SourceLine` |
| **Financial coverage** | A.011 (travel), A.012 (living), A.013 (tuition + family) | Checklist financial note → adds "travel" + finding provenance |
| **Genuine Student** | A.016, A.017, A.018, A.019, A.020, A.021, A.022 | New **plan** item "Prepare your Genuine Student answers" |

A.021 (each GS answer ≤ 150 words) is the one **structured** value in the slice (`value:150, value_type:"number", unit:"words"`); the other 20 are `prose-only`.

### Use-later by slice boundary — intentionally triaged, stay `pending` (7)

| Findings | Why deferred |
|---|---|
| A.003, A.004, A.005 (under-18 welfare; Form 157N / Form 1229) | Minors are out of the adult-focused MVP scope; revisit when under-18 applicants are in scope. |
| A.014 (school costs for dependants) | The school-cost *figure* (AUD 13,502) already ships via finding **B.005** (`AU_DHA_SCHOOL_COSTS_AUD`); the A.014 *requirement claim* belongs with a dependants slice. |
| A.023 (English test required unless exempt) | Belongs to a future English/visa-floor slice. |
| A.024 (DHA notice: min IELTS 5.5 → 6.0) | The 6.0 visa English floor **already ships** via finding **J1.003** (`ENGLISH_VISA_FLOOR_BY_DEST`, wired in Phase B1). Double-citing it here would add noise without changing the student experience. Revisit in the English slice. |
| A.032 (DHA median Student-visa processing 28 days, Apr 2026) | Belongs to a timing slice. |

### Rejected / needs-human-call (0)

The cluster has **no contradictions** (`conflict_with` empty on all A-pending). The three `dup_group`s are **enumerations**, not contradictions or duplicates — every member is co-`used`:
- **G1** (A.009, A.010): OSHC details for student/agent-arranged vs provider-arranged cover.
- **G2** (A.011–A.014): the distinct coverage elements (travel / living / tuition / school). A.011–A.013 are `used`; A.014 is use-later.
- **G11** (A.118, A.119): a CoE shows course dates / shows fees.

So this slice exercises **`used` + `use-later`**; the `rejected:<reason>` and `needs-human-call` states have no members here (recorded for completeness — a future English slice may `rejected:` A.024 if co-citation review deems it redundant).

### Out of this slice (82)

The remaining 82 A-pending are all Nepal-side logistics (NOC, police clearance, passport, certified translation / NAATI, land valuation, etc.) — a clean future A-slice. They are untouched and stay `pending`.

**Ledger math after the slice:** A `used` 12 → **33**, `pending` 110 → **89** (total 122; 0 rejected). `node docs/research-briefs/_tools/build-ledger.js` must show movement of exactly these 21.

---

## 3. Architecture — the wiring path

Per the slice-kit contract, a finding becomes `used` only when a **registered data-module record** carries `provenance.findingRefs:["A.xxx"]`, the finding declares a non-`unset` value, and (for `structured` findings) that value literally appears in the record. The four CI invariants — coverage, validity, value-fidelity, conflict gate — are enforced by `tests/data/` over every registered module.

```
A.jsonl findings ──(provenance.findingRefs)──► au-student-visa-requirements.ts (NEW data module)
       │                                                  │
       │                                                  ├─► checklist/generator.ts  (CoE / OSHC / financial notes + SourceLine)
       │                                                  └─► plan/generator.ts        (GS-answers action item, AU-gated)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the code's findingRefs — never hand-edited)
```

The module is **pure sourced data** (no scoring logic), so it is safe under the CLAUDE.md "scoring server-side / not in client JS" rule.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface (mirrors the `Provenanced` fact interfaces already there):

```ts
export interface AuStudentVisaRequirement extends Provenanced {
  id: "coe" | "oshc" | "financial-coverage" | "genuine-student";
  label: string;            // short human label
  summary: string;          // the note/body text the generators render
  questions?: string[];     // GS record only — the four GS questions
  responseLimitWords?: number; // GS record only — 150 (structured value backing A.021)
  appliesSince?: string;    // GS record only — ISO date "2024-03-23" (A.016)
  source: string;           // canonical DHA URL shown in the SourceLine
  lastVerified?: string;    // ISO date
}
```

**`lib/data/source/au-student-visa-requirements.ts`** — `export const AU_STUDENT_VISA_REQUIREMENTS: AuStudentVisaRequirement[]`, mirroring `lib/data/source/au-visa-facts.ts`. Four records:

| `id` | `findingRefs` | `source` (canonical) | Content the generators render |
|---|---|---|---|
| `coe` | A.002, A.118, A.119, A.120, A.121, A.122 | `immi.homeaffairs.gov.au/visas/web-evidentiary-tool` | "Issued after you accept your offer and pay the tuition deposit. Your CoE shows your course start/end dates and fees. You'll need it for your student visa application." |
| `oshc` | A.006, A.007, A.008, A.009, A.010 | DHA web-evidentiary-tool | "Required for the visa. Cover must start at least a week before your course and run for your full stay; include the insurer name and policy dates in your application." |
| `financial-coverage` | A.011, A.012, A.013 | DHA web-evidentiary-tool (documentary-evidence list) | coverage requirement: travel + living + tuition (for the student and any accompanying family members) |
| `genuine-student` | A.016, A.017, A.018, A.019, A.020, A.021, A.022 | DHA Genuine Student page | `questions` = the four GS questions; `responseLimitWords` = 150; `appliesSince` = "2024-03-23" |

Notes:
- A record may bundle findings whose individual sources differ (e.g. `coe`: A.002/A.120 are DHA; A.118–A.122 are provider corroborations from UoW/ACU/UTS). The record's headline `source` is the canonical DHA page; `provenance.findingRefs` lists all backing findings. Reconcile does not require per-finding source agreement.
- `financial-coverage` sources the *coverage requirement* (what funds must cover), **not** the AUD 29,710 figure itself — that number remains sourced via `AU_DHA_LIVING_CAPACITY_AUD` (findings A.015 / B.002, already `used`). The two are distinct findings (the rule vs the number).

---

## 5. Checklist changes (`lib/checklist/generator.ts`)

Import `AU_STUDENT_VISA_REQUIREMENTS` and look up records by `id`. For each touched item, set `note` from the record's `summary` and `source` to a `ChecklistSource` built from the record (`url: record.source`, `lastVerified: record.lastVerified`) so the existing `SourceLine` renders.

- **CoE** (`coe`, visa / after-offer): note → the `coe` summary; add `source` (today it has none).
- **OSHC** (`oshc`, visa / after-offer): note → the `oshc` summary; add `source`.
- **Financial note** (first required financial item): the `dhaNote` string becomes —
  > "DHA expects evidence covering your travel, at least AUD 29,710 living costs, and {tuition} (plus costs for any accompanying family members)."

  — keeping the existing Nepal-L3 seasoning sentence and the DHA `SourceLine`, and attaching the `financial-coverage` record's `findingRefs` as the coverage provenance.

Copy is canonical (approved); whitespace/wording polish during implementation is fine, but the sourced facts (travel coverage; OSHC ≥1 week + full duration; CoE needed for the visa application) must be present so the tests assert them.

---

## 6. Plan change (`lib/plan/generator.ts`)

Add one new item, **gated to an Australian primary destination** (`inputs.primaryDestinationId === "australia"`), sourced from the `genuine-student` record:

- `kind`: `"prepare-gs-answers"`
- `impact`: `"high"`
- `title`: **"Prepare your Genuine Student answers"**
- `body`: "Every Australian student visa (lodged since 23 Mar 2024) is assessed on the Genuine Student requirement. You'll answer four questions — your current circumstances and ties, why this course and provider, how it benefits you, and anything else relevant — each in 150 words or less. Draft your answers early; they anchor your whole application."
- `timeEstimate`: "2–4 hours"

It is a standing high-impact action (like `season-funds-six-months` it always emits for its destination); the F2 auto-close logic leaves it open until the user marks it done/dismissed. It must **not** emit for non-AU destinations.

---

## 7. Finding edits + status derivation (slice-kit steps 3 & 8)

1. **Hand-set `value_status`** on the 21 integrated findings in `A.jsonl`: `prose-only` for the 20 rule/process findings; `structured` for A.021 (`value:150, value_type:"number", unit:"words"`). The 7 use-later findings are left untouched (`pending` / `value_status:"unset"`).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the 21 code-referenced findings to `status:"used"` with an ID-accurate `used_by`. Inspect `git diff docs/research-briefs/findings/A.jsonl` — only those 21 (plus the value_status edits) may change.

---

## 8. Schema + registry (slice-kit steps 6 & 7)

- **`lib/data/schema/au-student-visa-requirements.schema.ts`** (~15 lines) reusing `ProvenanceSchema` (≥1 findingRef), `HttpUrl`, `IsoDate` from `common.ts`; enum on `id`; `responseLimitWords`/`questions`/`appliesSince` optional with sane refinements; unique-`id` array refine. Mirror `au-visa-facts.schema.ts`.
- **`lib/data/schema/registry.ts`** — append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "AU_STUDENT_VISA_REQUIREMENTS",
    data: AU_STUDENT_VISA_REQUIREMENTS, schema: AuStudentVisaRequirementsSchema,
    recordLabel: "au-student-visa-requirements", subRecordKeys: [],
    recordInterface: "AuStudentVisaRequirement" }
  ```
  This is the only wiring — `tests/data/{schema,reconcile-modules,flip-status.run}.test.ts` all iterate the registry, so the module is covered automatically.

---

## 9. Testing — TDD RED → GREEN → adversarial

Write the failing test first for each behavior; watch it fail for the right reason; implement the minimum; confirm green; then mutate to confirm the guard bites.

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity / conflict gate), schema parse, and flip-status normal-mode clean for the new module.
- **`tests/checklist/*`**: new cases asserting (a) the CoE item has the enriched note + a `SourceLine`; (b) the OSHC item note states "at least a week" + "full" duration + a `SourceLine`; (c) the financial note includes "travel". RED first (today's notes lack these).
- **`tests/plan/*`**: GS-answers item emitted when `primaryDestinationId === "australia"`, and **absent** for a non-AU destination. RED first.
- **Adversarial mutation** (must bite, then revert): change the structured value (A.021 `150` → `151`, or `responseLimitWords` in the module) → reconcile fails `VALUE_DRIFT`. Remove a record's findingRef → the dropped finding fails `ORPHAN_USED` / is demoted by flip-status.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all of these pass. This is the real gate:**
- `npx vitest run tests/data/` → `reconcile OK · used += 21 · 0 orphans · 0 drift · 0 open-conflict-uses` + schema parses + flip-status normal-mode clean.
- `npm run typecheck` clean.
- `npm test` full suite green (checklist + plan suites include the new cases).
- `node docs/research-briefs/_tools/build-ledger.js` → **A: used 12 → 33, pending 110 → 89**; inspect the regenerated `findings-clusters.md` / ledger diff to confirm only this slice moved.
- **`git diff -- tests/scoring/__fixtures__/golden-assessments.json` is empty** (byte-identical — no scorer import).

**Best-effort (non-gating) — do it if the environment allows; it never blocks the merge:**
- Browser smoke via the preview tools: a Nepal→AU `/checklist/[programId]` shows the enriched CoE/OSHC/financial notes + `SourceLine`s, and `/plan` shows the GS-answers item. Signed-in routes are OAuth-gated and the dev-session seam was removed, so this typically falls back to the `Results`/checklist/plan composition unit tests — note which was used. The automated tests + reconcile + typecheck are the real gate.

---

## 11. Commit plan (granular; git ritual)

One slice branch; granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); use explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-student-visa-requirements.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edits + `FLIP_STATUS` run. `tests/data/` green.
2. **Checklist consumption** — generator edit + checklist tests.
3. **Plan item** — generator edit + plan tests.

Then `git merge --ff-only` → push → delete branch. Report after the merge.

(The spec + the writing-plans plan doc are committed on the same branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new vault `DocumentKind`s (under-18 forms are deferred, not added to the taxonomy).
- No new pages/routes; only the two existing generators change.
- The 7 use-later findings and the 82 Nepal-logistics remainder stay `pending`.

---

## 13. Success criteria

1. The four pillars are sourced: CoE/OSHC/financial checklist items carry a finding-backed `SourceLine`; the financial note states travel coverage; the plan surfaces the GS-answers action for AU.
2. All four reconcile invariants are green for category A with `used` = 33, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical.
4. The ledger (`build-ledger.js`) shows exactly this slice's 21 findings moved `pending → used`, with the 7 deferrals recorded as use-later by slice boundary.
