# MV-91 — Overhaul Phase 1: Button `loading` contract

**Column:** In review · **Priority:** P1 · **Owner:** agent · **Created:** 2026-07-03
**Branch:** `mv-91-button-loading` off `origin/master f6cada8`

## Why

The overhaul spec's Phase 1 "Primitive completion" trio is Card ✔ (MV-90) / VerdictPill ✔ (MV-90) / **Button `loading`** — design-division audit finding **#13**. The `Button` primitive exists but has no in-flight contract, so every async button hand-rolls loading at its call site, and they have **drifted**:

- `components/documents/document-card.tsx` — Upload shows `"Uploading…"` (proper ellipsis) but View shows `"Loading..."` (three ASCII dots). Two different loading idioms in the **same component**, and each caller must remember to pass `disabled`.
- `components/assess/refresh-button.tsx` — a **raw `<button>`** that bypasses the `Button` primitive entirely, re-implementing the exact primary/lg class string plus `"Refreshing…"`.
- No loading button anywhere sets `aria-busy` — screen readers get no "working" signal.

## Scope

1. **`components/ui/button.tsx`** gains a `loading?: boolean` + `loadingLabel?: ReactNode` contract. When `loading`:
   - the button is **disabled** (`disabled || loading` — always prevents a double-submit),
   - `aria-busy="true"` is set (absent, not `"false"`, when idle),
   - it renders `{loadingLabel ?? children}` followed by a **canonical mono ellipsis** (`aria-hidden` `…` in `font-mono` — the design system's "system is working" voice; one idiom, forever).
2. **Migrate** the real loading buttons onto the contract:
   - document-card Upload/Re-upload → `loading={uploading} loadingLabel="Uploading"`; View → `loading={fetchingUrl} loadingLabel="Loading"` (kills the `...` drift; both now render the mono `…`). Drop the now-redundant `disabled={…}`.
   - refresh-button raw `<button>` → `<Button size="lg" loading={pending} loadingLabel="Refreshing">Refresh assessment</Button>` — folds a bespoke button back onto the primitive.

### Deliberate deltas (not regressions)

- refresh-button's disabled dim unifies `disabled:opacity-60` → the primitive's `disabled:opacity-50`; it also inherits the base niceties (`justify-center`, `active:translate-y-px`, `disabled:pointer-events-none`) — a strict superset, same size/variant footprint (`lg` = `px-7 py-[15px] text-[17px]`, `primary` = `bg-primary text-on-primary hover:bg-primary-ink`).
- The loading affordance is a **static** mono ellipsis reflecting a **real** pending state — not an animated fake-loading spinner (audit #18 is the opposite anti-pattern and stays out).

### Explicitly out of scope (correctly NOT loading buttons)

- `components/matches/shortlist-button.tsx` — optimistic segmented toggle (`aria-pressed`), no in-flight text/disabled state. Not a loading button.
- `components/plan/plan-item-card.tsx` — its `disabled={busy}` pill actions are a **separate small-pill family** (`px-3 py-1.5 text-[13px]`, bespoke strong-tint / line-2 variants), not the `Button` shape; they show no loading text. A future pill-action variant, not this slice.
- `components/documents/document-status-toggle.tsx` — a checkbox, not a button.

## Test plan

- TDD red-first: **NEW `tests/components/ui/button.test.tsx`** — idle render (type=button, not disabled, no `aria-busy`, children shown, no ellipsis); `loading` sets disabled + `aria-busy="true"`; `loading` renders `loadingLabel` + a `font-mono` `aria-hidden` ellipsis (accessible name excludes the `…`); `loadingLabel` falls back to `children`; `loading` disables even when `disabled` not passed; `className`/variant/size still compose.
- Migration harness: **extend `tests/components/documents/document-card.test.tsx`** — an in-flight upload disables + `aria-busy`es the Upload button (proves the call site adopted the contract and the raw `...` idiom is gone). Existing role-based queries are unaffected.
- Gate: typecheck + lint + full suite (baseline 1 pre-existing red = MV-80 freshness timer) + preview render check.

## Evidence

- Primitive: `components/ui/button.tsx` gains `loading` + `loadingLabel`; loading → `disabled={disabled || loading}` + `aria-busy` + a single-flex-child `<span>` wrapping `{loadingLabel ?? children}` and an `aria-hidden` `font-mono` `…` (so the base `gap-2` never splits label from ellipsis, and the accessible name stays the label).
- Migrations: `assess/refresh-button.tsx` raw `<button>` → `<Button size="lg" loading={pending} loadingLabel="Refreshing">` (folded onto the primitive; `disabled:opacity-60`→`50` unification); `documents/document-card.tsx` Upload → `loading={uploading} loadingLabel="Uploading"`, View → `loading={fetchingUrl} loadingLabel="Loading"` (the `"Loading..."` three-dot drift is gone; both now render the canonical mono `…`).
- Tests: NEW `tests/components/ui/button.test.tsx` (7, TDD red-first — verified 4 loading assertions failed before the impl, all green after) + extended `tests/components/documents/document-card.test.tsx` (+1: in-flight upload is disabled + `aria-busy` via the contract).
- Gate: `tsc --noEmit` exit 0 · lint 0 errors (1 pre-existing warning, docs/kanban/build.mjs) · suite **1604 passed / 1 failed** (the 1 = pre-existing MV-80 freshness timer; +8 new tests, zero regressions).
- Live preview (fresh dev-server recompile): marketing home renders end-to-end; the public `/assess` wizard shows idle `<Button>`s with **no `aria-busy` attribute** ("Continue →" enabled, "← Back" plain-`disabled`) — the idle contract confirmed in a real browser. (The loading-state buttons themselves are auth-gated; their contract is covered by the unit tests. The `<Card>` parse errors in the server log were **stale buffer** from MV-90's mid-edit state in this shared working tree — those files carry no `<Card>` on this master-based branch, and `tsc` compiled the whole project clean.)

## Ship

**SHIPPED 2026-07-03 → PR [#45](https://github.com/Spooderinbed/merovisa/pull/45)** (branch `mv-91-button-loading` off `origin/master f6cada8`; commit filled at push). In Review, founder-gated merge (never self-merged, per the merge-to-master rule). Independent of MV-90 (#44) — either can merge first; board unions.

## Resume notes (cold start)

Independent slice, branched off `origin/master` (targets `button.tsx` / `document-card.tsx` / `refresh-button.tsx` are all disjoint from MV-90's 44 migrated files — verified via `git diff origin/master..mv-90 --name-only`). No stacking; board unions with MV-90 at merge. If resuming: the primitive contract is the deliverable; the two migrations are mechanical prop swaps.
