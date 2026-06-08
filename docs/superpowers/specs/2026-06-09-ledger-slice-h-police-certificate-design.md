# Ledger slice H — DHA police / character certificate → checklist + plan

**Status:** Design approved 2026-06-09 (Option **(a) tight DHA-core only** — wire **A.039 only**; one after-offer visa info item + one AU-gated plan action; requirement chip **"recommended"** (DHA says "may ask"); no Nepal-side OPCR process, no turnaround timing, no contact directory; A.098/A.099 stay already-used but unsurfaced for a future Nepal-side police slice).
**Lane:** Ledger by slice (integrate `lib/data/source/*` findings into the engine/UI, one coherent slice at a time, four-state tagged).
**Slice-kit:** Follows `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md` (the canonical registry-driven process).
**Builds on:** Slices A–G. The third post-lodgement visa-readiness item after health (F) and biometrics (G) — it completes the DHA visa-readiness layer without opening the Nepal-side police process.

---

## 1. Context & goal

After health (F) and biometrics (G), the next student-facing visa-readiness question is the **character requirement** — *"will I need a police certificate, and from where?"* The finding exists (A.039) but is unsurfaced, and there is no police/character item in the checklist today.

This slice wires the **DHA police-certificate rule** into the two already-shipped surfaces, kept deliberately tight (DHA-core only):

- `lib/checklist/generator.ts` — **add one** after-offer `visa`-group info item (`kind:null`), "Police certificate".
- `lib/plan/generator.ts` — **add one** AU-gated `prepare-police-certificate` action, "Get your police certificate".

**Goal:** make the surfaces state DHA's rule faithfully — you *may* be asked for a police certificate from each country where you spent 12 months or more in the last 10 years (counting only time after you turned 16) — with Nepal framing (for most Nepali students that means a Nepal Police character certificate, plus one from any other country lived in that long). Every shipped phrase finding-backed and machine-checked.

**Non-goal / guarantee:** **no scoring code is touched.** No generator imports `lib/scoring/*`; `lib/scoring/financial.ts` and `lib/data/policy/funding-reliability.ts` are not edited; `tests/scoring/__fixtures__/golden-assessments.json` stays **byte-identical**.

---

## 2. Scope — the slice and its four-state disposition ledger

The subset is the single clean DHA character-requirement finding. **No reuse** this slice (unlike F/G): A.039 stands alone.

### Wired → `used` (1)

| Finding | Claim | `claim_type` | Consuming surface |
|---|---|---|---|
| **A.039** | DHA may need a police certificate from each country where the applicant spent 12+ months in the last 10 years after turning 16 | process | Checklist + plan |

A.039 is `value:null` / `value_status:"unset"` → no extractable structured value → it gets `value_status:"prose-only"` (same handling as slices E/F/G). `dup_group:null`, `conflict_with:null` — a clean singleton.

### Cluster integrity

- **`dup_group:null` on A.039** → no sibling stranded by flipping it.
- **`conflict_with:null`** → zero contradictions; `rejected:<reason>` and `needs-human-call` have **no members** in this slice.
- **No `cluster_triage` edits** → `findings-clusters.md` unchanged (stays **41 clusters**).

### Use-later by slice boundary — intentionally triaged, stay `pending`

The **Nepal-side police-certificate process** (OPCR / CID) is a coherent *future* slice, kept whole:

- **A.094** (Nepal Police CID provides character certificates), **A.095/A.096** (`dup_group:G8` — OPCR online / Nagarik App), **A.097** (apply from abroad), **A.100** (uploaded document set), **A.101** (ward recommendation for non-TIA departure), **A.102** (3-month validity for study/migration), **A.103** (download the PCC PDF abroad). All `pending` → future **Nepal-side police slice**.

### Already-`used`, untouched (no surface this slice)

