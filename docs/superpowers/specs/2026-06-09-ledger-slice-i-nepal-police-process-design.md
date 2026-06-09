# Ledger slice I — Nepal-side police / OPCR process → checklist + plan

**Status:** Design approved 2026-06-09 (**extend-not-add, tight OPCR-core**). Enrich the *existing* "Police certificate" checklist Step and the *existing* "Get your police certificate" plan action with the Nepal-side OPCR process; wire **A.095/A.096/A.097** (one route record), **A.100** (document set), **A.102** (validity); **reuse A.098/A.099 read-only** for turnaround; **no new checklist item, no new plan kind, no scoring, no contacts, no new page**.
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slice H. Slice H wired the DHA *character requirement* (A.039 — "you may be asked, from each country lived in 12+ months") and explicitly deferred the Nepal-side OPCR process (A.094–A.103). This slice opens exactly that deferred process and surfaces it on the two surfaces H already created — **richer copy, no new surfaces.**

---

## 1. Context & goal

Slice H made the app say *"DHA may ask for a police certificate, and for most Nepali students that's a Nepal Police character certificate."* The student's next question is **"so how do I actually get one?"** The OPCR facts exist (A.094–A.103) but none are surfaced.

This slice answers that question by enriching the two already-shipped police surfaces — it **does not add** an item or an action:

- `lib/checklist/generator.ts` — the existing `police-certificate` after-offer `visa` info item's **`note` only** gains the *document set to prepare* (A.100). Same item, same key, same `kind:null`/`infoKind:"step"`/`requirement:"recommended"`.
- `lib/plan/generator.ts` — the existing AU-gated `prepare-police-certificate` action's **`body` only** gains the *how-to* (apply route A.095/096/097, turnaround A.098/099 read-only, validity A.102). Same kind, same gate, same `impact`.

**Copy split (the locked product model):** the **checklist** says *what it is + what to prepare* (kept short); the **plan** carries *how to do it and when* (the longer how-to). The checklist note stays shorter than the plan body so police does not become the second dense block after NOC.

**Goal:** every shipped OPCR phrase is finding-backed and machine-checked; the load-bearing A.039 rule + Nepal framing stay byte-identical across both surfaces (shared verbatim, as in slices F–H).

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**.

---

## 2. Scope — the slice and its four-state disposition ledger

The cluster is the Nepal-side OPCR/CID process (A.094–A.103). The subset wired is the **OPCR-core**: how/where you apply, what you upload, how long it takes, how long it stays valid.

### Wired → `used` (5)

| Finding | Claim (paraphrased) | `claim_type` | Cluster | Consuming surface |
|---|---|---|---|---|
| **A.095** | OPCR: apply online from home or nearest cyber | process | `G8` (enumeration) | Plan (route) |
| **A.096** | OPCR: service available through Nagarik App | process | `G8` (enumeration) | Plan (route) |
| **A.097** | OPCR: applicants outside Nepal can also apply | process | — | Plan (route) |
| **A.100** | OPCR uploaded set: photo, citizenship cert, passport pp.1–3 | data | — | **Checklist** (prepare) |
| **A.102** | OPCR: study/migration certificate valid 3 months from issue | data | — | Plan (validity) |

All five are `value:null` (or non-extractable) → each gets `value_status:"prose-only"` (same handling as slices E–H), then `FLIP_STATUS` derives `status:"used"`. **A.095/A.096/A.097 collapse into one route record** (`opcr-application-route`) citing all three `findingRefs` — one user-facing route sentence, three findings credited.

### Cluster integrity — the one new wrinkle vs slice H

Slice H was a clean singleton. This slice flips **both members of an enumeration cluster** (`G8` = A.095 web/cyber + A.096 Nagarik App):

