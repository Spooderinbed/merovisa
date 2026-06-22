# MV-28 — Recoverable anonymous results (P0)

**Column:** Ready (serial track, after MV-31) · **Priority:** P0 · **Owner:** founder+agent · **Size:** M–L
**Gate:** half (a) agent-ownable; half (b) needs a **founder design nod** (anon-read policy) + a **prod Supabase migration** (founder-DB-gated, like [[MV-21]]).
**Created:** 2026-06-23
**Source:** `docs/audits/2026-06-23-real-user-audit.md` (the audit's #1 / P0).
**Related:** [[MV-31]] (coupled — same files), [[MV-14]]/[[MV-16]] (the OAuth claim path), [[MV-21]] (the founder-DB-gate precedent).

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

- [ ] (a) Refresh / back / tab-restore on the anonymous wizard and results no longer loses state (sessionStorage
      rehydrate). TDD.
- [ ] (b, local) An anonymous GET of `/assessment/[id]` for an unclaimed, non-expired id renders the results;
      a claimed or expired id still 404s/redirects. TDD + a local-stack RLS proof.
- [ ] (b, gate) Anon-read policy confirmed by the founder; prod migration applied by the founder.
- [ ] Gate green (typecheck/lint/full suite); goldens byte-identical (no scorer path); `au-cricos-codes.ts`
      untouched.

## Resume notes (cold agent)

- This is the architectural fix in the audit cluster; the three trust-copy fixes (MV-29/30/32) and the
  client-error fix (MV-31) are smaller and land first.
- **Split by gate:** half (a) is pure client work you can finish; half (b)'s prod migration is founder-DB-gated —
  stage it, don't apply it. Surface the anon-read/enumeration policy as a one-line founder decision.
- Commit straight to master; explicit `git add` paths; never stage the WIP trio. Only the founder closes to Done.
