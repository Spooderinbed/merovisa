# Refusal risk & recovery panel — results page (trust-defense slice K)

**Status:** Design approved 2026-06-10. First **trust-defense** integration, selected by a pending-ledger value audit (pivot from linear A→J slicing to triage-by-value). A new **propless, static, sourced panel** on the anonymous results page surfacing the truth about Nepal→Australia student-visa refusal: **why applications fail, honest sector odds, what recovery looks like, and what not to trust** — all gov-sourced (category I).
**Lane:** Value-audit triage (trust-defense primary, pre-signup decision trust secondary). Data layer still follows slice-kit (typed module → `prose-only` → `findingRefs` → `FLIP_STATUS` → registry-driven `tests/data/` invariants); four-state tagged.
**Audit basis:** Categories F/G/I are the unmined trust-defense spine. **I** chosen as the highest value-to-feasibility (gov 62/78). **G** (agent/consultancy risk) deferred to a human-sourcing + editorial task (65/107 unverifiable self-claims). **F** (GS credibility) is the slice-shaped fast-follow.

---

## 1. Context & goal

The student question this answers: **"What actually gets Nepal applications refused, what are my honest odds, and what happens if I'm refused?"** — on the pre-signup decision surface, before a student is misled, overcharged, or pushed into a weak application.

This is the product's spine made literal (MyVisa: *"assess your real chances before engaging consultancies"*). Today the results page shows a verdict, factor bars, the policy corridor (`PolicyBanner`), and costs (`CostToApply`) — but nothing tells a scared student the *truth about refusal and recovery*.

This slice adds **one new panel** to the anonymous results page (also shown to signed-in/owned users — not gated). No scoring, no new document kind, no profile change.

---

## 2. Scope — the audit pick and four-state disposition

The wired subset is the **gov-sourced** trust-defense core of category I, across four sections.

### Wired → `used` (16, all gov, all `prose-only`)

| Section | Findings | Rendered claim (paraphrased) |
|---|---|---|
| **Why refused** | I.008, I.006 | Genuine Student — must be a genuine applicant; DHA weighs the evidence behind the answers |
| | I.029 | Financial + English-language capacity evidence required |
| | I.027 | Altered/edited/manipulated documents are unlawful |
| **Honest odds (by sector)** | I.034 | Higher Education (university) offshore grant rate **85.3%** (Apr–Jun 2025) |
| | I.035 | VET offshore grant rate **36.3%** (same period) — shown as contrast |
| **If you're refused** | I.044 | ART can review the decision |
| | I.045 | ART review fee **AUD 3,580** (most migration decisions) |
| | I.046 | 50% fee reduction may apply on hardship grounds |
| | I.057, I.059, I.060 | Ministerial intervention is a rare, conditional last resort |
| **What not to trust** | I.078, I.079, I.080 | Australia issues no work permits / visa labels / LMIAs |
| | I.028 | Bogus/false documents → refusal, cancellation, future-application bans |

All sixteen are `value:null` / `value_status:"unset"` → each gets `value_status:"prose-only"`, then `FLIP_STATUS` derives `status:"used"`. None are clustered (`dup_group:null`, `conflict_with:null`) — no `cluster_triage` edits, no conflict-gate interaction.

### Deferred / out of scope (firm)

- **Use-later** (gov, but not v1): the clause-by-clause enumeration (I.007/I.009 PIC 4013/500.x), the GS-process items that duplicate the existing GS surfaces (I.001–I.005), the financial-capacity figures already used elsewhere via `au-cost-of-living` (I.017–I.020), the raw Nepal grant **counts** (I.036–I.039 — the *rates* are more decision-relevant than the counts), the dataset-meta (I.030 BP0015, I.031 grant-rate definition), the SSVF detail (beyond I.029), and **I.058** (must-leave-Australia-even-if-requested — too procedural/legally heavy for v1, per the recovery-concision guard).
- **Needs-human-call:** the 16 non-gov I findings (consultancy/forum publishers) — not surfaced; they feed the future **G** agent-risk task.
- **No scoring change. No new `DocumentKind`. No profile change. No `phases.ts` change.**

**Ledger math after the slice:** category I `used` 2 → **18**, `pending` 78 → **62**. Overall `used` 401 → **417**, `pending` 713 → **697**. `build-ledger.js` must show movement of exactly these sixteen findings; clusters stay **41**.

---

## 3. Architecture — a static, propless, sourced panel

