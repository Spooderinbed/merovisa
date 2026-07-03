# MV-92 — Overhaul Phase 1: Input / Select field primitive

**Column:** In review · **Priority:** P1 · **Owner:** agent · **Created:** 2026-07-03
**Branch:** `mv-92-input-primitive` off `origin/master f6cada8`

## Why

The overhaul spec's Phase 1 "Primitive completion" arc is Card ✔ (MV-90) / VerdictPill ✔ (MV-90) / Button-loading ✔ (MV-91) / **form fields**. The single most-duplicated string left in the repo is the form-field shell — `rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary` — copied **verbatim ~28 times** across the 8 profile-editor files (every text input and select in the profile editor). One drift and the whole editor looks inconsistent; there is no single place to evolve the field contract (focus ring, radius, disabled state) for the design overhaul.

## Scope

1. **NEW `components/ui/input.tsx`** — two named exports sharing one shell:
   - `Input` → renders `<input className={cn(fieldShell, className)} {...props} />`
   - `Select` → renders `<select className={cn(fieldShell, className)} {...props}>{children}</select>`
   - `fieldShell` = the exact canonical string above. Everything else (`type`, `value`/`defaultValue`, `onChange`, `disabled`, `required`, `name`, `id`, `aria-*`, `<option>` children) passes straight through, so the components are **drop-in** replacements for the raw elements. No injected defaults (no forced `type`), so the rendered DOM is unchanged.
2. **Migrate** the 8 profile-editor files (about-you, academic, destination-intake, english, immigration, money-scholarships, study-career, work-gap): each canonical `<input>`/`<select>` → `<Input>`/`<Select>`, dropping the now-redundant shell className. The one site carrying an extra utility (`about-you-editor.tsx` age field, `w-24`) keeps `className="w-24"` — the primitive merges it with the shell via `cn()`/twMerge.

### Deliberate scope boundaries (simplicity-first)

- **Only the input/select field shell** is extracted — the genuinely duplicated, high-multiplicity pattern. No speculative `error`/`invalid`, `fullWidth`, `size`, or `variant` props were added (no current site uses them; adding them would be unrequested abstraction).
- **Explicitly out of scope** (distinct single-site shapes, not this duplication):
  - `components/guide/guide-chat.tsx` textarea — a *different* shell (`rounded-lg border-line text-[15px] placeholder resize-y min-h`), one consumer. A future `Textarea`/`as="textarea"` extension when a second textarea appears.
  - `components/documents/document-status-toggle.tsx` checkbox + `document-card.tsx` hidden input — not form-field shells.
  - `components/profile/editors/chip-input.tsx` (`<div>` container w/ `focus-within:border-primary` + chip `<button>`) and `bank-loan-panel.tsx` (`<section>` `rounded-xl`) — share the border token but are not fields. Left untouched.

## Test plan

- TDD red-first: **NEW `tests/components/ui/input.test.tsx`** (7) — `Input` renders an `<input>` carrying the shell; merges a per-site `className` (width) alongside the shell; forwards `type`/`placeholder`/`disabled`; stays a passthrough (no injected `type`); fires `onChange` controlled. `Select` renders a `<select>` with the shell + `<option>` children; forwards `value`/`onChange`.
- Migration safety net: the existing profile-editor tests (values, labels, interactions) must stay green — presentational swap, behavior preserved. Each migrated file independently **adversarially verified** (skeptic diff vs `origin/master`: no dropped prop, no class drift, no lost `<option>`).
- Gate: typecheck + lint + full suite (baseline 1 pre-existing red = MV-80 freshness timer) .

## Evidence

- Primitive: `components/ui/input.tsx` — `Input` + `Select`, shared `fieldShell`, `cn()` merge, pure passthrough (no injected attrs). TDD red-first verified (import unresolved → red; 7/7 green after).
- Migrations: **28 field swaps across 8 profile-editor files** — about-you (I×3 S×1), academic (I×2 S×2), destination-intake (I×1), english (I×5 S×1), immigration (S×1), money-scholarships (I×1 S×2), study-career (I×2 S×3), work-gap (I×3 S×1). Every canonical shell removed (only the excluded `chip-input`/`bank-loan-panel` still carry `border-line-2`). The two `<input type="checkbox">` (immigration, work-gap) correctly left untouched; `about-you` age field keeps `className="w-24"`. Diff is a clean 48/+ 67/− (per-element single-line swaps).
- Method note: the intended migrate→verify **Workflow failed** — all 8 subagents hit the account session limit (resets 9:10pm Sydney) and edited nothing (one, study-career, half-applied and was reverted). Fell back to a **deterministic Node transform** (`scratchpad/migrate-inputs.mjs`) driven off the exact canonical className (checkbox-safe: renames the shell's owning element, never the bare `<input>` tag). Line endings normalised LF (a `git checkout` had re-materialised them CRLF, inflating the diff).
- Gate: `tsc --noEmit` exit 0 · `npm run lint` 0 errors (1 pre-existing warning, `docs/kanban/build.mjs`) · suite **1603 passed / 1 failed** (the 1 = pre-existing MV-80 freshness timer; +7 new `input.test.tsx`, zero regressions — all 8 profile-editor test suites stayed green, proving the swap is behaviour-preserving).

## Ship

**SHIPPED 2026-07-03 → PR [#46](https://github.com/Spooderinbed/merovisa/pull/46)** (branch `mv-92-input-primitive` off `origin/master f6cada8`). In Review, founder-gated merge (never self-merged, per the merge-to-master rule). Independent of MV-90 (#44) / MV-91 (#45) — the 8 editor files are disjoint from MV-90's 44 (only overlap was a checkbox, excluded); board unions at merge.

## Resume notes (cold start)

Independent slice off `origin/master`. Primitive is the deliverable; the 8 migrations are mechanical element→component swaps preserving all props. Canonical shell string: `rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink focus:border-primary`. If resuming mid-migration, re-run the migrate/verify workflow (scriptPath under session workflows/) or grep `border-line-2` in `components/profile/editors/` for any remaining raw shells.
