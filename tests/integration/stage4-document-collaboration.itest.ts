/**
 * MV-185 — Stage 4 slice 2: document versions and reviews, asserted against a real database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs against a
 * stack it hosts itself.
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent — SO A GREEN `npm test` IS NOT
 * EVIDENCE THIS FILE RAN. Read the count.  LOCAL STACK ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 * MV-185 ships no route and no repository module, so there is no app layer to test. The
 * migration IS the slice, and the only place its claims are true or false is Postgres.
 *
 * **AN RLS SUITE THAT ONLY ASSERTS DENIALS PASSES IDENTICALLY AGAINST A MISSING POLICY.** A table
 * with RLS forced and no policy at all denies everything — so "the outsider saw nothing" is
 * satisfied by a broken migration just as well as by a correct one. Every denial below is
 * therefore PAIRED with the positive case that proves the policy admits the actor it is supposed
 * to admit, and every silent denial is paired with a service-role existence proof so it cannot be
 * satisfied by a fixture that never seeded.
 *
 * The conjunct-level claims go further: `supabase/rehearsal/MV-185-mutation.sql` re-creates one
 * policy at a time WITHOUT one named conjunct, so each `it(...)` below can be watched going red
 * for the reason it names. The dossier records which test each mutant kills.
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

assertLocalStack("stage4-document-collaboration.itest.ts", url);

const REQUESTS = "case_document_requests";
const VERSIONS = "case_document_versions";
const REVIEWS = "case_document_reviews";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-185 Stage 4 document collaboration", () => {
  let fixture: TenancyFixture;
  let dbContainer: string;

  /** Organization A, linked student, `counsellorAssignedA` primary. The whole matrix on one case. */
  let caseA: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let caseB: string;
  /**
   * `student_user_id IS NULL` and `counsellorAssignedA` assigned. Acceptance criterion 5: the whole
   * request -> version -> review walk must work here, because nothing in this slice reads
   * `cases.student_user_id` and 5B genuinely precedes Stage 5.
   */
  let unclaimed: string;

  /** Rows this file created, removed before `fixture.teardown()`. */
  const createdRequests: string[] = [];
  /** `documents.case_id` is ON DELETE **RESTRICT**, so these MUST go before the cases do. */
  const createdDocuments: string[] = [];

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

  let sequence = 0;
  const tag = (): string => `mv185-${fixture.stamp}-${(sequence += 1)}`;

  /** A request, seeded SERVICE-ROLE so a denial below has something real to deny. */
  const seedRequest = async (caseId: string, organizationId: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(REQUESTS)
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        kind: "passport",
        title: `MV-185 request ${tag()}`,
        requested_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    createdRequests.push(data.id);
    return data.id;
  };

  /** A well-formed version payload for `requestId`, attributed to `uploadedBy`. */
  const versionRow = (
    caseId: string,
    organizationId: string | null,
    requestId: string,
    uploadedBy: string,
    documentId: string | null = null,
  ) => ({
    case_id: caseId,
    organization_id: organizationId,
    request_id: requestId,
    document_id: documentId,
    storage_path: `case/${caseId}/${tag()}`,
    file_size: 2048,
    original_name: `${tag()}.pdf`,
    content_type: "application/pdf",
    uploaded_by: uploadedBy,
  });

  const seedVersion = async (caseId: string, organizationId: string, requestId: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(VERSIONS)
      .insert(versionRow(caseId, organizationId, requestId, actor("adminA").id) as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a version: ${error?.message}`);
    return data.id;
  };

  const reviewRow = (
    caseId: string,
    organizationId: string | null,
    versionId: string,
    reviewedBy: string,
    decision: "accepted" | "rejected" = "accepted",
  ) => ({
    case_id: caseId,
    organization_id: organizationId,
    version_id: versionId,
    decision,
    note: `MV-185 review ${tag()}`,
    reviewed_by: reviewedBy,
  });

  /** A vault row, so the `document_id` pointer bound has a real target on each side. */
  const seedDocument = async (caseId: string, kind: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from("documents")
      .insert({
        owner: null,
        case_id: caseId,
        kind,
        file_path: `consultancy/${kind}/${tag()}.pdf`,
        file_size: 1024,
        original_name: `${tag()}.pdf`,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a document: ${error?.message}`);
    createdDocuments.push(data.id);
    return data.id;
  };

  /** The stored status of one request, read through the service role. */
  const storedStatus = async (requestId: string): Promise<{ status: string; resolvedAt: string | null }> => {
    const { data, error } = await fixture.admin
      .from(REQUESTS)
      .select("status, resolved_at")
      .eq("id", requestId)
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not read request ${requestId}: ${error?.message}`);
    return { status: data.status, resolvedAt: data.resolved_at };
  };

  /**
   * Turns "the fixture never seeded this" into a loud failure instead of a passing denial.
   * A silent RLS refusal and a missing row are the SAME observation from the actor's side.
   */
  const proveExists = async (table: typeof VERSIONS | typeof REVIEWS, id: string): Promise<void> => {
    const { data, error } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`HARNESS DEFECT: existence proof failed: ${error.message}`);
    if (!data) {
      throw new Error(`HARNESS DEFECT: ${table} row ${id} does not exist, so "sees nothing" proves nothing.`);
    }
  };

  /** A request on case A with one seeded version and one seeded accepted review, for the read probes. */
  let readableRequest: string;
  let readableVersion: string;
  let readableReview: string;

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
    unclaimed = fixture.cases.unclaimedA;

    readableRequest = await seedRequest(caseA, fixture.orgA);
    readableVersion = await seedVersion(caseA, fixture.orgA, readableRequest);
    const { data, error } = await fixture.admin
      .from(REVIEWS)
      .insert(reviewRow(caseA, fixture.orgA, readableVersion, actor("adminA").id) as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a review: ${error?.message}`);
    readableReview = data.id;
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    // Versions and reviews cascade from their request; the request cascades from its case. The
    // vault rows do NOT — `documents.case_id` is ON DELETE RESTRICT, so leaving one behind turns
    // `fixture.teardown()` into a `23503` that reads like an unrelated failure.
    if (createdRequests.length) await fixture.admin.from(REQUESTS).delete().in("id", createdRequests);
    if (createdDocuments.length) await fixture.admin.from("documents").delete().in("id", createdDocuments);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The migration landed in the shape it claims
  // ===================================================================================
  describe("the migration landed", () => {
    it("has RLS enabled AND forced on both tables", () => {
      const rows = sqlLines(`
        select c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('${VERSIONS}', '${REVIEWS}') order by 1;
      `);
      // `force` is the load-bearing half: without it the migration role that OWNS the table is
      // exempt from every policy below, and the whole file would be measuring nothing.
      expect(rows).toEqual([`${REVIEWS}|true|true`, `${VERSIONS}|true|true`]);
    });

    it("grants exactly SELECT and a column-scoped INSERT — no UPDATE, no DELETE", () => {
      const insertV = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${VERSIONS}' and privilege_type = 'INSERT' order by 1;
      `);
      // `id` and `created_at` are absent on purpose: an id the client chose is not a key the
      // server issued, and `created_at` is the server's account of when the file arrived.
      expect(insertV).toEqual([
        "case_id",
        "content_type",
        "document_id",
        "file_size",
        "organization_id",
        "original_name",
        "request_id",
        "storage_path",
        "uploaded_by",
      ]);

      const insertR = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${REVIEWS}' and privilege_type = 'INSERT' order by 1;
      `);
      expect(insertR).toEqual([
        "case_id",
        "decision",
        "note",
        "organization_id",
        "reviewed_by",
        "version_id",
      ]);

      // THE TWO FORBIDDEN GRANTS, in their strong form: no UPDATE on ANY column of either table,
      // so `case_id` and `organization_id` cannot be re-pointed because nothing can.
      const update = sqlLines(`
        select table_name || '.' || column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('${VERSIONS}', '${REVIEWS}') and privilege_type = 'UPDATE' order by 1;
      `);
      expect(update).toEqual([]);

      // DELETE is table-level and never appears in `column_privileges` at all — reading it from
      // the wrong catalogue is a filter that can never fail (MV-168 §4 (4)).
      const del = sqlLines(`
        select table_name from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('${VERSIONS}', '${REVIEWS}') and privilege_type = 'DELETE' order by 1;
      `);
      expect(del).toEqual([]);
    });

    it("holds UPDATE (case_id) and UPDATE (organization_id) NOWHERE in the schema", () => {
      // The rule is the schema's, not this table's — MV-182 §6 (2)/(3) states it the same way.
      const rows = sqlLines(`
        select distinct table_name || '(' || column_name || ')'
        from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and privilege_type = 'UPDATE' and column_name in ('case_id', 'organization_id') order by 1;
      `);
      expect(rows).toEqual([]);
    });

    it("carries all four policies, each attached to the verb it claims", () => {
      // `polcmd` is `"char"`, not text: `||` against it is ambiguous and the statement ERRORS
      // rather than failing, which is how this assertion shipped once without ever running.
      const rows = sqlLines(`
        select c.relname || '.' || p.polname || '|' || p.polcmd::text from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('${VERSIONS}', '${REVIEWS}') order by 1;
      `);
      expect(rows).toEqual([
        `${REVIEWS}.${REVIEWS}_insert_staff|a`,
        `${REVIEWS}.${REVIEWS}_select_actor|r`,
        `${VERSIONS}.${VERSIONS}_insert_staff|a`,
        `${VERSIONS}.${VERSIONS}_select_actor|r`,
      ]);
    });

    it("carries the two sync triggers and the request-status guard", () => {
      const rows = sqlLines(`
        select c.relname || '.' || t.tgname from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
          and t.tgname in ('${VERSIONS}_sync_request_status', '${REVIEWS}_sync_request_status',
                           '${REQUESTS}_status_guard') order by 1;
      `);
      expect(rows).toEqual([
        `${REQUESTS}.${REQUESTS}_status_guard`,
        `${REVIEWS}.${REVIEWS}_sync_request_status`,
        `${VERSIONS}.${VERSIONS}_sync_request_status`,
      ]);
    });

    it("keeps every policy name OUT of the `%_case` census reserved for the nine", () => {
      // The `_case` suffix is the census key seven exact-count guards read
      // (`MV-159/160/168-rollback.sql`, `supabase/rehearsal/README.md`), each asserting a total
      // and each phrased "on the nine". A policy here ending in `_case` makes those rollbacks
      // refuse with a count that names the wrong cause.
      const offenders = sqlLines(`
        select p.polname from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('${VERSIONS}', '${REVIEWS}')
          and p.polname like '%\\_case' order by 1;
      `);
      expect(offenders).toEqual([]);

      // ...and the census itself still reads 27 policies (MV-159's 24 + MV-168's 3) on the nine.
      const census = sqlLines(`
        select count(*)::text || '|' || count(distinct c.relname)::text from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname like '%\\_case';
      `);
      expect(census).toEqual(["27|9"]);
    });

    it("LEAVES THE VAULT ALONE — documents_case_kind_idx is still UNIQUE and still FULL", () => {
      // THE FENCE, and the sharpest sentence in the spec. supabase-js compiles `.upsert()` to
      // `INSERT … ON CONFLICT DO UPDATE`; the arbiter index must exist and must not be partial,
      // or every upsert on the vault fails AT PLAN TIME (42501 / 42P10 — MV-155 and MV-168
      // measured it three times). MV-182's own header would have told a reader to drop it.
      const rows = sqlLines(`
        select ic.relname || '|' || i.indisunique::text || '|' || (i.indpred is null)::text
        from pg_index i
        join pg_class ic on ic.oid = i.indexrelid
        join pg_class tc on tc.oid = i.indrelid
        join pg_namespace n on n.oid = tc.relnamespace
        where n.nspname = 'public' and tc.relname = 'documents'
          and ic.relname = 'documents_case_kind_idx';
      `);
      expect(rows).toEqual(["documents_case_kind_idx|true|true"]);
    });

    it("wired no part of this model INTO documents or document_status", () => {
      // The rest of the fence. Not a frozen-shape assertion — a later slice may legitimately
      // change the vault — but a targeted one: THIS model must not have leaked into it. The
      // collaboration tables sit BESIDE the vault (spec §2 D1) and the vault keeps meaning "the
      // current file for this kind on this case", which `lib/checklist/generator.ts` and the
      // profile sections read.
      const policies = sqlLines(`
        select c.relname || '.' || p.polname from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('documents', 'document_status')
          and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%case_document_%'
            or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%case_document_%')
        order by 1;
      `);
      expect(policies).toEqual([]);

      const columns = sqlLines(`
        select table_name || '.' || column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('documents', 'document_status')
          and column_name in ('version_id', 'review_id', 'request_id', 'storage_path', 'content_type')
        order by 1;
      `);
      expect(columns).toEqual([]);
    });
  });

  // ===================================================================================
  // READ — `actor_case_ids()`, which includes the linked student
  // ===================================================================================
  describe("reading versions and reviews", () => {
    it("the ASSIGNED counsellor sees their case's versions and reviews", async () => {
      const v = await actor("counsellorAssignedA").client.from(VERSIONS).select("id").eq("case_id", caseA);
      expect(v.error, `a SELECT must never error under RLS, it filters: ${v.error?.message}`).toBeNull();
      // THE POSITIVE HALF. Without it every denial below is satisfied by a missing policy.
      expect((v.data ?? []).map((row) => row.id)).toContain(readableVersion);

      const r = await actor("counsellorAssignedA").client.from(REVIEWS).select("id").eq("case_id", caseA);
      expect(r.error).toBeNull();
      expect((r.data ?? []).map((row) => row.id)).toContain(readableReview);
    });

    it("the org ADMIN sees them too — whole-organization scope", async () => {
      const v = await actor("adminA").client.from(VERSIONS).select("id").eq("case_id", caseA);
      expect(v.error).toBeNull();
      expect((v.data ?? []).map((row) => row.id)).toContain(readableVersion);
    });

    it("the LINKED STUDENT may read the versions on their case AND the reviews of them", async () => {
      const v = await actor("studentA").client.from(VERSIONS).select("id").eq("case_id", caseA);
      expect(v.error).toBeNull();
      expect((v.data ?? []).map((row) => row.id)).toContain(readableVersion);

      // The rejection NOTE is the half of this model that is any use to a student, and Stage 5's
      // surface depends on the policy already admitting them to it.
      const r = await actor("studentA").client.from(REVIEWS).select("id, note, decision").eq("case_id", caseA);
      expect(r.error).toBeNull();
      expect((r.data ?? []).map((row) => row.id)).toContain(readableReview);
      expect((r.data ?? []).find((row) => row.id === readableReview)?.note).toBeTruthy();
    });

    it("an UNASSIGNED counsellor in the same organization sees nothing", async () => {
      await proveExists(VERSIONS, readableVersion);
      await proveExists(REVIEWS, readableReview);

      const v = await actor("counsellorUnassignedA").client.from(VERSIONS).select("id");
      expect(v.error).toBeNull();
      expect((v.data ?? []).map((row) => row.id)).not.toContain(readableVersion);

      const r = await actor("counsellorUnassignedA").client.from(REVIEWS).select("id");
      expect(r.error).toBeNull();
      expect((r.data ?? []).map((row) => row.id)).not.toContain(readableReview);
    });

    it("organization B sees nothing — the tenant boundary", async () => {
      await proveExists(VERSIONS, readableVersion);
      for (const key of ["ownerB", "counsellorAssignedB", "outsider"] as const) {
        const v = await actor(key).client.from(VERSIONS).select("id");
        expect(v.error, `${key}: ${v.error?.message}`).toBeNull();
        expect((v.data ?? []).map((row) => row.id), key).not.toContain(readableVersion);

        const r = await actor(key).client.from(REVIEWS).select("id");
        expect(r.error, `${key}: ${r.error?.message}`).toBeNull();
        expect((r.data ?? []).map((row) => row.id), key).not.toContain(readableReview);
      }
    });

    it("an anonymous client sees nothing", async () => {
      await proveExists(VERSIONS, readableVersion);
      const v = await fixture.anon.from(VERSIONS).select("id");
      expect((v.data ?? []).map((row) => row.id)).not.toContain(readableVersion);
      const r = await fixture.anon.from(REVIEWS).select("id");
      expect((r.data ?? []).map((row) => row.id)).not.toContain(readableReview);
    });
  });

  // ===================================================================================
  // INSERT a version — staff AND org AND parentage AND vault pointer AND provenance
  // ===================================================================================
  describe("a file arriving against a request", () => {
    it("the ASSIGNED counsellor may, and created_at is the server's", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, c.id) as never)
        .select("id")
        .single();

      expect(error, `the assigned counsellor was refused: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();

      const { data: row } = await fixture.admin
        .from(VERSIONS)
        .select("created_at, organization_id, uploaded_by, document_id")
        .eq("id", data!.id)
        .single();
      expect(row!.created_at).toBeTruthy();
      expect(row!.organization_id).toBe(fixture.orgA);
      expect(row!.uploaded_by).toBe(c.id);
      expect(row!.document_id).toBeNull();
    }, 60_000);

    it("may name THIS case's vault row, and may NOT name another case's", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");
      const ours = await seedDocument(caseA, "passport");
      const theirs = await seedDocument(caseB, "passport");

      // THE POSITIVE HALF: the pointer bound must not refuse the legitimate pointer.
      const good = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, c.id, ours) as never)
        .select("id");
      expect(good.error, `a version could not name its OWN case's vault row: ${good.error?.message}`).toBeNull();
      expect(good.data ?? []).toHaveLength(1);

      // ...and the bound itself. MV-190 mints signed URLs from this pointer, and a signed URL
      // bypasses Storage RLS by design — an unbounded pointer is a cross-case file disclosure.
      const bad = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, c.id, theirs) as never)
        .select("id");
      expect(bad.data ?? []).toHaveLength(0);
      expect(bad.error).not.toBeNull();
    }, 60_000);

    it("may NOT hang a version off ANOTHER case's request", async () => {
      const foreign = await seedRequest(caseB, fixture.orgB);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, foreign, c.id) as never)
        .select("id");

      // Without `document_request_case_id(request_id) = case_id` the row reads as case A's to
      // every case-scoped query AND resolves case B's request through the sync trigger. Both
      // halves are wrong and neither is visible from either case.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("an UNASSIGNED counsellor in the same organization may NOT", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorUnassignedA");

      const { data, error } = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, c.id) as never)
        .select("id");

      // `can_staff_case`'s counsellor arm requires BOTH an active membership and a
      // `case_assignments` row. This actor has the first and not the second.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("the LINKED STUDENT may NOT upload a counsellor-side version on their own case", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const s = actor("studentA");

      const { data, error } = await s.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, s.id) as never)
        .select("id");

      // The exact reason the INSERT policy uses `can_staff_case` rather than `can_access_case`:
      // the student holds a genuine grant on this case for READING, and either of the wider
      // predicates would carry it into WRITING.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("organization B may NOT — the tenant boundary on write", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const b = actor("ownerB");

      const { data, error } = await b.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, b.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("a FORGED organization_id is refused even for an actor who may staff the case", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");

      // Org B's id on org A's case. Without `organization_id = case_org_id(case_id)` this lands,
      // and every organization-scoped report built on the table later counts it under the wrong
      // tenant.
      const { data, error } = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgB, request, c.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("a FORGED uploaded_by is refused — one counsellor cannot file for another", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(VERSIONS)
        .insert(versionRow(caseA, fixture.orgA, request, actor("adminA").id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("naming an ungranted column is refused at plan time, whoever asks", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(VERSIONS)
        .insert({
          ...versionRow(caseA, fixture.orgA, request, c.id),
          created_at: new Date(0).toISOString(),
        } as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      // 42501: the privilege check happens at plan time, so this fails even though the actor may
      // legitimately insert every OTHER column of the same row.
      expect(error?.code).toBe("42501");
    }, 60_000);
  });

  // ===================================================================================
  // INSERT a review — the card's headline: a student may not review their own file
  // ===================================================================================
  describe("judging a file", () => {
    it("the ASSIGNED counsellor may accept or reject", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, version, c.id, "rejected") as never)
        .select("id")
        .single();

      expect(error, `the assigned counsellor was refused: ${error?.message}`).toBeNull();
      const { data: row } = await fixture.admin
        .from(REVIEWS)
        .select("decision, reviewed_by, organization_id")
        .eq("id", data!.id)
        .single();
      expect(row!.decision).toBe("rejected");
      expect(row!.reviewed_by).toBe(c.id);
      expect(row!.organization_id).toBe(fixture.orgA);
    }, 60_000);

    it("THE LINKED STUDENT MAY NOT REVIEW THEIR OWN FILE", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const s = actor("studentA");

      const { data, error } = await s.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, version, s.id) as never)
        .select("id");

      // The whole reason the write axis is `can_staff_case` and not `actor_case_ids()`. A student
      // who could accept their own document could clear their own chase list.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("an UNASSIGNED counsellor and organization B may NOT", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);

      for (const key of ["counsellorUnassignedA", "ownerB", "outsider"] as const) {
        const a = actor(key);
        const { data, error } = await a.client
          .from(REVIEWS)
          .insert(reviewRow(caseA, fixture.orgA, version, a.id) as never)
          .select("id");
        expect(data ?? [], key).toHaveLength(0);
        expect(error, key).not.toBeNull();
      }
    }, 60_000);

    it("may NOT judge ANOTHER case's version", async () => {
      const theirs = await seedRequest(caseB, fixture.orgB);
      const theirVersion = await seedVersion(caseB, fixture.orgB, theirs);
      const c = actor("counsellorAssignedA");

      // Parentage: a review that lands on another case's version resolves another case's request
      // through the sync trigger, from a row that reads as this case's to every case-scoped query.
      const { data, error } = await c.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, theirVersion, c.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("a FORGED reviewed_by is refused — one counsellor cannot judge in another's name", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, version, actor("adminA").id) as never)
        .select("id");

      // Without `reviewed_by = auth.uid()`, "who accepted this document" stops being evidence of
      // anything — which is the whole of Stage 6's audit read on this table.
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("a FORGED organization_id on a review is refused even for staff", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const c = actor("counsellorAssignedA");

      const { data, error } = await c.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgB, version, c.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);

    it("admits only `accepted` and `rejected`", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const c = actor("counsellorAssignedA");

      const { error } = await c.client
        .from(REVIEWS)
        .insert({ ...reviewRow(caseA, fixture.orgA, version, c.id), decision: "pending" } as never)
        .select("id");

      // There is deliberately no `pending`: "nobody has decided yet" is the ABSENCE of a row.
      expect(error?.code).toBe("23514");
    }, 60_000);
  });

  // ===================================================================================
  // Neither table admits UPDATE or DELETE — which is what makes the derivation total
  // ===================================================================================
  describe("both tables are append-only to a client", () => {
    it("nobody may update or delete a version or a review, however staffed they are", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const version = await seedVersion(caseA, fixture.orgA, request);
      const { data: seededReview } = await fixture.admin
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, version, actor("adminA").id, "rejected") as never)
        .select("id")
        .single();

      for (const key of ["ownerA", "adminA", "counsellorAssignedA", "studentA"] as const) {
        const client = actor(key).client;

        const updV = await client.from(VERSIONS).update({ storage_path: "case/forged" } as never).eq("id", version);
        expect(updV.error?.code, `${key} was not refused an UPDATE on a version`).toBe("42501");

        const updR = await client.from(REVIEWS).update({ decision: "accepted" } as never).eq("id", seededReview!.id);
        expect(updR.error?.code, `${key} was not refused an UPDATE on a review`).toBe("42501");

        const delV = await client.from(VERSIONS).delete().eq("id", version);
        expect(delV.error?.code, `${key} was not refused a DELETE on a version`).toBe("42501");

        const delR = await client.from(REVIEWS).delete().eq("id", seededReview!.id);
        expect(delR.error?.code, `${key} was not refused a DELETE on a review`).toBe("42501");
      }

      await proveExists(VERSIONS, version);
      await proveExists(REVIEWS, seededReview!.id);
    }, 60_000);
  });

  // ===================================================================================
  // THE DERIVATION — acceptance criterion 4
  // ===================================================================================
  describe("a request's status is derived from its documents", () => {
    it("accepting the newest version resolves the request, and the MV-182 trigger dates it", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      expect((await storedStatus(request)).status).toBe("outstanding");

      const version = await seedVersion(caseA, fixture.orgA, request);
      // A version that has arrived but not been judged does NOT resolve anything.
      expect((await storedStatus(request)).status).toBe("outstanding");

      const c = actor("counsellorAssignedA");
      const { error } = await c.client
        .from(REVIEWS)
        .insert(reviewRow(caseA, fixture.orgA, version, c.id, "accepted") as never)
        .select("id");
      expect(error, `the review was refused: ${error?.message}`).toBeNull();

      const after = await storedStatus(request);
      expect(after.status).toBe("resolved");
      // `resolved_at` is client-ungrantable, so nothing but MV-182's stamp trigger wrote this —
      // which is the evidence that the sync trigger's UPDATE went through the normal path.
      expect(after.resolvedAt).not.toBeNull();
    }, 60_000);

    it("rejecting re-opens it, and a re-upload after a rejection re-opens it again", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");

      const first = await seedVersion(caseA, fixture.orgA, request);
      await c.client.from(REVIEWS).insert(reviewRow(caseA, fixture.orgA, first, c.id, "accepted") as never);
      expect((await storedStatus(request)).status).toBe("resolved");

      await c.client.from(REVIEWS).insert(reviewRow(caseA, fixture.orgA, first, c.id, "rejected") as never);
      // "NEWEST review", not "any accepted review". A reviewer who accepts and then rejects has
      // rejected; `exists (… 'accepted')` would call this resolved forever.
      const rejected = await storedStatus(request);
      expect(rejected.status).toBe("outstanding");
      // And the stale date goes with it — a resolution date beside "outstanding" is two facts
      // that contradict, with no way for a reader to tell which half is the lie.
      expect(rejected.resolvedAt).toBeNull();

      // THE CASE THE MISSING `unique (request_id)` EXISTS TO ALLOW.
      const second = await seedVersion(caseA, fixture.orgA, request);
      expect((await storedStatus(request)).status).toBe("outstanding");

      await c.client.from(REVIEWS).insert(reviewRow(caseA, fixture.orgA, second, c.id, "accepted") as never);
      expect((await storedStatus(request)).status).toBe("resolved");

      // A NEW version arriving after an acceptance re-opens the request: the newest file has not
      // been judged, so the request is not satisfied by it.
      await seedVersion(caseA, fixture.orgA, request);
      expect((await storedStatus(request)).status).toBe("outstanding");
    }, 60_000);

    it("REFUSES a hand-written status that contradicts the newest version", async () => {
      const request = await seedRequest(caseA, fixture.orgA);
      const c = actor("counsellorAssignedA");
      const version = await seedVersion(caseA, fixture.orgA, request);
      await c.client.from(REVIEWS).insert(reviewRow(caseA, fixture.orgA, version, c.id, "rejected") as never);

      // MV-182's `resolveCaseDocumentRequest` is still live and still granted `update (status)`.
      // Without the guard trigger this write lands, and MV-183's lodgement panel then renders the
      // request as satisfied while the only file against it had been refused.
      const { error } = await c.client.from(REQUESTS).update({ status: "resolved" }).eq("id", request);
      expect(error?.code, "a hand-written status contradicting the derivation was ADMITTED").toBe("23514");
      expect((await storedStatus(request)).status).toBe("outstanding");
    }, 60_000);

    it("still lets MV-182's manual verb resolve a request that has NO versions", async () => {
      const request = await seedRequest(caseA, fixture.orgA);

      // The derivation abstains on a request with no versions — a document received by hand is a
      // real thing, and the guard must not turn MV-182's shipped verb into a dead button.
      const { error } = await actor("counsellorAssignedA")
        .client.from(REQUESTS)
        .update({ status: "resolved" })
        .eq("id", request);
      expect(error, `the manual resolve was refused: ${error?.message}`).toBeNull();

      const after = await storedStatus(request);
      expect(after.status).toBe("resolved");
      expect(after.resolvedAt).not.toBeNull();
    }, 60_000);

    it("cannot disagree with an INDEPENDENT recomputation over every request this file touched", async () => {
      // Computed in TypeScript from the raw rows rather than by re-running the migration's own
      // SQL — a derivation checked against itself is a tautology.
      const { data: requests } = await fixture.admin
        .from(REQUESTS)
        .select("id, status")
        .in("id", createdRequests);
      const { data: versions } = await fixture.admin
        .from(VERSIONS)
        .select("id, request_id, created_at")
        .in("request_id", createdRequests);
      const { data: reviews } = await fixture.admin
        .from(REVIEWS)
        .select("id, version_id, decision, created_at")
        .in("case_id", [caseA, caseB, unclaimed]);

      // Non-vacuity: a comparison over an empty set is trivially true.
      expect((requests ?? []).length).toBeGreaterThan(5);
      expect((versions ?? []).length).toBeGreaterThan(3);
      expect((reviews ?? []).length).toBeGreaterThan(3);

      const newest = <T extends { id: string; created_at: string }>(rows: T[]): T | undefined =>
        [...rows].sort((a, b) =>
          a.created_at === b.created_at
            ? b.id.localeCompare(a.id)
            : b.created_at.localeCompare(a.created_at),
        )[0];

      const disagreements: string[] = [];
      for (const request of requests ?? []) {
        const own = (versions ?? []).filter((v) => v.request_id === request.id);
        if (own.length === 0) continue; // the derivation abstains, so there is nothing to disagree with
        const top = newest(own)!;
        const judgement = newest((reviews ?? []).filter((r) => r.version_id === top.id));
        const derived = judgement?.decision === "accepted" ? "resolved" : "outstanding";
        if (request.status !== derived) {
          disagreements.push(`${request.id}: stored=${request.status} derived=${derived}`);
        }
      }
      expect(disagreements).toEqual([]);
    }, 60_000);
  });

  // ===================================================================================
  // ACCEPTANCE CRITERION 5 — no dependency on Stage 5
  // ===================================================================================
  describe("an UNCLAIMED case", () => {
    it("supports the whole request -> version -> review walk with student_user_id NULL", async () => {
      // Proven, not assumed: the fixture's `unclaimedA` is an organization case with a primary
      // counsellor and no student account attached.
      const shape = sqlLines(`
        select (student_user_id is null)::text || '|' || (organization_id is not null)::text
        from public.cases where id = '${unclaimed}';
      `);
      expect(shape).toEqual(["true|true"]);

      const c = actor("counsellorAssignedA");
      const request = await seedRequest(unclaimed, fixture.orgA);

      const version = await c.client
        .from(VERSIONS)
        .insert(versionRow(unclaimed, fixture.orgA, request, c.id) as never)
        .select("id")
        .single();
      expect(version.error, `upload onto an unclaimed case was refused: ${version.error?.message}`).toBeNull();

      const review = await c.client
        .from(REVIEWS)
        .insert(reviewRow(unclaimed, fixture.orgA, version.data!.id, c.id, "accepted") as never)
        .select("id")
        .single();
      expect(review.error, `review on an unclaimed case was refused: ${review.error?.message}`).toBeNull();

      // And the derivation ran on it: nothing in this slice reads `cases.student_user_id`.
      expect((await storedStatus(request)).status).toBe("resolved");
    }, 60_000);

    it("carries no version onto a PERSONAL case, by two independent refusals", async () => {
      // MV-182 proved a personal case can carry no REQUEST, so it can carry no version either —
      // the parentage conjunct has nothing to point at. The org axis refuses it a second time:
      // `organization_id` is NOT NULL and the policy compares it with `case_org_id(case_id)`,
      // which is NULL on a personal case, and a WITH CHECK admits only TRUE.
      const personal = fixture.cases.personalA;
      expect(sqlLines(`select (organization_id is null)::text from public.cases where id = '${personal}';`))
        .toEqual(["true"]);

      const s = actor("studentA");
      const { data, error } = await s.client
        .from(VERSIONS)
        // `readableRequest` is a case A request, so this also exercises the parentage bound.
        .insert(versionRow(personal, fixture.orgA, readableRequest, s.id) as never)
        .select("id");

      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }, 60_000);
  });
});