- **A.095 / A.096 are already `cluster_triage:"enumeration"` with `conflict_with:null`** (verified in `A.jsonl`). The global conflict gate (`tests/data/findings-integrity.test.ts` → `conflictGate`) restricts only **contradictions** (findings linked by `conflict_with`) to "at most one `used` member." Enumeration members carry no `conflict_with`, so **both may ship `used`** — no gate violation.
- **No `cluster_triage` edits** (both are already `enumeration`) → `findings-clusters.md` member-triage counts unchanged; cluster count stays **41**.
- A.097/A.100/A.102 are `dup_group:null`, `conflict_with:null` — clean singletons.

### Use-later by slice boundary — intentionally deferred, stay `pending`

- **A.094** (Nepal Police CID provides character certificates to citizens/foreigners) — **use-later**: generic but not false; could feed a future explanatory guide. Redundant *for this slice* (the concrete OPCR route supersedes it), not permanently rejected.
- **A.101** (ward recommendation if departed via a non-TIA airport) — **use-later**: a conditional edge; revisit when we model conditional document requirements.
- **A.103** (applicants abroad can print/download the PCC PDF) — **use-later**: an abroad convenience detail; pairs with a future abroad-applicant slice.

### Already-`used`, reused read-only (no edit)

- **A.098 / A.099** — Nepal Police OPCR turnarounds (standard **2 working days**, urgent **1**), already `status:"used"`/structured in `nepal-document-processing-times.ts` (`police-character-standard` / `police-character-urgent`). The plan generator **reads these read-only** (the F/G/G-biometrics pattern — like the VFS fee reuse): it imports `NEPAL_DOCUMENT_PROCESSING_TIMES` and renders `typicalBusinessDays`. **No re-wiring, no findingRef in the new module, no edit to that module or its findings.**

### Out of scope (firm boundaries)

