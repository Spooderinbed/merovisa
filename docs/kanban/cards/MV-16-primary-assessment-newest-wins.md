# MV-16 — Re-assessing never updates the dashboard (primary-assessment newest-wins)

**Priority:** P1 · **Owner:** agent · **Gate:** human (founder live-smoke) — PASSED 2026-06-20
**Created:** 2026-06-20 · **Entered review:** 2026-06-20 · **Done:** 2026-06-20
**Related:** [[MV-14]] — found while live-smoking the OAuth claim; same `claim.ts` function. [[MV-17]] — the product-level follow-up (route logged-in re-assessment to profile-edit instead of new wizard rows).

## Why (root cause)

A returning user who redoes the anonymous wizard and signs in again still sees
their **first-ever** assessment on the dashboard — the new result never takes over.

Confirmed live: owner `ece83f09` has 16 assessments, but only the oldest
(`11815637`, June 3) is `is_primary=true`; today's `90767cb0` is `is_primary=false`.

The chain:

- The partial-unique index **`assessments_primary_idx = UNIQUE (owner) WHERE
  is_primary`** allows at most one primary assessment per owner.
- The dashboard reads the primary one (`getPrimaryAssessmentForUser` →
  `where owner=? and is_primary=true`).
- On claim, `claimAndBootstrapProfile` ran a **single unconditional promote**:
  `update({ is_primary: true }).eq("id", assessmentId).is("is_primary", false)`.
- On the **2nd+ claim** the owner already has a primary, so promoting the new row
  violates `assessments_primary_idx`. supabase-js returns `{ error }` — but the
  code **discarded the return entirely** (never destructured `error`). Silent
  failure → the new assessment stays `is_primary=false` → the dashboard stays
  pinned to the first assessment ever claimed.
- The comment (`// Mark is_primary unless the user already has one`) described a
  guard that wasn't in the code.

This is also a direct instance of the forward-plan §3/§4 "no silent failures"
class (the `{error}` was swallowed — audit Q16).

## What shipped

Fix **A (newest-wins)** in `lib/assessments/claim.ts` — replace the single
unconditional promote with **demote-then-promote**, two sequential app-layer
updates (business logic stays in Next.js, **not** a Postgres RPC/function, per the
architecture rule — Codex suggested an RPC for atomicity; overruled):

1. **Demote** any existing primary for this owner:
   `update({ is_primary: false }).eq("owner", userId).eq("is_primary", true)`.
2. **Promote** the just-claimed row: `update({ is_primary: true }).eq("id", assessmentId)`.

After the demote the owner has **no** primary, so the promote can't trip
`assessments_primary_idx`. Both `{ error }` results are **read and logged** with
structured `console.error` (`[claim] demote existing primary failed` /
`[claim] promote new primary failed`) — no longer swallowed. The misleading
comment is replaced with one that describes the actual behavior.

The MV-14 lead-insert (best-effort, after the promote) is **unchanged**.

### Design call: log, not throw
The auth callback (`app/auth/callback/route.ts`) has **no try/catch** around
`claimAndBootstrapProfile`. Throwing would 500 a user who has *already
authenticated and been claimed* — a worse outcome than the bug. "Surface, don't
swallow" is therefore **structured logging** (matching the lead-insert pattern in
the same function and forward-plan §3 "service-role write paths need structured
logging"), and the function still returns `claimed:true`. Residual: if the
*demote* succeeds but the *promote* then fails (rare transient DB error), the
owner is momentarily left with no primary (dashboard shows empty) — logged, not
silent. [[MV-17]] removes this path for the common case by not creating duplicate
wizard rows for logged-in users.

## Acceptance criteria

- [x] A 2nd+ claim **promotes** the newly claimed assessment and **demotes** the
      previous primary (newest-wins) — dashboard follows the latest assessment.
- [x] Demote filters on `(owner, is_primary=true)`; promote filters on `(id)`;
      demote runs **before** promote (no index conflict).
- [x] A failed demote/promote is **logged with structured detail**, never
      discarded.
- [x] The MV-14 lead-insert path is unchanged.
- [x] Business logic stays in Next.js (no Postgres RPC/function/trigger).
- [x] No DB schema change; no scoring/golden change; F16 untouched.

## Test evidence (TDD, failing-test-first)

- RED → GREEN, `tests/assessments/claim.test.ts` (+2): mock rewritten to a
  chainable thenable builder that records each `.update(...)` payload + filter
  chain.
  - "on a re-claim, demotes the existing primary then promotes the new assessment
    (newest-wins)" — asserts both updates + exact filters/order. (RED: `demote`
    was `undefined` against the old single-promote code.)
  - "surfaces a failed promote instead of swallowing it (claim still succeeds)" —
    asserts `console.error("[claim] promote new primary failed", …)` fires and
    `claimed:true` holds. (RED: nothing was logged before.)
- Gate green: **typecheck clean · lint 0 errors** (1 pre-existing unrelated
  `build.mjs` warning) · **full suite 1270/1270** (+2).

## Live smoke — PASSED (founder-confirmed + read-only verified, 2026-06-20)

Founder ran the OAuth round-trip and confirmed it works. Verified read-only
against prod (`obfvrxixtautamflzxzq`):

- **owner `ece83f09`** (the pinned test account, now 17 assessments): exactly
  **1 primary**, and **`primary_is_newest = true`** — the primary is today's
  newest row (`2026-06-20 12:54:31`). Before the fix this owner was pinned to the
  June-3 oldest; after a fresh assess+claim the newest is now primary. **Newest-
  wins confirmed live.**
- **Leads** went **1 → 2** (latest `2026-06-20 12:55:56`) in the same round-trip
  — MV-14 lead-insert re-confirmed.

### Residual (the documented non-retroactive caveat — for the founder)
Two historical accounts predate the fix and haven't re-claimed since, so their
primary is still stale (self-heals only on their *next* claim, not
retroactively):

- `5bda97e3…` — 5 assessments, primary `2026-06-04`, newest `2026-06-10`.
- `99b0a8f0…` — 3 assessments, primary `2026-06-04 04:19`, newest `04:49`.

A one-off **prod write** (`update assessments set is_primary` per owner to point
at the newest) would repair them immediately — **founder-gated; not done.** Weigh
it against the risk that an account's "newest" row is an abandoned half-redo
rather than their intended assessment.

## Follow-up
Decide whether to pursue [[MV-17]] (route logged-in re-assessment to
profile-edit/reScore — Codex's preferred primary path) to stop minting duplicate
wizard rows in the first place (it also removes MV-16's rare demote-ok/promote-fail
window for the common case).
