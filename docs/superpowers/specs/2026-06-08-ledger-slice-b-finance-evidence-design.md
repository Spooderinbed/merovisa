# Ledger slice B — finance evidence readiness → checklist + plan + profile

**Status:** Design approved 2026-06-08 (subset, surfaces, and approach confirmed).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical 9-step, registry-driven process).
**Builds on:** Slice A (`2026-06-08-ledger-slice-a-dha-visa-requirements-design.md`) established the new-sourced-module pattern this slice reuses.

---

## 1. Context & goal

Finance is the highest-trust, highest-consequence part of the Nepal → Australia journey. The student/family question is concrete: *"Do I have enough money, and what evidence actually counts?"* Category B of the reconciled findings (`docs/research-briefs/findings/B.jsonl`, 135 findings, 82 used / 53 pending) already powers the funding-source checklist branches and the proof-of-funds plan action. This slice answers the **"what evidence counts?"** half by wiring the **DHA acceptable-evidence paths** into the three already-shipped finance surfaces:

- `lib/checklist/generator.ts` (per-program document checklist — the financial note),
- `lib/plan/generator.ts` (the `upload-proof-of-funds` action), and
- `components/profile/editors/finance-editor.tsx` (the funding-source data-entry hint).

**Goal:** make the finance surfaces *state what DHA accepts as proof of financial capacity* (a money deposit, a loan, a scholarship/sponsorship, or a parent/partner's income) and *qualify the living-cost figure as indicative* — every shipped phrase provably traced to a `used` finding and machine-checked by the reconcile harness.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. No golden-regeneration tax.

---

## 2. Scope — the slice and its four-state disposition ledger

The Tight subset is the five findings that clarify *what evidence DHA accepts*. The four-state vocabulary maps onto the slice-kit exactly (`used` = `status:"used"`; `rejected:<reason>` = the reason rides in the status string; `use-later` = left `pending` and named here as the scope boundary; `needs-human-call` = `pending` + flagged, and `flip-status` auto-refuses unresolved contradictions).

### Wired → `used` (5)

| Finding | Claim | Consuming surface |
|---|---|---|
| **B.007** | DHA lists a **money deposit** held with a financial institution as an acceptable evidence path | Plan enumeration + profile hint |
| **B.008** | DHA lists a **loan** with a government or financial institution as an acceptable evidence path | Plan enumeration + profile hint |
| **B.009** | DHA lists a **scholarship or sponsorship** as an acceptable evidence path | Plan enumeration + profile hint |
| **B.010** | DHA lists **annual income of parents or partner** as an acceptable evidence path | Plan enumeration + profile hint |
| **B.011** | DHA's declared living-cost amount should be **indicative** of the real cost of living in Australia | Checklist financial note |

All five are `claim_type:"process"` with no structured value → each gets `value_status:"prose-only"`.

### Cluster integrity

- **B.007–B.010 are dup_group `G12`, `cluster_triage:"enumeration"`** — a list of co-existing acceptable paths, not a contradiction or duplicate. G12 has **exactly four members** (verified), all four are `used`, so **no sibling is stranded**.
- **B.011** has no `dup_group` (standalone).
- `conflict_with` is empty on all five → **zero contradictions**, so the `rejected:<reason>` and `needs-human-call` states have **no members** in this slice (recorded for completeness).
- **No `cluster_triage` edits**, so `findings-clusters.md` is unchanged (stays 41 clusters).

### Use-later by slice boundary — intentionally triaged, stay `pending`

The wider B-finance remainder is untouched and stays `pending`, to be picked up as future B-slices:
- Nepal source-of-funds / NRB / NOC (B.012–B.026),
- bank products (B.090–B.096),
- payment mechanics (B.099–B.133).

These are **use-later by slice boundary, not "pending because ignored."**

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No broad bank-catalogue UI.** B.007–B.010's `target` hint names `nepal-banks.ts (+ finance)`; this slice honors only the **+ finance** half via a new sourced module. The bank catalogue (`nepal-banks.ts` / `BankLoanPanel`) is **not** touched.
- **No trust-sensitive agent-fee / salary / KPI findings.**

**Ledger math after the slice:** category B `used` 82 → **87**, `pending` 53 → **48** (total 135; 0 rejected). Overall ledger `used` 363 → **368**, `pending` 751 → **746**. `node docs/research-briefs/_tools/build-ledger.js` must show movement of exactly these 5.

---

## 3. Architecture — the wiring path

Per the slice-kit contract, a finding becomes `used` only when a **registered data-module record** carries `provenance.findingRefs:["B.xxx"]` and the finding declares a non-`unset` value. The CI invariants (coverage, validity, value-fidelity, conflict gate) are enforced by `tests/data/` over every registered module.

```
B.jsonl findings ──(provenance.findingRefs)──► au-financial-evidence.ts (NEW data module)
       │                                                  │
       │                                                  ├─► plan/generator.ts      (upload-proof-of-funds: 4-path enumeration)
       │                                                  ├─► finance-editor.tsx     (hint: 4 paths + source link)   [client]
       │                                                  └─► checklist/generator.ts (dhaNote: B.011 indicative qualifier)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the code's findingRefs — never hand-edited)
```

The module is **pure sourced public data** — the published DHA list of acceptable evidence forms, **not** scoring logic. It is therefore safe to import into the `finance-editor.tsx` **client** component: the CLAUDE.md rule forbids exposing *scoring rules* in client JS, and these public requirement facts are not scoring rules. (Slice A's module was server-only; this slice's added client import is the one new wrinkle, and it is sound.)

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface (mirrors slice A's `AuStudentVisaRequirement`):

```ts
export interface AuFinancialEvidence extends Provenanced {
  id: "deposit" | "loan" | "scholarship" | "parent-partner-income" | "living-cost-indicative";
  kind: "evidence-path" | "living-cost-note"; // discriminator: the 4 paths vs the B.011 note
  label: string;     // short, for inline UI (profile)
  summary: string;   // full phrase — the displayed copy (plan / checklist)
  source: string;    // canonical DHA URL
  lastVerified?: string;
}
```

**`lib/data/source/au-financial-evidence.ts`** — `export const AU_FINANCIAL_EVIDENCE: AuFinancialEvidence[]`, five records. Two URL consts:
`DHA_STUDENT_500 = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500"`,
`DHA_SSVF = "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework"`.
`lastVerified: "2026-06-05"` throughout.

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|---|
| `deposit` | evidence-path | B.007 | "Money deposit" | "a money deposit held with a financial institution" | student-500 |
| `loan` | evidence-path | B.008 | "Education loan" | "a loan from a government or financial institution" | student-500 |
| `scholarship` | evidence-path | B.009 | "Scholarship or sponsorship" | "a scholarship or sponsorship" | student-500 |
| `parent-partner-income` | evidence-path | B.010 | "Parent or partner income" | "your parents' or partner's annual income" | student-500 |
| `living-cost-indicative` | living-cost-note | B.011 | "Indicative living-cost amount" | "The living-cost amount DHA asks you to show is indicative of the real cost of living in Australia." | SSVF |

The four `evidence-path` summaries are written article-first so they concatenate into a natural sentence; the `living-cost-note` summary is a standalone sentence.

---

## 5. Checklist change (`lib/checklist/generator.ts`)

Import `AU_FINANCIAL_EVIDENCE`; look up the `living-cost-indicative` record. Append its `summary` (B.011) as a sentence to the existing `dhaNote` ([:88](../../../lib/checklist/generator.ts)). Branches, the AUD figure, the Nepal-L3 seasoning sentence, and the `DHA_SOURCE` link are **unchanged**.

> **After:** "DHA expects evidence covering your travel, at least AUD 29,710 living costs, and {tuition} (plus costs for any accompanying family members). The living-cost amount DHA asks you to show is indicative of the real cost of living in Australia."

Existing assertions (`/29[,.]?710/`, `"travel"`) still pass; the new assertion is `"indicative"`.

---

## 6. Plan change (`lib/plan/generator.ts`)

Import `AU_FINANCIAL_EVIDENCE`; build the enumeration by joining the four `evidence-path` summaries with an Oxford "or". Replace the `upload-proof-of-funds` body ([:68](../../../lib/plan/generator.ts)). The AUD figure stays sourced from `AU_DHA_LIVING_CAPACITY_AUD.value`. No new item, no gating change (it still emits only when `!s.finance?.proofUploaded`).

> **After:** "DHA expects evidence covering AUD 29,710 living costs plus first-year tuition. It accepts a money deposit held with a financial institution, a loan from a government or financial institution, a scholarship or sponsorship, or your parents' or partner's annual income. A bank statement or loan sanction letter from a Class A institution is the usual proof."

---

## 7. Profile change (`components/profile/editors/finance-editor.tsx`) — minimal sourced copy

Import `AU_FINANCIAL_EVIDENCE`; from the four `evidence-path` records render one added sentence in the existing hint paragraph ([:81-87](../../../components/profile/editors/finance-editor.tsx)), plus an `<a>` to the shared `source` (student-500), styled like the existing Documents link (`text-primary` underline-on-hover). No new interactivity, no state, no change to the `BankLoanPanel` branch.

> **After:** "Have proof of funds? Upload your bank statement, loan sanction letter, or sponsor income on the Documents page to mark this as complete. DHA accepts a money deposit, an education loan, a scholarship or sponsorship, or parent or partner income as proof of funds — see the DHA student visa page."

The path enumeration and the link href are derived from the module (the four labels + their `source`); exact connectives are display polish.

---

## 8. Finding edits + status derivation (slice-kit steps 3 & 8)

1. **Hand-set `value_status:"prose-only"`** on B.007–B.011 in `B.jsonl` (all `claim_type:"process"`, no structured value). Leave `cluster_triage` and every other field untouched.
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the five code-referenced findings to `status:"used"` with an ID-accurate `used_by`. Inspect `git diff docs/research-briefs/findings/B.jsonl` — only those five (plus the value_status edits) may change.

---

## 9. Schema + registry (slice-kit steps 6 & 7)

- **`lib/data/schema/au-financial-evidence.schema.ts`** reusing `ProvenanceSchema` (≥1 findingRef), `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` and `kind`; non-empty `label`/`summary`; unique-`id` array refine. Mirror `au-student-visa-requirements.schema.ts`.
- **`lib/data/schema/registry.ts`** — append one `DataModuleEntry`:
  ```ts
  { category: "B", exportName: "AU_FINANCIAL_EVIDENCE",
    data: AU_FINANCIAL_EVIDENCE, schema: AuFinancialEvidenceSchema,
    recordLabel: "au-financial-evidence", subRecordKeys: [],
    recordInterface: "AuFinancialEvidence" }
  ```
  This is the only wiring — `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity}.test.ts` all iterate the registry, so the module is covered automatically.

---

## 10. Testing — TDD RED → GREEN → adversarial

Write the failing test first; watch it fail for the right reason; implement the minimum; confirm green; then mutate to confirm the guard bites.

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity N/A for prose-only / conflict gate), schema parse, flip-status normal-mode clean, findings-integrity for the new module.
- **`tests/checklist/generator.test.ts`**: new case — the first required financial note contains `"indicative"`; existing `29,710` + `travel` cases still pass. RED first.
- **`tests/plan/generator.test.ts`**: new case — the `upload-proof-of-funds` body enumerates the four paths (asserts "deposit", "loan", "scholarship", and the parent/partner phrase). RED first.
- **`tests/components/profile/finance-editor.test.tsx`**: new case — the hint paragraph names the DHA-accepted paths and exposes a link whose `href` contains `student-500`. RED first. (Uses the existing `@testing-library/react` render pattern.)
- **Adversarial mutation** (must bite, then revert) — adapted for prose-only (no structured value to drift): revert one of the five findings' `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm it fails with `USED_UNSET`; restore. (Optionally also: drop a record's findingRef → the finding fails `ORPHAN_USED` / is demoted by flip-status.)

