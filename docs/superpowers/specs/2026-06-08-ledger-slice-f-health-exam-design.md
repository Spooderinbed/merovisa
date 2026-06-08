# Ledger slice F — DHA health-exam readiness → checklist + plan

**Status:** Design approved 2026-06-08 (subset = 4 DHA-core findings, reuse-C.092 decision, surfaces, and the plan-body "panel physician or clinic" copy tweak confirmed).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slices A–E. This is the second **Category-A logistics** slice; it completes the student-facing question *"what health/medical steps will I need for the visa?"*

---

## 1. Context & goal

The checklist already carries an after-offer `medical` item ("Panel medical exam") — but its note is a bare *"When DHA requests it."* ([checklist generator, the `medical` add()](../../../lib/checklist/generator.ts)). The student's real question — *what the health examination involves, where to do it, what it costs, and how long results last* — is unanswered. The findings exist (A.033–A.038); they are unsurfaced.

This slice wires **DHA health-exam readiness** into the two already-shipped surfaces:

- `lib/checklist/generator.ts` — **enrich the existing `medical` item's note** (no new item),
- `lib/plan/generator.ts` — a new AU-gated `prepare-health-exam` action.

**Goal:** make the medical surfaces state *how the health examination runs* — outside Australia it must be done by a DHA-approved panel physician or clinic, you pay the clinic directly, My Health Declarations lets eligible applicants do it before lodging, and results are valid for 12 months (6 if a health undertaking is signed) — every shipped phrase finding-backed and machine-checked.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the four DHA-core health-exam findings; the 12-month validity is **reused** from an already-`used` structured finding rather than re-wired.

### Wired → `used` (4)

| Finding | Claim | `kind` | Consuming surface |
|---|---|---|---|
| **A.036** | Outside Australia, exams must be done by a DHA-approved panel physician/clinic | process | Checklist + plan |
| **A.038** | Form 26: costs paid directly to the panel physician/clinic | process | Checklist + plan |
| **A.033** | My Health Declarations lets eligible applicants complete exams before lodging | process | Checklist + plan |
| **A.035** | If a health undertaking is signed, validity is 6 months | validity | Checklist |

All four are `value:null` / `value_status:"unset"` → no extractable structured value → each gets `value_status:"prose-only"` (same handling as slice E). A.036/A.038/A.033 are `claim_type:"process"`; A.035 is `claim_type:"data"` but carries no structured value.

### Reused (not re-wired)

- **C.092** — `health-examination-validity` in `lib/data/source/au-health-biometric-facts.ts` (`value:12, unit:"months"`, already `status:"used"`, same DHA page as A.034). Both generators read it for the **12-month base validity**, giving this structured record its **first user-facing surface**. No change to that module or to C.092.

### Cluster integrity

- **`dup_group:null` on all four** → no sibling stranded.
- **`conflict_with:null` on all four** → zero contradictions; `rejected:<reason>` and `needs-human-call` have **no members** in this slice.
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays **41 clusters**).

### Use-later by slice boundary — intentionally triaged, stay `pending`

- **A.034** — "results valid for 12 months." A **duplicate** of the structured, already-`used` **C.092** (same fact, same DHA page). Held as use-later to avoid representing one fact as `used` twice; the 12-month figure ships via C.092. (If ever consolidated, A.034 would be marked `rejected:duplicate-of-C.092`; deferred so this slice needs no `rejected`-status harness path.)
- **A.037** — DHA's Nepal panel-physician **contact** (Nepal Mediciti Hospital). Contact-directory datum with the highest staleness risk; surfaced only with a deliberate "last-checked" treatment. Use-later (same posture as B.025–B.026, D).
- **A.029–A.031** (biometrics: ABCC locations + Immi App) and **A.039** (police certificate / character) are adjacent visa-prep steps → **separate future slices**, not health.

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No new `DocumentKind`** — the slice enriches the existing `medical` item (`kind:"medical"`, still uploadable); it adds no item and no `kind:null` info note.
- **No new checklist group**, no new pages/routes, no profile-editor change — the two generators + the new module only.
- **No panel-physician directory / clinic contacts** (A.037 use-later); no biometrics, no police certificate.

**Ledger math after the slice:** category A `used` 38 → **42**, `pending` 84 → **80** (0 rejected). Overall ledger `used` 386 → **390**, `pending` 728 → **724**. `build-ledger.js` must show movement of exactly these 4; clusters stay 41. (C.092 already counted as `used` — no double-count.)

---

## 3. Architecture — the wiring path

```
A.jsonl findings ──(provenance.findingRefs)──► au-health-exam.ts (NEW data module: A.036/A.038/A.033/A.035)
       │                                              │
       │                                              ├─► checklist/generator.ts (ENRICH existing `medical` note)
       │                                              └─► plan/generator.ts      (NEW prepare-health-exam action)
       │                                              │
au-health-biometric-facts.ts ──(C.092, already used)──┴─► both surfaces read the 12-month base validity (reuse)
       │
       └──(FLIP_STATUS=1 derives status:"used" + used_by from the new module's findingRefs — never hand-edited)
```

