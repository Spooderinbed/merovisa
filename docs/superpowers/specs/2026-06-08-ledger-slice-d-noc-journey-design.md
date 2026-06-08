# Ledger slice D — MoEST NOC document journey → checklist + plan

**Status:** Design approved 2026-06-08 (subset, surfaces, and Approach 1 confirmed).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slice C shipped the `nepal-source-of-funds` module and told the student *"your bank needs an NOC before it releases money."* This slice is the direct sequel: it answers *"how do I get the NOC?"*

---

## 1. Context & goal

Slice C wired the NRB remittance pathway and, in doing so, told the student a No Objection Certificate (NOC) is the thing a Nepali bank checks before releasing foreign currency ([checklist:136](../../../lib/checklist/generator.ts), [plan:90](../../../lib/plan/generator.ts)). It deliberately stopped at *naming* the NOC. The obvious, high-trust next question is concrete: **"How do I actually get one?"** The app currently answers it nowhere — the MoEST process (required documents, online submission, the in-person originals check) is unsurfaced.

This slice wires the **MoEST NOC application journey** into the same two already-shipped surfaces:

- `lib/checklist/generator.ts` (per-program document checklist — a new after-offer "visa"-group info note),
- `lib/plan/generator.ts` (a new after-offer funding-prep action).

**Goal:** make the finance/visa surfaces state *what the NOC application requires and how it runs* — the citizenship/academic/guardian/previous-NOC/transcript/offer documents the MoEST portal asks for, that you can submit online, and that a verified application ends in an in-person visit with all originals — every shipped phrase provably traced to a `used` finding and machine-checked by the reconcile harness.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. No golden-regeneration tax.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the eight findings describing the **NOC application journey**: the six required documents and the two process steps. The four-state vocabulary maps onto the slice-kit exactly (`used` = `status:"used"`; `rejected:<reason>` = reason rides in the status string; `use-later` = left `pending`, named here as the scope boundary; `needs-human-call` = `pending` + flagged).

### Wired → `used` (8)

| Finding | Claim | `kind` | Consuming surface |
|---|---|---|---|
| **B.017** | MoEST NOC portal lists a citizenship certificate as required | required-document | Checklist + plan |
| **B.018** | …an academic certificate | required-document | Checklist + plan |
| **B.019** | …guardian citizenship | required-document | Checklist + plan |
| **B.020** | …an old/previous NOC (when one exists) | required-document | Checklist + plan |
| **B.021** | NOC login page: an academic transcript of +2, PCL, or equivalence | required-document | Checklist + plan |
| **B.022** | NOC login page: an admission, offer, acceptance, or I-20 letter | required-document | Checklist + plan |
| **B.023** | MoEST: foreign-study permit applications can be submitted online | process-step | Checklist + plan |
| **B.024** | MoEST: a visit date/time message means attend with all originals | process-step | Checklist + plan |

All eight are `claim_type:"process"` with `value:null` → no extractable structured value → each gets `value_status:"prose-only"`. (Confirmed safe in slice C: `finding-schema.js` gates the structured-value rule on `value_status==="structured"` only, never on `claim_type`; `reconcile.js` value-fidelity likewise checks only structured findings.)

### Cluster integrity

- **`dup_group G13` = B.017–B.020** (the required-document enumeration) is **fully in scope** — all four members flip together, so **no sibling is stranded**. B.021–B.024 are `dup_group:null`.
- **`conflict_with:null` on all eight** (verified) → **zero contradictions**, so `rejected:<reason>` and `needs-human-call` have **no members** in this slice (recorded for completeness).
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays **41 clusters**).

### Use-later by slice boundary — intentionally triaged, stay `pending`

- **B.025–B.026** — the NOC portal **contact email (noc@moest.gov.np) and phone (+01-6635419)**. Deferred: both are `claim_type:"contact"` with `value:null`, contact details carry the highest staleness risk, and a published government email/phone is the kind of datum we surface only with a deliberate "last-checked" treatment. Recorded as **use-later**, not ignored. (If ever wired, they go in as `prose-only` like the rest.)
- The wider B-finance remainder also stays `pending`: bank products (B.090–B.096), payment mechanics (B.099–B.133).