```
I.jsonl (16 gov findings) ──(provenance.findingRefs)──► nepal-refusal-recovery.ts (NEW: kind-discriminated, prose-only)
                                                              │
                                                              └─► components/results/refusal-recovery.tsx (NEW panel)
                                                                      │
                                                              rendered in components/results/results.tsx (after PolicyBanner)

FLIP_STATUS=1 derives status:"used" + used_by for the 16 findings from the module's findingRefs.
```

**Static, no personalization (locked decision §3 of the design review).** MyVisa is **Higher-Education-only** (`program.level` is `bachelors|masters|doctorate`; there is no VET path a user can pick, and `AssessmentPayload` carries no intended sector). So "sector-matched" resolves to **HE-primary + VET-as-contrast**, which needs **no assessment read** — the panel is fully static, like `PolicyBanner`/`CostToApply`. Showing VET as contrast is itself trust-defense (warns against being steered into a cheaper/easier course that carries a far worse corridor outcome).

**Complements, not duplicates, `PolicyBanner`.** `PolicyBanner` shows the grant-rate corridor by **onshore vs offshore** (I.032/I.033, already used). This panel adds the **sector** cut (HE vs VET, I.034/I.035) inside the refusal narrative — a different, complementary dimension. The panel's odds section is framed "by sector" so the two never read as contradictory.

**Prose-only (v1).** The grant rates (I.034/I.035) and the ART fee (I.045) are stored `value:null`, so v1 wires the whole panel as `prose-only` — the numbers (85.3%, 36.3%, AUD 3,580) live verbatim in the module `summary` strings with their `SourceLine`s, consistent with the slice-I prose pattern. **Deferred:** promoting the three headline numbers to `structured` (extract `value`) for reconcile value-fidelity / drift-protection — a clean future hardening pass, not v1.

The panel is **server-renderable, propless** — reads the sourced module, groups records by `kind`, renders four compact sections. No scorer reads it.

---

## 4. The data module

**`lib/data/types.ts`** — add the record interface after `NepalPassportProcess`. Multi-record, `kind`-discriminated (mirrors `nepal-source-of-funds`):

```ts
export interface NepalRefusalRecovery extends Provenanced {
  id: string; // slug, e.g. "ground-genuine-student"
  kind: "refusal-ground" | "grant-rate" | "recovery-path" | "scam-warning";
  label: string;   // short inline label
  summary: string; // the rendered phrase (numbers live here in v1 prose-only)
  sector?: "higher-education" | "vet"; // grant-rate records only — drives HE-primary emphasis
  source: string;  // canonical gov URL (DHA / ART / legislation / Home Affairs stats)
  lastVerified?: string; // ISO date
}
```

**`lib/data/source/nepal-refusal-recovery.ts`** — `export const NEPAL_REFUSAL_RECOVERY: NepalRefusalRecovery[]`, **eleven records** (16 findings; some records cite several). `lastVerified` per record from the finding's `source_date` (e.g. legislation 2026-04, DHA 2026-01, ART 2024-10, stats 2025-06).

| `id` | `kind` | `findingRefs` | `summary` (locked copy) |
|---|---|---|---|
| `ground-genuine-student` | refusal-ground | I.008, I.006 | "Not being assessed as a genuine student — DHA weighs your Genuine Student answers and the evidence behind them." |
| `ground-capacity` | refusal-ground | I.029 | "Not showing enough financial and English-language capacity." |
| `ground-document-integrity` | refusal-ground | I.027 | "Document problems — altered, edited, or manipulated documents are unlawful." |
| `grant-rate-higher-ed` | grant-rate (sector: higher-education) | I.034 | "University (Higher Education) applications from Nepal were granted 85.3% of the time when applying from outside Australia (Apr–Jun 2025)." |
| `grant-rate-vet` | grant-rate (sector: vet) | I.035 | "Vocational (VET) applications were granted 36.3% over the same period." |
| `recovery-review` | recovery-path | I.044 | "If you're refused, you can ask the Administrative Review Tribunal to review the decision." |
| `recovery-cost` | recovery-path | I.045 | "The review has a fee — AUD 3,580 for most migration decisions." |
| `recovery-hardship` | recovery-path | I.046 | "A 50% reduction may apply on financial-hardship grounds." |
| `recovery-ministerial` | recovery-path | I.057, I.059, I.060 | "Ministerial intervention exists but is a rare, conditional last resort." |
| `scam-no-issuance` | scam-warning | I.078, I.079, I.080 | "Australia issues no work permits, visa labels, or Labour Market Impact Assessments — anyone offering these is running a scam." |
| `scam-bogus-documents` | scam-warning | I.028 | "Bogus or false documents can lead to refusal, cancellation, and bans on future applications." |

