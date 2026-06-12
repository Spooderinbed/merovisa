# Data-governance Phase 3 — volatile/stale freshness refresh — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase-1 freshness guard *live* by tagging the high-value expiring facts with real change-dates (golden-safe), then — behind one mid-slice sign-off gate — refresh the stale HE/VET grant-rate headline numbers and disposition the 15 `stale` findings.

**Architecture:** Three workstreams across two commits. **Commit 1 = W1**: deterministic `volatility`/`reverifyBy` backfill on ~6 registered modules — metadata on `provenance`, no `value` touched, so goldens stay byte-identical. **Sign-off gate**: W2+W3 re-verification research → one consolidated table → user approval. **Commit 2 = W2 (grant-rate refresh, value-fidelity moves together) + W3 (the 15 stale findings: reject static-unfit, re-verify the rest)**. Then a docs commit.

**Tech Stack:** TypeScript (strict), Zod (`ProvenanceSchema`/`ConfigProvenanceSchema` already carry `volatility`+`reverifyBy`), the slice-kit findings harness (`tests/data/`), `freshness.test.ts`, WebFetch for re-verification, PowerShell on win32.

---

## How this plan handles the seven named risks

| Risk | Where handled | Proof |
|---|---|---|
| Which modules get `volatility`/`reverifyBy` | The **W1 target table** (Task 1) — exact module·record·date, confirmed against `DATA_MODULES` (only registered modules; `fx-rates` excluded — not registered, guard can't walk it) | `freshness.test.ts` walks exactly these |
| W1 is metadata-only | Every W1 edit adds only `volatility`+`reverifyBy` to a `provenance`; no `value`, no finding edited | `golden-assessments.json` byte-identical (Task 1 step 8) |
| Goldens byte-identical | W1 metadata-only; W2 panel is fact-only (no scorer) with value+finding moved together; W3 findings are all `pending` | byte-check in Task 1 (step 8) and Task 5 |
| Guard green until 2026-07-01 | Every `reverifyBy` is future as of 2026-06-12 (1 July cluster → `2026-07-01`; capacity → `2027-06-07`) | `freshness.test.ts` green at commit; fires 2026-07-01 by design |
| Sign-off table before any W2/W3 change | **Task 2 is an explicit STOP** — research → table → await approval; Tasks 3–4 apply only the approved table | no Commit-2 edit precedes approval |
| Reject reasons precise (static-unfit, not source-wrong) | Fixed reason vocabulary: `out-of-scope` / `dynamic-data` / `ephemeral-jobad` / `promo-window` / `unverifiable`; id kept, never deleted | `check-id-immutability.js` green; reasons reviewed in the table |
| `stale` → 0 only after approved dispositions | `stale` count asserted 0 in Task 5, *after* Task 4 applies the approved table | ledger rebuild shows `stale=0` |

## Commit boundary (read before starting)

- **Commit 1** — `feat(freshness)`: the W1 backfill only. Golden-safe, no research, ships immediately so the guard goes live.
- **STOP** at Task 2 for the sign-off table. **No Commit-2 edit happens before the user approves.**
- **Commit 2** — `chore(ledger)`: the approved W2 grant-rate refresh + W3 dispositions.
- **Commit 3** — `docs(status)`: PROJECT_STATUS + spec + plan.

Ledger after the slice: `used` unchanged (485); `pending` drops by the number of W3 rejects; `stale` → 0.

---

### Task 1: W1 freshness backfill (Commit 1)

**Files (all `lib/data`):** `policy/au-visa-fees.ts`, `policy/au-tax-figures.ts`, `source/au-student-worker-wages.ts`, `policy/au-visa-charges-skilled.ts`, `source/nepal-refusal-recovery.ts`, `policy/au-cost-of-living.ts`.

**The transform (identical everywhere):** add `volatility` + `reverifyBy` to a record's `provenance`, immediately after `findingRefs`. Set **both** (the schema's `missingReverifyBy` refine fails `volatility` without `reverifyBy`). Touch nothing else — no `value`, `source`, `note`, `lastVerified`, or finding.

**W1 target table** (volatility `"annual"` for every row):

