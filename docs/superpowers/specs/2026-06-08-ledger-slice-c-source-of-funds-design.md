# Ledger slice C — Nepal source-of-funds / remittance readiness → checklist + plan

**Status:** Design approved 2026-06-08 (subset, surfaces, and approach confirmed).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slices A & B established the new-sourced-module pattern this slice reuses. Slice B answered the DHA-side "what evidence counts?"; this slice answers the adjacent Nepal-side question.

---

## 1. Context & goal

Slice B taught the finance surfaces *what evidence DHA accepts*. The natural next question from a Nepal student is concrete and high-trust: *"How do I legally move and pay the money from Nepal?"* That pathway is governed by Nepal Rastra Bank (NRB) rules and the education-ministry No Objection Certificate (NOC) — and the app currently says **nothing** about it. (The only existing "source-of-funds" copy — [checklist:91](../../../lib/checklist/generator.ts), [plan:111](../../../lib/plan/generator.ts) — is DHA-side *seasoning*, a different concept; the bare term "NOC" appears once, unglossed, at [nepal-banks.ts:131](../../../lib/data/source/nepal-banks.ts).)

This slice wires the **NRB remittance pathway** into two already-shipped surfaces:

- `lib/checklist/generator.ts` (per-program document checklist — a new financial-group info note),
- `lib/plan/generator.ts` (a new funding-prep action).

**Goal:** make the finance surfaces state *how a Nepali bank legally releases foreign currency for study* — you need an NOC and your institution's documents; banks remit the NRB-set living-expense amount when documents don't state it, after confirming approval on the MoEST portal — every shipped phrase provably traced to a `used` finding and machine-checked by the reconcile harness.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. No golden-regeneration tax.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the five findings describing the **NRB remittance pathway + what an NOC is**. The four-state vocabulary maps onto the slice-kit exactly (`used` = `status:"used"`; `rejected:<reason>` = reason rides in the status string; `use-later` = left `pending`, named here as the scope boundary; `needs-human-call` = `pending` + flagged).

### Wired → `used` (5)

| Finding | Claim | `kind` | Consuming surface |
|---|---|---|---|
| **B.016** | An NOC is the approval the Government of Nepal grants students to study abroad | definition | Checklist note (gloss) |
| **B.012** | NRB: remitting study funds requires an NOC from the education ministry | bank-requirement | Checklist + plan |
| **B.013** | NRB: also requires an institution letter / brochure / invoice / I-20 / equivalent | bank-requirement | Checklist + plan |
| **B.014** | NRB: banks may remit the NRB-set living-expense amount when docs don't state it | remittance-mechanism | Checklist + plan |
| **B.015** | NRB (2022/23 report): BFIs release forex after confirming approval on the MoEST portal | remittance-mechanism | Checklist + plan |

B.012–B.015 are `claim_type:"process"`; B.016 is `claim_type:"data"` but carries `value:null`. All five have no extractable structured value → each gets `value_status:"prose-only"`. (Confirmed safe: `finding-schema.js` gates the structured-value rule on `value_status==="structured"` only, never on `claim_type`; `reconcile.js` value-fidelity likewise checks only structured findings. So a `data`-type finding with `value:null` is a valid `prose-only` member.)

### Cluster integrity

- **B.012–B.016 are all standalone** — `dup_group:null` and `conflict_with:null` on every one (verified). **Zero contradictions**, so `rejected:<reason>` and `needs-human-call` have **no members** in this slice (recorded for completeness).
- The only `dup_group` in B.012–B.026 is **`G13` (B.017–B.020)**, the NOC required-document enumeration — **entirely inside the excluded NOC-journey cluster**. Leaving all of B.017–B.026 `pending` strands **no sibling** (the whole group stays pending together).
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays 41 clusters).

### Use-later by slice boundary — intentionally triaged, stay `pending`

- **B.017–B.026** — the MoEST NOC **document journey**: the required-document list (`G13` = B.017–B.020, plus B.021 transcript and B.022 offer/I-20), online submission (B.023), visit-with-originals (B.024), and portal contacts (B.025–B.026). This is the "broad NOC document journey" deferred by design.
- The wider B-finance remainder also stays `pending`: bank products (B.090–B.096), payment mechanics (B.099–B.133).

