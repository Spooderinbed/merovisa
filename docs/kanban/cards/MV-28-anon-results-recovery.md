# MV-28 — Recoverable anonymous results (P0)

**Priority:** P0 · **Owner:** founder+agent · **Size:** M–L
**Gate:** half (a) agent-ownable (DONE, 51fd70e); half (b) authored on branch `mv-28b-anon-read` (DONE, 39c716c) — **NO migration** (Option C); remaining gate is a **founder anon-read *policy* nod + merge to master** (the security fork the audit reserved).
**Created:** 2026-06-23
**Source:** `docs/audits/2026-06-23-real-user-audit.md` (the audit's #1 / P0).
**Related:** [[MV-31]] (coupled — same files), [[MV-14]]/[[MV-16]] (the OAuth claim path), [[MV-21]] (the founder-DB-gate precedent).

## STATUS 2026-06-23 — BOTH HALVES BUILT

- **Half (a)** — sessionStorage recovery: **DONE on master (51fd70e), In Review.** Wizard answers (`myvisa.wizard.v1`) + computed results (`myvisa.results.v1`) survive refresh/back/tab; anon-only; cleared on `/assess?new=1`.
- **Half (b)** — anon-recoverable `/assessment/[id]`: **DONE on branch `mv-28b-anon-read` (39c716c), gate green (suite 1321, +6), Codex-reviewed.** Kept off master pending the founder policy nod (below).
  - **DESIGN PIVOT — no migration (Option C).** The original plan here assumed a Supabase **RLS migration** granting `anon` SELECT under the predicate. That design is **insecure and was rejected**: the public anon key (shipped in client JS) + a row-content RLS policy (`owner is null and expires_at > now()`) lets anyone `GET /rest/v1/assessments?select=*` and **enumerate every unclaimed assessment's PII** — RLS filters by row content, not by whether the caller supplied the id. Codex confirmed the enumeration analysis.
  - **What shipped instead:** the anon read goes through the **server-only admin (service-role) client** with the predicate **in the query** (`.eq(id).is(owner,null).gt(expires_at,now)`), plus an app-side guard + canary log as defense in depth. Anon keeps **zero table grant** → no PostgREST enumeration surface. Matches CLAUDE.md ("business logic in Next.js, Supabase is dumb storage"). **No migration, no founder-DB-gate.**
  - **Files (on branch):** `lib/assessments/repo.ts` (`getRecoverableAssessment`), `app/(focused)/assessment/[id]/page.tsx` (drop signed-out redirect; anon branch → admin read → `Results mode="anonymous" assessmentId={id}` so recovery still offers the claim/sign-in path), `tests/assessments/repo-recoverable.test.ts` (+5), `tests/app/assessment-page.test.tsx` (anon-recovery/404).
  - **The remaining founder decision (now ONLY a policy + merge call, not a migration):** is it acceptable that a bearer-of-the-UUID can read an *unclaimed, non-expired* assessment's profile (GPA/scores)? This fulfills the existing "expires in 3 days" promise (the id is only ever returned to the creator), so it's arguably the implied contract — but it is the security-sensitive exposure the audit reserved, so it is **not auto-merged**. Founder nod → `git checkout master && git merge mv-28b-anon-read` (or authorize the agent to).

## Why (the P0)

The product promises an anonymous user their assessment "expires in 3 days" — implying it persists and is
recoverable. In reality:

1. The wizard + results state lives **only in client `useState`** (`components/assess/assess-flow.tsx`,
   `components/wizard/use-wizard-state.ts`). A refresh, a back-nav, or a killed tab **wipes all 9 steps and the
   result**. Nothing is written to `sessionStorage`/`localStorage`.
2. The assessment **is** persisted server-side (see `/api/assess` → a row with `result` + `profile_snapshot`),
   and there is a route to view it — but `app/(focused)/assessment/[id]/page.tsx:15` does
   `if (!data.user) redirect("/assess")`, and `getOwnedAssessment` is owner-scoped (RLS). So an **anonymous**
   visitor can never reach the persisted id. The 3-day promise is structurally unreachable for the very users
   it targets.

This is the headline P0. It **partly contradicts** the earlier "conversion shipped" reconciliation
([[value-triage-lane]]): the conversion *code paths* exist, but the *lived recovery* does not.

## Design — two halves, split by gate

### Half (a) — in-session persistence (AGENT-OWNABLE, no gate)
Persist the wizard answers + the computed results payload to **`sessionStorage`** (survives refresh/back/tab
within the browser session), rehydrating `use-wizard-state.ts` / `assess-flow.tsx` on mount. Client-only, no DB,
no RLS, no migration. Closes the most common pain (accidental refresh / back). **This is the bulk of the lived
fix and ships without any founder gate.** Do this as part of / right after [[MV-31]] (same files).

### Half (b) — cross-device recoverable URL (FOUNDER DESIGN FORK + PROD MIGRATION GATE)
Make `/assessment/[id]` readable by an anonymous visitor **iff** the assessment is **unclaimed** (no `owner`)
and **non-expired** (within the 3-day window), keyed by its **random UUID**. Relax the redirect at
`page.tsx:15`; add an `lib/assessments/repo.ts` anon-read path; add a **Supabase RLS migration** allowing
`anon` SELECT on `assessments` under exactly that predicate.

**The founder decision (do not build half (b) past local staging without it):**
- **Enumeration / anon-read policy.** Random UUIDv4 ids already make enumeration impractical, and the predicate
  is scoped to *unclaimed + non-expired* only (a claimed or expired row stays private). Confirm this is the
  intended exposure, or choose to keep recovery **in-session only** (half (a)) and **not** expose any anon-read.
- **Prod migration** is founder-DB-gated regardless (same rule as [[MV-13]]/[[MV-21]]): author + Codex-vet the
  migration locally, prove it against a local stack, but **prod apply is the founder's**.

**Recommended default (pending the nod):** ship half (a) now; author half (b)'s code + migration locally and
stage it; defer the prod apply + the policy confirmation to the founder. That fully fixes the in-session case
autonomously and leaves only the cross-device promise behind one explicit gate.

## Coupling / sequencing

Coupled with [[MV-31]] (#4) — both edit `assess-flow.tsx` + `use-wizard-state.ts`. **Do MV-31 first** (stabilize
the client retry/error path), then layer MV-28 on top. Codex merge order for the whole audit-fix cluster:
MV-30 → MV-29 → MV-32 → **MV-31 → MV-28**, full gate (typecheck+lint+test) after each.

## Acceptance criteria

- [x] (a) Refresh / back / tab-restore on the anonymous wizard and results no longer loses state (sessionStorage
      rehydrate). TDD. **DONE 51fd70e.**
- [x] (b, local) An anonymous GET of `/assessment/[id]` for an unclaimed, non-expired id renders the results;
      a claimed or expired id still 404s. TDD (5 repo cases incl. the claimed/expired security boundary + page
      anon-recovery/404). **DONE on branch 39c716c.** No RLS proof needed — Option C uses no anon RLS policy.
- [ ] (b, gate) Anon-read **policy** confirmed by the founder; branch merged to master. **No prod migration** (Option C).
- [x] Gate green (typecheck/lint/full suite, 1321 +6); goldens byte-identical (no scorer path); `au-cricos-codes.ts`
      untouched.

## Resume notes (cold agent)

- This is the architectural fix in the audit cluster; the three trust-copy fixes (MV-29/30/32) and the
  client-error fix (MV-31) are smaller and land first.
- **Split by gate:** half (a) is pure client work you can finish; half (b)'s prod migration is founder-DB-gated —
  stage it, don't apply it. Surface the anon-read/enumeration policy as a one-line founder decision.
- Commit straight to master; explicit `git add` paths; never stage the WIP trio. Only the founder closes to Done.
