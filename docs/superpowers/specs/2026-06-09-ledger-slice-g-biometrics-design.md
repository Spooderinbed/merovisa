# Ledger slice G — DHA biometrics readiness → checklist + plan

**Status:** Design approved 2026-06-09 (subset = A.031 only; reuse C.123 + C.127 read-only; one new after-offer visa info item + one AU-gated plan action; the **source-display guard** → the checklist item's source line points to the fee/biometrics source C.127, not A.031; plan title "Prepare for biometrics after you lodge"; checklist label "Biometrics letter").
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slices A–F. The natural sibling to slice F (health exam) — it completes the **post-lodgement logistics layer**: after health, *"what biometrics step will I face, what does it cost, and how do I track it?"*

---

## 1. Context & goal

Slice F enriched the after-offer `medical` item so the checklist answers the health half of post-lodgement logistics. The biometrics half is unanswered: there is **no biometrics item** in the checklist today, and the relevant facts sit unsurfaced — A.031 (the Immi App requires a biometrics letter whose Visa Lodgement Number starts with "AUI") is `pending`, while the two Nepal-side biometrics facts already in the data layer (C.123 Nepal-in-program, C.127 VFS Kathmandu fee) have **no user-facing surface**.

This slice wires **biometrics readiness** into the two already-shipped surfaces, kept intentionally small:

- `lib/checklist/generator.ts` — **add one** after-offer `visa`-group info item (`kind:null`), "Biometrics letter".
- `lib/plan/generator.ts` — **add one** AU-gated `prepare-biometrics` action, "Prepare for biometrics after you lodge".

**Goal:** make the biometrics surfaces state — Nepal is in Australia's biometrics program, expect a VFS Global collection fee (about NPR 2,365 at the Kathmandu centre), and after lodging the Immi App needs your biometrics letter (Visa Lodgement Number starting "AUI") — every shipped phrase finding-backed and machine-checked.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**. And — carried from F's diff-review caution — **no C-category churn**: C.123/C.127 are read read-only; `C.jsonl` and `au-health-biometric-facts.ts` are untouched.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the single clean biometrics-process finding; the two Nepal-side biometrics facts are **reused** from an already-`used` structured module rather than re-wired.

### Wired → `used` (1)

| Finding | Claim | `claim_type` | Consuming surface |
|---|---|---|---|
| **A.031** | The Australian Immi App requires a biometrics letter with a Visa Lodgement Number that starts with "AUI" | process | Checklist + plan |

A.031 is `value:null` / `value_status:"unset"` → no extractable structured value → it gets `value_status:"prose-only"` (same handling as slices E/F). `dup_group:null`, `conflict_with:null` — a clean singleton.

### Reused (not re-wired, no status change, no C churn)

Both already `status:"used"` via `au-health-biometric-facts.ts` (their used status predates this slice — **no double-count**):

- **C.123** — `nepal-biometrics-program-inclusion` (`value:true`, source `india.highcommission.gov.au`). A **boolean**: it cannot be interpolated, so the generators state Nepal's participation as **prose framing** faithful to the fact (and its provenance note "Applicants in Nepal provide biometrics as part of the visa process"). No const binding — referenced in a code comment to record provenance without an unused variable.
- **C.127** — `vfs-kathmandu-biometric-collection-fee` (`value:2365, unit:"NPR"`, source `visa.vfsglobal.com/npl/en/aus/attend-centre/kathmandu`). Genuinely reused: its **numeric value + unit are interpolated** ("NPR 2,365"), and its **source is the checklist item's SourceLine** (see §5, the source-display guard). This gives the structured fee its first user-facing surface — the same read-only-reuse pattern F used for C.092.

### Cluster integrity

- **`dup_group:null` on A.031** → no sibling stranded by flipping it.
- **`conflict_with:null`** → zero contradictions; `rejected:<reason>` and `needs-human-call` have **no members** in this slice.
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays **41 clusters**).

### Use-later by slice boundary — intentionally triaged, stay `pending`

