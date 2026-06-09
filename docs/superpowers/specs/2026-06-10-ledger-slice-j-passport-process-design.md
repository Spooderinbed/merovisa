# Ledger slice J — Nepal passport process readiness → checklist + plan

**Status:** Design approved 2026-06-10 (**Option B — checklist note + gated plan action**). Wire **A.043–A.046** (the four e-passport pre-enrolment steps); reuse **A.049** (central-office ~2 working days) **read-only**; enrich the existing passport checklist row with a conditional note and add one **`hasPassport`-gated** plan action. Fees **A.047/A.048 not wired** (they live in `nepal-application-fees` / cost-to-apply); **A.050** (district 15–45 days) stays use-later. No new `DocumentKind`, no scoring, no contacts.
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slice I. First slice to give the plan generator a **document-derived input** (`hasPassport`), kept deliberately narrow (a single boolean, not the documents table).

---

## 1. Context & goal

The student question this answers: **"If I don't have a passport yet, how do I start getting one?"** The passport bio page is already a required checklist document, but there's no guidance on obtaining one, and nothing in the plan prompts a passport-less student to begin.

This slice:

- `lib/checklist/generator.ts` — enrich the **existing** `passport` row with a short **conditional note** (shown only when the passport is not uploaded): *where the process starts* (A.043 pre-enrolment + A.044 choose centre/date).
- `lib/plan/generator.ts` + `lib/plan/invalidate.ts` — add **one** plan action `start-passport-process`, gated on **`hasPassport === false`**, carrying the fuller process (A.043–A.046) + the reused ~2-working-day turnaround (A.049).

