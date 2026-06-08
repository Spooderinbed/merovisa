# Ledger slice E — DHA document preparation (translation + certified copies) → checklist + plan

**Status:** Design approved 2026-06-08 (subset = DHA core 5, surfaces = checklist + plan / Approach 1, and the certification-scoping copy tweak confirmed).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slices C/D wired the finance + NOC journey. This is the first **Category-A logistics** slice — it addresses document *form* (how Nepali-language documents are made acceptable to DHA), a concern orthogonal to the finance lane.

---

## 1. Context & goal

The checklist already *lists* the documents a Nepal→AU applicant must produce — passport, citizenship/national ID, birth certificate, transcripts ([checklist:71–73](../../../lib/checklist/generator.ts)). It says nothing about the **form** those documents must take. For a Nepali applicant this is a real, concrete gap: their citizenship, birth certificate, and academic certificates are in Nepali, and DHA will not accept them as-is. Two DHA rules govern this and are currently unsurfaced:

1. **Translation** — every non-English document must be translated into English, the original *and* the translation are both submitted, and an overseas translator's full credentials must be listed.
2. **Certified copies** — DHA asks for *certified* copies of some identity documents (birth certificate, national identity card), not plain photocopies.

This slice wires the **DHA document-preparation rules** into the same two already-shipped surfaces:

- `lib/checklist/generator.ts` (per-program document checklist — a new identity-group info note),
- `lib/plan/generator.ts` (a new AU-gated document-prep action).

**Goal:** make the document surfaces state *how to prepare Nepali-language documents for DHA* — translate non-English documents, submit original + translation, list an overseas translator's details, and provide certified copies of the named identity documents — every shipped phrase provably traced to a `used` finding and machine-checked by the reconcile harness.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. No golden-regeneration tax.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the five DHA-core findings describing document admissibility: three translation rules and two certified-copy rules. The four-state vocabulary maps onto the slice-kit exactly (`used` = `status:"used"`; `rejected:<reason>` = reason rides in the status string; `use-later` = left `pending`, named here as the scope boundary; `needs-human-call` = `pending` + flagged).

### Wired → `used` (5)

| Finding | Claim | `kind` | Consuming surface |
|---|---|---|---|
| **A.026** | All documents not in English must be translated into English | translation-rule | Checklist (+ plan prose) |
| **A.027** | Both the original non-English document and the translation must be submitted | translation-rule | Checklist (+ plan prose) |
| **A.028** | Overseas translator → full name, address, phone number, qualifications | translation-rule | Checklist (+ plan prose) |
| **A.041** | Certified copy of birth certificate (where you have one) | certified-copy | Checklist + plan |
| **A.042** | Certified copy of national identity card (where you have one) | certified-copy | Checklist + plan |

All five are `value:null` with `value_status:"unset"` → no extractable structured value → each gets `value_status:"prose-only"`. (A.026–A.028 are `claim_type:"process"`; A.041–A.042 are `claim_type:"data"` but carry no structured value — they are prose statements about *what to include*. Confirmed safe in slices C/D: `finding-schema.js` gates the structured-value rule on `value_status==="structured"` only, never on `claim_type`; `reconcile.js` value-fidelity likewise checks only structured findings.)

### Cluster integrity

- **`dup_group:null` on all five** → **no sibling is stranded** by flipping the subset.
- **`conflict_with:null` on all five** (verified) → **zero contradictions**, so `rejected:<reason>` and `needs-human-call` have **no members** in this slice (recorded for completeness).
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays **41 clusters**).

### Use-later by slice boundary — intentionally triaged, stay `pending`

- **A.040** — "attach a copy of your passport." Plain copy (no certification angle), and the existing `passport` checklist row already covers it. Redundant → **use-later**, not wired.
- **A.092 / A.093** — the Apostille pair (Australia is a Convention party since 1995; Nepal is *not* listed). The high-value reading ("Nepal can't issue an apostille, so certified translation is the path") is a *synthesized inference*, not a direct finding — held for a deliberate decision. **use-later.**
- **Nepal-side verification / equivalence / legalisation cluster** — A.072 (NOC equivalence-certificate attachment), A.077/A.078 (Pokhara University verification & attestation service + its contact email), A.084/A.088/A.089/A.090 (TU CDC equivalence service, ~1-month procedural timeline, its own translation rule, "no notarisation needed"), A.091 (Notary Public Act), A.109 (embassy authentication of foreign-income certificates). A coherent **future dedicated slice** ("Nepal-side document verification & equivalence"). **use-later.** *(Note: A.085–A.087 — TU CDC equivalence fees + 3-day timeline — are already `used` from a prior slice; this slice does not touch them.)*

