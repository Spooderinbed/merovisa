/**
 * MV-157 — Real-DB proof that `case_id` is what selects a row, and that every
 * moved `onConflict` target still matches.
 *
 * ## The one thing this suite exists to do
 *
 * Until MV-159 the database still enforces the LEGACY owner-scoped policies on
 * all nine student-owned tables. So a read issued through the **authenticated**
 * client with a `case_id` filter is silently ANDed with `owner = auth.uid()`, and
 * a wrong, missing, or accidentally-still-owner-scoped filter produces correct
 * results in Stage 2 — failing only when MV-159 removes the owner predicate, in
 * the next card, in a different PR, with a different author.
 *
 * **Therefore every case-scoping assertion below runs through the SERVICE-ROLE
 * client with RLS bypassed, so the `case_id` filter alone is what selects the
 * rows.** A test that proves case scoping while RLS is helping proves nothing.
 * (This mirrors MV-153's inverse reasoning: use the client that removes the layer
 * you are not testing.)
 *
 * ## What a mock could not do
 *
 * The partial and full unique indexes, the `ON CONFLICT` arbiter inference that
 * distinguishes them, the definer trigger that derives `case_id` from `owner`,
 * the column-level grants, and `private.mv155_assert_case_backfill()` are all
 * invisible to a supabase-js mock.
 *
 * ## Deferred, recorded so silence is not read as coverage
 *
 *  - **Cross-tenant DENIAL on these nine tables is NOT tested here.** No
 *    case-aware policy exists until MV-159; the database still enforces the
 *    legacy owner predicate, so there is nothing to assert yet.
 *  - **The production-shaped before/after regression is MV-160's**, and it
 *    carries the Stage 2 exit gate with it.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. Excluded from
 * `npm test`; run only by `npm run test:integration`.
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
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import { ensurePersonalCase, resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { getProfileForCase, upsertProfileForCase } from "@/lib/profiles/repo";
import { listShortlistForCase, upsertProgramState } from "@/lib/matches/repo";
import { listObtainedKinds, setObtained } from "@/lib/documents/status-repo";
import { listDocumentsForCase, upsertDocument } from "@/lib/documents/repo";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { getOutcomesForCase, insertAttempt, insertEvent, insertPrediction } from "@/lib/outcomes/repo";
import {
  createAnonymousAssessment,
  getPrimaryAssessmentForCase,
  listAssessmentsForCase,
} from "@/lib/assessments/repo";
import { purgeUnclaimedAnonymousAssessments, ANON_RETENTION_DAYS } from "@/lib/assessments/purge";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isLocalStack = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const { hostname } = new URL(u);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
};

// HARD localhost guard — a gate, not a comment. At MODULE level so the suite
// refuses to LOAD rather than at the first assertion. This file mints auth users
// and writes across all nine student-owned tables.
if (url && !isLocalStack(url)) {
  throw new Error(
    `case-data-access.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "It mints Auth users and writes across every student-owned table. Point it at a local " +
      "`npx supabase start` stack, or unset the variable.",
  );
}

type Actor = { id: string; email: string; caseId: string };

describe.skipIf(!url || !serviceKey || !anonKey)("MV-157 case-aware data access", () => {
  let admin: SupabaseClient<Database>;
  let dbContainer: string;

  const stamp = Date.now();
  const password = `pw-${stamp}-Aa!`;
  const seededUserIds: string[] = [];
  const seededAssessmentIds: string[] = [];

  /** Two personal cases. Every scoping assertion is "A sees A's rows and none of B's". */
  let userA: Actor;
  let userB: Actor;
  let programA: string;
  let programB: string;

  const resolveDbContainer = (): string => {
    if (process.env.SUPABASE_TEST_DB_CONTAINER) return process.env.SUPABASE_TEST_DB_CONTAINER;
    const [first] = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], {
      encoding: "utf8",
    })
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (first === undefined) {
      throw new Error(
        "no running supabase_db_* container found. Start the stack with `npx supabase start`, " +
          "or set SUPABASE_TEST_DB_CONTAINER.",
      );
    }
    return first;
  };

  /**
   * Run SQL as `postgres` inside the stack's DB container. `private` and
   * `pg_index` are not PostgREST-exposed, so a catalogue question cannot be asked
   * through supabase-js at all.
   */
  const sql = (statement: string): string[] =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-c", statement],
      { encoding: "utf8" },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const sqlOne = (statement: string): string => {
    const rows = sql(statement);
    const [only] = rows;
    if (rows.length !== 1 || only === undefined) {
      throw new Error(`expected exactly one row from: ${statement} (got ${rows.length})`);
    }
    return only;
  };

  const sqlError = (statement: string): string => {
    try {
      execFileSync(
        "docker",
        ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-c", statement],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      const e = err as { stderr?: Buffer | string };
      return String(e.stderr ?? "");
    }
    throw new Error(`expected this statement to raise, but it succeeded: ${statement}`);
  };

  /**
   * MV-155's cross-table invariant detector. It is a FUNCTION the tests call, NOT
   * a constraint: a mismatched write is **not rejected at write time**, and
   * nothing will reject one until MV-160 makes `case_id` NOT NULL. Every mutating
   * case in this suite ends with this call — frequency is the compensating
   * control for the missing lock (MV-157 §E, Risk 2).
   */
  const reconcile = (): void => {
    sql("select private.mv155_assert_case_backfill();");
  };

  const mint = async (label: string): Promise<Actor> => {
    const email = `mv157-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `MV157 ${label}` },
    });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);
    const caseId = await ensurePersonalCase(data.user, admin);
    if (caseId === null) throw new Error(`failed to resolve a personal case for ${label}`);
    return { id: data.user.id, email, caseId };
  };

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    dbContainer = resolveDbContainer();

    userA = await mint("a");
    userB = await mint("b");

    const { data: programs } = await admin.from("programs").select("id").limit(2);
    const ids = (programs ?? []).map((p) => p.id);
    if (ids.length < 2) throw new Error("expected at least two seeded programs in the catalogue");
    programA = ids[0]!;
    programB = ids[1]!;
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    if (seededAssessmentIds.length > 0) {
      await admin.from("assessments").delete().in("id", seededAssessmentIds);
    }
    // Owned rows first (the nine case_id FKs are ON DELETE RESTRICT), then the
    // personal cases, then the Auth users.
    for (const table of [
      "outcome_events",
      "application_attempts",
      "program_predictions",
      "document_status",
      "documents",
      "plan_items",
      "assessments",
      "user_program_state",
      "profiles",
    ] as const) {
      await admin.from(table).delete().in("owner", seededUserIds);
    }
    await admin.from("cases").delete().in("student_user_id", seededUserIds).is("organization_id", null);
    for (const id of seededUserIds) await admin.auth.admin.deleteUser(id);
  }, 120_000);

  // ------------------------------------------------------------------
  // Preconditions. MV-157 ships NO migration: it ASSERTS this DDL is present and
  // stops if it is not, rather than "adding just one index" and re-creating the
  // duplicate-migration problem §F exists to remove (Risk 10).
  // ------------------------------------------------------------------
  describe("preconditions inherited from MV-155 / MV-156", () => {
    it("the four ON CONFLICT arbiters are FULL indexes, not partial", () => {
      // A PARTIAL unique index is inferrable as an arbiter only when the
      // statement supplies the predicate, and PostgREST's `on_conflict=` emits a
      // bare column list — so a partial arbiter raises 42P10 at runtime and every
      // upsert this card re-points would be undeliverable (spec §4 rule 1).
      for (const idx of [
        "profiles_case_idx",
        "user_program_state_case_program_idx",
        "documents_case_kind_idx",
        "document_status_case_kind_idx",
      ]) {
        expect(sqlOne(`select (indpred is null) from pg_index where indexrelid = '${idx}'::regclass;`)).toBe("t");
      }
    });

    it("the two DOMAIN-predicated case uniques keep their predicate, and neither is an arbiter", () => {
      // `is_primary` and `status = 'todo'` are domain rules, not the nullable
      // window; nothing upserts against either.
      expect(sqlOne("select (indpred is null) from pg_index where indexrelid = 'assessments_case_primary_idx'::regclass;")).toBe("f");
      expect(sqlOne("select (indpred is null) from pg_index where indexrelid = 'plan_items_case_kind_open_idx'::regclass;")).toBe("f");
    });

    it("cases_personal_student_idx exists and is the partial unique the resolver relies on", () => {
      expect(sqlOne("select indisunique from pg_index where indexrelid = 'cases_personal_student_idx'::regclass;")).toBe("t");
      expect(sqlOne("select pg_get_indexdef('cases_personal_student_idx'::regclass);")).toContain("organization_id IS NULL");
    });

    it("user_program_state and document_status arrive with SURROGATE primary keys", () => {
      // Both historically carried `owner` INSIDE the PK, which a `drop not null`
      // cannot touch. MV-156 replaced them; this card verifies rather than
      // improvises (Risk 6).
      for (const table of ["user_program_state", "document_status"]) {
        expect(sqlOne(`select pg_get_constraintdef(oid) from pg_constraint where contype = 'p' and conrelid = '${table}'::regclass;`))
          .toBe("PRIMARY KEY (id)");
      }
    });

    it("BOTH index generations are live — the legacy owner-scoped uniques survive to MV-160", () => {
      for (const idx of [
        "assessments_primary_idx",
        "plan_items_kind_open_idx",
        "profiles_owner_key",
        "documents_owner_kind_key",
        "user_program_state_owner_program_idx",
        "document_status_owner_kind_idx",
      ]) {
        expect(sql(`select 1 from pg_class where relname = '${idx}';`)).toEqual(["1"]);
      }
    });

    it("Stage 2 grants NO UPDATE(case_id) on either upsert-seam table", () => {
      // This is the whole reason `case_id` must stay OUT of those two payloads.
      for (const table of ["user_program_state", "document_status"]) {
        expect(
          sql(
            `select column_name from information_schema.column_privileges ` +
              `where grantee = 'authenticated' and privilege_type = 'UPDATE' ` +
              `and table_name = '${table}' and column_name = 'case_id';`,
          ),
        ).toEqual([]);
      }
    });
  });

  // ------------------------------------------------------------------
  // Personal-case resolution.
  // ------------------------------------------------------------------
  describe("personal case resolution", () => {
    it("is 1:1 with the owner — ensurePersonalCase twice yields ONE case", async () => {
      // Risk 4: keeping both index generations is safe ONLY because a personal
      // case is 1:1 with an owner. If that ever broke, the legacy and case-scoped
      // indexes would stop agreeing and writes would start failing in production
      // for a reason that reads like an application bug.
      const { data } = await admin.auth.admin.getUserById(userA.id);
      const again = await ensurePersonalCase(data.user!, admin);
      expect(again).toBe(userA.caseId);
      expect(sqlOne(
        `select count(*) from public.cases where organization_id is null and student_user_id = '${userA.id}';`,
      )).toBe("1");
    });

    it("never returns an organization case for the same student", async () => {
      const orgId = sqlOne(
        `with ins as (insert into public.organizations (name, slug) ` +
          `values ('MV157 Org ${stamp}', 'mv157-org-${stamp}') returning id) select id from ins;`,
      );
      const orgCaseId = sqlOne(
        `with ins as (insert into public.cases (display_name, student_user_id, organization_id) ` +
          `values ('MV157 org case', '${userA.id}', '${orgId}') returning id) select id from ins;`,
      );
      try {
        expect(await resolvePersonalCaseId(userA.id, admin)).toBe(userA.caseId);
        expect(await resolvePersonalCaseId(userA.id, admin)).not.toBe(orgCaseId);
      } finally {
        sql(`delete from public.cases where id = '${orgCaseId}';`);
        sql(`delete from public.organizations where id = '${orgId}';`);
      }
    });

    it("an AUTHENTICATED client cannot create its own personal case — measured, not assumed", () => {
      // FINDING recorded in the spec (§5): `cases_insert_admin` is the only INSERT
      // policy on `cases` and its WITH CHECK requires `organization_id IS NOT
      // NULL`, so a student creating their own organization-less personal case is
      // refused. That is why `ensurePersonalCase` is handed a service-role client
      // by the sign-in seam, and why no page or ordinary route can create one.
      const err = sqlError(
        `begin; set local role authenticated; ` +
          `set local request.jwt.claims = '{"sub":"${userB.id}","role":"authenticated"}'; ` +
          `insert into public.cases (display_name, student_user_id, organization_id) ` +
          `values ('probe', '${userB.id}', null); rollback;`,
      );
      expect(err).toContain("violates row-level security policy");
    });
  });

  // ------------------------------------------------------------------
  // THE CENTRAL PROBE. Service-role, RLS bypassed: the case_id filter alone is
  // what selects the rows.
  // ------------------------------------------------------------------
  describe("case_id is what selects the rows (service-role, RLS bypassed)", () => {
    beforeAll(async () => {
      // Seed one row per table for BOTH cases, through the real repositories, so
      // the dual-write path under test is the one that produced the fixture.
      for (const [actor, program] of [
        [userA, programA],
        [userB, programB],
      ] as const) {
        await upsertProfileForCase(admin, {
          caseId: actor.caseId,
          sections: { personal: { name: `Owner ${actor.id.slice(0, 8)}` } },
          completeness: 10,
        });
        await upsertProgramState(admin, { caseId: actor.caseId, programId: program, status: "shortlisted" });
        await setObtained(admin, actor.caseId, "passport", true);
        await upsertDocument(admin, {
          caseId: actor.caseId,
          kind: "ielts",
          filePath: `${actor.id}/ielts/score.pdf`,
          fileSize: 100,
          originalName: "score.pdf",
        });

        const assessmentId = sqlOne(
          `with ins as (insert into public.assessments ` +
            `(owner, case_id, result, profile_snapshot, rule_version, expires_at, is_primary, destination_id) ` +
            `values ('${actor.id}', '${actor.caseId}', '{}'::jsonb, '{}'::jsonb, 'v1', now() + interval '30 days', true, 'australia') ` +
            `returning id) select id from ins;`,
        );
        seededAssessmentIds.push(assessmentId);
        sql(
          `insert into public.plan_items (owner, case_id, kind, impact, title, status) ` +
            `values ('${actor.id}', '${actor.caseId}', 'set-name', 'high', 'Add your name', 'todo');`,
        );

        const prediction = await insertPrediction(admin, {
          caseId: actor.caseId,
          assessmentId,
          programId: program,
          verdict: "strong",
          ruleVersion: "v1",
          scoreSnapshot: {},
        });
        const attempt = await insertAttempt(admin, {
          caseId: actor.caseId,
          predictionId: prediction!.row.id,
          programId: program,
        });
        await insertEvent(admin, {
          caseId: actor.caseId,
          attemptId: attempt!.id,
          eventType: "applied",
          gate: null,
          decisionAuthority: "student",
          source: "self_reported",
          occurredAt: new Date().toISOString(),
        });
      }
      reconcile();
    }, 120_000);

    it("profiles: case A's read returns A's row and none of B's", async () => {
      const a = await getProfileForCase(admin, userA.caseId);
      expect(a?.case_id).toBe(userA.caseId);
      expect(a?.owner).toBe(userA.id);
      const b = await getProfileForCase(admin, userB.caseId);
      expect(b?.case_id).toBe(userB.caseId);
      expect(a?.id).not.toBe(b?.id);
    });

    it("assessments: primary + list are case-scoped", async () => {
      const primary = await getPrimaryAssessmentForCase(admin, userA.caseId);
      expect(primary?.case_id).toBe(userA.caseId);
      const all = await listAssessmentsForCase(admin, userA.caseId);
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((r) => r.case_id === userA.caseId)).toBe(true);
    });

    it("plan_items: the list is case-scoped", async () => {
      const items = await listAllPlanForCase(admin, userA.caseId);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.owner === userA.id)).toBe(true);
      expect((await listAllPlanForCase(admin, userB.caseId)).every((i) => i.owner === userB.id)).toBe(true);
    });

    it("user_program_state: the shortlist is case-scoped", async () => {
      expect((await listShortlistForCase(admin, userA.caseId)).map((s) => s.programId)).toEqual([programA]);
      expect((await listShortlistForCase(admin, userB.caseId)).map((s) => s.programId)).toEqual([programB]);
    });

    it("documents: the vault is case-scoped", async () => {
      const docs = await listDocumentsForCase(admin, userA.caseId);
      expect(docs).toHaveLength(1);
      expect(docs[0]!.owner).toBe(userA.id);
    });

    it("document_status: the checklist is case-scoped", async () => {
      expect([...(await listObtainedKinds(admin, userA.caseId))]).toEqual(["passport"]);
      expect([...(await listObtainedKinds(admin, userB.caseId))]).toEqual(["passport"]);
      // Same KIND for both cases — which is exactly why the (case_id, kind)
      // uniqueness has to be per case and not global.
      expect(sqlOne(
        `select count(*) from public.document_status where kind = 'passport' and owner in ('${userA.id}','${userB.id}');`,
      )).toBe("2");
    });

    it("the outcome chain: predictions, attempts and events are case-scoped", async () => {
      const a = await getOutcomesForCase(admin, userA.caseId);
      const b = await getOutcomesForCase(admin, userB.caseId);
      expect(a.predictions).toHaveLength(1);
      expect(a.attempts).toHaveLength(1);
      expect(a.events).toHaveLength(1);
      expect(a.predictions[0]!.owner).toBe(userA.id);
      expect(b.predictions[0]!.owner).toBe(userB.id);
      expect(a.attempts[0]!.id).not.toBe(b.attempts[0]!.id);
    });

    it("a case with no rows returns empty, not another case's rows", async () => {
      const orphanCase = sqlOne(
        `with ins as (insert into public.cases (display_name, student_user_id, organization_id) ` +
          `values ('MV157 empty', null, null) returning id) select id from ins;`,
      );
      try {
        expect(await getProfileForCase(admin, orphanCase)).toBeNull();
        expect(await listShortlistForCase(admin, orphanCase)).toEqual([]);
        expect(await listDocumentsForCase(admin, orphanCase)).toEqual([]);
        expect(await listAllPlanForCase(admin, orphanCase)).toEqual([]);
      } finally {
        sql(`delete from public.cases where id = '${orphanCase}';`);
      }
    });
  });

  // ------------------------------------------------------------------
  // Dual-write.
  // ------------------------------------------------------------------
  describe("the dual-write rule", () => {
    it("every insert path leaves case_id set and owner equal to the case's student_user_id", () => {
      for (const table of [
        "profiles",
        "assessments",
        "plan_items",
        "user_program_state",
        "documents",
        "document_status",
        "program_predictions",
        "application_attempts",
        "outcome_events",
      ]) {
        expect(sqlOne(
          `select count(*) from public.${table} t join public.cases c on c.id = t.case_id ` +
            `where t.owner in ('${userA.id}','${userB.id}') and c.student_user_id is distinct from t.owner;`,
        )).toBe("0");
        expect(sqlOne(
          `select count(*) from public.${table} where owner in ('${userA.id}','${userB.id}') and case_id is null;`,
        )).toBe("0");
      }
      reconcile();
    });

    it("a deliberately MISMATCHED write is DETECTED — and nothing rejects it at write time", () => {
      // Read this carefully, because the SHAPE of the guarantee is the point.
      // MV-155 §F ships an assertion FUNCTION, not a CHECK: the invariant is
      // cross-table and no constraint can express it. So the write below
      // SUCCEEDS — no error, no rejection — and is caught only because a test
      // calls the detector afterwards.
      //
      // The single write-time guard in Stage 2 is `lib/cases/dual-write.ts`
      // deriving `owner` from `cases.student_user_id`, which is why no repository
      // signature may accept both. That guard is unbacked until MV-160 makes
      // `case_id` NOT NULL (MV-157 §E, Risk 2).
      //
      // `documents` + a kind case B does NOT hold is deliberate. Attempting the
      // same corruption on `profiles` gets rejected 23505 by `profiles_case_idx`
      // — but only INCIDENTALLY, because the target case already had a profile.
      // Reading that as "the database protects the invariant" is exactly the
      // false confidence this test exists to remove: the moment the target case
      // has no row of that kind, the mismatched write lands silently.
      const docId = sqlOne(
        "with ins as (insert into public.documents (owner, case_id, kind, file_path, file_size, original_name) " +
          `values ('${userA.id}', '${userA.caseId}', 'coe', 'mismatch-probe', 1, 'x') returning id) select id from ins;`,
      );
      try {
        sql(`update public.documents set case_id = '${userB.caseId}' where id = '${docId}';`);
        // No error above — the corruption is now sitting in the table.
        expect(sqlError("select private.mv155_assert_case_backfill();")).toContain("case_id");
      } finally {
        sql(`delete from public.documents where id = '${docId}';`);
      }
      reconcile();
    });
  });

  // ------------------------------------------------------------------
  // The moved onConflict targets. A missed target does NOT error — it inserts a
  // duplicate or raises 42P10 — so upsert-twice is the only assertion that can
  // tell "target matched" from "target silently missed" (Risk 3).
  // ------------------------------------------------------------------
  describe("every moved onConflict target actually matches", () => {
    it("upsertProfileForCase — twice yields ONE row", async () => {
      await upsertProfileForCase(admin, { caseId: userA.caseId, sections: {}, completeness: 1 });
      await upsertProfileForCase(admin, { caseId: userA.caseId, sections: {}, completeness: 2 });
      expect(sqlOne(`select count(*) from public.profiles where case_id = '${userA.caseId}';`)).toBe("1");
      expect(sqlOne(`select completeness from public.profiles where case_id = '${userA.caseId}';`)).toBe("2");
      reconcile();
    });

    it("upsertProgramState — twice yields ONE row, and the payload carries no case_id", async () => {
      expect(await upsertProgramState(admin, { caseId: userA.caseId, programId: programA, status: "shortlisted" })).toBe(true);
      expect(await upsertProgramState(admin, { caseId: userA.caseId, programId: programA, status: "applied" })).toBe(true);
      expect(sqlOne(
        `select count(*) from public.user_program_state where case_id = '${userA.caseId}' and program_id = '${programA}';`,
      )).toBe("1");
      expect(sqlOne(
        `select status from public.user_program_state where case_id = '${userA.caseId}' and program_id = '${programA}';`,
      )).toBe("applied");
      reconcile();
    });

    it("setObtained — twice yields ONE row", async () => {
      await setObtained(admin, userA.caseId, "ielts", true);
      await setObtained(admin, userA.caseId, "ielts", true);
      expect(sqlOne(
        `select count(*) from public.document_status where case_id = '${userA.caseId}' and kind = 'ielts';`,
      )).toBe("1");
      reconcile();
    });

    it("upsertDocument — twice yields ONE row (the C-8 atomic replace, now case-keyed)", async () => {
      await upsertDocument(admin, {
        caseId: userA.caseId, kind: "passport", filePath: `${userA.id}/passport/a.png`, fileSize: 1, originalName: "a.png",
      });
      await upsertDocument(admin, {
        caseId: userA.caseId, kind: "passport", filePath: `${userA.id}/passport/b.png`, fileSize: 2, originalName: "b.png",
      });
      expect(sqlOne(
        `select count(*) from public.documents where case_id = '${userA.caseId}' and kind = 'passport';`,
      )).toBe("1");
      expect(sqlOne(
        `select file_path from public.documents where case_id = '${userA.caseId}' and kind = 'passport';`,
      )).toBe(`${userA.id}/passport/b.png`);
      reconcile();
    });

    it("a payload naming case_id on an upsert-seam table is 42501 — the failure the comments exist to prevent", () => {
      // Proves the rule rather than restating it: `case_id` in the payload
      // compiles to an ON CONFLICT DO UPDATE SET list that names it, the
      // privilege check happens at plan time, and Stage 2 grants no
      // UPDATE(case_id). Driven as `authenticated`, which is what
      // /api/documents/status actually is.
      const err = sqlError(
        `begin; set local role authenticated; ` +
          `set local request.jwt.claims = '{"sub":"${userA.id}","role":"authenticated"}'; ` +
          `insert into public.document_status (owner, kind, obtained, case_id) ` +
          `values ('${userA.id}', 'coe', true, '${userA.caseId}') ` +
          `on conflict (case_id, kind) do update set case_id = excluded.case_id; rollback;`,
      );
      expect(err).toMatch(/permission denied|42501/i);
    });
  });

  // ------------------------------------------------------------------
  // Both index generations bite, each with a positive control so "nobody can
  // insert" cannot pass as "uniqueness works".
  // ------------------------------------------------------------------
  describe("MV-155's case-scoped uniques bite, and agree with the legacy ones", () => {
    it("documents (case_id, kind): a duplicate is 23505, a different kind is accepted", () => {
      const dup = sqlError(
        `insert into public.documents (owner, case_id, kind, file_path, file_size, original_name) ` +
          `values ('${userA.id}', '${userA.caseId}', 'passport', 'x', 1, 'x');`,
      );
      expect(dup).toMatch(/duplicate key|23505/i);
      // Positive control — the legal second row IS accepted.
      sql(
        `insert into public.documents (owner, case_id, kind, file_path, file_size, original_name) ` +
          `values ('${userA.id}', '${userA.caseId}', 'coe', 'y', 1, 'y');`,
      );
      expect(sqlOne(`select count(*) from public.documents where case_id = '${userA.caseId}' and kind = 'coe';`)).toBe("1");
      sql(`delete from public.documents where case_id = '${userA.caseId}' and kind = 'coe';`);
      reconcile();
    });

    it("for a personal case the two generations are the SAME write — which is why keeping both is safe", () => {
      // A duplicate (case_id, kind) row for a personal case is necessarily also a
      // duplicate (owner, kind) row, because owner ↔ personal case is 1:1. That
      // equivalence is the whole reason the legacy indexes can survive to MV-160.
      const byCase = sqlOne(
        `select count(*) from public.documents where case_id = '${userA.caseId}' and kind = 'ielts';`,
      );
      const byOwner = sqlOne(
        `select count(*) from public.documents where owner = '${userA.id}' and kind = 'ielts';`,
      );
      expect(byCase).toBe(byOwner);
    });

    it("assessments (case_id) where is_primary: a second primary for one case is 23505", () => {
      const err = sqlError(
        `insert into public.assessments ` +
          `(owner, case_id, result, profile_snapshot, rule_version, expires_at, is_primary, destination_id) ` +
          `values ('${userA.id}', '${userA.caseId}', '{}'::jsonb, '{}'::jsonb, 'v1', now() + interval '30 days', true, 'australia');`,
      );
      expect(err).toMatch(/duplicate key|23505/i);
      // Positive control: a NON-primary second assessment is accepted.
      const extra = sqlOne(
        `with ins as (insert into public.assessments ` +
          `(owner, case_id, result, profile_snapshot, rule_version, expires_at, is_primary, destination_id) ` +
          `values ('${userA.id}', '${userA.caseId}', '{}'::jsonb, '{}'::jsonb, 'v1', now() + interval '30 days', false, 'australia') ` +
          `returning id) select id from ins;`,
      );
      sql(`delete from public.assessments where id = '${extra}';`);
      reconcile();
    });
  });

  // ------------------------------------------------------------------
  // Anonymous rows stay case-less. MV-157 must not quietly stop retention.
  // ------------------------------------------------------------------
  describe("anonymous assessments stay case-less", () => {
    it("createAnonymousAssessment writes owner NULL and case_id NULL, and the purge still matches it", async () => {
      const expired = new Date(Date.now() - (ANON_RETENTION_DAYS + 1) * MS_PER_DAY).toISOString();
      const id = await createAnonymousAssessment(admin, {
        profileSnapshot: {},
        destinationId: "australia",
        result: {},
        ruleVersion: "v1",
        expiresAt: expired,
      });
      expect(id).not.toBeNull();

      expect(sqlOne(`select (owner is null and case_id is null) from public.assessments where id = '${id}';`)).toBe("t");

      // MV-135's predicate is three-part — `owner IS NULL AND expires_at < now
      // AND created_at < cutoff` — and the repo stamps `created_at` with now().
      // Backdate it, or the row is never a purge CANDIDATE and this test would
      // pass while proving nothing about the purge at all.
      sql(`update public.assessments set created_at = '${expired}' where id = '${id}';`);

      // `lib/assessments/purge.ts` is UNCHANGED by this card and asserted so: an
      // anonymous row is DEFINED by `owner IS NULL` (spec §3), and MV-135's
      // predicate keys on exactly that. Re-keying it to `case_id is null` would
      // make a claimed row whose case_id write was lost deletable — which is why
      // MV-158 pins it twice more.
      await purgeUnclaimedAnonymousAssessments(admin);
      expect(sqlOne(`select count(*) from public.assessments where id = '${id}';`)).toBe("0");
      reconcile();
    });

    it("an OWNED row with a null case_id survives the purge", async () => {
      // The exact residue of a partially-applied claim. It must not be deletable.
      const expired = new Date(Date.now() - (ANON_RETENTION_DAYS + 1) * MS_PER_DAY).toISOString();
      const id = sqlOne(
        `with ins as (insert into public.assessments ` +
          `(owner, case_id, result, profile_snapshot, rule_version, created_at, expires_at, is_primary, destination_id, claimed_at) ` +
          `values ('${userA.id}', null, '{}'::jsonb, '{}'::jsonb, 'v1', '${expired}', '${expired}', false, 'australia', now()) ` +
          `returning id) select id from ins;`,
      );
      try {
        await purgeUnclaimedAnonymousAssessments(admin);
        expect(sqlOne(`select count(*) from public.assessments where id = '${id}';`)).toBe("1");
      } finally {
        sql(`delete from public.assessments where id = '${id}';`);
      }
      reconcile();
    });
  });
});