- **A.098 / A.099** — Nepal Police OPCR turnarounds (standard **2 working days**, urgent **1**), already `status:"used"`/structured in `nepal-document-processing-times.ts` (`police-character-standard` / `police-character-urgent`). That module is imported **only by the registry**, so these facts have no user-facing surface yet. Per the approved Option (a) they **stay unsurfaced**; the future Nepal-side police slice will surface them read-only **alongside** A.094–A.103 (no re-wiring needed — they are already wired). This slice does not touch them.

### Out of scope (firm boundaries)

- **No scoring change** (`financial.ts` + `funding-reliability.ts` + goldens byte-identical).
- **No new `DocumentKind`** — the checklist item is `kind:null` (informational, no vault binding), like `doc-preparation` / `noc-application` / `biometrics`. (No police/character kind exists in `lib/documents/types.ts`.)
- **No Nepal-side OPCR process, no turnaround timing, no contact directory** — A.094–A.103 deferred.
- **No new checklist group**, no new pages/routes, no profile-editor change — the two generators + the new module only.

**Ledger math after the slice:** category A `used` 43 → **44**, `pending` 79 → **78** (0 rejected). Overall ledger `used` 391 → **392**, `pending` 723 → **722**. `build-ledger.js` must show movement of exactly **this one finding**; clusters stay **41**. (A.098/A.099 already counted as `used` — no change.)

---

## 3. Architecture — the wiring path

```
A.jsonl finding A.039 ──(provenance.findingRefs)──► au-police-certificate.ts (NEW data module: A.039, single record)
       │                                                  │
       │                                                  ├─► checklist/generator.ts (NEW after-offer "Police certificate" info item)
       │                                                  └─► plan/generator.ts      (NEW AU-gated prepare-police-certificate action)
       │
       └──(FLIP_STATUS=1 derives A.039 status:"used" + used_by from the new module's findingRefs — never hand-edited)
```

The new module is **pure sourced prose** (one DHA character page). **Single source per surface** — unlike slice G, the note carries only one sourced claim (A.039), so there is **no source-display guard**: the SourceLine is simply A.039's DHA page. (The Nepal framing — "Nepal Police character certificate" — is generator contextualization for the Nepal→Australia audience, not a separately-sourced claim, so it needs no finding.) Both consumers are **server-side** generators. No cross-module read, no reuse.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface immediately after `AuBiometrics` (the last interface, from slice G). Single record, no `kind` (mirrors `AuBiometrics`):

```ts
export interface AuPoliceCertificate extends Provenanced {
  id: "police-certificate-requirement";
  label: string;     // short, inline
  summary: string;   // the full sentence rendered by plan/checklist
  source: string;    // canonical DHA URL
  lastVerified?: string; // ISO date
}
```

**`lib/data/source/au-police-certificate.ts`** — `export const AU_POLICE_CERTIFICATE: AuPoliceCertificate[]`, **one record**. URL const:

- `DHA_CHARACTER = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/character/police-certificates"` (A.039)