These are **use-later by slice boundary, not "pending because ignored."**

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No new `DocumentKind`** — the item is an `info` note (`kind:null`), not an uploadable document type. The existing `passport` / `national-id` / `birth-certificate` rows are **untouched** (this slice adds the *prep* layer over them, not new rows).
- **No new checklist group** — reuse the existing `identity` (now) group.
- **No new pages/routes; no profile-editor change** — this slice is the two generators + the new module only.
- **No apostille / Nepal-side verification copy** (the use-later cluster above).

**Ledger math after the slice:** category A `used` 33 → **38**, `pending` 89 → **84** (0 rejected). Overall ledger `used` 381 → **386**, `pending` 733 → **728**. `build-ledger.js` must show movement of exactly these 5; clusters stay 41.

---

## 3. Architecture — the wiring path

Per the slice-kit contract, a finding becomes `used` only when a **registered data-module record** carries `provenance.findingRefs:["A.xxx"]` and the finding declares a non-`unset` value. The CI invariants are enforced by `tests/data/` over every registered module.

```
A.jsonl findings ──(provenance.findingRefs)──► au-document-preparation.ts (NEW data module)
       │                                                  │
       │                                                  ├─► checklist/generator.ts (NEW doc-preparation info item, identity group)
       │                                                  └─► plan/generator.ts      (NEW translate-certify-documents action)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the code's findingRefs — never hand-edited)
```

The module is **pure sourced public data** (DHA published rules), not scoring logic. Both consumers are **server-side** generators. The `kind` discriminator (`translation-rule` / `certified-copy`) lets both surfaces compose copy from records rather than hardcoding phrases — and, critically, lets the generators **frame the two certified-copy records as scoped to those named identity documents** ("certified copies of some identity documents, including …") rather than letting "certify" bleed onto every translated document.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `NepalNocJourney` (mirrors it):

```ts
export interface AuDocumentPreparation extends Provenanced {
  id:
    | "translate-non-english"
    | "submit-original-and-translation"
    | "overseas-translator-details"
    | "certified-copy-birth-certificate"
    | "certified-copy-national-id";
  kind: "translation-rule" | "certified-copy";
  label: string;     // short, inline
  summary: string;   // translation-rule = full sentence; certified-copy = bare document noun
  source: string;    // canonical DHA URL
  lastVerified?: string;
}
```

**`lib/data/source/au-document-preparation.ts`** — `export const AU_DOCUMENT_PREPARATION: AuDocumentPreparation[]`, five records. Three URL consts:

- `DHA_POPULAR = "https://immi.homeaffairs.gov.au/help-support/popular-questions"` (translation Q&A — A.026/A.027)
- `DHA_VISITOR = "https://immi.homeaffairs.gov.au/check-twice-submit-once/visitor-visa"` (overseas-translator detail — A.028)
- `DHA_EVIDENTIARY = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool"` (student-document checklist — A.041/A.042)