- **A.029 / A.030** — DHA lists Kathmandu / Pokhara as Australian Biometrics Collection Centre (ABCC) locations. Both are `topic:contact`, `dup_group:G3` (held together — flipping neither strands the other). Location/contact data carries the highest staleness risk → use-later (same posture as B.025–B.026 in D, A.037 in F). A contact directory is explicitly out (below).
- **Any broader VFS / contact directory** — out; this slice surfaces no addresses, phone numbers, or appointment links.

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No C churn** — C.123/C.127 read-only; `au-health-biometric-facts.ts` + `C.jsonl` untouched.
- **No new `DocumentKind`** — the checklist item is `kind:null` (informational, no vault binding), exactly like `doc-preparation` / `noc-application`.
- **No new checklist group**, no new pages/routes, no profile-editor change — the two generators + the new module only.
- **No contact directory / ABCC locations** (A.029/A.030 use-later); no Nepal-side verification or equivalence.

**Ledger math after the slice:** category A `used` 42 → **43**, `pending` 80 → **79** (0 rejected). Overall ledger `used` 390 → **391**, `pending` 724 → **723**. `build-ledger.js` must show movement of exactly **this one finding**; clusters stay **41**. (C.123 + C.127 already counted as `used` — no double-count.)

---

## 3. Architecture — the wiring path

```
A.jsonl finding A.031 ──(provenance.findingRefs)──► au-biometrics.ts (NEW data module: A.031, single record)
       │                                                  │
       │                                                  ├─► checklist/generator.ts (NEW after-offer "Biometrics letter" info item)
       │                                                  └─► plan/generator.ts      (NEW AU-gated prepare-biometrics action)
       │                                                  │
au-health-biometric-facts.ts ──(C.123 + C.127, already used)──┴─► both surfaces read participation (C.123) + fee (C.127) read-only
       │
       └──(FLIP_STATUS=1 derives A.031 status:"used" + used_by from the new module's findingRefs — never hand-edited)
```

The new module is **pure sourced prose** (one DHA biometrics page). The two C-facts are read from the existing `AU_HEALTH_BIOMETRIC_FACTS` import (already present in both generators for C.092). Both consumers are **server-side** generators. The cross-module read of C.123/C.127 is the deliberate single-source-of-truth move — no fact is represented twice in the data layer.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `AuHealthExam` (the last interface, from slice F). Unlike E/F it carries **no `kind` discriminator** — the module is a single record, so there is nothing to filter:

```ts
export interface AuBiometrics extends Provenanced {
  id: "immi-app-biometrics-letter";
  label: string;     // short, inline
  summary: string;   // full sentence rendered by plan/checklist
  source: string;    // canonical DHA URL
  lastVerified?: string;
}
```

**`lib/data/source/au-biometrics.ts`** — `export const AU_BIOMETRICS: AuBiometrics[]`, **one record**. URL const:

- `DHA_IMMI_APP = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/biometrics/australian-immi-app"` (A.031)

`lastVerified: "2026-06-05"` (matches the finding's caveat "Last verified 2026-06-05").

| `id` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|
| `immi-app-biometrics-letter` | A.031 | "Immi App biometrics letter" | "After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'." | DHA_IMMI_APP |

**Why a single-record module (flagged):** this is the smallest module in the lane. That is intentional — A.031 is the only finding being newly wired; the slice's substance comes from composing it with the two reused structured C-facts. The slice-kit still requires a registered module for A.031 to flip to `used`, so the one-record module is the correct (and minimal) vehicle. `'AUI'` is single-quoted inside the double-quoted summary so no escaping is needed; the summary is a faithful rendering of A.031 ("Visa Lodgement Number" implies lodgement has occurred → "After you lodge").

---

## 5. Checklist change (`lib/checklist/generator.ts`) — add one info item

Add `import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";` (the `AU_HEALTH_BIOMETRIC_FACTS` import is already present, used for C.092). Compose the note and add **one new after-offer `visa`-group info item** immediately after the existing `medical` item:

```ts
const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
// Participation is framed from C.123 (boolean — stated, not interpolated); the fee value + the
// item SourceLine come from C.127 (the most concrete, most falsifiable claim — see the guard below).
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
const BIOMETRICS_NOTE =
  `Nepal takes part in Australia's biometrics program, so you'll give biometrics as part of your visa application. ` +
  `Expect a VFS Global collection fee of about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} at the Kathmandu centre. ` +
  `${BIOMETRICS_LETTER.summary}`;
```