**Source-display pattern:** each record carries one canonical `source` (the most representative gov page) shown as the row's link; `provenance.findingRefs` lists every backing finding (all reconciled to `used`). Records citing several findings on one page (the three scam claims share the DHA visa-scams page) show that page; multi-page records (ministerial: immi status-resolution + Home Affairs FOI stats) show the primary page (immi) — the established source-display pattern from slices G/I.

---

## 5. The panel component + placement

**`components/results/refusal-recovery.tsx`** (NEW) — mirrors `CostToApply`'s calm-authority shell (`<aside>` · `border-line` · `bg-bg-tint` · mono uppercase section headers · per-row source `<a>` link). Groups `NEPAL_REFUSAL_RECOVERY` by `kind` and renders four sections:

```
Refusal risk & recovery (Nepal → Australia)      [mono header]

Why applications are refused
  • <ground summaries>                            each row → source link

Honest odds — by sector
  • University (Higher Education): 85.3% …         [emphasized: text-ink]
  • Vocational (VET): 36.3% …                      [contrast: text-ink-soft]
  We show VET as a contrast because some students are steered into cheaper
  courses — it is not your personal probability.   [guard line, text-ink-faint]

If you're refused
  • <recovery summaries, concise>                 each row → source link

What not to trust
  • <scam summaries>                              each row → source link

General context for Nepal → Australia, not legal advice.   [disclaimer, text-ink-faint]
```

The HE grant-rate row is emphasized (`text-ink`); the VET row is rendered as contrast (`text-ink-soft`) followed by the **locked VET guard line**. Each row carries a source `<a>` (mirrors `CostToApply` line links). Closing **disclaimer** line is always present.

**Placement:** rendered in `components/results/results.tsx` immediately after `<PolicyBanner />` (verdict → policy corridor → refusal truth → costs). Shown in both `anonymous` and `owned` modes (not gated).

### Locked copy (user-approved guards)

- **VET contrast line (verbatim):** *"We show VET as a contrast because some students are steered into cheaper courses — it is not your personal probability."* Never imply VET is bad for everyone; only that the corridor outcome differs.
- **Recovery concision (user):** show only that review exists, that it costs money, that a hardship reduction may apply, and that ministerial intervention is rare/conditional — **no procedural deep dive** (I.058 deferred).
- **Disclaimer (verbatim):** *"General context for Nepal → Australia, not legal advice."*
- **No personal probability** (sector corridor context only — honors "never percentages as personal odds"). **No fearmongering** (neutral, factual). **No consultancy claims** (gov publishers only). **Sources visible** (per-row link).

---

## 6. Finding edits + status derivation (slice-kit)

1. **Hand-set `value_status:"prose-only"`** on the **sixteen** findings only (I.006/008/027/028/029/034/035/044/045/046/057/059/060/078/079/080) in `I.jsonl` via a parse-by-id node script (string-replace only those lines; leave every other field + EOL untouched). All other I findings stay `unset`/`pending`.
2. **Never hand-edit `status`.** Run `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts`; it promotes the sixteen to `status:"used"` with `used_by:["nepal-refusal-recovery[<id>]"]`. Inspect `git diff -- docs/research-briefs/findings/I.jsonl` — **only those sixteen lines change**.

---

## 7. Schema + registry (slice-kit)

- **`lib/data/schema/nepal-refusal-recovery.schema.ts`** reusing `ProvenanceSchema`, `HttpUrl`, `IsoDate` from `common.ts`: `id` is `z.string().min(1)` (free slug — the record set may grow in a future deepen pass), `kind` `z.enum([4 values])`, optional `sector` `z.enum(["higher-education","vet"])`, non-empty `label`/`summary`, `HttpUrl` source, `IsoDate.optional()` lastVerified, `ProvenanceSchema`; unique-`id` array refine. Mirror `nepal-source-of-funds.schema.ts`.
- **`lib/data/schema/registry.ts`** — import pair after the `NEPAL_PASSPORT_PROCESS` imports, then append one `DataModuleEntry`:
  ```ts
  { category: "I", exportName: "NEPAL_REFUSAL_RECOVERY",
    data: NEPAL_REFUSAL_RECOVERY, schema: NepalRefusalRecoverySchema,
    recordLabel: "nepal-refusal-recovery", subRecordKeys: [],
    recordInterface: "NepalRefusalRecovery" }
  ```
  `tests/data/{schema,reconcile-modules,flip-status.run,findings-integrity,registry-integrity}.test.ts` iterate the registry, so the module is covered automatically.

