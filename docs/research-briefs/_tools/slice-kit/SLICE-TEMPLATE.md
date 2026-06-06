# Slice-kit — integrating a research category (per-slice checklist)

A **slice** turns a research category's `pending` findings into typed, **sourced**
data that the verdict and/or UI reads, with every shipped value provably traced to
a `used` finding and machine-checked in CI. The harness (reconcile, schema,
flip-status) is **registry-driven**, so adding a category is "author the module +
append one registry line" — everything else is inherited.

## The four invariants the harness enforces (CI, every registered module)

- **(a) Coverage** — every `used` finding is referenced by ≥1 code record.
- **(b) Validity** — every code `findingRef` exists *and* is `used`.
- **(c) Value fidelity** — a structured finding's value is actually present in the code.
- **(d) Conflict gate** — no `used` finding sits in an unresolved contradiction.

A slice is "done" when all four are green for its category and the value drives the
verdict/UI. "Foolproof" reduces to these mechanically — a wrong or invented value
fails CI.

## The 9 steps

### 1 · Scope the slice — see the surface
```
node docs/research-briefs/_tools/list-pending.js <CAT>          # all pending in the category
node docs/research-briefs/_tools/list-pending.js <CAT> --data   # just the structured-value (claim_type:"data") findings
```
Pick which findings this slice integrates — a slice may be a *subset* of a category
(e.g. the bank-loan subset of B). Leave the rest `pending` for later slices and say
so in the plan's scope boundary.

### 2 · Author the typed data module
Create `lib/data/<area>/<name>.ts`, mirroring an existing sourced module
(`lib/data/source/nepal-banks.ts`, `lib/data/policy/au-cost-of-living.ts`). Each
record (and each provenance-bearing sub-record) `extends Provenanced`; a single
config value is a `Sourced<T>`. Keep scoring rules server-side — a client-imported
module must not carry scoring logic (CLAUDE.md).

### 3 · Fill structured values on the findings
In the JSONL, set `value` / `value_type` / `unit` / `value_status` on each finding
you integrate: `value_status:"structured"` for a real value (ranges → `{min,max}`
with the bound's `value_type`), `value_status:"prose-only"` for a process/contact
finding with no extractable value. A `used` finding left `unset` is a CI failure
(`USED_UNSET`).

### 4 · Declare `provenance.findingRefs` on each record
Set `provenance.findingRefs` to the finding IDs that back each record/sub-record
(granularity = where findings exist). A config value needs ≥1 findingRef **or** an
explicit `source:"internal-heuristic"`, so an unsourced constant can't masquerade
as sourced.

### 5 · Triage the category's clusters
```
node docs/research-briefs/_tools/build-ledger.js   # regenerates findings-clusters.md
```
Label every cluster member's `cluster_triage` (`enumeration` | `duplicate` |
`contradiction`). Resolve each contradiction to exactly one `used` member; mark the
rest `rejected:<reason>` and set `conflict_with`. flip-status refuses to flip an
unresolved contradiction; reconcile pass-3 fails CI on one.

### 6 · Write the Zod schema
Create `lib/data/schema/<name>.schema.ts` mirroring the interface: provenance
required (closes the unprovenanced gap), URL/ISO formats, numeric-range sanity,
unique ids. ~15 lines.

### 7 · Register the module (one line)
Append a `DataModuleEntry` to `lib/data/schema/registry.ts` (data + schema + walker
hints: `recordLabel`, `subRecordKeys`, `recordInterface`). This is the only wiring —
the reconcile, schema, and flip-status tests all iterate the registry, so the new
module is now covered automatically.

### 8 · Derive the used set from code (never hand-edit `status`)
```
FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts
```
Promotes the findings your code references to `used` (with an ID-accurate
`used_by`), demotes any you removed (self-healing), and refuses unresolved
contradictions. Inspect the git diff: only this slice's findings should change.

### 9 · Verify the gate
```
npx vitest run tests/data/        # reconcile + schema + flip-status guards, per category
npm run typecheck
node docs/research-briefs/_tools/build-ledger.js   # refresh the ledger; used/pending must move by exactly this slice
```
Green = `reconcile OK · used=<n> · 0 orphans · 0 drift · 0 open-conflict-uses` +
schema parses + flip-status normal-mode clean. **Adversarially confirm a guard
bites:** mutate one shipped value → reconcile fails `VALUE_DRIFT`; revert.

## What you do NOT do anymore

- **No hand-flipping `status`** — step 8 derives it from code (the old fragile
  name-regex is gone).
- **No manual "is every value sourced?" review** — invariant (c) + the schema
  enforce it; a typo'd or invented value fails CI instead of shipping silently.
- **No untracked high-stakes values** — provenance is required on every record.