```ts
add({
  key: "biometrics",
  kind: null,
  label: "Biometrics letter",
  group: "visa",
  stage: "after-offer",
  requirement: "required",
  note: BIOMETRICS_NOTE,
  // SOURCE-DISPLAY GUARD: the note carries three claims from two modules, but the SourceLine
  // shows one URL. Point it at the most concrete/falsifiable claim — the C.127 VFS Kathmandu fee
  // (also a biometrics-centre page) — NOT A.031's Immi App page. A.031 stays reconcile-backed via
  // AU_BIOMETRICS (provenance.findingRefs), independent of what URL renders. A deliberate departure
  // from the E/F "item source = wired finding" convention, per the approved design.
  source: { url: BIOMETRICS_FEE.source, lastVerified: BIOMETRICS_FEE.lastVerified },
});
```

> **Rendered note:** "Nepal takes part in Australia's biometrics program, so you'll give biometrics as part of your visa application. Expect a VFS Global collection fee of about NPR 2,365 at the Kathmandu centre. After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'."
>
> **Rendered label:** "Biometrics letter", with a mono "Bring this" status chip (`checklist-item.tsx` maps `status:"info"` → the chip text "Bring this"; the label renders as-is, not suffixed). Reads cleanly — you bring the biometrics letter to the appointment.

New assertions: the `biometrics` item is `{ kind:null, status:"info", group:"visa", stage:"after-offer", requirement:"required", label:"Biometrics letter" }`; `note` contains "biometrics program" + "AUI" and matches `/2[,.]?365/` (locale-tolerant, mirroring the existing 29,710 assertions) with "NPR"; **`source.url` contains `vfsglobal.com`** (the guard — proves the SourceLine is the fee/biometrics page, not the immi.homeaffairs A.031 page). The existing "places all visa documents in the after-offer stage" assertion is unaffected (it checks only the four named keys, not biometrics).

---

## 6. Plan change (`lib/plan/generator.ts`)

Add `import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";` (the `AU_HEALTH_BIOMETRIC_FACTS` import is already present). Add **one new `PlanItem`** (`PlanItem.kind` is a free `string`; **`PlanItem` carries no `source` field, so the source-display guard is N/A here**), placed right after the `prepare-health-exam` block, gated `primaryDestinationId === "australia"`:

```ts
const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
// ...
if (inputs.primaryDestinationId === "australia") {
  out.push({
    kind: "prepare-biometrics",
    impact: "medium",
    title: "Prepare for biometrics after you lodge",
    body:
      // participation framed from C.123; fee from C.127; the AUI letter sentence is A.031 verbatim
      `Nepal is in Australia's biometrics program, so you'll give biometrics at a VFS Global centre as part of your visa ` +
      `(collection fee about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} in Kathmandu). ` +
      `${BIOMETRICS_LETTER.summary}`,
    timeEstimate: "After you lodge",
  });
}
```

> **Rendered body:** "Nepal is in Australia's biometrics program, so you'll give biometrics at a VFS Global centre as part of your visa (collection fee about NPR 2,365 in Kathmandu). After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'."

