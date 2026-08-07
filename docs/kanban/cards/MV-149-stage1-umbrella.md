# MV-149 — Umbrella: Stage 1 tenancy foundation (MV-150 schema · MV-151 server boundary · MV-152 RLS · MV-153 negative-test gate)

**Priority:** P1 · **Owner:** founder + agent
**Goal:** Drive Stage 1 (tenancy foundation) to its exit gate — the case authorization matrix passing positive AND negative real-DB integration tests — by coordinating four implementation slices, without itself shipping any schema, policy, or app code.

**Umbrella — do NOT build from this card.** It tracks a stage; the work lives in MV-150/151/152/153. This card closes only when MV-153's harness is green and the founder accepts the stage. Its job is to hold the stage exit gate, the slice DAG, the stage-level risks, and the two decision-record items that are Stage-1-scoped but still unanswered — so those stop living only in the plan and the decision record.
**Source:** Stage 1 of the revised consultancy plan (2026-07-25 revision); carved into slices by the integrator session 2026-07-30.

## Context links

- **Stage 1 definition + exit gate:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` → "Stage 1 — Tenancy foundation" (lines ~620-628). Exit gate (line ~627): *"the authorization matrix passes positive and negative database tests."*
- **Domain model the slices build to:** same plan → "New core tables" (lines ~214-275) and "Moving existing data to cases" → "Additive migration sequence" step 1 (line ~304, the only step in Stage-1 scope; steps 2-13 are Stage 2+).
- **Authorization doctrine (load-bearing for MV-151/152):** same plan → "Authorization and tenant isolation" → "Enforcement boundary" (lines ~336-345), "Authorization rules" (~347-356), "Enforcement layers" (~358-382), "Required negative security tests" (~393-405).
- **Schema obstacles the slices must respect (owner NOT NULL, composite FKs, immutability trigger):** same plan → "Known schema obstacles" (lines ~321-329). Note: relaxing `owner` and any backfill are **Stage 2**, out of MV-150's scope.
- **Stage 0 decision record (why Stage 1 is unblocked):** `docs/legal/2026-07-29-stage0-decision-record.md` → D-B (lines ~62-83): the legal gate blocks real-data onboarding (Stage 3), not this stage; Stage 1 "touches no real student data and can proceed against seed data." Still-open founder items table (lines ~136-146).
- **Live schema idioms the slices inherit:** `supabase/migrations/20260620000000_add_outcome_validation.sql` (force RLS, `unique (id, owner)` composite-FK targets, explicit `revoke all` + scoped `grant … to authenticated`, `SECURITY DEFINER`/`set search_path=''` writer, immutability trigger); `supabase/migrations/20260605130000_fix_documents_rls.sql` (grant tightening); `lib/supabase/types.ts` (regenerated types MV-150 must refresh).
- **Harness pattern MV-153 extends:** `tests/integration/anon-purge.itest.ts` (the `*.itest.ts` naming, `describe.skipIf`, and the hard localhost guard that refuses a non-local `SUPABASE_TEST_URL`).
- **Dossier schema + Definition of Ready this umbrella and its slices must meet:** `docs/kanban/README.md`.

### Slice map (each is its own Ready card; respect the seams — do not let a slice absorb a sibling's scope)

| Slice | Scope in one line | Depends on | Explicitly NOT in scope |
|---|---|---|---|
| **MV-150** SCHEMA | Additive migration(s): `organizations`, `organization_memberships`, `cases`, `case_assignments`, `invitations` (token_hash single-acceptance shape), `audit_events` (append-only: revoke UPDATE/DELETE + controlled write path); indexes on every column a future RLS predicate reads; RLS enabled+forced with **deny-all** default policies; regenerated types. | — | No backfill, no `owner`-column changes (Stage 2), no policy logic (MV-152), no app code. |
| **MV-151** SERVER BOUNDARY | `getCaseContext(actorUserId, caseId)`, `requireCasePermission(actorUserId, caseId, permission)`, the role→permission matrix (owner/admin full-org, counsellor assigned-only, student linked-only), and the enforcement-boundary doctrine: authenticated-client + RLS is load-bearing; service-role only via an enumerated, audited exception list + a lint/convention new call sites must join. Unit + behavioural tests. | MV-150 | No UI, no RLS SQL (MV-152), no migration beyond MV-150. |
| **MV-152** RLS POLICIES | Replace MV-150's deny-all with real case-aware policies: `SECURITY DEFINER` `STABLE` helpers with pinned `search_path` for membership/assignment lookups (anti-recursion), `USING` + `WITH CHECK` on every update, grant review (authenticated only; anon nothing), all six tables covering org owner/admin full-org, counsellor assigned-only, student linked-case-only, inactive membership = no access. | MV-150 | No new tables, no server code. |
| **MV-153** NEGATIVE-TEST HARNESS | Real-Supabase `*.itest.ts` harness with fixtures (2 orgs × a user in every role × cases); the full negative catalogue AND the positive matrix. **This card IS the stage exit gate.** | MV-150 + MV-151 + MV-152 | — |

## Acceptance criteria

The umbrella is a tracking card; its criteria are observable stage-completion facts, not new behaviour.

- [x] Four slice dossiers exist and each meets the README Definition of Ready: `cards/MV-150-*.md`, `cards/MV-151-*.md`, `cards/MV-152-*.md`, `cards/MV-153-*.md` (each with observable acceptance criteria, a test plan, an integration gate, and cold-start resume notes).
- [x] The DAG is respected in board order and in work: MV-150 reaches Done before MV-151 and MV-152 start; MV-153 starts only after MV-150 + MV-151 + MV-152 are Done. A merged MV-153 with any of the three still open is a defect.
- [ ] **Stage exit gate is observably green:** MV-153's harness proves the full negative catalogue (cross-org list/read/change/delete/export/download deny; unassigned-counsellor deny; student cross-case deny; revoked member immediate loss; role forgery from browser/user-metadata rejected) **and** the positive matrix, under `npm run test:integration` against a local stack, with the run recorded on MV-153's Done evidence. This umbrella is not Done until that run is green.
- [ ] Enforcement-boundary doctrine holds across the stage as a checkable fact: RLS (authenticated client) denies cross-tenant access even with the MV-151 layer bypassed in a test (RLS is load-bearing, not defence-in-depth-only); the service-role exception list exists and MV-151's lint/convention fails CI if a new service-role call site is added without joining it.
- [x] No real student personal data entered the system during Stage 1 (D-B): every slice ran on seed/fixture data only. Verifiable — no migration in the stage writes real rows, and the harness mints its own fixtures.
- [ ] The two Stage-1-scoped open decision-record items are carried as explicit design inputs on the slice cards (see Risk notes), **not decided here**: MV-150's `cases` shape does not preclude a later unclaimed-case retention/purge rule, and records `created_at`; MV-150/151 acceptance notes the bounded case-creation→student-notice window as an input to invitation design without setting a value.

## Test plan

The umbrella owns no tests. The stage's proof is the union of the slices' coverage, gated by MV-153:

- **MV-150:** migration applies cleanly on a fresh local stack; `list_migrations` shows it; deny-all RLS proven (an authenticated client reads zero rows from all six tables); regenerated types compile.
- **MV-151:** unit + behavioural tests for the role→permission matrix and the service-role exception-list lint (a fixture call site outside the list fails the check).
- **MV-152:** helper functions are non-recursive and `STABLE` with a pinned `search_path`; policy tests per table for the five access shapes.
- **MV-153 (the exit gate):** real-Supabase integration suite implementing the plan's "Required negative security tests" (lines ~393-405) plus the positive matrix, run under `npm run test:integration`, extending the `anon-purge.itest.ts` localhost-guard idiom. **This is the only evidence that closes the stage — a green `npm test`/`typecheck`/`lint` is necessary but categorically insufficient, because unit tests cannot exercise RLS as the authenticated user.**

## Integration gate

The umbrella runs no gate of its own; it aggregates the slice gates. The **stage-level** gate every slice must pass, and MV-153 must additionally green:

- `npm run typecheck` · `npm run lint` · `npm test` — on every slice.
- `npm run test:integration` — **load-bearing for this stage** (Stage 1 produces real-DB authorization behaviour). Required green on MV-152 and MV-153; MV-153's green run is the stage exit gate.

## Dependencies / blocked-by

- **Internal DAG:** MV-150 → MV-151 (the server boundary reads MV-150's tables) and MV-150 → MV-152 (policies replace MV-150's deny-all). MV-153 depends on all three.
- **NOT blocked by the Stage 0 legal gate.** Per D-B, the unresolved consultancy agreement blocks onboarding real cases (Stage 3), not this stage. Stage 1 runs on seed data. Do not stall these slices on the agreement.
- **Local Supabase stack** for the MV-153 harness (`npx supabase start`; env from `npx supabase status -o env`), matching the `anon-purge.itest.ts` run instructions.
- **No new packages, no production migration apply** in Stage 1 — migrations are authored and rehearsed locally; applying to the hosted project is a separate founder-gated action (cf. MV-135's un-applied index).

## Risk notes

Stage-level risks (each slice carries the concrete mitigation; this table is the stage's risk register, mirroring the plan's "Primary risks and mitigations", lines ~764-776):

| Risk | Where it bites | Mitigation / owning slice |
|---|---|---|
| **Cross-tenant data exposure** | Any read/write/list/export/download crossing an org or case boundary. The headline Stage-1 risk. | RLS as the load-bearing layer (MV-152), proven by the negative catalogue (MV-153). Acceptance requires RLS to deny even with the MV-151 layer bypassed — a bug in the server layer must not be sufficient to cross a boundary. |
| **Service-role bypass** | The current codebase default routes sensitive reads/writes through the service-role client, which bypasses RLS; the tenancy work inverts that. | MV-151 owns the enumerated, audited service-role exception list + a lint/convention that fails when a new service-role call site is added without joining it. Risk that a slice quietly adds an unlisted service-role path — the lint is the guard. |
| **RLS recursion / performance** | Membership/assignment predicates written as inline recursive subqueries → infinite recursion or seq-scan blowups at scale. | MV-152 uses `SECURITY DEFINER` `STABLE` helpers with a pinned `search_path` (e.g. `is_org_member`, `can_access_case`); MV-150 indexes every column those helpers read. Risk lives at the MV-150/152 seam — an unindexed predicate column is a defect. |

**Carried decision-record items (Stage-1-scoped, still open — recorded here as design inputs, deciding NOTHING):**

- **Fate of an unclaimed case** (decision record "Still open" #7/#12, and D-A work item 5). A case whose student never claims it has no defined retention/deletion rule yet — the data subject never interacted with the product. *Design input, not a decision:* MV-150's `cases` shape (nullable `student_user_id`, `created_at`, and a way to identify unclaimed rows) must not preclude a later purge rule following the `docs/data-retention-policy.md` pattern (purge predicate + daily cron + a never-remove-this guard, as landed for anonymous assessments in MV-135). The window and mechanism remain a founder call; MV-150 only keeps the door open.
- **Bounded window: case creation → student notice** (decision record "Still open" #13b, and D-A work item 6). The maximum time a case may exist before the student is notified is unset; it constrains invitation design. *Design input, not a decision:* MV-150 records `cases.created_at`, and MV-150/151 acceptance should note that the eventual window is enforced at the invitation/notice layer (later stage) — Stage 1 neither sets the value nor builds the enforcement. Explicitly out of Stage 1: the invitation-send flow, adults-only enforcement (#9), and whether case data may reach `api.deepseek.com` (#14) — those are Stage 3/guide/pilot scope, not tenancy foundation.

## Agent resume notes (for a cold start)

- **Do not implement from this card.** It is an umbrella. First concrete action: read the four slice dossiers (`cards/MV-150-*.md` … `cards/MV-153-*.md`); if any does not yet exist, that slice is the work — write it to Definition of Ready before building.
- Then read `board.json` to see which slice is topmost Ready. Pick per the DAG: **MV-150 first** (nothing else can proceed until the tables exist). Respect WIP = 1 in progress.
- For any slice, read the plan sections linked above and the two exemplar migrations (`20260620000000_add_outcome_validation.sql`, `20260605130000_fix_documents_rls.sql`) before writing SQL — they are the house style for force-RLS, composite-FK `unique (id, …)` targets, `revoke`/`grant`, and `SECURITY DEFINER` writers.
- To verify the stage is closeable: `npx supabase start`, set `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY` from `npx supabase status -o env`, then `npm run test:integration` — MV-153's suite green is the exit gate. Update this card's Done evidence only when that run is recorded on MV-153 and the founder has accepted the stage.
- Board hygiene: this is a `founder + agent` P1 card; moving any slice = edit its `col` + `entered` in `board.json`, then `npm run board` (never hand-edit `board.md`/`board.html`).

## Decision log

- 2026-07-30 — Card carved from Stage 1 of the revised consultancy plan (integrator session).
- 2026-07-30 — Stage split into four slices along enforcement seams: schema (MV-150) / server boundary (MV-151) / RLS policies (MV-152) / negative-test harness (MV-153), so each has one testable responsibility and MV-150's deny-all default keeps every table closed between the schema landing and the real policies landing.
- 2026-07-30 — MV-153 designated the stage exit gate: the plan's exit is "positive and negative database tests," which only a real-Supabase harness can prove, so the harness card carries the gate rather than the umbrella.
- 2026-07-30 — Confirmed Stage 1 is NOT blocked by the open consultancy agreement (decision record D-B): all four slices run on seed data, no real student data, so engineering proceeds while the legal gate waits.
- 2026-07-30 — Two still-open founder decisions (unclaimed-case fate; case-creation→notice window) recorded here as carried design inputs for MV-150/151 acceptance, explicitly deciding nothing — they constrain the schema's shape, not this stage's outcome.
- 2026-08-03 — MV-150/151/152 Done and merged (PRs #106/#109/#108); both tenancy migrations applied to production, Supabase advisors re-run clean. A cross-layer review found the TS and SQL layers had diverged in six cells (four with SQL MORE permissive than TS). Resolved via `docs/superpowers/specs/2026-08-02-stage1-canonical-access-matrix.md`, now authoritative for every access cell and serving as MV-153's checklist.
- 2026-08-03 — **OPEN FOUNDER DECISION — CI gating of the exit gate.** The `integration` job in `.github/workflows/ci.yml` carries `continue-on-error: true` (added when the flake rate was unmeasured), so every tenancy assertion is advisory: a cross-tenant leak turns the job red and merges anyway. Measured evidence now exists — across PRs #95–#110 the job ran ~12 times with exactly one failure (#102), and that failure was a true positive (a stale assertion), not a flake. Until the flag is flipped AND `integration` is made a required check in branch protection, **Stage 1's exit rests on a recorded run, not an enforced signal.** Recorded here per MV-153's risk note, which routes the flip to the founder. Not decided by any agent session.
- 2026-08-03 — MV-153 round 1 reviewed and sent back — 2 blockers, 4 majors, all adversarially verified: the card's own "across all six tenant tables" criterion was unmet for WRITES (notably `organizations` DELETE — total tenant destruction — untested on every suite); clone-based delete/assign probes stripped `student_user_id`, so ~10–19 cells deny for a reason other than the one they name; both CI "the gate actually ran" guards proved inert when replayed against a real vitest run; no inactive owner/admin fixture existed, leaving `private.org_role`'s status filter untested on every path it uniquely gates; and the "292/292 inversion" vacuity proof is a tautology (a single-equality cell that passes with `expected` must fail with `!expected`), so it cannot support the causal claim made of it. **Stage 1 does not exit until the round-2 harness is green.**

## Done evidence

**Partially discharged 2026-08-07 by the composer session**, in the same pass that discharged MV-154. This card had been sitting at `col: done` with 0 of 6 criteria ticked and this section reading `(pending)`. **3 of 6 are now ticked against verified facts. The other 3 are left open with named reasons — this pass deliberately under-claims rather than ratifying Stage 1's exit after the fact.**

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Four slice dossiers exist | ✅ | `cards/MV-150-*` … `MV-153-*` — four files present on master |
| 2 | DAG respected in board order and in work | ✅ | Merge order: `#106` MV-150 → `{#108 MV-152, #109 MV-151}` → `#110` MV-153. MV-150 landed before both of its dependents; MV-151 and MV-152 are parallel siblings in the `150 → {151,152} → 153` DAG so either order satisfies it; MV-153 landed last |
| 3 | Stage exit gate observably green (MV-153's harness) | ⬜ **open** | See below |
| 4 | Enforcement-boundary doctrine holds as a checkable fact | ⬜ **open** | See below |
| 5 | No real student personal data entered during Stage 1 (D-B) | ✅ | True by construction — no Stage 1 migration writes real rows and the harness mints its own fixtures. D-B was in force throughout and remains so |
| 6 | The two Stage-1-scoped decision-record items carried as design inputs, not decided | ⬜ **open** | Not checked by this pass — requires opening each slice card to confirm both items are present as inputs. No evidence either way |

### Why 3 and 4 are left open

Both suites exist on master (`tests/integration/tenant-isolation.itest.ts`, `tests/integration/case-rls.itest.ts`) and both are gating in CI, so the *mechanism* is real and running. What is not established is that it proves what these two criteria claim, for two documented reasons:

- **MV-153's own evidence was later found to overstate what its artifacts proved.** MV-161's dossier cites `cards/MV-153-cross-tenant-negative-tests.md` as its evidence-rigor precedent precisely because it carried **two load-bearing claims that overstated an artifact**. Ticking a stage-exit criterion on the strength of that harness, without re-reading it, would repeat the error the repo has already caught once.
- **A denial-only RLS suite is inert.** A negative probe set passes *identically* against a correct policy and a **missing** one — nothing in a "this was denied" assertion distinguishes the two. Criterion 4 specifically claims RLS is *load-bearing* (denies even with the MV-151 layer bypassed), which is exactly the claim a denial-only suite cannot make. Establishing it needs mutation evidence: drop the policy, watch the named test go red.

**This is not an assertion that Stage 1's isolation is broken.** Stage 2 built extensively on these policies and its own suites pass; the boundary behaves correctly in every observation made since. The open items say only that *this pass did not verify these two claims to the standard the criteria demand*, and that the cheapest way to close them is a mutation run against the two suites.

**Follow-up, if these matter:** MV-163 already extends MV-161's column-axis guard to the four Stage 1 tenancy tables and requires mutation evidence (its N1–N6 matrix). That card is the natural place to close criterion 4, and it is currently in Backlog.
