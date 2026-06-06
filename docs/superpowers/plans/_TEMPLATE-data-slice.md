# <Category/Area> Data Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. This is a fill-in template — replace every `<…>` placeholder and delete this line. The operational detail behind each task lives in `docs/research-briefs/_tools/slice-kit/SLICE-TEMPLATE.md`.

**Goal:** Turn the `<N>` `<category-X>` findings (`<which subset>`) into typed, sourced data that `<drives which verdict dimension / surfaces in which UI>`, with every shipped value traced to a `used` finding and machine-checked in CI.

**Architecture:** A pure data module (`lib/data/<area>/<name>.ts`) typed in `lib/data/types.ts`, validated by `lib/data/schema/<name>.schema.ts`, registered in `lib/data/schema/registry.ts`, and read by `<scorer / accessor / UI>`. Integration state is **derived, not hand-edited**: `flip-status.js` sets each consumed finding's `status`/`used_by` from the code's `findingRefs`; `reconcile.js` + `schema.test` enforce the four invariants in CI.

**Tech Stack:** TypeScript (strict), Vitest, Node (CommonJS slice-kit tools).

**Scope boundary:** This slice integrates only `<subset>` of category `<X>` (`<count>` findings). The other `<count>` stay `pending` for later slices. Source of truth: `docs/research-briefs/findings/<X>.jsonl`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/data/types.ts` | Add `<Interface>` (`extends Provenanced`, or `Sourced<T>` for single config values) | Modify |
| `lib/data/<area>/<name>.ts` | The `<N>` sourced records | Create |
| `lib/data/schema/<name>.schema.ts` | Zod schema (provenance required, formats, ranges, unique ids) | Create |
| `lib/data/schema/registry.ts` | One `DataModuleEntry` for the module | Modify |
| `docs/research-briefs/findings/<X>.jsonl` | Fill structured values; triage clusters (status flipped by tool) | Modify |
| `<consumer>` | Read the new data (scorer / accessor / UI) | Create/Modify |

---

## Task 1: Author the typed, sourced module
**Files:** Create `lib/data/<area>/<name>.ts`; Modify `lib/data/types.ts`.

- [ ] Define the interface(s); records `extends Provenanced` (or `Sourced<T>` for single config values).
- [ ] Author the records — byte-identical to any constant they replace if a scorer reads them (behavior-preserving).
- [ ] **Verify:** `npm run typecheck` clean.

## Task 2: Fill structured values + provenance on the findings
**Files:** Modify `docs/research-briefs/findings/<X>.jsonl`.

- [ ] For each integrated finding set `value`/`value_type`/`unit`/`value_status` (ranges → `{min,max}`; process/contact → `prose-only`).
- [ ] On each record set `provenance.findingRefs` (≥1 finding ID, or `source:"internal-heuristic"`).
- [ ] **Verify:** `node docs/research-briefs/_tools/list-pending.js <X> --data` shows the findings you filled.

## Task 3: Triage clusters + resolve contradictions
**Files:** Modify `docs/research-briefs/findings/<X>.jsonl`.

- [ ] `node docs/research-briefs/_tools/build-ledger.js`; in `findings-clusters.md` label every member's `cluster_triage`.
- [ ] Resolve each contradiction to exactly one `used` member; mark the rest `rejected:<reason>` + set `conflict_with`.
- [ ] **Verify:** no untriaged clusters for `<X>` remain in `findings-clusters.md`.

## Task 4: Schema + register
**Files:** Create `lib/data/schema/<name>.schema.ts`; Modify `lib/data/schema/registry.ts`.

- [ ] Write the schema (provenance required, URL/ISO/range/unique checks).
- [ ] Append one `DataModuleEntry` (data + schema + walker hints: `recordLabel`, `subRecordKeys`, `recordInterface`).
- [ ] **Verify:** `npx vitest run tests/data/schema.test.ts` green for the new module.

## Task 5: Derive status from code (no hand-flipping)
**Files:** Modify `docs/research-briefs/findings/<X>.jsonl` (scripted by the tool).

- [ ] `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` — promotes referenced findings to `used` with ID-accurate `used_by`.
- [ ] Inspect the git diff: only the integrated findings changed; `status`/`used_by` as expected.
- [ ] **Verify:** `npx vitest run tests/data/flip-status.run.test.ts` (normal mode) is green — the used set matches code.

## Task 6: Wire the consumer (if this slice drives a verdict/UI)
**Files:** `<scorer / accessor / UI>`.

- [ ] Read the sourced data (server-side for scoring; no scoring rules in client JS).
- [ ] If a scorer reads it, the characterization goldens must stay byte-identical unless a `RULE_VERSION` bump is intended.
- [ ] **Verify:** `npx vitest run tests/scoring/characterization.test.ts` unchanged (or regenerated deliberately).

## Task 7: Verify the gate
> Replaces the old "name-regex flip" task. Status is derived in Task 5; the "never invent a value" rule is now **enforced** by `schema.test` + `reconcile.test`, not hoped for.

- [ ] `npx vitest run tests/data/` — reconcile + schema + flip-status all green for `<X>`.
- [ ] Adversarial: mutate one shipped value → `reconcile` fails `VALUE_DRIFT`; point a ref at a `pending` finding → `REF_NOT_USED`; revert each.
- [ ] `node docs/research-briefs/_tools/build-ledger.js` — confirm `used`/`pending` move by exactly this slice's count.
- [ ] **Verify:** `reconcile OK · used=<n> · 0 orphans · 0 drift · 0 open-conflict-uses`; full suite + `npm run typecheck` green.