These are **use-later by slice boundary, not "pending because ignored."**

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No bank-catalogue UI** (`nepal-banks.ts` / `BankLoanPanel` untouched).
- **No payment-provider mechanics.**
- **No broad NOC document journey** (B.017–B.026 use-later).
- **No profile-editor change** — this slice is plan/checklist only.

**Ledger math after the slice:** category B `used` 87 → **92**, `pending` 48 → **43** (total 135; 0 rejected). Overall ledger `used` 368 → **373**, `pending` 746 → **741**. `build-ledger.js` must show movement of exactly these 5.

---

## 3. Architecture — the wiring path

Per the slice-kit contract, a finding becomes `used` only when a **registered data-module record** carries `provenance.findingRefs:["B.xxx"]` and the finding declares a non-`unset` value. The CI invariants are enforced by `tests/data/` over every registered module.

```
B.jsonl findings ──(provenance.findingRefs)──► nepal-source-of-funds.ts (NEW data module)
       │                                                  │
       │                                                  ├─► checklist/generator.ts (NEW fin-nrb-remittance info item)
       │                                                  └─► plan/generator.ts      (NEW prepare-fund-remittance action)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the code's findingRefs — never hand-edited)
```

The module is **pure sourced public data** (NRB / MoEST published rules), not scoring logic. Both consumers are **server-side** generators (no client-component import this slice — even simpler than slice B's profile edit). The `kind` discriminator (`definition` / `bank-requirement` / `remittance-mechanism`) lets both surfaces compose the note from records rather than hardcoding phrases.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface (mirrors `AuFinancialEvidence`):

```ts
export interface NepalSourceOfFunds extends Provenanced {
  id: "noc-definition" | "noc-requirement" | "institution-documents"
    | "living-expense-remittance" | "forex-portal-confirmation";
  kind: "definition" | "bank-requirement" | "remittance-mechanism";
  label: string;     // short, inline
  summary: string;   // full phrase — the displayed copy
  source: string;    // canonical URL
  lastVerified?: string;
}
```

**`lib/data/source/nepal-source-of-funds.ts`** — `export const NEPAL_SOURCE_OF_FUNDS: NepalSourceOfFunds[]`, five records. Three URL consts:

- `NRB_STUDY = "https://www.nrb.org.np/2020/11/%E0%A4%89%E0%A4%9A%E0%A5%8D%E0%A4%9A-%E0%A4%B6%E0%A4%BF%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE-%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%AF%E0%A4%A8%E0%A4%95%E0%A4%BE-%E0%A4%B2%E0%A4%BE%E0%A4%97/"` (NRB study-abroad circular)
- `NRB_ANNUAL = "https://www.nrb.org.np/contents/uploads/2024/03/Annual-Report-2022-23-English.pdf"`
- `MOEST_NOC = "https://noc.moest.gov.np/"`

`lastVerified: "2026-06-08"` throughout. Each record's `provenance.findingRefs` is the single `B.0xx` shown.

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|---|
| `noc-definition` | definition | B.016 | "What an NOC is" | "A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad." | MOEST_NOC |
| `noc-requirement` | bank-requirement | B.012 | "No Objection Certificate" | "a No Objection Certificate from Nepal's education ministry" | NRB_STUDY |
| `institution-documents` | bank-requirement | B.013 | "Institution documents" | "an institution letter, brochure, invoice, I-20, or equivalent document" | NRB_STUDY |
| `living-expense-remittance` | remittance-mechanism | B.014 | "NRB living-expense remittance" | "Banks may remit the living-expense amount Nepal Rastra Bank sets when your institution's documents don't state living expenses." | NRB_STUDY |
| `forex-portal-confirmation` | remittance-mechanism | B.015 | "MoEST portal confirmation" | "Banks release foreign-exchange facilities after confirming your foreign-study approval on the MoEST portal." | NRB_ANNUAL |

The two `bank-requirement` summaries are article-first so they concatenate with "and"; the `remittance-mechanism` summaries are standalone sentences.

---

## 5. Checklist change (`lib/checklist/generator.ts`)

Import `NEPAL_SOURCE_OF_FUNDS`. Compose a remittance note from the records and add **one new info item** to the financial group, placed after the funding-source switch ([:126](../../../lib/checklist/generator.ts)), **unconditional** (the checklist is per-program reference material):

```ts
const SOF = NEPAL_SOURCE_OF_FUNDS;
const sofDef = SOF.find((r) => r.kind === "definition")!;
const sofPrimary = SOF.find((r) => r.id === "noc-requirement")!; // NRB study page → item source
const sofReqs = SOF.filter((r) => r.kind === "bank-requirement").map((r) => r.summary);
const sofMechs = SOF.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary);
const remittanceNote =
  `${sofDef.summary} Before releasing foreign currency, your bank requires ${sofReqs.join(" and ")}. ${sofMechs.join(" ")}`;
```

```ts
add({
  key: "fin-nrb-remittance", kind: null, label: "NOC + institution documents",
  group: "financial", stage: "now", requirement: "required",
  note: remittanceNote,
  source: { url: sofPrimary.source, lastVerified: sofPrimary.lastVerified },
});
```

`kind:null` → `status:"info"` (the AHPRA / fin-scholarship pattern); the checklist UI renders `info` with a "· Bring this" suffix ([checklist-item.tsx:4](../../../components/checklist/checklist-item.tsx)), so the label is a documents noun-phrase — "NOC + institution documents · Bring this" reads naturally (a gerund like "Releasing funds…" would not). The DHA `financeNote`, the funding-source branches, and the seasoning sentence are **unchanged**.

> **Rendered note:** "A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad. Before releasing foreign currency, your bank requires a No Objection Certificate from Nepal's education ministry and an institution letter, brochure, invoice, I-20, or equivalent document. Banks may remit the living-expense amount Nepal Rastra Bank sets when your institution's documents don't state living expenses. Banks release foreign-exchange facilities after confirming your foreign-study approval on the MoEST portal."

New assertions: item `fin-nrb-remittance` exists, `status:"info"`, note contains "No Objection Certificate" / "institution letter" / "Nepal Rastra Bank" / "MoEST portal" / "grants Nepalese students"; `source.url` contains `nrb.org.np`.

---

## 6. Plan change (`lib/plan/generator.ts`)

Import `NEPAL_SOURCE_OF_FUNDS`. Add **one new `PlanItem`** (`PlanItem.kind` is a free `string` — no union to extend), gated on funding source being set and not pure-scholarship:

```ts
const sofReqs = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ");
const sofMechs = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ");
// ...
const fundsNeedRemittance = !!s.finance?.source && s.finance.source !== "scholarship-dependent";
if (fundsNeedRemittance) {
  out.push({
    kind: "prepare-fund-remittance",
    impact: "medium",
    title: "Prepare to release your funds from Nepal",
    body: `Moving money abroad for study runs through Nepal Rastra Bank. Your bank requires ${sofReqs}. ${sofMechs}`,
    timeEstimate: "1-2 weeks",
  });
}
```

> **Rendered body:** "Moving money abroad for study runs through Nepal Rastra Bank. Your bank requires a No Objection Certificate from Nepal's education ministry and an institution letter, brochure, invoice, I-20, or equivalent document. Banks may remit the living-expense amount Nepal Rastra Bank sets when your institution's documents don't state living expenses. Banks release foreign-exchange facilities after confirming your foreign-study approval on the MoEST portal."

New assertions: item present for `self-funded` (body contains "No Objection Certificate" / "institution letter" / "Nepal Rastra Bank" / "MoEST portal"); **absent** when source unset; **absent** when `scholarship-dependent`.

B.016 (definition) is `used` because the module record references it and the checklist renders it; the plan body deliberately omits the definition (it's a checklist gloss). All five findings are referenced by module records → all `used`.

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on B.012–B.016 in `B.jsonl` via a parse-by-id node one-liner (string-replace only the target lines; leave `cluster_triage` and every other field untouched; preserve line endings).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the five code-referenced findings to `status:"used"` with ID-accurate `used_by` (`nepal-source-of-funds[<id>]`). Inspect `git diff -- docs/research-briefs/findings/B.jsonl` — only those five lines (value_status + status + used_by) may change.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/nepal-source-of-funds.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` and `kind`; non-empty `label`/`summary`; unique-`id` array refine. Mirror `au-financial-evidence.schema.ts`.
- **`lib/data/schema/registry.ts`** — append one `DataModuleEntry`:
  ```ts
  { category: "B", exportName: "NEPAL_SOURCE_OF_FUNDS",
    data: NEPAL_SOURCE_OF_FUNDS, schema: NepalSourceOfFundsSchema,
    recordLabel: "nepal-source-of-funds", subRecordKeys: [],
    recordInterface: "NepalSourceOfFunds" }
  ```
  This is the only wiring — `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically. `registry-integrity` enforces unique `recordLabel` + `exportName` (both new).

---

## 9. Testing — TDD RED → GREEN → adversarial

Write the failing test first; watch it fail for the right reason; implement the minimum; confirm green; then mutate to confirm the guard bites.

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity N/A for prose-only / conflict gate), schema parse, flip-status normal-mode clean, findings-integrity + registry-integrity for the new module.
- **`tests/checklist/generator.test.ts`**: new case — `fin-nrb-remittance` info item exists with the five content tokens + NRB source. RED first.
- **`tests/plan/generator.test.ts`**: new cases — `prepare-fund-remittance` present for `self-funded` with the four tokens; absent for unset source; absent for `scholarship-dependent`. RED first.
- **Adversarial mutation** (must bite, then revert) — adapted for prose-only (no structured value to drift): revert one of the five findings' `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm it fails with `USED_UNSET`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass. This is the real gate:**

- `npx vitest run tests/data/` → reconcile clean (`used += 5`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema parses + flip-status normal-mode clean + findings/registry integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green (checklist + plan suites include the new cases).
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical — no scorer import).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → regenerate `findings-ledger.md`: **B used 87 → 92, pending 48 → 43** (overall used 368 → 373, pending 746 → 741); confirm only this slice moved and clusters stay 41. **Run build-ledger.js, not just list-pending.js**, so the dashboard does not lie.

**Best-effort (non-gating) — do it if the environment allows; it never blocks the merge:**

- Browser smoke via the preview tools: a Nepal→AU `/plan` (with a funding source set) shows the new "Prepare to release your funds from Nepal" action; `/checklist/[programId]` shows the "NOC + institution documents" note. Signed-in routes are OAuth-gated and the dev-session seam was removed, so this typically falls back to the composition unit tests — note which was used. The automated tests + reconcile + typecheck are the real gate.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-c-source-of-funds`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); use explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `nepal-source-of-funds.ts` + `.schema.ts` + registry line + `B.jsonl` value_status edits + `FLIP_STATUS` run. `tests/data/` green.
2. **Checklist consumption** — generator edit (new `fin-nrb-remittance` info item) + checklist test.
3. **Plan consumption** — generator edit (new `prepare-fund-remittance` action) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (test count + slice-C bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + the writing-plans plan doc are committed on the same branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No `nepal-banks.ts` / `BankLoanPanel` / bank-catalogue UI.
- No payment-provider mechanics; no NOC document journey (B.017–B.026 use-later).
- No profile-editor change; no new pages/routes — only the two generators + the new module.

---

## 13. Success criteria

1. The checklist states the NRB remittance pathway (new info item) and the plan adds a Nepal-side funding-prep action for funded students — every phrase finding-backed.
2. All reconcile invariants are green for category B with `used` = 92, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched.
4. The ledger (`build-ledger.js`) shows exactly this slice's 5 findings moved `pending → used`, clusters unchanged, with B.017–B.026 (NOC journey) recorded as use-later by slice boundary.