| Module · record | `reverifyBy` |
|---|---|
| `au-visa-fees` · `AU_SUBCLASS_500_APPLICATION_CHARGE_AUD` | `2026-07-01` |
| `au-tax-figures` · `tax-free-threshold`, `dasp-taxed-element`, `dasp-untaxed-element`, `dasp-whm` | `2026-07-01` |
| `au-student-worker-wages` · `national-minimum-wage-current`, `national-minimum-wage-announced-2026`, `hospitality-casual-ordinary`, `hospitality-casual-saturday`, `hospitality-casual-sunday`, `hospitality-casual-public-holiday` | `2026-07-01` |
| `au-visa-charges-skilled` · `skilled-491`, `regional-191`, `skilled-189`, `employer-186` | `2026-07-01` |
| `nepal-refusal-recovery` · `recovery-cost` | `2026-07-01` |
| `au-cost-of-living` · `AU_DHA_LIVING_CAPACITY_AUD`, `AU_DHA_PARTNER_CAPACITY_AUD`, `AU_DHA_CHILD_CAPACITY_AUD`, `AU_DHA_SCHOOL_COSTS_AUD`, `AU_DHA_INCOME_METHOD_THRESHOLD_AUD` | `2027-06-07` |

**Deliberately NOT tagged** (record their exclusion in the commit body): `au-tax-figures[tfn-mail-turnaround]` (processing turnaround, not calendar), `au-student-worker-wages[super-guarantee-rate]` (capped at 12%, stable), the `internal-heuristic` configs in `au-cost-of-living` (`TYPICAL_YEARLY_USD`/`AU_REPRESENTATIVE_TUITION_AUD`/`AU_DHA_CAPACITY_GATE` — dataset-driven, not calendar), and `fx-rates` (not in `DATA_MODULES`). The fuzzy-date long tail (provider/application/health fees, forex cards, tuition-payment facts, processing medians, grant band) is deferred to the dynamic-data follow-up.

- [ ] **Step 1: `au-visa-fees.ts`** — one config. Edit:

```ts
  provenance: {
    findingRefs: ["A.001", "B.001"],
    source: DHA_STUDENT_500_SOURCE,
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 base visa application charge for the primary applicant (AUD).",
  },
```
→ insert after the `findingRefs` line:
```ts
    findingRefs: ["A.001", "B.001"],
    volatility: "annual",
    reverifyBy: "2026-07-01",
    source: DHA_STUDENT_500_SOURCE,
```

- [ ] **Step 2: `au-tax-figures.ts`** — 4 records. Two formatting shapes:

Single-line (`tax-free-threshold`):
```ts
    provenance: { findingRefs: ["H.059"] },
```
→ `    provenance: { findingRefs: ["H.059"], volatility: "annual", reverifyBy: "2026-07-01" },`

Single-line with note (`dasp-taxed-element` H.060, `dasp-untaxed-element` H.061):
```ts
    provenance: { findingRefs: ["H.060"], note: "Applies to non-WHM temporary residents." },
```
→ `    provenance: { findingRefs: ["H.060"], volatility: "annual", reverifyBy: "2026-07-01", note: "Applies to non-WHM temporary residents." },`
(same for H.061)

Multi-line (`dasp-whm` H.062): insert the two fields after `findingRefs: ["H.062"],`.
**Leave `tfn-mail-turnaround` (H.057) untouched.**

- [ ] **Step 3: `au-student-worker-wages.ts`** — 6 records. Each provenance gets `volatility: "annual", reverifyBy: "2026-07-01"` after `findingRefs`. Example (`national-minimum-wage-current`):
```ts
    provenance: { findingRefs: ["H.066"], effectiveDate: "2025-07-01" },
```
→ `    provenance: { findingRefs: ["H.066"], volatility: "annual", reverifyBy: "2026-07-01", effectiveDate: "2025-07-01" },`
Apply to H.066, H.067 (multi-line — after findingRefs), and the four hospitality records H.068/H.069/H.070/H.071. **Leave `super-guarantee-rate` (H.065) untouched.**