`lastVerified: "2026-06-05"` (matches the finding's caveat "Last verified 2026-06-05").

| `id` | `findingRefs` | `label` | `summary` (canonical copy) | `source` |
|---|---|---|---|---|
| `police-certificate-requirement` | A.039 | "Police certificate (character requirement)" | "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16." | DHA_CHARACTER |

**Why a single-record module:** A.039 is the only DHA character finding in scope (A.094–A.103 are Nepal-side). The slice-kit requires a registered module for A.039 to flip to `used`, so the one-record module (no `kind`) is the minimal vehicle — second of its shape after `au-biometrics`. The summary is a faithful rendering of A.039's conditional ("might need" → "may ask"), preserving all four qualifiers: **per-country**, **12 months or more**, **last 10 years**, **after turning 16**.

---

## 5. Checklist change (`lib/checklist/generator.ts`) — add one info item

Add `import { AU_POLICE_CERTIFICATE } from "@/lib/data/source/au-police-certificate";`. Compose the note and add **one new after-offer `visa`-group info item** immediately after the existing `biometrics` item:

```ts
const POLICE_CERT = AU_POLICE_CERTIFICATE.find((r) => r.id === "police-certificate-requirement")!; // A.039
const POLICE_NOTE =
  `${POLICE_CERT.summary} For most Nepali students that means a Nepal Police character certificate, ` +
  `plus one from any other country you've lived in that long.`;
```

```ts
add({
  key: "police-certificate",
  kind: null,
  label: "Police certificate",
  group: "visa",
  stage: "after-offer",
  requirement: "recommended", // DHA says "may ask" — conditional, so not "required"
  note: POLICE_NOTE,
  source: { url: POLICE_CERT.source, lastVerified: POLICE_CERT.lastVerified },
});
```

> **Rendered note:** "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16. For most Nepali students that means a Nepal Police character certificate, plus one from any other country you've lived in that long."
>
> **Rendered label:** "Police certificate", with a mono "Bring this" status chip (`status:"info"`).

**Requirement = "recommended" (copy-precision):** DHA states applicants *might* need a police certificate, so the chip stays conditional rather than overstating "required" (the note explains the practical Nepal near-certainty). This differs from the after-offer items that *are* unconditionally required (`coe`/`oshc`/`medical` → "required"); it does not affect the existing "places all visa documents in the after-offer stage, required" assertion, which checks only the four named keys.

New assertions: the `police-certificate` item is `{ kind:null, status:"info", group:"visa", stage:"after-offer", requirement:"recommended", label:"Police certificate" }`; `note` contains "12 months or more" + "after you turned 16" + "Nepal Police character certificate"; `source.url` contains `immi.homeaffairs.gov.au`.

---

## 6. Plan change (`lib/plan/generator.ts`)

Add `import { AU_POLICE_CERTIFICATE } from "@/lib/data/source/au-police-certificate";`. Add **one new `PlanItem`** (`PlanItem.kind` is a free `string`), placed right after the `prepare-biometrics` block, gated `primaryDestinationId === "australia"`:

```ts
const POLICE_CERT = AU_POLICE_CERTIFICATE.find((r) => r.id === "police-certificate-requirement")!; // A.039
// ...
if (inputs.primaryDestinationId === "australia") {
  out.push({
    kind: "prepare-police-certificate",
    impact: "medium",
    title: "Get your police certificate",
    body:
      `${POLICE_CERT.summary} For most Nepali students that means a Nepal Police character certificate, ` +
      `plus one from any other country you've lived in that long. They can take time, so start early.`,
    timeEstimate: "1-2 weeks",
  });
}
```

> **Rendered body:** "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16. For most Nepali students that means a Nepal Police character certificate, plus one from any other country you've lived in that long. They can take time, so start early."

**Cross-surface consistency (the F/G lesson):** both the checklist note and the plan body **open with `POLICE_CERT.summary` verbatim**, so the load-bearing A.039 rule (the four qualifiers) is byte-identical across surfaces and cannot drift. The Nepal-framing sentence is shared; the plan adds only the "start early" nudge. No specific turnaround is cited (A.098/A.099 deferred), so the nudge stays qualitative ("they can take time").

New assertions: item `prepare-police-certificate` present for `primaryDestinationId:"australia"` with `impact:"medium"`, title contains "police certificate", body contains "12 months or more" + "after you turned 16"; **absent** for `null` and non-AU (`"canada"`).

---

## 7. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on **A.039 only** in `A.jsonl` via a parse-by-id node one-liner (string-replace only that line; leave every other field + EOL untouched). A.094–A.103 are left `unset`/`pending` (or stay `used` for A.098/A.099) — not touched.
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes the one code-referenced finding to `status:"used"` with ID-accurate `used_by` (`au-police-certificate[police-certificate-requirement]`). Inspect `git diff -- docs/research-briefs/findings/A.jsonl` — **only that one line changes**.

---

## 8. Schema + registry (slice-kit)

- **`lib/data/schema/au-police-certificate.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`; `z.enum` on `id` (1 value); non-empty `label`/`summary`; unique-`id` array refine. Mirror `au-biometrics.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `AU_BIOMETRICS` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "A", exportName: "AU_POLICE_CERTIFICATE",
    data: AU_POLICE_CERTIFICATE, schema: AuPoliceCertificateSchema,
    recordLabel: "au-police-certificate", subRecordKeys: [],
    recordInterface: "AuPoliceCertificate" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically; `registry-integrity` enforces unique `recordLabel` + `exportName`.

---

## 9. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage / validity; value-fidelity N/A for prose-only; conflict gate), schema parse, flip-status normal-mode clean, findings/registry integrity. The new module adds ~+1 to the data suite.
- **`tests/checklist/generator.test.ts`**: new case — the `police-certificate` item exists with the shape in §5, the note carries the tokens ("12 months or more", "after you turned 16", "Nepal Police character certificate") + DHA source. RED first.
- **`tests/plan/generator.test.ts`**: new cases — `prepare-police-certificate` present for AU primary with the tokens; absent for unset destination; absent for non-AU (`"canada"`). RED first.
- **Adversarial mutation** (prose-only): revert A.039's `value_status` to `unset` while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET A.039`; restore via `git checkout --`.

---

## 10. Verification gate

**Hard gate — the slice is not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 1`, 0 orphans, 0 drift, 0 open-conflict-uses) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green. Expected ≈ **723 → 727** (+1 checklist, +2 plan, +1 registry-driven) — use the **actual** figure in PROJECT_STATUS.
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- **`git diff master...HEAD -- lib/data/source/nepal-document-processing-times.ts docs/research-briefs/findings/C.jsonl` empty** (the already-used Nepal turnarounds + C untouched).
- `node docs/research-briefs/_tools/build-ledger.js` → **A used 43 → 44, pending 79 → 78** (overall used 391 → 392, pending 723 → 722); only this slice moved, clusters stay 41.

**Best-effort (non-gating):** browser smoke via the preview tools — `/plan` (AU primary) shows "Get your police certificate"; `/checklist/[programId]` shows the new "Police certificate" item. Signed-in routes are OAuth-gated, so this typically falls back to the composition unit tests — note which was used.

---

## 11. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-h-police-certificate`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `au-police-certificate.ts` + `.schema.ts` + registry line + `A.jsonl` value_status edit + `FLIP_STATUS`. `tests/data/` green.
2. **Checklist consumption** — generator edit (new `police-certificate` info item + consts) + checklist test.
3. **Plan consumption** — generator edit (new `prepare-police-certificate` action) + plan tests.
4. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-H bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge. (The spec + plan doc are committed on the branch ahead of the code commits.)

---

## 12. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No new `DocumentKind`, no new checklist group, no new pages/routes, no profile-editor change — the two generators + the new module only.
- No Nepal-side OPCR/CID process (A.094–A.103), no turnaround timing (A.098/A.099 stay used-but-unsurfaced), no contact directory — all reserved for a future Nepal-side police slice.
- No reuse / cross-module read; no source-display guard (single source).

---

## 13. Success criteria

1. The checklist gains a "Police certificate" after-offer info item and the plan adds a `prepare-police-certificate` action for AU-primary students — every phrase finding-backed, the A.039 rule (12 months / 10 years / after 16) identical across both surfaces.
2. The requirement chip reads "recommended" (DHA "may ask"), and the SourceLine resolves to the DHA character page (`immi.homeaffairs.gov.au`).
3. All reconcile invariants green for category A with `used` = 44, and the adversarial mutation bites (`USED_UNSET A.039`).
4. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `financial.ts` / `funding-reliability.ts` untouched; the already-used `nepal-document-processing-times` (A.098/A.099) untouched.
5. The ledger shows exactly this slice's one finding moved `pending → used`, clusters unchanged at 41, with the Nepal-side police process (A.094–A.103) recorded as use-later by slice boundary.