The new module is **pure sourced prose** (DHA health pages + Form 26). The `kind` discriminator (`process` / `validity`) lets the generators compose the process sentences as a block and place the undertaking-validity nuance after the 12-month base. Both consumers are **server-side** generators. The cross-module read of C.092 is deliberate — single source of truth for the 12-month figure.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `AuDocumentPreparation` (mirrors it):

```ts
export interface AuHealthExam extends Provenanced {
  id:
    | "panel-physician-overseas"
    | "cost-paid-to-clinic"
    | "mhd-before-lodging"
    | "undertaking-validity";
  kind: "process" | "validity";
  label: string;     // short, inline
  summary: string;   // process = full sentence; validity = the 6-month nuance
  source: string;    // canonical DHA URL
  lastVerified?: string;
}
```

**`lib/data/source/au-health-exam.ts`** — `export const AU_HEALTH_EXAM: AuHealthExam[]`, four records. URL consts:

- `DHA_HEALTH_ARRANGE = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/arrange-your-health-examinations"` (A.036)
- `DHA_FORM_26 = "https://immi.homeaffairs.gov.au/form-listing/forms/26.pdf"` (A.038)
- `DHA_HEALTH_WHEN = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/when-to-have-health-examinations"` (A.033)
- `DHA_HEALTH_AFTER = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/after-your-health-examinations"` (A.035)

`lastVerified: "2026-06-05"` throughout. Array order chosen so the `process` filter concatenates readably.

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|---|
| `panel-physician-overseas` | process | A.036 | "Panel physician (overseas)" | "Outside Australia, the examination must be done by a DHA-approved panel physician or clinic." | DHA_HEALTH_ARRANGE |
| `cost-paid-to-clinic` | process | A.038 | "Cost paid to clinic" | "You pay the panel physician or clinic directly." | DHA_FORM_26 |
| `mhd-before-lodging` | process | A.033 | "My Health Declarations" | "If your visa is eligible, the My Health Declarations service lets you complete it before you lodge." | DHA_HEALTH_WHEN |
| `undertaking-validity` | validity | A.035 | "Health-undertaking validity" | "6 months if DHA asks you to sign a health undertaking." | DHA_HEALTH_AFTER |

The three `process` summaries are standalone sentences (joined by a space); the `validity` summary is a fragment designed to append after the 12-month base (`"… valid for 12 months — 6 months if DHA asks you to sign a health undertaking."`).

---

## 5. Checklist change (`lib/checklist/generator.ts`) — enrich, don't add

Import `AU_HEALTH_EXAM` and `AU_HEALTH_BIOMETRIC_FACTS` (both new to this generator). Compose the note and **replace the bare note on the existing `medical` item** (the item key/kind/group/stage/requirement are unchanged — it stays an uploadable `kind:"medical"` item):

```ts
const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_UNDERTAKING = AU_HEALTH_EXAM.find((r) => r.id === "undertaking-validity")!.summary;
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092 (structured 12 months)
const HEALTH_EXAM_SOURCE = AU_HEALTH_EXAM.find((r) => r.id === "mhd-before-lodging")!; // DHA health page → item source
const MEDICAL_NOTE =
  `DHA may request a health examination as part of your application. ${HEALTH_EXAM_PROCESS} ` +
  `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit} — ${HEALTH_EXAM_UNDERTAKING}`;
```

The `medical` item becomes:

```ts
add({
  key: "medical", kind: "medical", label: "Panel medical exam",
  group: "visa", stage: "after-offer", requirement: "required",
  note: MEDICAL_NOTE,
  source: { url: HEALTH_EXAM_SOURCE.source, lastVerified: HEALTH_EXAM_SOURCE.lastVerified },
});
```

> **Rendered note:** "DHA may request a health examination as part of your application. Outside Australia, the examination must be done by a DHA-approved panel physician or clinic. You pay the panel physician or clinic directly. If your visa is eligible, the My Health Declarations service lets you complete it before you lodge. Results are generally valid for 12 months — 6 months if DHA asks you to sign a health undertaking."

New assertions: the `medical` item's `note` contains "panel physician or clinic" / "My Health Declarations" / "12 months"; `source.url` contains `immi.homeaffairs.gov.au`. (Existing "places all visa documents in the after-offer stage" assertion is unaffected — it checks only stage/requirement.)

---

## 6. Plan change (`lib/plan/generator.ts`)

Import `AU_HEALTH_EXAM` + `AU_HEALTH_BIOMETRIC_FACTS`. Add **one new `PlanItem`** (`PlanItem.kind` is a free `string`), placed right after the DHA-document-preparation (`translate-certify-documents`) block, gated `primaryDestinationId === "australia"`:

