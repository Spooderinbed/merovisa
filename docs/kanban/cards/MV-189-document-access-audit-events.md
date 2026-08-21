# MV-189 — Document access audit events (Stage 4 slice 5)

**Priority:** P1   **Owner:** agent
**Goal:** Every service-role document access — upload, view, download, delete — writes an
append-only `audit_events` row naming the human who reached the bytes, so the plan's "and audited"
clause is satisfied by the five document paths instead of by none of the eighteen.

## Context links

- Plan: `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md`
  — line 342 (the exception list's four clauses), line 652 (Stage 4 "add document access audit
  events"), line 275 (no PII in metadata), line 504 ("cannot be separated"), line 655 (exit gate).
- **Spec §8 (D11–D15)**: `docs/superpowers/specs/2026-08-20-case-document-collaboration.md`
  — written and committed BEFORE any code, as MV-185 §1/§6, MV-190 §6 and MV-186 §7 each did.
- Predecessors: MV-182 (requests), MV-185 (schema), MV-190 (Storage paths), MV-186 (UI + routes).
- Table shipped in Stage 1: `supabase/migrations/20260730120000_stage1_tenancy_core.sql:182-256`.
- Read policy from MV-152: `supabase/migrations/20260730180000_case_aware_rls_policies.sql:667-669`.

## The debt this pays

`lib/supabase/service-role-exceptions.ts` holds **18 sanctioned entries, all 18 with
`auditEvent: null`**. The plan makes auditing a *condition* of the exception, not a follow-up. Two
entries already carry the words "The at-mint AUDIT EVENT is still owed". Today a counsellor can
upload, open and download a student's passport scan and nothing anywhere records it.

## Acceptance criteria

- [ ] `lib/audit/write-audit-event.ts` is the single write choke point; it inserts directly on the
      service-role client (D11) and **throws** on failure (D12).
- [ ] Five routes emit their event at the position D12 assigns:
      `document.uploaded`, `document.viewed`, `document.deleted`, `document.version_uploaded`,
      `document.downloaded`.
- [ ] **Read paths audit BEFORE the mint** — on an audit failure `createSignedUrl` is never reached.
- [ ] **No route returns 2xx without its audit row committed** (the D12 invariant).
- [ ] `actor_user_id` is the authenticated human, never a service identity (D14).
- [ ] `organization_id` is the case's own org, taken from `CaseContext` (D15); `TargetCase` widened
      to carry it — no new query.
- [ ] `metadata` and `entity_id` carry **no free text** — closed allow-list, swept from source (D13).
- [ ] The five wired entries in `service-role-exceptions.ts` have their `auditEvent` set, and the
      file's "AUDIT WIRING IS NOT YET POSSIBLE" header is corrected.
- [ ] **NO MIGRATION** — and therefore no gated production apply, so this is ONE PR.

## Test plan

- **Unit / route (default lane)** — per route: a success test asserting the audit row's shape, and a
  **fail-closed test** asserting 500 on an audit failure. For the two read routes the fail-closed
  test additionally asserts `createSignedUrl` was **never called**.
- **Source sweep** — `tests/audit/audit-metadata-pii.test.ts` reads the call sites and fails on any
  banned free-text identifier reaching a metadata argument. **Splits on `/\r?\n/`** (CRLF tree).
- **Integration (`*.itest.ts`)** — builds a **real organization**, an admin membership and an
  org-owned case, then asserts (a) the fixture can express the thing: an org-scoped audit row IS
  readable by its own org admin; (b) a different org's admin reads zero; (c) the row is append-only.
  A null-org fixture would pass (a) vacuously — that is the trap this ordering exists to avoid.
- **Mutation evidence** — every guard falsified, each mutant naming a distinct test.

## Integration gate

```
npm run typecheck
npm run lint
npm test
```

Integration lane (Docker stack up, `SUPABASE_TEST_*` set), run **one file at a time** on Windows —
a crashed worker reports as CLEAN:

```
npx vitest run --config vitest.integration.config.ts tests/integration/stage4-audit-events.itest.ts
```

## Dependencies / blocked-by

- None. `audit_events`, its indexes, the append-only trigger and `audit_events_select_admin` are all
  already applied in production (Stage 1 + MV-152). This slice adds no schema.

## Risk notes

- **Fail-closed is a real availability trade** (D12): an audit outage stops document access. Decided
  deliberately against plan line 504 ("cannot be separated"), not by accident of `await` order.
- **PII leak** is the sharp risk (D13). `original_name` is user-supplied and routinely
  `<name>_passport_<year>.pdf`. Fenced by a source sweep, not by reviewer attention.
- **Write-only log** (D15): `NULL = ANY(…)` is `NULL`, so a null-org row is readable by nobody. The
  row must carry the case's actual org even while every case is personal.
- **Vacuous fixture** — the third occurrence of the shape that bit MV-190 and MV-186. Assert the
  fixture can express the claim before asserting the claim.
- `eslint.config.mjs` enforces `merovisa/service-role-exception-list`: a module touching
  `lib/supabase/admin` must be listed in the same commit. `lib/audit/write-audit-event.ts` takes a
  client as a parameter rather than constructing one, so it does not need an entry — verified, not
  assumed.

## Agent resume notes (for a cold start)

Spec §8 of `docs/superpowers/specs/2026-08-20-case-document-collaboration.md` is committed and is
the contract. Work in a worktree **outside `.claude/`** — both vitest configs exclude `**/.claude/**`,
so a run from an agent worktree collects ZERO tests and looks green. `C:\ci\mv189` with a junctioned
`node_modules` is the working copy; **delete the junction before `git worktree remove`.**

## Decision log

- 2026-08-22 — D11: direct INSERT, no migration. Proved by measurement that granting EXECUTE on
  `private.write_audit_event` does **not** make it callable: PostgREST returns PGRST202 (searching
  `public`) with the grant in place, and PGRST106 "Only the following schemas are exposed: public,
  graphql_public" when `private` is forced. Grant reverted, probe rows deleted.
- 2026-08-22 — D12: **fail-closed**, decided on plan line 504. Testable invariant: no 2xx without a
  committed audit row; strictly stronger on read paths (no URL is minted at all).
- 2026-08-22 — D13: closed metadata allow-list + source sweep. `original_name` named as the trap.
- 2026-08-22 — D14: `actor_user_id` is the authenticated human.
- 2026-08-22 — D15: `organization_id` from `CaseContext`; `TargetCase` widened (it already computed
  the value and threw it away).
- 2026-08-22 — Observation recorded, not fixed: `service_role` holds **TRUNCATE** on an append-only
  evidence table, which the Stage 1 DELETE rationale does not cover. Recommended for the Stage 6
  retention migration.
- 2026-08-22 — The Supabase MCP was NOT reachable this session (interactive OAuth, non-interactive
  session). All DB claims re-measured on the local Docker stack; production row count and the
  "10 null-org cases" claim are carried forward UNVERIFIED and the slice does not depend on either.

## Done evidence

_(filled at the gate — see the PR)_