- [ ] **Step 4: `au-visa-charges-skilled.ts`** — 4 records (all single-line `provenance: { findingRefs: ["C.0xx"] }`): C.060, C.064, C.068, C.073. Each → `{ findingRefs: ["C.0xx"], volatility: "annual", reverifyBy: "2026-07-01" }`.

- [ ] **Step 5: `nepal-refusal-recovery.ts`** — `recovery-cost` only:
```ts
    provenance: {
      findingRefs: ["I.045"],
      source: ART_IMMIGRATION,
      note: "ART application fee for a review of most migration decisions is AUD 3,580 (I.045).",
    },
```
→ insert after `findingRefs: ["I.045"],`:
```ts
      findingRefs: ["I.045"],
      volatility: "annual",
      reverifyBy: "2026-07-01",
      source: ART_IMMIGRATION,
```

- [ ] **Step 6: `au-cost-of-living.ts`** — 5 configs, `reverifyBy: "2027-06-07"`. Each multi-line provenance gets the two fields after `findingRefs`. Example (`AU_DHA_LIVING_CAPACITY_AUD`):
```ts
  provenance: {
    findingRefs: ["A.015", "B.002"],
    source: DHA_SOURCE,
```
→
```ts
  provenance: {
    findingRefs: ["A.015", "B.002"],
    volatility: "annual",
    reverifyBy: "2027-06-07",
    source: DHA_SOURCE,
```
Apply to `AU_DHA_LIVING_CAPACITY_AUD` (A.015/B.002), `AU_DHA_PARTNER_CAPACITY_AUD` (B.003), `AU_DHA_CHILD_CAPACITY_AUD` (B.004), `AU_DHA_SCHOOL_COSTS_AUD` (B.005), `AU_DHA_INCOME_METHOD_THRESHOLD_AUD` (B.006). **Leave the three `internal-heuristic` configs untouched.**

- [ ] **Step 7: Typecheck + data guards**

Run: `npm run typecheck` then `npx vitest run tests/data/`
Expected: green. Schema accepts the new fields (`ProvenanceSchema`/`ConfigProvenanceSchema` carry them); reconcile/flip-status unaffected (no findingRef/value change); **`freshness.test.ts` green — all deadlines future** (today 2026-06-12 < 2026-07-01).

- [ ] **Step 8: Prove goldens byte-identical + W1 is metadata-only**

Run: `git diff --stat lib/data/` (expect only the 6 W1 files) and `git status --short lib/scoring/ golden-assessments.json` (expect **no** golden change). Spot-check `git diff` shows only `volatility`/`reverifyBy` additions — no `value` line moved.
Run the full suite: `npm test` → green (only `freshness.test.ts` now walks real deadlines).

- [ ] **Step 9: Commit 1**

