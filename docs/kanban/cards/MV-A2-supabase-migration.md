# MV-A2 — Apply Supabase advisor migration + enable leaked-password protection

**Priority:** P1   **Owner:** founder (approval) → agent (execute)
**Status:** ⛔ Blocked — migration applied + verified 2026-06-18; only the founder-only leaked-password dashboard toggle remains.
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
- [x] Founder says GO. Founder chose **direct-to-production** (over dev-branch-first) via an explicit prompt on 2026-06-18.
- [x] Migration applied; `get_advisors` (security + performance) re-run → the three target findings cleared (search_path WARN, unindexed-FK INFO, 2× RLS-initplan WARN).
- [ ] Auth **leaked-password protection** enabled in the dashboard — **founder-only manual toggle, still OFF.** Not doable via SQL/MCP; browser is read-only to the agent.
- [ ] `tests/programs/seed-migration-parity.test.ts` still passes. _Parity test guards the seed migration only; this advisor migration adds no seed rows, so it's unaffected — confirm on next full `npm test`._

## Dependencies / blocked-by
- **Founder GO.** Auto-mode classifier blocked applying to the live shared prod DB (correct — outward-facing). Prefer a dev-branch run first.

## Risk notes
- Touches the **live shared prod DB**. Idempotent/reversible and low-risk, but still prod — dev-branch-first is the safe path.

## Agent resume notes (cold start)
- Only act on explicit GO. Prefer: create dev branch → apply → re-run advisors → confirm clear → then promote. Leaked-password protection is a dashboard toggle the founder may need to flip.

## Decision log
- 2026-06-18 — Authored + committed; live apply blocked by auto-mode classifier; held for founder GO.
- 2026-06-18 — Founder GO; classifier re-blocked direct-to-prod citing the "dev-branch first" default; asked the founder explicitly; founder chose **direct-to-production**; applied.

## Done evidence
- Baseline advisors (before): SECURITY had `function_search_path_mutable` (WARN) on `private.set_updated_at`; PERFORMANCE had `unindexed_foreign_keys` (INFO) on `user_program_state.program_id` + `auth_rls_initplan` (WARN) ×2 on `documents`.
- `apply_migration(name="harden_advisors")` → `{"success":true}` on project `obfvrxixtautamflzxzq`.
- Advisors (after): all three target findings **cleared**. Remaining are expected/intentional: `rls_enabled_no_policy` on `leads` (INFO, service-role-only by design), `auth_leaked_password_protection` (WARN, the pending toggle), and `unused_index` INFOs (incl. the new `user_program_state_program_id_idx` — normal for a fresh index; the `programs(field,level)` ones clear once MV-01 wires the filter).
- **Remaining to fully close this card:** founder flips leaked-password protection at https://supabase.com/dashboard/project/obfvrxixtautamflzxzq/auth/providers → then this card → Done.