---

## 8. Testing — TDD RED → GREEN → adversarial

- **`tests/data/`** (registry-driven, inherited): reconcile (coverage; value-fidelity N/A for prose-only), schema parse, flip-status normal-mode clean, findings/registry integrity.
- **`tests/results/refusal-recovery.test.tsx`** (NEW, render test): the panel renders all four section headers, both sector figures (85.3% emphasized, 36.3% as contrast), the VET guard line, a recovery row (ART + the AUD 3,580 fee), a scam row (no work permits), the disclaimer, and at least one source link per section (`immi.homeaffairs.gov.au` / `art.gov.au` / `legislation.gov.au`). RED first.
- **`tests/results/results.test.tsx`** (existing composition test, if present): assert the new panel appears in the rendered results. (If no such test exists, the dedicated panel test above suffices.)
- **Adversarial mutation** (prose-only): revert one finding's `value_status` to `unset` (e.g. I.034) while it stays `status:"used"`, run `tests/data/reconcile-modules.test.ts`, confirm `USED_UNSET I.034`; restore via `git checkout --`.

---

## 9. Verification gate

**Hard gate — not "done" until all pass:**

- `npx vitest run tests/data/` → reconcile clean (`used += 16`, 0 orphans/drift/open-conflict) + schema + flip-status + integrity green.
- `npm run typecheck` clean.
- `npm test` full suite green (record the **actual** figure: baseline 742 + the new render test + registry-driven data cases).
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/ lib/data/policy/funding-reliability.ts lib/plan/phases.ts` empty** (no scorer / no plan-phases change).
- `node docs/research-briefs/_tools/build-ledger.js` → **I used 2 → 18** (overall used 401 → 417); only this slice's sixteen findings moved, clusters stay 41.

**Best-effort (non-gating):** rendered smoke of the panel on the anonymous results page (DOM/CSS measurement via `preview_eval` — the screenshot tool's network-idle wait hangs on the HMR socket, per the slice-I smoke). Confirm the four sections, the HE-emphasis/VET-contrast, the guard line, and the disclaimer render; no horizontal overflow.

---

## 10. Commit plan (granular; git ritual)

One slice branch (`ledger-slice-k-refusal-recovery`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Sourced layer** — `types.ts` + `nepal-refusal-recovery.ts` + `.schema.ts` + registry line + `I.jsonl` value_status edits (×16) + `FLIP_STATUS`. `tests/data/` green.
2. **Panel component** — `refusal-recovery.tsx` + render in `results.tsx` + render test (RED → GREEN).
3. **Status + ledger** — `PROJECT_STATUS.md` (actual test count + slice-K bullet) + regenerated `findings-ledger.md`.

Then `git merge --ff-only` master → push → delete branch. Report after the merge.

---

## 11. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No personalization plumbing (static panel; HE-primary + VET-contrast). No `AssessmentPayload` change.
- No new `DocumentKind`, no checklist/plan change, no `phases.ts` change.
- No consultancy/forum (non-gov) findings — those feed the future **G** agent-risk human-sourcing task.
- No procedural ART/ministerial deep dive (I.058 and the clause enumeration deferred).
- No structured value extraction for the headline numbers (prose-only v1; structured hardening deferred).
- No public/marketing guide page (the `app/(marketing)/trust` SEO packaging is a later lane).

---

## 12. Success criteria

1. The anonymous results page shows a compact **Refusal risk & recovery** panel with four gov-sourced sections (why refused / honest sector odds / recovery / what not to trust), placed after `PolicyBanner`, in both anonymous and owned modes.
2. The odds section shows HE (85.3%) emphasized and VET (36.3%) as contrast, with the locked VET guard line; never as personal odds. Recovery is concise (review exists / fee / hardship reduction / ministerial rare-conditional). The disclaimer line is present. Every section shows its source.
3. All reconcile invariants green for category I with `used` = 18; the adversarial mutation bites (`USED_UNSET`).
4. `typecheck` + full suite green; `golden-assessments.json` byte-identical; scorer / `phases.ts` untouched; ledger shows exactly these sixteen findings `pending → used`, clusters unchanged at 41.
5. Guardrails honored: gov-only, no personal probability, no fearmongering, compact, sources visible, "not legal advice."
