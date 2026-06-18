# MV-A2 — Apply Supabase advisor migration + enable leaked-password protection

**Priority:** P1   **Owner:** founder (approval) → agent (execute)
**Status:** 🟣 In Review — committed but NOT applied; awaiting GO (or a dev-branch run).
**Goal:** Clear the three live Supabase advisor findings and enable leaked-password
protection before public traffic.

## Context links
- Migration (committed, not applied): `supabase/migrations/20260618120000_harden_advisors.sql`
- DB audit §1: `.claude/plans/tender-bouncing-locket.md`
- Execution checkpoint: `docs/audits/2026-06-18-EXECUTION-CHECKPOINT.md`
- Project id: `obfvrxixtautamflzxzq` (Postgres 17)

## What the migration does
- Hardens `private.set_updated_at` with `set search_path = ''`.
- Adds an index on `user_program_state(program_id)` (unindexed FK).
- Rewrites `documents` RLS SELECT/DELETE to `((select auth.uid()) = owner)` (per-row → once).

## Acceptance criteria
- [ ] Founder says GO (or: run against a Supabase **dev branch** first).
- [ ] Migration applied; `get_advisors` (security + performance) re-run → the three items clear.
- [ ] Auth **leaked-password protection** enabled in the dashboard (manual step — not doable via migration).
- [ ] `tests/programs/seed-migration-parity.test.ts` still passes.

## Dependencies / blocked-by
- **Founder GO.** Auto-mode classifier blocked applying to the live shared prod DB (correct — outward-facing). Prefer a dev-branch run first.

## Risk notes
- Touches the **live shared prod DB**. Idempotent/reversible and low-risk, but still prod — dev-branch-first is the safe path.

## Agent resume notes (cold start)
- Only act on explicit GO. Prefer: create dev branch → apply → re-run advisors → confirm clear → then promote. Leaked-password protection is a dashboard toggle the founder may need to flip.

## Decision log
- 2026-06-18 — Authored + committed; live apply blocked by auto-mode classifier; held for founder GO.

## Done evidence
_pending — not applied._
