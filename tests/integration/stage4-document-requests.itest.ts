/**
 * MV-182 — Stage 4 slice 1: the document chase list, asserted against a real database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs against
 * a stack it hosts itself.
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
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 * `tests/cases/document-requests-repo.test.ts` and `tests/api/document-request-routes.test.ts`
 * prove the APP layer: which claim each route asks for, which case id it forwards, and how
 * each failure is named. Neither can prove Postgres agrees, and the app layer is explicitly
 * NOT the tenant boundary (`lib/cases/README.md`) — RLS evaluated as the authenticated user
 * is. Delete every `checkCasePermission` call in this slice and both of those suites go red;
 * delete the three policies and they stay green.
 *
 * **AN RLS SUITE THAT ONLY ASSERTS DENIALS PASSES IDENTICALLY AGAINST A MISSING POLICY.**
 * A table with RLS forced and no policy at all denies everything — so "the outsider saw
 * nothing" is satisfied by a broken migration just as well as by a correct one. Every denial
 * below is therefore PAIRED with the positive case that proves the policy admits the actor it
 * is supposed to admit, and every silent denial is paired with a service-role existence proof
 * so it cannot be satisfied by a fixture that never seeded.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. A probe issued on the service-role client bypasses
 * every policy and proves nothing; the harness self-check in `fixtures/tenancy.ts` covers the
 * clients this file uses because they come from `fixture.actors`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";

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

assertLocalStack("stage4-document-requests.itest.ts", url);

const TABLE = "case_document_requests";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-182 Stage 4 case document requests", () => {
  let fixture: TenancyFixture;
  let dbContainer: string;

  /**
   * `orgAssignedA` — organization A, `student_user_id = studentA`, `counsellorAssignedA` is its
   * primary counsellor. The shape that lets every actor in the matrix be asked about ONE case:
   * an assigned counsellor, an unassigned colleague, an org admin, the linked student, and a
   * stranger from organization B.
   */
  let caseA: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let caseB: string;
  /** A personal case — `organization_id IS NULL`. A consultancy request cannot exist on one. */
  let personalCase: string;

  /** Rows this file created, removed before `fixture.teardown()`. */
  const created: string[] = [];

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  const sqlLines = (statement: string): string[] =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { encoding: "utf8", input: statement },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  /** A well-formed request row for `caseId`, attributed to `requestedBy`. */
  const requestRow = (caseId: string, organizationId: string | null, requestedBy: string) => ({
    case_id: caseId,
    organization_id: organizationId,
    kind: "passport",
    title: `MV-182 probe ${fixture.stamp}-${created.length}`,
    requested_by: requestedBy,
  });

  /** Seed a request through the SERVICE ROLE, so a read denial has something real to deny. */
  const seedRequest = async (caseId: string, organizationId: string, requestedBy: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(TABLE)
      .insert(requestRow(caseId, organizationId, requestedBy) as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    created.push(data.id);
    return data.id;
  };

  /**
   * Turns "the fixture never seeded this" into a loud failure instead of a passing denial.
   * A silent RLS refusal and a missing row are the SAME observation from the actor's side.
   */
  const proveExists = async (id: string): Promise<void> => {
    const { data, error } = await fixture.admin.from(TABLE).select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`HARNESS DEFECT: existence proof failed: ${error.message}`);
    if (!data) {
      throw new Error(
        `HARNESS DEFECT: ${TABLE} row ${id} does not exist, so "sees nothing" proves nothing.`,
      );
    }
  };

  let seededOnA: string;

  beforeAll(async () => {
    dbContainer =
      process.env.SUPABASE_TEST_DB_CONTAINER ??
      execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean)[0]!;

    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    caseA = fixture.cases.orgAssignedA;
    caseB = fixture.cases.orgAssignedB;
    personalCase = fixture.cases.personalA;

    seededOnA = await seedRequest(caseA, fixture.orgA, actor("adminA").id);
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    // Requests cascade from their case, but the personal case and any probe row on it do not
    // belong to an organization — so they are removed explicitly, before teardown.
    if (created.length) await fixture.admin.from(TABLE).delete().in("id", created);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The table exists in the shape the migration claims
  // ===================================================================================
  describe("the migration landed", () => {
    it("has RLS enabled AND forced", () => {
      const rows = sqlLines(`
        select c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = '${TABLE}';
      `);
      // `force` is the load-bearing half: without it the migration role that OWNS the table is
      // exempt from every policy below, and the whole file would be measuring nothing.
      expect(rows).toEqual(["true|true"]);
    });

    it("grants exactly the three verbs, at exactly the columns the migration names", () => {
      const insert = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${TABLE}' and privilege_type = 'INSERT' order by 1;
      `);
      expect(insert).toEqual([
        "case_id",
        "due_at",
        "kind",
        "note",
        "organization_id",
        "requested_by",
        "title",
      ]);

      const update = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${TABLE}' and privilege_type = 'UPDATE' order by 1;
      `);
      // Widening this to `resolved_at` would let a client date its own resolution; to
      // `case_id` or `organization_id`, re-point the row into another case or tenant.
      expect(update).toEqual(["status"]);

      const del = sqlLines(`
        select privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${TABLE}' and privilege_type = 'DELETE';
      `);
      // DELETE is table-level and never appears in `column_privileges` at all — reading it
      // from the wrong catalogue is a filter that can never fail (MV-168 §4 (4)).
      expect(del).toEqual([]);
    });

    it("carries all three policies, each attached to the verb it claims", () => {
      const rows = sqlLines(`
        select p.polname || '|' || p.polcmd from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = '${TABLE}' order by 1;
      `);
      expect(rows).toEqual([
        `${TABLE}_insert_staff|a`,
        `${TABLE}_select_case|r`,
        `${TABLE}_update_staff|w`,
      ]);
    });
  });

  // ===================================================================================
  // READ — `actor_case_ids()`, which includes the linked student
  // ===================================================================================
  describe("reading the chase list", () => {
    it("the ASSIGNED counsellor sees their case's requests", async () => {
      const { data, error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .select("id")
        .eq("case_id", caseA);

      expect(error, `a SELECT must never error under RLS, it filters: ${error?.message}`).toBeNull();
      // THE POSITIVE HALF. Without it every denial below is satisfied by a missing policy.
      expect((data ?? []).map((row) => row.id)).toContain(seededOnA);
    });

    it("the org ADMIN sees them too — whole-organization scope", async () => {
      const { data, error } = await actor("adminA").client.from(TABLE).select("id").eq("case_id", caseA);

      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.id)).toContain(seededOnA);
    });

    it("the LINKED STUDENT may read what has been asked of them", async () => {
      const { data, error } = await actor("studentA").client.from(TABLE).select("id").eq("case_id", caseA);

      expect(error).toBeNull();
      // The matrix cell `student × case.read = linked` promises this, and the Stage 5 surface
      // that shows it depends on the policy already admitting them.
      expect((data ?? []).map((row) => row.id)).toContain(seededOnA);
    });

    it("an UNASSIGNED counsellor in the same organization sees nothing", async () => {
      await proveExists(seededOnA);
      const { data, error } = await actor("counsellorUnassignedA").client.from(TABLE).select("id");

      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.id)).not.toContain(seededOnA);
    });

    it("organization B sees nothing — the tenant boundary", async () => {
      await proveExists(seededOnA);
      for (const key of ["ownerB", "counsellorAssignedB", "outsider"] as const) {
        const { data, error } = await actor(key).client.from(TABLE).select("id");
        expect(error, `${key}: ${error?.message}`).toBeNull();
        expect((data ?? []).map((row) => row.id), key).not.toContain(seededOnA);
      }
    });

    it("an anonymous client sees nothing", async () => {
      await proveExists(seededOnA);
      const { data } = await fixture.anon.from(TABLE).select("id");
      expect((data ?? []).map((row) => row.id)).not.toContain(seededOnA);
    });
  });

  // ===================================================================================
  // INSERT — `can_staff_case` AND the org axis AND the provenance axis
  // ===================================================================================
  describe("asking a case for a document", () => {
    it("the ASSIGNED counsellor may, and the row lands outstanding with no resolution date", async () => {
      const c = actor("counsellorAssignedA");
      const { data, error } = await c.client
        .from(TABLE)
        .insert(requestRow(caseA, fixture.orgA, c.id) as never)
        .select("id")
        .single();

      expect(error, `the assigned counsellor was refused: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      created.push(data!.id);

      // THE ROW, not the return value. `status` and `resolved_at` carry no INSERT grant, so
      // their values here are the column defaults — which is the whole point of withholding them.
      const { data: row } = await fixture.admin
        .from(TABLE)
        .select("status, resolved_at, organization_id, requested_by")
        .eq("id", data!.id)
        .single();
      expect(row!.status).toBe("outstanding");
      expect(row!.resolved_at).toBeNull();
      expect(row!.organization_id).toBe(fixture.orgA);
      expect(row!.requested_by).toBe(c.id);
    }, 60_000);

    it("an UNASSIGNED counsellor in the same organization may NOT", async () => {
      const c = actor("counsellorUnassignedA");
      const { data, error } = await c.client
        .from(TABLE)
        .insert(requestRow(caseA, fixture.orgA, c.id) as never)
        .select("id");

      // `can_staff_case`'s counsellor arm requires BOTH an active membership and a
      // `case_assignments` row. This actor has the first and not the second.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("the LINKED STUDENT may NOT — their own link must not launder them into the counsellor's chair", async () => {
      const s = actor("studentA");
      const { data, error } = await s.client
        .from(TABLE)
        .insert(requestRow(caseA, fixture.orgA, s.id) as never)
        .select("id");

      // This is the exact reason the INSERT policy uses `can_staff_case` rather than
      // `can_access_case` or `actor_case_ids()`: the student holds a genuine grant on this
      // case for READING, and either of those predicates would carry it into WRITING.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("organization B may NOT, on organization A's case", async () => {
      const b = actor("ownerB");
      const { data, error } = await b.client
        .from(TABLE)
        .insert(requestRow(caseA, fixture.orgA, b.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("A FORGED organization_id is refused even for an actor who may staff the case", async () => {
      const c = actor("counsellorAssignedA");
      const { data, error } = await c.client
        .from(TABLE)
        // Org B's id on org A's case. Without the `organization_id = case_org_id(case_id)`
        // conjunct this lands, and every organization-scoped report built on the table later
        // counts it under the wrong tenant.
        .insert(requestRow(caseA, fixture.orgB, c.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("A FORGED requested_by is refused — one counsellor cannot attribute a request to another", async () => {
      const c = actor("counsellorAssignedA");
      const { data, error } = await c.client
        .from(TABLE)
        .insert(requestRow(caseA, fixture.orgA, actor("adminA").id) as never)
        .select("id");

      // Without `requested_by = auth.uid()`, "who chased this" stops being evidence of anything.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("a PERSONAL case can carry no request — it has no organization to belong to", async () => {
      const s = actor("studentA");
      const { data, error } = await s.client
        .from(TABLE)
        .insert(requestRow(personalCase, null, s.id) as never)
        .select("id");

      // `organization_id` is NOT NULL, and the policy's `= case_org_id(case_id)` compares
      // against NULL there — a WITH CHECK admits only TRUE, so both halves refuse.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("naming an ungranted column is refused at plan time, whoever asks", async () => {
      const c = actor("counsellorAssignedA");
      for (const forged of [
        { status: "resolved" },
        { resolved_at: new Date().toISOString() },
        { created_at: new Date(0).toISOString() },
      ]) {
        const { data, error } = await c.client
          .from(TABLE)
          .insert({ ...requestRow(caseA, fixture.orgA, c.id), ...forged } as never)
          .select("id");

        expect(data ?? [], JSON.stringify(forged)).toHaveLength(0);
        // 42501: the privilege check happens at plan time, so this fails even though the
        // actor may legitimately insert every OTHER column of the same row.
        expect(error?.code, JSON.stringify(forged)).toBe("42501");
      }
    });
  });

  // ===================================================================================
  // UPDATE — resolving, and the trigger that stamps the date
  // ===================================================================================
  describe("resolving a request", () => {
    it("the ASSIGNED counsellor may, and the TRIGGER stamps resolved_at", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);

      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .update({ status: "resolved" })
        .eq("id", id);
      expect(error, `the assigned counsellor was refused: ${error?.message}`).toBeNull();

      const { data: row } = await fixture.admin
        .from(TABLE)
        .select("status, resolved_at")
        .eq("id", id)
        .single();
      expect(row!.status).toBe("resolved");
      // `resolved_at` is client-ungrantable, so nothing but the trigger can have written this.
      // Drop the trigger and every resolved request loses its date, silently.
      expect(row!.resolved_at).not.toBeNull();
    }, 60_000);

    it("re-resolving does not re-stamp, and re-opening clears the stamp", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);
      const c = actor("counsellorAssignedA").client;

      await c.from(TABLE).update({ status: "resolved" }).eq("id", id);
      const first = await fixture.admin.from(TABLE).select("resolved_at").eq("id", id).single();

      await c.from(TABLE).update({ status: "resolved" }).eq("id", id);
      const second = await fixture.admin.from(TABLE).select("resolved_at").eq("id", id).single();
      // An idempotent write must not move the date — "received on the 3rd" is a fact about
      // the document, not about the last time somebody clicked.
      expect(second.data!.resolved_at).toBe(first.data!.resolved_at);

      await c.from(TABLE).update({ status: "outstanding" }).eq("id", id);
      const third = await fixture.admin.from(TABLE).select("resolved_at").eq("id", id).single();
      // A stale date beside "outstanding" would render as two facts that contradict, with no
      // way for a reader to tell which half is the lie.
      expect(third.data!.resolved_at).toBeNull();
    }, 60_000);

    it("an UNASSIGNED counsellor, the LINKED STUDENT and organization B may NOT resolve", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);

      for (const key of ["counsellorUnassignedA", "studentA", "ownerB", "outsider"] as const) {
        const { error } = await actor(key).client.from(TABLE).update({ status: "resolved" }).eq("id", id);
        // A policy refusal on UPDATE is ZERO ROWS AND NO ERROR, so the error is not the
        // evidence — the row is. Reading it back through the service role is what tells a
        // refusal apart from a success.
        const { data: row } = await fixture.admin.from(TABLE).select("status").eq("id", id).single();
        expect(row!.status, `${key} resolved a request they may not touch (error: ${error?.message})`).toBe(
          "outstanding",
        );
      }
    }, 60_000);

    it("nobody may re-point a request into another case or another tenant", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);
      const c = actor("counsellorAssignedA").client;

      for (const forged of [{ case_id: caseB }, { organization_id: fixture.orgB }]) {
        const { error } = await c.from(TABLE).update(forged as never).eq("id", id);
        expect(error?.code, JSON.stringify(forged)).toBe("42501");
      }

      const { data: row } = await fixture.admin
        .from(TABLE)
        .select("case_id, organization_id")
        .eq("id", id)
        .single();
      expect(row!.case_id).toBe(caseA);
      expect(row!.organization_id).toBe(fixture.orgA);
    }, 60_000);

    it("nobody may hand-write resolved_at", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);

      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .update({ resolved_at: new Date(0).toISOString() } as never)
        .eq("id", id);

      expect(error?.code).toBe("42501");
    }, 60_000);
  });

  // ===================================================================================
  // DELETE — the record that a document was chased does not go away
  // ===================================================================================
  describe("deleting", () => {
    it("no client may delete a request, however staffed they are", async () => {
      const id = await seedRequest(caseA, fixture.orgA, actor("adminA").id);

      for (const key of ["ownerA", "adminA", "counsellorAssignedA", "studentA"] as const) {
        const { error } = await actor(key).client.from(TABLE).delete().eq("id", id);
        expect(error?.code, `${key} was not refused by the missing DELETE grant`).toBe("42501");
      }

      await proveExists(id);
    }, 60_000);
  });
});