- **B.134** (category B: "Nepal Police provides online character certificates to local and foreign nationals") is a cross-category near-duplicate of A.095. **Left entirely untouched** — this is a category-A slice; tagging a category-B finding would add cross-category churn (a `B.jsonl` edit + a category-B reconcile surface that doesn't exist here) for zero user benefit. Recorded here as a known near-duplicate, deliberately out of scope. **Zero edits to B.134 / `B.jsonl`.**
- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No new `DocumentKind`**, no new checklist item, no new checklist group — the existing `police-certificate` item's `note` is the only checklist change.
- **No new plan kind** — `prepare-police-certificate` already exists and is already in `VISA_PREP_KINDS` (`lib/plan/phases.ts`); only its `body` changes. **No `phases.ts` edit.**
- **No contact directory, no new pages/routes, no profile-editor change** — the two generators + the new module only.

**Ledger math after the slice:** category A `used` 44 → **49**, `pending` 78 → **73** (0 rejected). Overall `used` 392 → **397**, `pending` 722 → **717**. `build-ledger.js` must show movement of exactly **these five findings**; clusters stay **41**. (A.098/A.099 already counted `used` — no change.)

---

## 3. Architecture — the wiring path

```
A.jsonl A.095/096/097 ─┐
A.jsonl A.100 ─────────┼─(provenance.findingRefs)─► nepal-police-certificate.ts (NEW: 3 records, 5 findings)
A.jsonl A.102 ─────────┘                                  │
                                                          ├─► checklist/generator.ts  (EXISTING police item — note gains A.100 doc set)
                                                          └─► plan/generator.ts        (EXISTING police action — body gains route/validity)
                                                                  ▲
nepal-document-processing-times.ts (A.098/A.099) ─read-only──────┘  (turnaround; already used, not re-wired)

FLIP_STATUS=1 derives status:"used" + used_by for the 5 new findings from the new module's findingRefs (never hand-edited).
```

The new module is **pure sourced prose** (one OPCR service page, `https://opcr.nepalpolice.gov.np/`). Both consumers are **server-side** generators. The plan additionally performs one **read-only cross-module read** (`NEPAL_DOCUMENT_PROCESSING_TIMES`) for the turnaround — the established reuse pattern; no new finding is created for the turnaround.

**SourceLine:** both surfaces already point their SourceLine at the **DHA character page** (A.039, via `POLICE_CERT.source`) — that stays. The OPCR sentences are an additional sourced layer in the note/body whose provenance lives in the data module (`findingRefs`), independent of the single rendered SourceLine URL (same display-vs-provenance separation used for biometrics in slice G). The OPCR page is not rendered as a second SourceLine — keeping one URL per surface, as today.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `AuPoliceCertificate` (the last interface, from slice H). Multi-record with a `kind` discriminator (mirrors `NepalNocJourney`):

```ts
export interface NepalPoliceCertificate extends Provenanced {
  id:
    | "opcr-application-route"
    | "opcr-document-set"
    | "opcr-validity";
  kind: "application-route" | "required-document" | "validity-rule";
  label: string;   // short, inline label
  summary: string; // the phrase the plan/checklist render
  source: string;  // OPCR service URL
  lastVerified?: string; // ISO date
}
```

**`lib/data/source/nepal-police-certificate.ts`** — `export const NEPAL_POLICE_CERTIFICATE: NepalPoliceCertificate[]`, **three records**. URL const:

- `POLICE_OPCR = "https://opcr.nepalpolice.gov.np/"` (matches the value already used in `nepal-document-processing-times.ts`).

`lastVerified: "2026-06-05"` (matches the findings' verification date).

| `id` | `kind` | `findingRefs` | `label` | `summary` (canonical copy) |
|---|---|---|---|---|
| `opcr-application-route` | `application-route` | A.095, A.096, A.097 | "How to apply" | "You can apply online through the Nepal Police OPCR portal or the Nagarik App, including from outside Nepal." |
| `opcr-document-set` | `required-document` | A.100 | "Documents to upload" | "a recent photo, your citizenship certificate, and passport pages 1 to 3" |
| `opcr-validity` | `validity-rule` | A.102 | "Validity" | "A study or migration certificate stays valid for 3 months from its issue date." |

**Editorial notes (faithfulness):**
- `opcr-application-route` collapses the `G8` enumeration (A.095 portal + A.096 Nagarik App) and A.097 (from abroad) into one route sentence; the `provenance.note` records all three source claims by ID.
- `opcr-document-set.summary` is an **article-first fragment** (renders after "you'll upload …"), covering the universal core of A.100 (photo / citizenship / passport pp.1–3). A.100's abroad-only "departure page" clause is **intentionally not surfaced** here (kept tight; the route sentence already states "including from outside Nepal"); A.100 is still `used` via the findingRef, and the `provenance.note` records the full set.
- `opcr-validity.summary` is a full standalone sentence (A.102's 3-month study/migration validity).

---

## 5. Checklist change (`lib/checklist/generator.ts`) — enrich the existing note

Add `import { NEPAL_POLICE_CERTIFICATE } from "@/lib/data/source/nepal-police-certificate";`. Add one const and **extend** the existing `POLICE_NOTE` (the `add({ key: "police-certificate", … })` block is **unchanged** — same item, same shape):

```ts
const POLICE_CERT = AU_POLICE_CERTIFICATE.find((r) => r.id === "police-certificate-requirement")!; // A.039
const POLICE_DOC_SET = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-document-set")!.summary; // A.100
const POLICE_NOTE =
  `${POLICE_CERT.summary} For most Nepali students that means a Nepal Police character certificate, ` +
  `plus one from any other country you've lived in that long. ` +
  `For the Nepal certificate you'll upload ${POLICE_DOC_SET}.`;
```

> **Rendered note (locked, approved):** "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16. For most Nepali students that means a Nepal Police character certificate, plus one from any other country you've lived in that long. **For the Nepal certificate you'll upload a recent photo, your citizenship certificate, and passport pages 1 to 3.**"

The item still renders the mono **"Step"** chip (`infoKind:"step"`, `status:"info"`) with the suppressed requirement pill (the IA-cleanup behaviour) — **unchanged**. The only diff vs today is the appended third sentence.

**Test impact:** the existing case *"adds the after-offer police-certificate info item with the DHA rule + Nepal framing (A.039)"* keeps all current asserts (item shape + "12 months or more" / "after you turned 16" / "Nepal Police character certificate" / `immi.homeaffairs.gov.au`) and gains an assert that `note` contains **"passport pages 1 to 3"**. The `infoKind:"step"` case is unaffected.

---

## 6. Plan change (`lib/plan/generator.ts`) — enrich the existing body

Add two imports: `NEPAL_POLICE_CERTIFICATE` and (read-only) `NEPAL_DOCUMENT_PROCESSING_TIMES`. Add three consts and **extend** the existing `prepare-police-certificate` body (the `out.push({ kind: "prepare-police-certificate", … })` shape — kind, `impact:"medium"`, `title`, gate, `timeEstimate` — is **unchanged**):

```ts
const POLICE_CERT = AU_POLICE_CERTIFICATE.find((r) => r.id === "police-certificate-requirement")!; // A.039
const POLICE_ROUTE = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-application-route")!.summary;   // A.095/096/097
const POLICE_VALIDITY = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-validity")!.summary;          // A.102
const POLICE_STD_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "police-character-standard")!.typicalBusinessDays; // A.098 (read-only)
const POLICE_URGENT_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "police-character-urgent")!.typicalBusinessDays; // A.099 (read-only)
// ...
if (inputs.primaryDestinationId === "australia") {
  out.push({
    kind: "prepare-police-certificate",
    impact: "medium",
    title: "Get your police certificate",
    body:
      `${POLICE_CERT.summary} For most Nepali students that means a Nepal Police character certificate, ` +
      `plus one from any other country you've lived in that long. ${POLICE_ROUTE} ` +
      `Standard service is usually about ${POLICE_STD_DAYS} working days (${POLICE_URGENT_DAYS} working day urgent). ` +
      `${POLICE_VALIDITY} Time it so it's still valid when you lodge.`,
    timeEstimate: "1-2 weeks",
  });
}
```

> **Rendered body (locked, approved):** "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16. For most Nepali students that means a Nepal Police character certificate, plus one from any other country you've lived in that long. **You can apply online through the Nepal Police OPCR portal or the Nagarik App, including from outside Nepal. Standard service is usually about 2 working days (1 working day urgent). A study or migration certificate stays valid for 3 months from its issue date. Time it so it's still valid when you lodge.**"

**Cross-surface consistency (the F/G/H lesson):** both surfaces still **open with `POLICE_CERT.summary` verbatim**, so the A.039 rule (the four qualifiers) is byte-identical across surfaces. The old vague "They can take time, so start early." is **replaced** by concrete facts (route + turnaround + validity + timing). The "Time it so it's still valid when you lodge." nudge is generator copy (the actionable insight from the 3-month validity), not a sourced claim.

**Test impact:** the existing case *"adds the prepare-police-certificate item for an Australian primary destination (A.039)"* keeps all current asserts (presence, `impact:"medium"`, title, "12 months or more" / "after you turned 16") and gains asserts that `body` contains **"OPCR"** (or "Nagarik App"), **"working days"**, and **"3 months"**. The absent-for-non-AU/unset case is unaffected.

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on **A.095, A.096, A.097, A.100, A.102 only** in `A.jsonl`, via a parse-by-id node script (string-replace only those five lines; leave every other field + EOL untouched). A.094/A.101/A.103 stay `unset`/`pending` (use-later); A.098/A.099 stay `used`/`structured` (untouched); B.134 untouched.
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes the five code-referenced findings to `status:"used"` with ID-accurate `used_by` (`nepal-police-certificate[opcr-application-route]` for A.095/096/097, `nepal-police-certificate[opcr-document-set]` for A.100, `nepal-police-certificate[opcr-validity]` for A.102). Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — **only those five lines change** (each: `value_status` unset→prose-only, `status` pending→used, `used_by` set).

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/nepal-police-certificate.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (3 values) and `kind` (3 values); non-empty `label`/`summary`; unique-`id` array refine. Mirror `nepal-noc-journey.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `AU_POLICE_CERTIFICATE` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "NEPAL_POLICE_CERTIFICATE",
    data: NEPAL_POLICE_CERTIFICATE, schema: NepalPoliceCertificateSchema,
    recordLabel: "nepal-police-certificate", subRecordKeys: [],
    recordInterface: "NepalPoliceCertificate" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically; `registry-integrity` enforces unique `recordLabel` + `exportName`.

---

## 9. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity — value-fidelity N/A for prose-only; conflict gate green incl. the `G8` enumeration both-`used`), schema parse, flip-status normal-mode clean, findings/registry integrity. No new `it` blocks — the parameterized tests pick up the new module.
- **`tests/checklist/generator.test.ts`**: extend the existing police case with the **"passport pages 1 to 3"** assert (RED first — today's note lacks it).
- **`tests/plan/generator.test.ts`**: extend the existing police case with the **"OPCR" + "working days" + "3 months"** asserts (RED first). Add one focused case asserting the route/turnaround/validity sentences render for AU primary.
- **Adversarial mutation** (prose-only): revert one finding's `value_status` to `unset` (e.g. A.100) while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET A.100`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 5`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green. Expected ≈ **734 → ~736** (+2 generator cases; data suite count unchanged) — use the **actual** figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- **`git diff master...HEAD -- lib/data/source/nepal-document-processing-times.ts lib/plan/phases.ts docs/research-briefs/findings/B.jsonl` empty** (reused turnaround module, plan phases, and category B all untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → **A used 44 → 49, pending 78 → 73** (overall used 392 → 397, pending 722 → 717); only this slice's five findings moved, clusters stay 41.

**Best-effort (non-gating):** browser smoke via the preview tools — `/plan` (AU primary) shows the enriched "Get your police certificate" body; `/checklist/[programId]` shows the enriched "Police certificate" note. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests / a temporary public scratch route — note which was used.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-i-nepal-police-process`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `nepal-police-certificate.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edits (×5) + `FLIP_STATUS`. `tests/data/` green.
2. **Checklist consumption** — generator edit (extend `POLICE_NOTE` + const) + checklist test assert.
3. **Plan consumption** — generator edit (extend body + consts + 2 imports) + plan test asserts.
4. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-I bullet) + regenerated `findings-ledger.md` / `findings-clusters.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + plan doc are committed on the branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, **no new checklist item**, no new checklist group, **no new plan kind** (no `phases.ts` edit), no new pages/routes, no profile-editor change.
- No edit to `nepal-document-processing-times.ts` or its findings (A.098/A.099 reused read-only).
- No edit to B.134 / `B.jsonl` (cross-category near-dup left out of scope).
- No contact directory; A.094 / A.101 / A.103 deferred as use-later.

---

## 13. Success criteria

1. The existing "Police certificate" checklist item and `prepare-police-certificate` plan action are **enriched** (no new item/action): the checklist note gains the OPCR document set; the plan body gains the apply route, turnaround, and validity — every OPCR phrase finding-backed, the A.039 rule identical across both surfaces.
2. The checklist note stays shorter than the plan body (what-to-prepare vs how-to-do-it); the item still renders the "Step" chip with no requirement pill.
3. All reconcile invariants green for category A with `used` = 49; the `G8` enumeration ships **both** A.095 and A.096 `used` with the conflict gate green; the adversarial mutation bites (`USED_UNSET A.100`).
4. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched; `nepal-document-processing-times.ts`, `lib/plan/phases.ts`, and `B.jsonl` untouched.
5. The ledger shows exactly these five findings moved `pending → used`, clusters unchanged at 41, with A.094 / A.101 / A.103 recorded as use-later and B.134 noted as out-of-scope cross-category near-dup.
