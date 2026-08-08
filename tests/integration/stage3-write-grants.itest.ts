/**
 * MV-168 — Stage 3 slice 1: the consultancy write grants, and the three `.upsert()` conversions
 * without which those grants never reach their own call sites.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts).
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 * Stage 2 left `authenticated` with no INSERT on `profiles` or `plan_items` and no UPDATE on
 * `assessments` at all, and pinned that state as a DECISION GATE in
 * `stage2-tighten.itest.ts`'s "DEFERRED HALF" test. Stage 3 spec §6.1 rows 1, 3 and 5 grant
 * three of those ten deferred verbs and refuse or defer the rest. **The two assertions this
 * file inverts are deleted from that test in the same PR** — the DEFERRED HALF test keeps the
 * `assessments` INSERT and `documents` INSERT assertions, which stay refused.
 *
 * THE FAILURE MODE THIS FILE EXISTS TO CATCH is shipping the grants without the conversions.
 * A migration that applies, three policies that read back correctly out of `pg_policy`, and a
 * grant no code path can reach: everything green, nothing delivered. The three CONVERSION
 * tests are the mechanical guard — each one fails against the `.upsert()` form.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. A probe issued on the service-role client bypasses
 * every policy and proves nothing; the harness self-check in `fixtures/tenancy.ts` covers the
 * clients this file uses because they come from `fixture.actors`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

// The three repositories under test are `import "server-only"` modules; the marker package
// throws outside a React Server Component. Same line, same reason, as every other integration
// suite that exercises a repository (`case-data-access.itest.ts:51`).
vi.mock("server-only", () => ({}));

import { upsertProfileForCase } from "@/lib/profiles/repo";
import { upsertProgramState } from "@/lib/matches/repo";
import { setObtained } from "@/lib/documents/status-repo";
import {
  assertLocalStack,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage3-write-grants.itest.ts", url);

describe.skipIf(!url || !serviceKey || !anonKey)("MV-168 Stage 3 consultancy write grants", () => {
  let fixture: TenancyFixture;
  let dbContainer: string;

  /**
   * `unclaimedA` — organization A, `student_user_id IS NULL`, `counsellorAssignedA` is its
   * primary counsellor. THE CONSULTANCY SHAPE, and deliberately left unseeded by this file:
   * every row on it is written by the code under test, through the authenticated client, which
   * is the only way "the grant is reachable from its own call site" can be observed.
   */
  let consultancyCase: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there. */
  let unreachableCase: string;
  let programId: string;
  let sparePlanKind: string;

  /** Rows this file created, torn down before `fixture.teardown()` (cases are ON DELETE RESTRICT). */
  const created: { profiles: string[]; plan_items: string[]; assessments: string[] } = {
    profiles: [],
    plan_items: [],
    assessments: [],
  };

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  /** `programs` is not readable through PostgREST here, so the catalogue read goes direct. */
  const sqlLines = (statement: string): string[] =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { encoding: "utf8", input: statement },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  beforeAll(async () => {
    dbContainer =
      process.env.SUPABASE_TEST_DB_CONTAINER ??
      execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean)[0]!;

    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    consultancyCase = fixture.cases.unclaimedA;
    unreachableCase = fixture.cases.orgAssignedB;
    sparePlanKind = `mv168-${fixture.stamp}`;

    programId = sqlLines("select id from public.programs order by id limit 1;")[0] ?? "";
    expect(programId, "HARNESS DEFECT: no programs seeded by the migrations").toBeTruthy();

    // The consultancy case must start with NO profile row, or "first-ever" is not what is
    // being measured and the conversion test would pass against the `.upsert()` form.
    const { data: pre } = await fixture.admin
      .from("profiles")
      .select("id")
      .eq("case_id", consultancyCase)
      .maybeSingle();
    expect(pre, "HARNESS DEFECT: the consultancy case already has a profile row").toBeNull();
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    for (const id of created.plan_items) await fixture.admin.from("plan_items").delete().eq("id", Number(id));
    for (const id of created.assessments) await fixture.admin.from("assessments").delete().eq("id", id);
    for (const id of created.profiles) await fixture.admin.from("profiles").delete().eq("id", id);
    await fixture.admin.from("document_status").delete().eq("case_id", consultancyCase);
    await fixture.admin.from("user_program_state").delete().eq("case_id", consultancyCase);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The three conversions. EACH FAILS AGAINST THE `.upsert()` FORM.
  // ===================================================================================
  describe("the conversions — a grant its own call site cannot use is a paper resolution", () => {
    it("CONVERSION 1 — the AUTHENTICATED client creates a FIRST-EVER `profiles` row for a case it may reach", async () => {
      // WHY THIS TEST IS WRITTEN FIRST, and why it must be seen to fail before the migration
      // lands: PostgREST compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE SET` and puts
      // EVERY payload column in that SET list, including the conflict target `case_id`, with
      // the privilege check at plan time. Grant 1 is INSERT-only and `UPDATE (case_id)` is
      // forbidden by design, so the upsert form raises 42501 on the INSERT branch with no row
      // present — the grant is unreachable from the one call site that needs it.
      const c = actor("counsellorAssignedA").client;

      const id = await upsertProfileForCase(c, {
        caseId: consultancyCase,
        sections: { personal: { name: "MV-168 first-ever" } },
        completeness: 7,
      });
      expect(id, "the first-ever profile write returned null — the grant never reached its call site").not.toBeNull();
      created.profiles.push(id!);

      // THE ROW, NOT THE RETURN VALUE. `upsertProfileForCase` returns null on failure rather
      // than throwing, so "did not throw" is not evidence and neither is a truthy id alone.
      const { data: row, error } = await fixture.admin
        .from("profiles")
        .select("id, case_id, owner, completeness")
        .eq("case_id", consultancyCase)
        .maybeSingle();
      expect(error, `read-back failed: ${error?.message}`).toBeNull();
      expect(row, "no profiles row exists for the consultancy case").not.toBeNull();
      const profile = row as { id: string; case_id: string; owner: string | null; completeness: number };
      expect(profile.owner, "a consultancy row carries owner NULL — that is the whole shape").toBeNull();
      expect(profile.case_id).toBe(consultancyCase);
      expect(profile.completeness).toBe(7);
    }, 120_000);

    it("CONVERSION 1b — a SECOND call resolves onto the same row instead of colliding", async () => {
      // Read-then-insert has an insert branch and an update branch, and only the first is new.
      // A conversion that always inserts raises 23505 on `profiles_case_idx` the second time.
      const c = actor("counsellorAssignedA").client;

      const id = await upsertProfileForCase(c, {
        caseId: consultancyCase,
        sections: { personal: { name: "MV-168 second write" } },
        completeness: 9,
      });
      expect(id, "the second write returned null — the resolve branch is missing").not.toBeNull();

      const { data: rows, error } = await fixture.admin
        .from("profiles")
        .select("id, completeness")
        .eq("case_id", consultancyCase);
      expect(error).toBeNull();
      expect((rows ?? []).length, "the resolve branch created a duplicate instead of updating").toBe(1);
      expect((rows as Array<{ completeness: number }>)[0]!.completeness).toBe(9);
    }, 120_000);

    it("CONVERSION 2 — `setObtained` ticks a box on a case with `student_user_id` NULL", async () => {
      // TODAY THIS FAILS SILENTLY. `caseUpsertColumns` returns null for a student-less case,
      // `setObtained` logs and returns `false`, and the route answers 200. So the assertion is
      // THE ROW, read back service-role — never "it did not throw".
      const c = actor("counsellorAssignedA").client;

      const ok = await setObtained(c, consultancyCase, "ielts", true);
      expect(ok, "setObtained refused a consultancy case").toBe(true);

      const { data: rows, error } = await fixture.admin
        .from("document_status")
        .select("case_id, owner, kind, obtained")
        .eq("case_id", consultancyCase);
      expect(error).toBeNull();
      const ticked = (rows ?? []) as Array<{ case_id: string; owner: string | null; obtained: boolean }>;
      expect(ticked.length, "no document_status row landed on the consultancy case").toBe(1);
      expect(ticked[0]!.owner, "a consultancy row carries owner NULL").toBeNull();
      expect(ticked[0]!.case_id, "MV-155's derive trigger must not have re-pointed the row").toBe(consultancyCase);
      expect(ticked[0]!.obtained).toBe(true);
    }, 120_000);

    it("CONVERSION 3 — `upsertProgramState` shortlists a program on a case with `student_user_id` NULL", async () => {
      const c = actor("counsellorAssignedA").client;

      const ok = await upsertProgramState(c, {
        caseId: consultancyCase,
        programId,
        status: "shortlisted",
        notes: "mv168",
      });
      expect(ok, "upsertProgramState refused a consultancy case").toBe(true);

      const { data: rows, error } = await fixture.admin
        .from("user_program_state")
        .select("case_id, owner, program_id, status, notes")
        .eq("case_id", consultancyCase);
      expect(error).toBeNull();
      const state = (rows ?? []) as Array<{ case_id: string; owner: string | null; status: string; notes: string | null }>;
      expect(state.length, "no user_program_state row landed on the consultancy case").toBe(1);
      expect(state[0]!.owner, "a consultancy row carries owner NULL").toBeNull();
      expect(state[0]!.case_id, "MV-155's derive trigger must not have re-pointed the row").toBe(consultancyCase);
      expect(state[0]!.status).toBe("shortlisted");

      // The UPDATE branch: same case, same program, a new status. It must resolve onto the row
      // rather than raise 23505 on `user_program_state_case_program_idx`.
      const again = await upsertProgramState(c, {
        caseId: consultancyCase,
        programId,
        status: "applied",
        notes: "mv168-again",
      });
      expect(again, "the resolve branch of upsertProgramState is missing").toBe(true);
      const { data: after } = await fixture.admin
        .from("user_program_state")
        .select("status, notes")
        .eq("case_id", consultancyCase);
      expect((after ?? []).length, "the resolve branch duplicated the row").toBe(1);
      expect((after as Array<{ status: string }>)[0]!.status).toBe("applied");
    }, 120_000);
  });

  // ===================================================================================
  // The grants themselves, probed directly through the authenticated client.
  // ===================================================================================
  describe("the grants and their policies, as the client meets them", () => {
    it("the counsellor INSERTs a `plan_items` row with `owner` NULL — the inversion of MV-160's pin", async () => {
      const c = actor("counsellorAssignedA").client;
      const { data, error } = await c
        .from("plan_items")
        .insert({
          owner: null,
          case_id: consultancyCase,
          kind: sparePlanKind,
          impact: "high",
          title: "MV-168 counsellor-authored step",
          body: "written through the authenticated client",
          status: "todo",
          lift_estimate: "medium",
          time_estimate: "2 weeks",
        } as never)
        .select("id")
        .single();
      expect(error, `plan_items INSERT failed: ${error?.message}`).toBeNull();
      created.plan_items.push(String((data as { id: number }).id));
    }, 120_000);

    it("REFUSES an INSERT naming ANOTHER USER as `owner` — the third conjunct, proven", async () => {
      // Without `owner IS NULL OR owner = private.case_student_id(case_id)` an actor who may
      // reach a case could write rows ATTRIBUTED TO SOMEONE ELSE inside it. The consultancy
      // case has no student, so every non-null owner is someone else's id.
      const c = actor("counsellorAssignedA").client;
      const foreignOwner = actor("studentB").id;

      const prof = await c
        .from("profiles")
        .insert({ owner: foreignOwner, case_id: consultancyCase, sections: {}, completeness: 0 } as never);
      expect(prof.error?.code, "profiles INSERT must not accept a foreign owner").toBe("42501");

      const plan = await c.from("plan_items").insert({
        owner: foreignOwner,
        case_id: consultancyCase,
        kind: `${sparePlanKind}-foreign`,
        impact: "low",
        title: "attributed to someone else",
        status: "todo",
      } as never);
      expect(plan.error?.code, "plan_items INSERT must not accept a foreign owner").toBe("42501");

      const { data: rows } = await fixture.admin
        .from("plan_items")
        .select("id")
        .eq("case_id", consultancyCase)
        .eq("owner", foreignOwner);
      expect((rows ?? []).length, "a foreign-owner row landed anyway").toBe(0);
    }, 120_000);

    it("REFUSES an INSERT naming a case the actor cannot reach — the second conjunct, proven", async () => {
      const c = actor("counsellorAssignedA").client;

      const prof = await c
        .from("profiles")
        .insert({ owner: null, case_id: unreachableCase, sections: {}, completeness: 0 } as never);
      expect(prof.error?.code, "profiles INSERT crossed the tenant boundary").toBe("42501");

      const plan = await c.from("plan_items").insert({
        owner: null,
        case_id: unreachableCase,
        kind: `${sparePlanKind}-cross`,
        impact: "low",
        title: "cross-tenant",
        status: "todo",
      } as never);
      expect(plan.error?.code, "plan_items INSERT crossed the tenant boundary").toBe("42501");
    }, 120_000);

    it("`assessments` UPDATE succeeds for `is_primary` and is REFUSED for `result`", async () => {
      // The narrowing is the point. `result` and `rule_version` are scoring outputs; a client
      // that can write them mints its own verdict against the server-side rule, which is the
      // trust property this product sells. `is_primary` is a user choice already governed by
      // the partial unique `assessments_case_primary_idx`.
      const { data: seeded, error: seedError } = await fixture.admin
        .from("assessments")
        .insert({
          owner: null,
          case_id: consultancyCase,
          result: { verdict: "possible" },
          rule_version: "mv168-fixture",
          destination_id: "AU",
          is_primary: false,
          profile_snapshot: {},
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never)
        .select("id")
        .single();
      expect(seedError, `HARNESS DEFECT: assessment seed failed: ${seedError?.message}`).toBeNull();
      const assessmentId = (seeded as { id: string }).id;
      created.assessments.push(assessmentId);

      const c = actor("counsellorAssignedA").client;

      const primary = await c.from("assessments").update({ is_primary: true } as never).eq("id", assessmentId);
      expect(primary.error, `is_primary UPDATE failed: ${primary.error?.message}`).toBeNull();
      const { data: afterPrimary } = await fixture.admin
        .from("assessments")
        .select("is_primary")
        .eq("id", assessmentId)
        .single();
      expect((afterPrimary as { is_primary: boolean }).is_primary, "the is_primary UPDATE affected zero rows").toBe(true);

      const forged = await c
        .from("assessments")
        .update({ result: { verdict: "strong" } } as never)
        .eq("id", assessmentId);
      expect(forged.error?.code, "a client must never be able to write `result`").toBe("42501");

      const version = await c.from("assessments").update({ rule_version: "forged" } as never).eq("id", assessmentId);
      expect(version.error?.code, "a client must never be able to write `rule_version`").toBe("42501");

      const { data: intact } = await fixture.admin
        .from("assessments")
        .select("result, rule_version")
        .eq("id", assessmentId)
        .single();
      const row = intact as { result: { verdict?: string }; rule_version: string };
      expect(row.result.verdict, "the verdict was overwritten by a client").toBe("possible");
      expect(row.rule_version).toBe("mv168-fixture");
    }, 120_000);

    it("REFUSES an `assessments` UPDATE across the tenant boundary even on the granted column", async () => {
      const foreignCounsellor = actor("counsellorAssignedB").client;
      const target = created.assessments[0];
      expect(target, "HARNESS DEFECT: the assessments probe must run after the row is seeded").toBeTruthy();

      const { data: before } = await fixture.admin
        .from("assessments")
        .select("is_primary")
        .eq("id", target!)
        .single();
      await foreignCounsellor.from("assessments").update({ is_primary: false } as never).eq("id", target!);
      // An UPDATE whose USING clause matches nothing affects ZERO rows and returns no error.
      // The proof is the row, not the error.
      const { data: after } = await fixture.admin
        .from("assessments")
        .select("is_primary")
        .eq("id", target!)
        .single();
      expect(after, "org B's counsellor changed org A's assessment").toEqual(before);
    }, 120_000);
  });
});
