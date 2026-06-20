# MV-17 — Route logged-in re-assessment to profile-edit/reScore (stop minting duplicate wizard rows)

**Column:** Backlog · **Priority:** P2 · **Owner:** agent · **Gate:** human (founder — product/routing decision)
**Created:** 2026-06-20
**Related:** [[MV-16]] — the claim-path fix (newest-wins) handles the *fallback*; this is the *primary* path Codex recommended. [[MV-14]] (lead-insert) and [[MV-08]]/[[MV-15]] (the outcome loop reads the primary assessment) all sit on the same claim/primary plumbing.

## Why

A logged-in user who wants to re-check their chances currently goes back through
the **anonymous wizard**, which mints a **new** `assessments` row (owner NULL →
claimed on the next OAuth round-trip). The result: owner `ece83f09` has accreted
**16 assessment rows** — only one can be primary, the rest are dead weight, and
every re-assessment leans on the claim path's demote-then-promote ([[MV-16]]) to
re-point the dashboard.

Codex's review (the A-vs-B-vs-C triangulation, 2026-06-20) ranked this the
**preferred primary path**: a signed-in user editing their data should update
their existing primary assessment **in place**, not create a parallel row.
`reScoreAssessment` (`lib/assessments/re-score.ts`) already recomputes and
overwrites the primary assessment's `result` when the profile changes — the
machinery exists; it just isn't on the re-assessment entry point for logged-in
users. [[MV-16]] (newest-wins on claim) remains the correct **fallback** for the
case where a logged-in user still completes a fresh anonymous wizard.

## What to build (proposed — needs founder sign-off before TDD)

- Detect an authenticated session at the wizard entry point (`/assess` and the
  results CTAs) and, for logged-in users, route to **profile-edit → `reScoreAssessment`**
  (update the existing primary in place) instead of starting a fresh anonymous
  assessment.
- Keep the anonymous wizard intact for signed-out users (the conversion funnel is
  unchanged).
- Decide the UX for "I want a genuinely *new* scenario" (e.g. a different target
  country/degree later) vs "re-check my current profile" — only the latter should
  reuse the primary row. (MVP corridor is Nepal→Australia, so this is largely
  theoretical today but worth naming.)

## Open questions for the founder

1. **Entry-point UX:** when a logged-in user clicks "assess" again, do we send
   them straight to profile-edit, or show a choice ("update my assessment" vs
   "start fresh")?
2. **Existing duplicate rows:** leave the historical 16 rows as-is (harmless once
   [[MV-16]] keeps the primary correct), or add a cleanup? (Cleanup = prod write,
   founder-gated.)
3. **Architecture:** stays in Next.js (reuse `reScoreAssessment`); no Postgres
   RPC — consistent with [[MV-16]].

## UX decision (Option A — founder pre-authorized, decided with Codex)

A signed-in user who triggers "re-assess / check again" **re-scores their existing
primary assessment in place** (via `reScoreAssessment`) and lands on their results
— instead of re-running the anonymous wizard (which mints a new `assessments` row).
The signed-OUT anonymous wizard + OAuth claim funnel are untouched. The "I want a
genuinely new scenario" intent is preserved as an explicit secondary action
("Start a new assessment" → `/assess?new=1`, the existing wizard path). No Postgres
RPC — business logic stays in Next.js, consistent with [[MV-16]].

## Actual-vs-Codex recon (2026-06-21)

Codex's plan was **partly hallucinated**; verified against the real code:

- ❌ Codex: an `app/assess/page.tsx` + `api/assess/refresh/route.ts` already route
  logged-in users to reScore. **Reality:** the page is `app/(focused)/assess/page.tsx`;
  there was **no** `api/assess/refresh` route. The interstitial existed
  (`components/assess/assess-interstitial.tsx`) but its "Refresh assessment" button
  was a `Link href="/assess?new=1"` → `<AssessFlow signedIn />` → full wizard → POST
  `/api/assess` which **INSERTs a new row** (`route.ts` lines 80–92). So the card was
  right: re-assessment accreted rows; Codex's "already routes to reScore" claim was false.
- ❌ Codex: `reScoreAssessment(userId)` single-arg. **Reality:** `reScoreAssessment(db, userId)`
  (two args) in `lib/assessments/re-score.ts`; updates the primary row in place, no insert.
- ⚠️ Edge handling: no `redirect()`/`isRedirectError` needed — the entry point is an
  **API route** (returns JSON), not a server component that throws NEXT_REDIRECT. The
  client component navigates via `router.push`.
- ✅ MV-01 invariant honored: `reScoreAssessment` owns scoring; we don't re-normalize.
  No goldens touched.

## What shipped

- **New** `app/api/assess/refresh/route.ts` (POST): server-side. getUser → 401 if
  signed out; loads the primary → **409 `{ redirect: "/assess?new=1" }`** if none (no
  500); else `reScoreAssessment(admin, user.id)` in place and returns `{ id: primaryId }`.
  Scoring stays server-side (F16).
- **New** `components/assess/refresh-button.tsx` (`"use client"`): POSTs to the refresh
  route, then `router.push('/assessment/{id}')`. Keeps the interstitial a server component.
- **Changed** `components/assess/assess-interstitial.tsx`: "Refresh assessment" is now the
  in-place re-score button; the wizard link is relabeled **"Start a new assessment"**
  (`/assess?new=1`, unchanged target) for the genuinely-new-scenario case; dashboard link kept.
- Entry points unchanged: dashboard/results/destination CTAs link to `/assess`, which
  already routes signed-in+primary users to the interstitial (the single chokepoint).

## Acceptance criteria

- [x] A logged-in user re-checking their chances updates their existing primary
      assessment in place (no new `assessments` row created). — refresh route asserts
      `insert` is never called.
- [x] Signed-out anonymous wizard + OAuth claim funnel unchanged. — `/api/assess` and
      `/auth/callback` untouched; refresh route 401s a signed-out caller.
- [x] The [[MV-16]] claim-path newest-wins remains as the fallback for a logged-in
      user who still completes a fresh anonymous wizard. — `/api/assess` insert path intact.
- [x] No Postgres RPC/function; business logic in Next.js.
- [x] TDD; no scoring/golden change beyond what `reScoreAssessment` already does.
- [x] No-primary edge does not 500 (409 → wizard redirect hint).

## Done evidence

- Gate (2026-06-21): `npm run typecheck` clean · `npm run lint` clean (1 pre-existing
  unrelated `build.mjs` warning) · `npm test` → **220 files / 1274 tests passed** (was
  1270; +3 new refresh-route tests, interstitial 2→3). No golden/scoring files in the diff.
- Tests: `tests/api/assess/refresh.test.ts` (in-place reScore + no-insert / 401 / 409-no-500),
  `tests/components/assess/assess-interstitial.test.tsx` (refresh is a button not a wizard link;
  "Start a new assessment" still → `/assess?new=1`).
- Commit: `<filled on commit>`.

## Deferred / founder-owed

- **Historical-duplicate-row cleanup** (owner `ece83f09` ~16 rows): a **prod write**,
  founder-gated — OUT OF SCOPE for this card, intentionally not done. [[MV-16]]
  newest-wins keeps the primary correct in the meantime.
- **Founder accept** (→ Done): this card is the routing/product decision gate; only the
  founder closes it.

## Status

In Review — machine-green, **founder-gated** accept. Built per the founder-authorized
Option A; the prod-row cleanup remains deferred.