**Copy guard (user, locked):** frame conditionally — *"If you still need a passport…"* — never assert non-possession ("you don't have a passport"). Upload status ≠ possession; the gate is upload-based (the app's existing passport Have/Needed semantic), so the wording must stay soft.

**Narrowness guard (user, locked):** `invalidatePlan` loads only the user's uploaded document **kinds**; the generator gains only `hasPassport?: boolean`. The plan must **not** depend on the broader documents table.

**Non-goal / guarantee:** **no scoring code is touched** (`lib/scoring/financial.ts`, `lib/data/policy/funding-reliability.ts` unedited; `golden-assessments.json` byte-identical). `start-passport-process` is **destination-agnostic** (a passport is needed for any country) → **not** added to `VISA_PREP_KINDS` (`lib/plan/phases.ts` untouched).

---

## 2. Scope — the slice and its four-state disposition ledger

The cluster is the Department of Passports e-passport journey (A.043–A.051). The subset wired is the **pre-enrolment process core**.

### Wired → `used` (4)

| Finding | Claim (paraphrased) | `claim_type` | Surface |
|---|---|---|---|
| **A.043** | First step: complete the online pre-enrolment form | process | Checklist + plan |
| **A.044** | Applicant chooses enrolment centre + appointment during pre-enrolment | process | Checklist + plan |
| **A.045** | After submitting, applicant gets a copy with a barcode + QR code | process | Plan |
| **A.046** | At the centre, registration includes photo + biometrics | process | Plan |

All four are `value:null` / `value_status:"unset"` → each gets `value_status:"prose-only"`, then `FLIP_STATUS` derives `status:"used"`. All four are **un-clustered singletons** (`dup_group:null`, `conflict_with:null`, distinct entity+attribute) — no `cluster_triage` edits, no conflict-gate interaction; `findings-clusters.md` unchanged, cluster count stays **41**.

### Reused read-only (already `used`, no edit)

- **A.049** — Department of Passports central-office turnaround (**2 working days**), already `status:"used"`/structured in `nepal-document-processing-times.ts` (`passport-central`). The plan reads `typicalBusinessDays` read-only (the slice-I pattern); **no re-wiring, no findingRef in the new module, no edit to that module.**

### Deferred / out of scope (firm)

- **A.047 / A.048** (passport fees NPR 12,000 / 20,000) — already `used` in `nepal-application-fees`; **not reused here**. Fees belong to cost-to-apply, where they live. Untouched.
- **A.050** (district/area office 15–45 days) — **use-later** (a range/variable turnaround; revisit when the timeline models ranges).
- **No new `DocumentKind`** (passport exists), no new checklist item, no new checklist group, no contacts/office list.
- **No scoring change.** **No `VISA_PREP_KINDS` / `phases.ts` change** (passport is destination-agnostic).

**Ledger math after the slice:** category A `used` 49 → **53**, `pending` 73 → **69** (0 rejected). Overall `used` 397 → **401**, `pending` 717 → **713**. `build-ledger.js` must show movement of exactly **these four findings**; clusters stay **41**. (A.047/A.048/A.049 already `used` — no change.)

---

## 3. Architecture — the wiring path + the narrow plan input

```
A.jsonl A.043–A.046 ──(provenance.findingRefs)──► nepal-passport-process.ts (NEW: 4 records, no kind)
                                                       │
                                                       ├─► checklist/generator.ts  (passport row gains a conditional note: A.043+A.044)
                                                       └─► plan/generator.ts        (start-passport-process action: A.043–A.046)
                                                               ▲                         ▲
nepal-document-processing-times.ts (A.049) ─read-only──────────┘                         │
                                                                                         │
documents repo ─listDocumentsForUser─► invalidatePlan derives hasPassport ───────────────┘
                                        (docs.some(d => d.kind === "passport"))

FLIP_STATUS=1 derives status:"used" + used_by for A.043–A.046 from the new module's findingRefs.
```

**The `hasPassport` signal (narrow).** `invalidatePlan` (the sole production caller of `generatePlan`) adds one `listDocumentsForUser(adminDb, userId)` load to its existing `Promise.all`, derives `hasPassport = docs.some(d => d.kind === "passport")`, and passes the boolean. `GeneratorInputs` gains `hasPassport?: boolean` — nothing else; the generator never sees the documents table. Optional (`?`) so existing test callers that omit it get `undefined` → the action is not emitted.

**Auto-close payoff (free from existing invalidate logic).** When the student uploads a passport, `hasPassport` flips `true`, the generator stops emitting `start-passport-process`, and `invalidatePlan`'s satisfied-todo sweep auto-closes the open todo to `done` — no new lifecycle code.

Both generators are **server-side**. The plan additionally reads `NEPAL_DOCUMENT_PROCESSING_TIMES` read-only (already imported in the plan generator since slice I) for the A.049 turnaround.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface after `NepalPoliceCertificate` (the last interface, from slice I). Multi-record, **no `kind`** (records picked by id; mirrors the no-discriminator shape):

```ts
export interface NepalPassportProcess extends Provenanced {
  id:
    | "pre-enrolment"
    | "choose-centre"
    | "barcode-copy"
    | "enrolment-biometrics";
  label: string;   // short, inline label
  summary: string; // composable fragment the plan/checklist render
  source: string;  // Department of Passports process URL
  lastVerified?: string; // ISO date
}
```

**`lib/data/source/nepal-passport-process.ts`** — `export const NEPAL_PASSPORT_PROCESS: NepalPassportProcess[]`, **four records**. URL const `PASSPORT_PROCESS = "https://nepalpassport.gov.np/process/-4"` (A.043–A.046 source). `lastVerified: "2026-06-05"` (matching the sibling passport records in `nepal-document-processing-times` / `nepal-application-fees`).

| `id` | `findingRefs` | `label` | `summary` (canonical, composable) |
|---|---|---|---|
| `pre-enrolment` | A.043 | "Online pre-enrolment" | "the online pre-enrolment form on the Department of Passports website" |
| `choose-centre` | A.044 | "Centre & appointment" | "your enrolment centre and appointment" |
| `barcode-copy` | A.045 | "Barcode/QR copy" | "a copy with a barcode and QR code to bring along" |
| `enrolment-biometrics` | A.046 | "Photo & biometrics" | "your photo and biometrics at the enrolment centre" |

Summaries are **article/noun-first fragments** so the generators compose them into sentences (the slice-I pattern); each record's `provenance.note` records its source claim.

---

## 5. Checklist change (`lib/checklist/generator.ts`) — conditional note on the passport row

Add `import { NEPAL_PASSPORT_PROCESS } from "@/lib/data/source/nepal-passport-process";`. Add consts and make the existing passport `add()` conditionally carry the note + SourceLine (the row's `kind:"passport"` / `group:"identity"` / `stage:"now"` / `requirement:"required"` are **unchanged**):

```ts
const PASSPORT_PRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "pre-enrolment")!;            // A.043
const PASSPORT_CENTRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "choose-centre")!.summary; // A.044
const PASSPORT_NOTE =
  `If you still need a passport, start with ${PASSPORT_PRE.summary}, where you choose ${PASSPORT_CENTRE}.`;
```

```ts
// inside generateChecklist (uploadedKinds is in scope):
const passportMissing = !uploadedKinds.has("passport");
// IDENTITY (now) — the passport row gains a conditional note when not uploaded:
add({
  key: "passport", kind: "passport", label: "Passport bio page",
  group: "identity", stage: "now", requirement: "required",
  ...(passportMissing
    ? { note: PASSPORT_NOTE, source: { url: PASSPORT_PRE.source, lastVerified: PASSPORT_PRE.lastVerified } }
    : {}),
});
```

> **Rendered note (locked, shown only when passport not uploaded):** "If you still need a passport, start with the online pre-enrolment form on the Department of Passports website, where you choose your enrolment centre and appointment."

The row keeps its **Have/Needed** chip (it's a document item, not `kind:null`). When the passport *is* uploaded, the row has no note/SourceLine (unchanged from today).

**Test impact:** new case — passport row has the note (tokens "pre-enrolment", "enrolment centre") + `nepalpassport.gov.np` source when `uploadedKinds` lacks `passport`; and **no note** when `uploadedKinds` has `passport`.

---

## 6. Plan change — gated action + the narrow input

**`lib/plan/generator.ts`.** Add `import { NEPAL_PASSPORT_PROCESS } from "@/lib/data/source/nepal-passport-process";` (`NEPAL_DOCUMENT_PROCESSING_TIMES` is already imported since slice I). Extend `GeneratorInputs` and add the gated action:

```ts
export interface GeneratorInputs {
  sections: ProfileSections;
  primaryDestinationId: string | null;
  matches: MatchResult[];
  policy: { nepalAssessmentLevel: "L2" | "L3" };
  hasPassport?: boolean; // from the user's uploaded document kinds; gates start-passport-process
}

const PP_PRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "pre-enrolment")!.summary;          // A.043
const PP_CENTRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "choose-centre")!.summary;        // A.044
const PP_BARCODE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "barcode-copy")!.summary;        // A.045
const PP_BIO = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "enrolment-biometrics")!.summary;    // A.046
const PASSPORT_CENTRAL_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "passport-central")!.typicalBusinessDays; // A.049 (read-only)
```

```ts
// PASSPORT (Nepal-side prerequisite) — destination-agnostic; show only if no passport uploaded.
if (inputs.hasPassport === false) {
  out.push({
    kind: "start-passport-process",
    impact: "medium",
    title: "Start your passport application",
    body:
      `Start with ${PP_PRE}, where you choose ${PP_CENTRE}. ` +
      `After submitting, you'll get ${PP_BARCODE}, then give ${PP_BIO}. ` +
      `Lodged at the central office, an ordinary e-passport is usually ready in about ${PASSPORT_CENTRAL_DAYS} working days.`,
  });
}
```

> **Rendered body (locked):** "Start with the online pre-enrolment form on the Department of Passports website, where you choose your enrolment centre and appointment. After submitting, you'll get a copy with a barcode and QR code to bring along, then give your photo and biometrics at the enrolment centre. Lodged at the central office, an ordinary e-passport is usually ready in about 2 working days."

`impact:"medium"` + not-a-visa-prep-kind → renders in **"Your next steps" → Medium impact** (PlanList re-groups by impact at render time, so emission position is irrelevant). No `timeEstimate` (the turnaround is in the body — avoids the duplication noted in slice I).

**`lib/plan/invalidate.ts`.** Add the documents load and derive the boolean:

```ts
import { listDocumentsForUser } from "@/lib/documents/repo";
// ...
const [profileRow, primaryRow, programs, universities, docs] = await Promise.all([
  getProfile(adminDb, userId),
  getPrimaryAssessmentForUser(adminDb, userId),
  listAllPrograms(adminDb),
  listAllUniversities(adminDb),
  listDocumentsForUser(adminDb, userId),
]);
// ...
const hasPassport = docs.some((d) => d.kind === "passport");
const items = generatePlan({
  sections,
  primaryDestinationId: primaryRow?.destination_id ?? null,
  matches,
  policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
  hasPassport,
});
```

**Test impact:**
- `tests/plan/generator.test.ts`: new case — `start-passport-process` present (with body tokens "pre-enrolment" / "barcode" / "working days") when `hasPassport:false` (even with `primaryDestinationId:null` — proving destination-agnostic); **absent** when `hasPassport:true` and when `hasPassport` omitted.
- `tests/plan/invalidate.test.ts`: mock `listDocumentsForUser` (default `[]`), add `"start-passport-process"` to `EMPTY_PROFILE_KINDS` (empty profile + no docs → `hasPassport:false` → emitted), and a new case: docs include a passport → `start-passport-process` not inserted, and an open `start-passport-process` todo is auto-closed.

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on **A.043, A.044, A.045, A.046 only** in `A.jsonl` via a parse-by-id node script (string-replace only those four lines; leave every other field + EOL untouched). A.047/A.048/A.049 stay `used`/structured (untouched); A.050 stays `unset`/`pending` (use-later).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes the four to `status:"used"` with `used_by:["nepal-passport-process[<id>]"]`. Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — **only those four lines change**.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/nepal-passport-process.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (4 values, no `kind`); non-empty `label`/`summary`; unique-`id` array refine. Mirror `nepal-police-certificate.schema.ts` minus the `kind` enum.
- **`lib/data/schema/registry.ts`** — import pair after the `NEPAL_POLICE_CERTIFICATE` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "NEPAL_PASSPORT_PROCESS",
    data: NEPAL_PASSPORT_PROCESS, schema: NepalPassportProcessSchema,
    recordLabel: "nepal-passport-process", subRecordKeys: [],
    recordInterface: "NepalPassportProcess" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically.

---

## 9. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage; value-fidelity N/A for prose-only; conflict gate), schema parse, flip-status normal-mode clean, findings/registry integrity.
- **`tests/checklist/generator.test.ts`**: new case — passport row note present (+ source) when passport not uploaded, absent when uploaded. RED first.
- **`tests/plan/generator.test.ts`**: new case — `start-passport-process` present for `hasPassport:false` (incl. `primaryDestinationId:null`) with body tokens; absent for `hasPassport:true` / omitted. RED first.
- **`tests/plan/invalidate.test.ts`**: mock `listDocumentsForUser`; update `EMPTY_PROFILE_KINDS`; new case for passport-present (not emitted / auto-closed). RED first (the unmocked repo call throws until mocked).
- **Adversarial mutation** (prose-only): revert one finding's `value_status` to `unset` (e.g. A.045) while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET A.045`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 4`, 0 orphans/drift/open-conflict) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green. Expected ≈ **737 → ~741** (+3 generator/invalidate cases, +1 registry-driven) — use the **actual** figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts lib/plan/phases.ts` empty** (scorer + visa-prep ordering untouched).
- **`git diff master...HEAD -- lib/data/source/nepal-application-fees.ts lib/data/source/nepal-document-processing-times.ts` empty** (fees + reused turnaround module untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → **A used 49 → 53, pending 73 → 69** (overall used 397 → 401, pending 717 → 713); only this slice's four findings moved, clusters stay 41.

**Best-effort (non-gating):** rendered smoke of the passport row note (passport-missing profile) + the `start-passport-process` plan card. (Note: the dev-server screenshot tool's network-idle wait hangs on the HMR socket — DOM/CSS measurement via `preview_eval` is the reliable fallback, as in the slice-I smoke.)

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-j-passport-process`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `nepal-passport-process.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edits (×4) + `FLIP_STATUS`. `tests/data/` green.
2. **Checklist consumption** — generator edit (conditional passport note + consts) + checklist test.
3. **Plan action + input** — `generator.ts` (`hasPassport?` + gated action) + `invalidate.ts` (`listDocumentsForUser` + derive `hasPassport`) + generator test + invalidate test. (One atomic feature: the input is useless without the caller, the caller needs the input.)
4. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-J bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge.

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, no new checklist item/group, no `VISA_PREP_KINDS` / `phases.ts` change (passport is destination-agnostic).
- No fee wiring (A.047/A.048 stay in `nepal-application-fees`); no edit to `nepal-document-processing-times.ts` (A.049 reused read-only).
- The plan gains **only** `hasPassport?: boolean` — no broader documents-table dependency.
- No contact directory; A.050 deferred as use-later.

---

## 13. Success criteria

1. The passport checklist row shows a short *how-to-start* note (A.043 + A.044) **only when the passport is not uploaded**, conditionally framed ("If you still need a passport…"); and a `start-passport-process` plan action appears for passport-less students with the fuller process (A.043–A.046) + the reused ~2-day turnaround (A.049).
2. The action gates on `hasPassport === false` (destination-agnostic), renders under "Your next steps → Medium impact," and **auto-closes** once a passport is uploaded.
3. `invalidatePlan` derives `hasPassport` from one `listDocumentsForUser` load; the generator's only new input is `hasPassport?: boolean`.
4. All reconcile invariants green for category A with `used` = 53; the adversarial mutation bites (`USED_UNSET`).
5. `typecheck` + full suite green; `golden-assessments.json` byte-identical; scorer / `phases.ts` / `nepal-application-fees` / `nepal-document-processing-times` untouched; ledger shows exactly these four findings `pending → used`, clusters unchanged at 41, with A.050 recorded use-later and A.047/A.048 left in cost-to-apply.