`lastVerified: "2026-06-05"` throughout (the findings' own recorded verification date — honored over the slice date). Each record's `provenance.findingRefs` is the single `A.0xx` shown.

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|---|
| `translate-non-english` | translation-rule | A.026 | "Translate non-English documents" | "Any document not in English must be translated into English." | DHA_POPULAR |
| `submit-original-and-translation` | translation-rule | A.027 | "Original + translation" | "Submit both the original document and its English translation." | DHA_POPULAR |
| `overseas-translator-details` | translation-rule | A.028 | "Overseas translator details" | "If your translator is outside Australia, include their full name, address, phone number, and qualifications." | DHA_VISITOR |
| `certified-copy-birth-certificate` | certified-copy | A.041 | "Certified birth certificate" | "birth certificate" | DHA_EVIDENTIARY |
| `certified-copy-national-id` | certified-copy | A.042 | "Certified national ID" | "national identity card" | DHA_EVIDENTIARY |

**Summary-style rationale (the copy tweak, encoded in the data shape):** the three `translation-rule` summaries are **standalone sentences** (joined by a space). The two `certified-copy` summaries are **bare document nouns** ("birth certificate", "national identity card") so the generators frame them as *"certified copies of some identity documents, including your …"* — keeping certification **scoped to those named identity documents** instead of overgeneralizing onto every translated document. The `certified-copy` semantic lives in the `kind` discriminator + the generator framing, not in the summary string.

---

## 5. Checklist change (`lib/checklist/generator.ts`)

Import `AU_DOCUMENT_PREPARATION`. Compose the note from the records and add **one new info item** to the `identity` group, placed **right after the `birth-certificate` item** ([:73](../../../lib/checklist/generator.ts)) — so the guidance reads as attached to the identity documents it most concerns rather than floating. **Unconditional** (every Nepal→AU applicant has non-English documents):

```ts
const DOC_PREP = AU_DOCUMENT_PREPARATION;
const DOC_PREP_PRIMARY = DOC_PREP.find((r) => r.id === "translate-non-english")!; // DHA popular-questions → item source
const TRANSLATION_RULES = DOC_PREP.filter((r) => r.kind === "translation-rule").map((r) => r.summary).join(" ");
const CERTIFIED_COPIES = DOC_PREP.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
const DOC_PREP_NOTE =
  `${TRANSLATION_RULES} DHA also asks for certified copies of some identity documents, ` +
  `including your ${oxfordAnd(CERTIFIED_COPIES)}.`;
```

```ts
add({
  key: "doc-preparation", kind: null, label: "Translations & certified copies",
  group: "identity", stage: "now", requirement: "required",
  note: DOC_PREP_NOTE,
  source: { url: DOC_PREP_PRIMARY.source, lastVerified: DOC_PREP_PRIMARY.lastVerified },
});
```

`kind:null` → `status:"info"`; the checklist UI renders `info` with a "· Bring this" suffix ([checklist-item.tsx:4](../../../components/checklist/checklist-item.tsx)), so the label is a document noun-phrase — **"Translations & certified copies · Bring this"** reads naturally. The existing private `oxfordAnd` helper ([checklist:43](../../../lib/checklist/generator.ts)) is **reused** (no new helper). The identity rows, academic/english/financial items, and the visa items are **unchanged**.

> **Rendered note:** "Any document not in English must be translated into English. Submit both the original document and its English translation. If your translator is outside Australia, include their full name, address, phone number, and qualifications. DHA also asks for certified copies of some identity documents, including your birth certificate and national identity card."

New assertions: item `doc-preparation` exists in the `identity` group, `stage:"now"`, `status:"info"`, `kind:null`, `requirement:"required"`, `label:"Translations & certified copies"`; note contains "translated into English" / "outside Australia" / "certified copies of some identity documents"; `source.url` contains `immi.homeaffairs.gov.au`.

---

## 6. Plan change (`lib/plan/generator.ts`)

Import `AU_DOCUMENT_PREPARATION`. Derive the certified-copy list from the records (reusing the existing `oxfordAnd` at [plan:28](../../../lib/plan/generator.ts)), then add **one new `PlanItem`** (`PlanItem.kind` is a free `string` — no union to extend), placed right after the NOC block ([:167](../../../lib/plan/generator.ts)), gated the same way as the GS/NOC items — `primaryDestinationId === "australia"`:

```ts
const CERTIFIED_COPIES = AU_DOCUMENT_PREPARATION.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
// ...
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
```

> **Rendered body:** "Translate any non-English document into English and keep both the original and translation. If your translator is outside Australia, include their details. DHA also asks for certified copies of some identity documents, including your birth certificate and national identity card."

**Copy-tweak compliance:** the body keeps translation (every non-English document) and certification (only *some* identity documents) in separate clauses, so "certify" never reads as applying to every translated document — the user's explicit requirement. The translation lead-in is intentionally concise prose ("include their details"); the full A.028 detail (name/address/phone/qualifications) lives in the checklist note, which is the comprehensive surface.

New assertions: item `translate-certify-documents` present for `primaryDestinationId:"australia"` with `impact:"medium"`, title contains "Translate", body contains "outside Australia" / "certified copies of some identity documents"; **absent** for `null` and non-AU (`"canada"`) destinations.

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on A.026, A.027, A.028, A.041, A.042 in `A.jsonl` via a parse-by-id node one-liner (string-replace only the five target lines; leave `dup_group`, `cluster`, and every other field untouched; preserve CRLF line endings). **A.040 is left `unset`/`pending`** (use-later).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the five code-referenced findings to `status:"used"` with ID-accurate `used_by` (`au-document-preparation[<id>]`). Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — only those five lines (value_status + status + used_by) may change, and A.040 must remain `pending`.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/au-document-preparation.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (5 values) and `kind` (2 values); non-empty `label`/`summary`; unique-`id` array refine. Mirror `nepal-noc-journey.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `NEPAL_NOC_JOURNEY` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "AU_DOCUMENT_PREPARATION",
    data: AU_DOCUMENT_PREPARATION, schema: AuDocumentPreparationSchema,
    recordLabel: "au-document-preparation", subRecordKeys: [],
    recordInterface: "AuDocumentPreparation" }
  ```
  This is the only wiring — `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically. `registry-integrity` enforces unique `recordLabel` + `exportName` (both new).

---

## 9. Testing — TDD RED → GREEN → adversarial

Write the failing test first; watch it fail for the right reason; implement the minimum; confirm green; then mutate to confirm the guard bites.

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity N/A for prose-only / conflict gate), schema parse, flip-status normal-mode clean, findings-integrity + registry-integrity for the new module.
- **`tests/checklist/generator.test.ts`**: new case — `doc-preparation` identity-group info item (kind null, status info, stage now, requirement required, label "Translations & certified copies") with the content tokens + DHA source. RED first.
- **`tests/plan/generator.test.ts`**: new cases — `translate-certify-documents` present for AU primary with the tokens; absent for unset destination; absent for non-AU (`"canada"`). RED first.
- **Adversarial mutation** (must bite, then revert) — adapted for prose-only (no structured value to drift): revert one of the five findings' `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm it fails with `USED_UNSET`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass. This is the real gate:**

- `npx vitest run tests/data/` → reconcile clean (`used += 5`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema parses + flip-status normal-mode clean + findings/registry integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green (checklist + plan suites include the new cases). Expected ≈ **711 → 715** (+1 checklist, +2 plan, +1 registry-driven) — use the **actual** `npm test` figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical — no scorer import).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → regenerate `findings-ledger.md`: **A used 33 → 38, pending 89 → 84** (overall used 381 → 386, pending 733 → 728); confirm only this slice moved, A.040 stays `pending`, and clusters stay 41. **Run build-ledger.js, not just list-pending.js.**

**Best-effort (non-gating) — do it if the environment allows; it never blocks the merge:**

- Browser smoke via the preview tools: a Nepal→AU `/plan` (with AU primary) shows the new "Translate and certify your documents" action; `/checklist/[programId]` shows the identity-group "Translations & certified copies" note. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests — note which was used. The automated tests + reconcile + typecheck are the real gate.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-e-document-preparation`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); use explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-document-preparation.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edits + `FLIP_STATUS` run. `tests/data/` green.
2. **Checklist consumption** — generator edit (new `doc-preparation` info item) + checklist test.
3. **Plan consumption** — generator edit (new `translate-certify-documents` action) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (test count bumped to the actual post-slice figure from `npm test` + slice-E bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + the writing-plans plan doc are committed on the same branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, no new checklist group — the item is an `info` note in the existing `identity` group; existing identity rows untouched.
- No apostille copy (A.092/A.093 use-later); no Nepal-side verification/equivalence/legalisation cluster (future dedicated slice).
- No A.040 plain-passport-copy wiring (redundant with existing passport row).
- No profile-editor change; no new pages/routes — only the two generators + the new module.

---

## 13. Success criteria

1. The checklist states the DHA document-preparation rules (new identity-group info item) and the plan adds a `translate-certify-documents` action for AU-primary students — every phrase finding-backed, and certification scoped to the named identity documents (not every translated document).
2. All reconcile invariants are green for category A with `used` = 38, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched.
4. The ledger (`build-ledger.js`) shows exactly this slice's 5 findings moved `pending → used`, clusters unchanged at 41, with A.040 + the apostille/Nepal-side cluster recorded as use-later by slice boundary.