```bash
git add lib/data/policy/au-visa-fees.ts lib/data/policy/au-tax-figures.ts lib/data/source/au-student-worker-wages.ts lib/data/policy/au-visa-charges-skilled.ts lib/data/source/nepal-refusal-recovery.ts lib/data/policy/au-cost-of-living.ts
git commit -m "feat(freshness): make the guard live — tag the 1 July 2026 cluster + DHA capacity figures

Backfill volatility/reverifyBy on the high-value expiring facts: DHA Subclass 500
charge, tax-free threshold + DASP rates, Fair Work min wage + hospitality award
ladder, skilled-visa charges, the ART review fee (-> 2026-07-01), and the DHA
financial-capacity figures (-> 2027-06-07 annual recheck). Metadata-only: no value
touched, goldens byte-identical. Excludes super-guarantee (capped/stable), tfn
turnaround, internal-heuristic configs, and fx-rates (not registered).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: W2 + W3 re-verification research → sign-off table (STOP GATE)

**Files:** none (research only — this task produces a table, applies nothing).

- [ ] **Step 1: Re-verify the grant-rate findings (W2)**

WebFetch the current Home Affairs student & temporary-graduate program report (the source on I.034/I.035/I.040/I.041). Determine: is there a cleaner/fresher Nepal × sector × outside-Australia HE/VET grant-rate breakdown than Apr–Jun 2025 85.3%/36.3%? Capture proposed HE %, VET %, period, source — or conclude "no clean fresher breakdown; keep current + set deadline." Re-verify the Nepal grant-count findings I.040/I.041 against the same report.

- [ ] **Step 2: Re-verify / disposition the stale findings (W3)**

For each of the 15 (A.032, C.078, D.003, D.004, E.158, E.159, E.160, G.050, H.012, H.016, H.077, I.040, I.041, I.047, J1.015): WebFetch where a current value is reasonably checkable; for the structurally static-unfit ones (daily FX, one-off job ads, seasonal promo, out-of-corridor) record the reject reason. **Preliminary lean from the spec** (confirm or revise per research): reject `C.078` (out-of-scope), `D.003`/`D.004` (dynamic-data), `E.158`/`E.159`/`E.160` (ephemeral-jobad), `H.012` (promo-window); re-verify `A.032`, `G.050`, `H.016`, `H.077`, `I.047`, `J1.015` (→ re-date `use-later`, or `rejected:unverifiable` if no current source); `I.040`/`I.041` fold into the W2 grant-report pass.

- [ ] **Step 3: Present the consolidated sign-off table and STOP**

Present ONE table to the user:
- **Grant rates:** current → proposed HE %, VET %, period, source (or "keep current"); the matches-banner band (I.032/I.033) and counts (I.040/I.041) re-verification result.
- **15 stale findings:** per finding — `reject:<reason>` (reason from the fixed vocabulary, naming unsuitability not a research fault) **or** `re-verify → use-later` (with the re-checked value/date).

**Do not proceed to Task 3 until the user approves or adjusts the table.** This is the mid-slice human-verify gate.

---

### Task 3: Apply the approved W2 grant-rate refresh (Commit 2, part a)

**Files:** `docs/research-briefs/findings/I.jsonl`, `lib/data/source/nepal-refusal-recovery.ts` (and `lib/data/policy/visa-outcomes.ts` if the band is refreshed).

- [ ] **Step 1: Apply only what the table approved.**

- **If numbers changed:** update the finding `value` + `claim` + caveats date (I.034 HE, I.035 VET — and I.032/I.033 if the band moved) **and** the matching module record's `value` + `summary` + `period` in the same edit, so reconcile's value-fidelity pass stays green (the number in `summary` must equal `value`). Set `volatility: "volatile"` + the next-quarter `reverifyBy` on the grant-rate module records.
- **If kept:** add only `volatility: "volatile"` + a future-quarter `reverifyBy` to the grant-rate module records (`grant-rate-higher-ed`, `grant-rate-vet`), and update the findings' caveats verification date.

- [ ] **Step 2: Verify value-fidelity.** Run `npx vitest run tests/data/` → green (value-fidelity matches finding↔module; no `VALUE_DRIFT`).

---

### Task 4: Apply the approved W3 dispositions (Commit 2, part b)

**Files:** `docs/research-briefs/findings/{A,C,D,E,G,H,I,J}.jsonl` (the stale rows), surgical byte-preserving edits (the ④·1 idiom — match each finding's unique tail, change only the targeted fields, preserve EOL/key-order).

- [ ] **Step 1: Reject the static-unfit findings (per approved table).** For each: change `"status":"pending"` → `"status":"rejected:<reason>"` and remove the `,"triage":"stale","triage_reason":"…"` tail (clear triage). Keep the line/id (immutability). Reason vocabulary: `out-of-scope` / `dynamic-data` / `ephemeral-jobad` / `promo-window` / `unverifiable`. Example (D.003):
```
...,"status":"pending",...,"value_status":"unset","triage":"stale","triage_reason":"daily NRB market rate; moved since 2026-06-05 - needs live feed, not static ledger"}
```
→ `...,"status":"rejected:dynamic-data",...,"value_status":"unset"}`

- [ ] **Step 2: Re-verify the rest (per approved table).** Change `"triage":"stale"` → `"triage":"use-later"` (or `"ready"`) and rewrite `triage_reason` to note the 2026-06-12 re-verification. Status stays `pending`. Example pattern: match the unique `"triage":"stale","triage_reason":"<old>"`, replace with `"triage":"use-later","triage_reason":"<re-verified 2026-06-12: …>"`.

- [ ] **Step 3: Verify the guards hold.** Run `npx vitest run tests/data/` → green. flip-status CHECK leaves `rejected:*` (terminal, unreferenced — never promoted/demoted) and `use-later` pending rows untouched; `check-id-immutability` green (no id deleted); reconcile green (rejected rows aren't `used`). **No `FLIP_STATUS` run needed** (no code refs changed).

---

### Task 5: Full gate, ledger rebuild, Commit 2

- [ ] **Step 1:** `npm run typecheck` → clean.
- [ ] **Step 2:** `npm run lint` → clean.
- [ ] **Step 3:** `npm test` → green. If grant numbers changed, the refusal-recovery copy-lock test may need its number updated (only if W2 moved a shipped number).
- [ ] **Step 4: Rebuild the ledger and confirm the movement.** `node docs/research-briefs/_tools/build-ledger.js`, then check the printed totals: `used` unchanged (**485**), `pending` down by the number rejected, **`stale` → 0**. `git status` to see `findings-ledger.md` (+ `findings-clusters.md` if changed) regenerated.
- [ ] **Step 5: Browser-verify (only if a shipped grant number changed).** Reach the results page; confirm the refusal panel renders the new HE/VET figure; clean console. Skip if numbers were kept.
- [ ] **Step 6: Commit 2.**
```bash
git add docs/research-briefs/findings/ lib/data/source/nepal-refusal-recovery.ts docs/research-briefs/findings-ledger.md docs/research-briefs/findings-clusters.md
# add lib/data/policy/visa-outcomes.ts only if the band was refreshed
git commit -m "chore(ledger): refresh grant rates + disposition the 15 stale findings (Phase 3)