**Copy-tweak compliance:**
- **Plan title** — "Prepare for biometrics after you lodge" (revised at spec review from "after lodgement" to the warmer, student-friendly "after you lodge"; clearer than the bare "Prepare biometrics", and consistent with the body's "After you lodge …").
- **Cross-surface consistency (the F lesson)** — both the checklist note and the plan body **end with `BIOMETRICS_LETTER.summary` verbatim**, so the load-bearing A.031 facts (Immi App, biometrics letter, "Visa Lodgement Number starts with 'AUI'") are byte-identical across surfaces and cannot drift. The fee scoping ("Kathmandu") and participation framing are consistent; only the connective idiom differs (informative note vs. action nudge).
- **Fee scoped to Kathmandu** — "about NPR 2,365 … in Kathmandu" so the figure never reads as a universal/Australia-wide fee (C.127 is Kathmandu-specific).

New assertions: item `prepare-biometrics` present for `primaryDestinationId:"australia"` with `impact:"medium"`, title contains "biometrics", body contains "AUI" and matches `/2[,.]?365/`; **absent** for `null` and non-AU (`"canada"`).

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on **A.031 only** in `A.jsonl` via a parse-by-id node one-liner (string-replace only that line; leave every other field + EOL untouched). A.029/A.030 are left `unset`/`pending` (use-later).
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes the one code-referenced finding to `status:"used"` with ID-accurate `used_by` (`au-biometrics[immi-app-biometrics-letter]`). Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — **only that one line changes**; A.029 + A.030 must remain `pending`.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/au-biometrics.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (1 value); non-empty `label`/`summary`; unique-`id` array refine. Mirror `au-health-exam.schema.ts` (minus the `kind` enum).
- **`lib/data/schema/registry.ts`** — import pair after the `AU_HEALTH_EXAM` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "AU_BIOMETRICS",
    data: AU_BIOMETRICS, schema: AuBiometricsSchema,
    recordLabel: "au-biometrics", subRecordKeys: [],
    recordInterface: "AuBiometrics" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically; `registry-integrity` enforces unique `recordLabel` + `exportName`.

---

## 9. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity; value-fidelity N/A for prose-only; conflict gate), schema parse, flip-status normal-mode clean, findings/registry integrity. The new module adds ~+1 to the data suite.
- **`tests/checklist/generator.test.ts`**: new case — the `biometrics` item exists with the shape in §5, the note carries the tokens ("biometrics program", "AUI", `/2[,.]?365/`, "NPR"), and **`source.url` contains `vfsglobal.com`** (locks the guard). RED first.
- **`tests/plan/generator.test.ts`**: new cases — `prepare-biometrics` present for AU primary with the tokens; absent for unset destination; absent for non-AU (`"canada"`). RED first.
- **Adversarial mutation** (prose-only): revert A.031's `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET A.031`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 1`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green. Expected ≈ **719 → 723** (+1 checklist, +2 plan, +1 registry-driven) — use the **actual** figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- **`git diff master...HEAD -- docs/research-briefs/findings/C.jsonl lib/data/source/au-health-biometric-facts.ts` empty** (no C churn — the F caution, carried forward).
- `node docs/research-briefs/_tools/build-ledger.js` → **A used 42 → 43, pending 80 → 79** (overall used 390 → 391, pending 724 → 723); only this slice moved, A.029 + A.030 stay `pending`, clusters stay 41.

**Best-effort (non-gating):** browser smoke via the preview tools — `/plan` (AU primary) shows "Prepare for biometrics after you lodge"; `/checklist/[programId]` shows the new "Biometrics letter" item. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests — note which was used.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-g-biometrics`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-biometrics.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edit + `FLIP_STATUS`. `tests/data/` green.
2. **Checklist consumption** — generator edit (new `biometrics` info item + consts, reusing C.123/C.127, source-display guard) + checklist test.
3. **Plan consumption** — generator edit (new `prepare-biometrics` action) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-G bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + plan doc are committed on the branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No C churn — C.123/C.127 reused read-only; `au-health-biometric-facts.ts` + `C.jsonl` untouched.
- No new `DocumentKind`, no new checklist group, no new pages/routes, no profile-editor change — the two generators + the new module only.
- No ABCC location data / contact directory (A.029/A.030 use-later); no Nepal-side verification or equivalence.

---

## 13. Success criteria

1. The checklist gains a "Biometrics letter" after-offer info item and the plan adds a `prepare-biometrics` action for AU-primary students — every phrase finding-backed, the A.031 "AUI" sentence identical across both surfaces.
2. The checklist item's SourceLine resolves to the C.127 fee/biometrics page (`vfsglobal.com`), not A.031 — the source-display guard holds and is asserted by test.
3. All reconcile invariants green for category A with `used` = 43, and the adversarial mutation bites (`USED_UNSET A.031`).
4. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched; **no C churn**.
5. The ledger shows exactly this slice's one finding moved `pending → used`, clusters unchanged at 41, with A.029/A.030 (ABCC locations) recorded as use-later by slice boundary.