These are **use-later by slice boundary, not "pending because ignored."**

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No new `DocumentKind`** — the NOC item is an `info` note (`kind:null`), not an uploadable document type.
- **No new checklist group** — reuse the existing `visa` (after-offer) group.
- **No new pages/routes; no profile-editor change** — this slice is the two generators + the new module only.
- **No bank-catalogue UI** (`nepal-banks.ts` / `BankLoanPanel` untouched).

**Ledger math after the slice:** category B `used` 92 → **100**, `pending` 43 → **35** (0 rejected). Overall ledger `used` 373 → **381**, `pending` 741 → **733**. `build-ledger.js` must show movement of exactly these 8; clusters stay 41.

---

## 3. Architecture — the wiring path

Per the slice-kit contract, a finding becomes `used` only when a **registered data-module record** carries `provenance.findingRefs:["B.xxx"]` and the finding declares a non-`unset` value. The CI invariants are enforced by `tests/data/` over every registered module.

```
B.jsonl findings ──(provenance.findingRefs)──► nepal-noc-journey.ts (NEW data module)
       │                                                  │
       │                                                  ├─► checklist/generator.ts (NEW noc-application info item, visa group)
       │                                                  └─► plan/generator.ts      (NEW apply-for-noc action)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the code's findingRefs — never hand-edited)
```

The module is **pure sourced public data** (MoEST published process), not scoring logic. Both consumers are **server-side** generators. The `kind` discriminator (`required-document` / `process-step`) lets both surfaces compose the note from records rather than hardcoding phrases — exactly as slice C's `kind` discriminator did.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `NepalSourceOfFunds` (mirrors it):

```ts
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
  label: string;     // short, inline
  summary: string;   // full phrase — the displayed copy
  source: string;    // canonical MoEST URL
  lastVerified?: string;
}
```

**`lib/data/source/nepal-noc-journey.ts`** — `export const NEPAL_NOC_JOURNEY: NepalNocJourney[]`, eight records. Three URL consts:

- `MOEST_NOC = "https://noc.moest.gov.np/"` (NOC portal root)
- `MOEST_NOC_LOGIN = "https://noc.moest.gov.np/login"` (portal login page document list)
- `MOEST_FAQ = "https://moest.gov.np/pages/faq/"` (foreign-study FAQ)