---

## 11. Verification gate

**Hard gate — the slice is not "done" until all of these pass. This is the real gate:**
- `npx vitest run tests/data/` → reconcile clean (`used += 5`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema parses + flip-status normal-mode clean + findings-integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green (checklist + plan + finance-editor suites include the new cases).
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` is empty** (byte-identical — no scorer import).
- `node docs/research-briefs/_tools/build-ledger.js` → regenerate `findings-ledger.md`: **B used 82 → 87, pending 53 → 48** (overall used 363 → 368, pending 751 → 746); confirm only this slice moved and clusters stay 41. **Run build-ledger.js, not just list-pending.js**, so the dashboard does not lie.

**Best-effort (non-gating) — do it if the environment allows; it never blocks the merge:**
- Browser smoke via the preview tools: a Nepal→AU `/plan` shows the enriched proof-of-funds body, `/checklist/[programId]` shows the indicative qualifier, and the profile finance editor shows the DHA-accepted paths + link. Signed-in routes are OAuth-gated and the dev-session seam was removed, so this typically falls back to the composition unit tests — note which was used. The automated tests + reconcile + typecheck are the real gate.

---

## 12. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-b-finance-evidence`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); use explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-financial-evidence.ts` + `.schema.ts` + registry line + `B.jsonl` value_status edits + `FLIP_STATUS` run. `tests/data/` green.
2. **Checklist consumption** — generator edit (B.011 qualifier) + checklist test.
3. **Plan consumption** — generator edit (4-path enumeration) + plan test.
4. **Profile copy** — finance-editor edit + finance-editor test.
5. **Status + ledger** — `PROJECT_STATUS.md` (test count + slice-B bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge.

(The spec + the writing-plans plan doc are committed on the same branch ahead of the code commits.)

---

## 13. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No `nepal-banks.ts` / `BankLoanPanel` / bank-catalogue UI.
- No agent-fee / salary / KPI findings.
- No new pages/routes; only the two generators + one editor paragraph change.
- The B-finance remainder (B.012–B.026, B.090–B.096, B.099–B.133) stays `pending` (use-later by slice boundary).

---

## 14. Success criteria

1. The finance surfaces state DHA's accepted evidence paths (plan + profile) and qualify the living-cost figure as indicative (checklist), every phrase finding-backed.
2. All reconcile invariants are green for category B with `used` = 87, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched.
4. The ledger (`build-ledger.js`) shows exactly this slice's 5 findings moved `pending → used`, clusters unchanged, with the B-finance remainder recorded as use-later by slice boundary.
