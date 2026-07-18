# MV-67 — Fix global-error.tsx false "saved data is safe" claim

**Priority:** P2 · **Owner:** agent · **Branch (when built):** `mv-67-global-error-copy` (off master)

A tiny, self-contained **trust-copy** fix. Sourced from the founder 2026-06-28.

## Why (trust-first)

`app/global-error.tsx` — the root-layout last-resort error boundary shipped in **MV-62** —
renders (confirmed at **~line 36**):

> "We hit an unexpected error loading MyVisa. **Your saved data is safe.** Please try again."

That saved-data claim is **not always true**. `global-error` is the **only** error boundary
an **anonymous** visitor can reach: it fires when a *layout itself* throws (e.g.
`app/(focused)/layout.tsx`, or the root layout's `getUser()`), past the per-segment
`error.tsx`. An anonymous user whose assessment hit a **persist-miss** (`POST /api/assess`
returned `200` with `id: null`) may have **nothing** saved server-side — so promising their
data is safe is a false reassurance on a trust-first product.

## Scope (surgical, copy-only)

Reword `app/global-error.tsx` to drop the **unconditional** saved-data claim and keep only
what is always true, e.g.:

> "We hit an unexpected error loading MyVisa. This is usually temporary — please try again."

**Do NOT touch:**
- `app/(app)/error.tsx` — the signed-in group only, so "your saved data is safe" is correct there.
- `app/(focused)/error.tsx` — already avoids the claim.

(Both confirmed present in the tree.)

## Test plan (TDD)

1. Update the **global-error** describe block in `tests/app/error-boundaries.test.tsx` to
   assert the honest copy (and that the "saved data is safe" string is **absent** from
   global-error). Watch it fail (RED).
2. Reword `app/global-error.tsx`. Watch it pass (GREEN).

**Gate:** `npm run typecheck` + `npm run lint` + `npx vitest run tests/app/error-boundaries.test.tsx`, then the full `npx vitest run` before the PR.

## Acceptance criteria

- [ ] `app/global-error.tsx` no longer makes an unconditional "saved data is safe" claim;
  copy states only what is always true.
- [ ] `app/(app)/error.tsx` and `app/(focused)/error.tsx` are unchanged.
- [ ] `tests/app/error-boundaries.test.tsx` asserts the honest global-error copy (RED→GREEN).
- [ ] No scoring/DB/migration; goldens byte-identical.

## Notes

Copy-only on a rarely-hit boundary, but it's the one anonymous users see, and the false
reassurance directly contradicts the product's trust-first stance — hence P2 not P4.
Branch `mv-67-global-error-copy` off master · PR · founder-gated merge.