`lastVerified: "2026-06-05"` throughout (the findings' own recorded verification date — honored over the slice date). Each record's `provenance.findingRefs` is the single `B.0xx` shown.

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|---|
| `noc-doc-citizenship` | required-document | B.017 | "Citizenship certificate" | "a citizenship certificate" | MOEST_NOC |
| `noc-doc-academic` | required-document | B.018 | "Academic certificate" | "an academic certificate" | MOEST_NOC |
| `noc-doc-guardian` | required-document | B.019 | "Guardian citizenship" | "your guardian's citizenship certificate" | MOEST_NOC |
| `noc-doc-previous` | required-document | B.020 | "Previous NOC" | "any previous NOC you already hold" | MOEST_NOC |
| `noc-doc-transcript` | required-document | B.021 | "Academic transcript" | "an academic transcript of your +2, PCL, or equivalent" | MOEST_NOC_LOGIN |
| `noc-doc-offer` | required-document | B.022 | "Offer / I-20 letter" | "your admission, offer, acceptance, or I-20 letter" | MOEST_NOC_LOGIN |
| `noc-step-online` | process-step | B.023 | "Online submission" | "You can submit the foreign-study permit application online through the MoEST portal." | MOEST_FAQ |
| `noc-step-visit` | process-step | B.024 | "In-person originals check" | "Once your application is verified, MoEST messages you a visit date and time; attend in person with all your original documents." | MOEST_FAQ |

The six `required-document` summaries are article-first so they concatenate into an Oxford-"and" list; the two `process-step` summaries are standalone sentences. (`noc-doc-previous` is phrased without an internal comma so the joined list stays readable.)

---

## 5. Checklist change (`lib/checklist/generator.ts`)

Import `NEPAL_NOC_JOURNEY`. Compose the NOC note from the records and add **one new info item** to the `visa` group, placed **right after the `offer-letter` item** ([:161](../../../lib/checklist/generator.ts)) — the NOC application gates on having an offer (B.022), so after-offer is its natural home and it leads the after-offer sequence. **Unconditional** (every Nepal→AU student needs it, like the other visa items):

```ts
const NOC = NEPAL_NOC_JOURNEY;
const NOC_PRIMARY = NOC.find((r) => r.id === "noc-doc-citizenship")!; // MoEST portal → item source
const NOC_DOCS = NOC.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NOC.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
const NOC_NOTE =
  "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, " +
  "and your bank needs it before releasing tuition or living expenses. " +
  `The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ${NOC_STEPS}`;
```

```ts
add({
  key: "noc-application", kind: null, label: "No Objection Certificate (NOC)",
  group: "visa", stage: "after-offer", requirement: "required",
  note: NOC_NOTE,
  source: { url: NOC_PRIMARY.source, lastVerified: NOC_PRIMARY.lastVerified },
});
```

`kind:null` → `status:"info"`; the checklist UI renders `info` with a "· Bring this" suffix ([checklist-item.tsx:4](../../../components/checklist/checklist-item.tsx)), so the label is a document noun-phrase — **"No Objection Certificate (NOC) · Bring this"** reads naturally. A small private `oxfordAnd(items: string[])` joiner is added (mirrors the plan's existing `oxfordOr` at [plan:19](../../../lib/plan/generator.ts)) to join the six documents as "a, b, …, and f". The identity/academic/english/financial items and the other visa items are **unchanged**.

> **Rendered note:** "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, and your bank needs it before releasing tuition or living expenses. The MoEST portal asks for a citizenship certificate, an academic certificate, your guardian's citizenship certificate, any previous NOC you already hold, an academic transcript of your +2, PCL, or equivalent, and your admission, offer, acceptance, or I-20 letter. You can submit the foreign-study permit application online through the MoEST portal. Once your application is verified, MoEST messages you a visit date and time; attend in person with all your original documents."

New assertions: item `noc-application` exists in the `visa` group, `stage:"after-offer"`, `status:"info"`, `kind:null`, `label:"No Objection Certificate (NOC)"`; note contains "No Objection Certificate" / "academic transcript" / "original documents"; `source.url` contains `moest.gov.np`.

---

## 6. Plan change (`lib/plan/generator.ts`)

Import `NEPAL_NOC_JOURNEY`. Add a private `oxfordAnd` (mirroring `oxfordOr`) and the composed consts, then add **one new `PlanItem`** (`PlanItem.kind` is a free `string` — no union to extend), placed right after the Genuine Student block ([:142](../../../lib/plan/generator.ts)), gated the same way as that item — `primaryDestinationId === "australia"` (an AU-commitment process nudge):

```ts
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
// ...
if (inputs.primaryDestinationId === "australia") {
  out.push({
    kind: "apply-for-noc",
    impact: "medium",
    title: "Apply for your NOC (No Objection Certificate)",
    body:
      `Once your offer arrives, apply for your No Objection Certificate (NOC) — the Nepal Ministry of ` +
      `Education permit your bank needs before it can remit tuition. The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ` +
      `${NOC_STEPS} It can take time, so start as soon as you're accepted.`,
    timeEstimate: "1-2 weeks",
  });
}
```

> **Rendered body:** "Once your offer arrives, apply for your No Objection Certificate (NOC) — the Nepal Ministry of Education permit your bank needs before it can remit tuition. The MoEST portal asks for a citizenship certificate, an academic certificate, your guardian's citizenship certificate, any previous NOC you already hold, an academic transcript of your +2, PCL, or equivalent, and your admission, offer, acceptance, or I-20 letter. You can submit the foreign-study permit application online through the MoEST portal. Once your application is verified, MoEST messages you a visit date and time; attend in person with all your original documents. It can take time, so start as soon as you're accepted."

**Accepted Approach-1 trade-off:** slice C's `prepare-fund-remittance` already name-checks the NOC as a *bank requirement* (gated on funding source). This `apply-for-noc` is the *application action* (gated on AU primary). The word "NOC" can therefore appear twice in the plan, but the two are distinct actions firing on different gates and never contradict — the cost the user accepted in choosing both surfaces.

New assertions: item `apply-for-noc` present for `primaryDestinationId:"australia"` with `impact:"medium"`, title contains "NOC", body contains "academic transcript" / "original documents" / "MoEST"; **absent** for `null` and non-AU (`"canada"`) destinations.

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on B.017–B.024 in `B.jsonl` via a parse-by-id node one-liner (string-replace only the eight target lines; leave `cluster_triage`, `dup_group`, and every other field untouched; preserve CRLF line endings). **B.025–B.026 are left `unset`/`pending`** (use-later).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the eight code-referenced findings to `status:"used"` with ID-accurate `used_by` (`nepal-noc-journey[<id>]`). Inspect `git diff -- docs/research-briefs/findings/B.jsonl` — only those eight lines (value_status + status + used_by) may change, and B.025–B.026 must remain `pending`.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/nepal-noc-journey.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (8 values) and `kind` (2 values); non-empty `label`/`summary`; unique-`id` array refine. Mirror `nepal-source-of-funds.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `NEPAL_SOURCE_OF_FUNDS` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "B", exportName: "NEPAL_NOC_JOURNEY",
    data: NEPAL_NOC_JOURNEY, schema: NepalNocJourneySchema,
    recordLabel: "nepal-noc-journey", subRecordKeys: [],
    recordInterface: "NepalNocJourney" }
  ```
  This is the only wiring — `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically. `registry-integrity` enforces unique `recordLabel` + `exportName` (both new).