```ts
const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!;
// ...
if (inputs.primaryDestinationId === "australia") {
  out.push({
    kind: "prepare-health-exam",
    impact: "medium",
    title: "Prepare for your health examination",
    body:
      `DHA may request a health examination as part of your visa. ${HEALTH_EXAM_PROCESS} ` +
      `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit}, so arrange it early — don't let it hold up your application.`,
    timeEstimate: "1-2 weeks",
  });
}
```

> **Rendered body:** "DHA may request a health examination as part of your visa. Outside Australia, the examination must be done by a DHA-approved panel physician or clinic. You pay the panel physician or clinic directly. If your visa is eligible, the My Health Declarations service lets you complete it before you lodge. Results are generally valid for 12 months, so arrange it early — don't let it hold up your application."

**Copy-tweak compliance:** the user's requested wording — "a DHA-approved panel physician **or clinic**" — is satisfied **structurally**: the plan body composes the same `HEALTH_EXAM_PROCESS` join the checklist uses, so the panel-physician clause comes verbatim from the A.036 summary in both surfaces and cannot drift apart. (The 6-month undertaking nuance, A.035, is checklist-only — the plan stays the action nudge.)

New assertions: item `prepare-health-exam` present for `primaryDestinationId:"australia"` with `impact:"medium"`, title contains "health examination", body contains "panel physician or clinic" / "12 months"; **absent** for `null` and non-AU (`"canada"`).

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on A.033, A.035, A.036, A.038 in `A.jsonl` via a parse-by-id node one-liner (string-replace only those four lines; leave every other field + EOL untouched). **A.034 and A.037 are left `unset`/`pending`** (use-later).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes exactly the four code-referenced findings to `status:"used"` with ID-accurate `used_by` (`au-health-exam[<id>]`). Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — only those four lines change; A.034 + A.037 must remain `pending`.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/au-health-exam.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (4 values) and `kind` (2 values); non-empty `label`/`summary`; unique-`id` array refine. Mirror `au-document-preparation.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `AU_DOCUMENT_PREPARATION` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "AU_HEALTH_EXAM",
    data: AU_HEALTH_EXAM, schema: AuHealthExamSchema,
    recordLabel: "au-health-exam", subRecordKeys: [],
    recordInterface: "AuHealthExam" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically; `registry-integrity` enforces unique `recordLabel` + `exportName`.

---

## 9. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity / value-fidelity N/A for prose-only / conflict gate), schema parse, flip-status normal-mode clean, findings/registry integrity.
- **`tests/checklist/generator.test.ts`**: new case — the `medical` item's note carries the health-exam tokens ("panel physician or clinic", "My Health Declarations", "12 months") + DHA source. RED first.
- **`tests/plan/generator.test.ts`**: new cases — `prepare-health-exam` present for AU primary with the tokens; absent for unset destination; absent for non-AU (`"canada"`). RED first.
- **Adversarial mutation** (prose-only): revert one of the four findings' `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 4`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green. Expected ≈ **715 → 719** (+1 checklist, +2 plan, +1 registry-driven) — use the **actual** figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → **A used 38 → 42, pending 84 → 80** (overall used 386 → 390, pending 728 → 724); only this slice moved, A.034 + A.037 stay `pending`, clusters stay 41.

**Best-effort (non-gating):** browser smoke via the preview tools — `/plan` (AU primary) shows "Prepare for your health examination"; `/checklist/[programId]` shows the enriched medical note. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests — note which was used.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-f-health-exam`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-health-exam.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edits + `FLIP_STATUS`. `tests/data/` green.
2. **Checklist consumption** — generator edit (enriched `medical` note + consts, reusing C.092) + checklist test.
3. **Plan consumption** — generator edit (new `prepare-health-exam` action) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-F bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + plan doc are committed on the branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, no new item, no new checklist group — the existing `medical` item is enriched in place.
- No re-wire of A.034 (12-month validity reused from C.092); no panel-physician contact directory (A.037 use-later).
- No biometrics (A.029–A.031) and no police certificate (A.039) — separate future slices.
- No profile-editor change; no new pages/routes — only the two generators + the new module.

---

## 13. Success criteria

1. The checklist's `medical` item states the health-exam process + validity (enriched note) and the plan adds a `prepare-health-exam` action for AU-primary students — every phrase finding-backed, "panel physician or clinic" identical across both surfaces.
2. All reconcile invariants green for category A with `used` = 42, and the adversarial mutation bites.
3. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched.
4. The ledger shows exactly this slice's 4 findings moved `pending → used`, clusters unchanged at 41, with A.034 (dup of C.092) + A.037 (clinic contact) recorded as use-later by slice boundary.