Grant-rate freshness per sign-off; reject the static-unfit stale findings
(dynamic FX, ephemeral job ads, seasonal promo, out-of-scope) and re-verify the
rest to use-later. stale -> 0. No scorer input changed; goldens byte-identical.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Status, memory, push, report

- [ ] **Step 1: `PROJECT_STATUS.md`** — add a slice ④·2 bullet (W1 guard-live + W2/W3 outcomes, ledger movement, the deferred long-tail/fx-rates noted) and advance the backlog line (④·2 done → ④·3 human read-through packet next; verify-MARN fast-follow; the dynamic-data feed for the rejected class).
- [ ] **Step 2: Commit 3** — `docs(status)` with PROJECT_STATUS + this plan + the spec.
- [ ] **Step 3: Push** `git push origin master`.
- [ ] **Step 4: Memory** (local) — update `value-triage-lane.md` (④·2 shipped; the 2026-07-01 deadlines now armed; rejections are the repo's first; NEXT = ④·3) + the `MEMORY.md` line.
- [ ] **Step 5: Report after merge** — commits, ledger movement (`stale → 0`, pending drop), the 2026-07-01 guard-fire note, and the deferred long-tail. Await steer; don't auto-start ④·3.

---

## Self-review

**Spec coverage:** W1 backfill (Task 1, golden-safe, registered-modules-only) ✓; W2 grant refresh with sign-off (Tasks 2–3, value-fidelity) ✓; W3 stale disposition (Tasks 2,4, reject-vs-re-verify) ✓; mid-slice sign-off gate (Task 2 STOP) ✓; reject-reason vocabulary = unsuitability not source-fault ✓; real 1 July deadlines / guard green at commit ✓; `stale → 0` only post-approval (Task 5) ✓; out-of-scope long tail + fx-rates noted ✓.

**Placeholder scan:** W1 is fully specified (exact table + transform per formatting shape). W2/W3 apply-step values are intentionally research-and-approval-determined (the sign-off gate IS the design) — not placeholders; the *mechanism* is exact (reject = `status`→`rejected:<reason>` + clear triage; re-verify = `triage` `stale`→`use-later`).

**Type/name consistency:** field names `volatility`/`reverifyBy` match `ProvenanceSchema`/`ConfigProvenanceSchema`; both set together (the `missingReverifyBy` refine); record ids match the modules read (Task 1); `rejected:<reason>` matches `flip-status` `isRejected` (`startsWith("rejected:")`) and `check-id-immutability`. No `FLIP_STATUS` run in W2/W3 (no code-ref change), consistent with the guards staying green.