---

## 9. Testing — TDD RED → GREEN → adversarial

Write the failing test first; watch it fail for the right reason; implement the minimum; confirm green; then mutate to confirm the guard bites.

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity N/A for prose-only / conflict gate), schema parse, flip-status normal-mode clean, findings-integrity + registry-integrity for the new module.
- **`tests/checklist/generator.test.ts`**: new case — `noc-application` after-offer visa info item with the content tokens + MoEST source. RED first.
- **`tests/plan/generator.test.ts`**: new cases — `apply-for-noc` present for AU primary with the tokens; absent for unset destination; absent for non-AU (`"canada"`). RED first.
- **Adversarial mutation** (must bite, then revert) — adapted for prose-only (no structured value to drift): revert one of the eight findings' `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm it fails with `USED_UNSET`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass. This is the real gate:**

- `npx vitest run tests/data/` → reconcile clean (`used += 8`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema parses + flip-status normal-mode clean + findings/registry integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green (checklist + plan suites include the new cases).
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical — no scorer import).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → regenerate `findings-ledger.md`: **B used 92 → 100, pending 43 → 35** (overall used 373 → 381, pending 741 → 733); confirm only this slice moved, B.025–B.026 stay `pending`, and clusters stay 41. **Run build-ledger.js, not just list-pending.js.**

**Best-effort (non-gating) — do it if the environment allows; it never blocks the merge:**

- Browser smoke via the preview tools: a Nepal→AU `/plan` (with AU primary) shows the new "Apply for your NOC (No Objection Certificate)" action; `/checklist/[programId]` shows the after-offer "No Objection Certificate (NOC)" note. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests — note which was used. The automated tests + reconcile + typecheck are the real gate.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-d-noc-journey`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); use explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `nepal-noc-journey.ts` + `.schema.ts` + registry line + `B.jsonl` value_status edits + `FLIP_STATUS` run. `tests/data/` green.
2. **Checklist consumption** — generator edit (new `noc-application` info item + `oxfordAnd`) + checklist test.
3. **Plan consumption** — generator edit (new `apply-for-noc` action + `oxfordAnd`) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (test count bumped to the actual post-slice figure from `npm test` + slice-D bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + the writing-plans plan doc are committed on the same branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, no new checklist group — the NOC is an `info` item in the existing `visa` group.
- No `nepal-banks.ts` / `BankLoanPanel` / bank-catalogue UI.
- No NOC portal contacts (B.025–B.026 use-later); no payment-provider mechanics.
- No profile-editor change; no new pages/routes — only the two generators + the new module.

---

## 13. Success criteria

1. The checklist states the NOC application journey (new after-offer info item) and the plan adds an `apply-for-noc` action for AU-primary students — every phrase finding-backed.
2. All reconcile invariants are green for category B with `used` = 100, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched.
4. The ledger (`build-ledger.js`) shows exactly this slice's 8 findings moved `pending → used`, clusters unchanged at 41, with B.025–B.026 (NOC contacts) recorded as use-later by slice boundary.
