/**
 * MV-190 — Stage 4 slice 3: the case-keyed Storage prefix, asserted against a real database and a
 * real Storage service.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs against a
 * stack it hosts itself.
 *
 * Run locally:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-case-storage.itest.ts
 *
 * Skips cleanly (never fails) when those env vars are absent — SO A GREEN `npm test` IS NOT
 * EVIDENCE THIS FILE RAN. Read the count.  LOCAL STACK ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS EVIDENCE FOR
 * ---------------------------------------------------------------------------------------
 * Spec §6 (the MV-190 note) took two decisions that only Postgres and the Storage service can
 * confirm, and each is the kind of claim that is silently permissive when wrong:
 *
 *   D4 — **MV-190 adds no `storage.objects` policy.** The `case/` prefix is unreadable by
 *        `authenticated` because `(storage.foldername(name))[1]` is the literal `case`, which is
 *        no uid. That is an ABSENCE, and an absence is exactly what a denial-only probe cannot
 *        tell from a broken fixture. So every denial here is paired with a CONTROL — the same
 *        actor, the same client, the same run, reading an object they SHOULD reach — and with a
 *        service-role existence proof that the bytes are really there. The mutant for an absence
 *        is an ADDITION: `supabase/rehearsal/MV-190-mutation.sql` plants a permissive `case/`
 *        policy and the denial test must go red.
 *
 *   D5 — **`storage_path` is bounded to the row's own case by a table CHECK.** MV-185 left the
 *        column deliberately unconstrained; granting `id` completes client control of it, and an
 *        unbounded path means an authorization on case X mints a URL for case Y's bytes. The
 *        constraint is a CHECK rather than a policy conjunct precisely so it binds `service_role`
 *        too, and there is a test below that only a CHECK can pass.
 *
 * EVERY RLS ASSERTION RUNS AS `authenticated`. A probe issued on the service-role client bypasses
 * every policy and proves nothing; `fixture.admin` appears only in seeding, teardown and
 * existence proofs — and in the one test whose whole point is that the constraint binds it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

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

assertLocalStack("stage4-case-storage.itest.ts", url);

const REQUESTS = "case_document_requests";
const VERSIONS = "case_document_versions";
const REVIEWS = "case_document_reviews";
const BUCKET = "documents";

/** The constraint spec §6.2 adds. Named here once so a rename cannot pass silently. */
const PATH_CONSTRAINT = "case_document_versions_storage_path_case_prefix";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-190 Stage 4 case-scoped Storage", () => {
  let fixture: TenancyFixture;
  let dbContainer: string;

  /** Organization A's assigned case. `counsellorAssignedA` may staff it. */
  let caseA: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let caseB: string;

  const createdRequests: string[] = [];
  /** Storage keys this file uploaded, removed before teardown so a re-run starts clean. */
  const createdObjects: string[] = [];

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

  const tag = (): string => randomUUID();

  const seedRequest = async (caseId: string, organizationId: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(REQUESTS)
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        kind: "passport",
        title: `MV-190 request ${tag()}`,
        requested_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    createdRequests.push(data.id);
    return data.id;
  };

  /**
   * A version payload. `storagePath` is a separate parameter so a test can hand it a foreign-case
   * path without the helper quietly repairing it.
   *
   * `id` is OPTIONAL, and that is deliberate rather than convenience. A client-chosen id is D5's
   * subject, so the POSITIVE supplies one — but the constraint refusals below must not, or they
   * would fail with `42501` the moment the `id_grant` mutant runs and could no longer be told from
   * a test about the grant. A refusal that names another case does not need to name itself.
   */
  const versionRow = (args: {
    id?: string;
    caseId: string;
    organizationId: string;
    requestId: string;
    uploadedBy: string;
    storagePath: string;
  }) => ({
    ...(args.id === undefined ? {} : { id: args.id }),
    case_id: args.caseId,
    organization_id: args.organizationId,
    request_id: args.requestId,
    document_id: null,
    storage_path: args.storagePath,
    file_size: 2048,
    original_name: `${tag()}.pdf`,
    content_type: "application/pdf",
    uploaded_by: args.uploadedBy,
  });

  /** Upload real bytes and remember the key, so the denials below are about POLICY, not absence. */
  const putObject = async (key: string, body: string): Promise<void> => {
    const { error } = await fixture.admin.storage
      .from(BUCKET)
      .upload(key, Buffer.from(body, "utf8"), { contentType: "text/plain", upsert: true });
    if (error) throw new Error(`HARNESS DEFECT: could not upload ${key}: ${error.message}`);
    createdObjects.push(key);
  };

  /** A version id and its object, both real. Returned so a test can name the exact key. */
  let caseObjectKey: string;
  /** The SAME actor's own uid-keyed object — the control for every `case/` denial below. */
  let ownObjectKey: string;
  let requestA: string;

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
    requestA = await seedRequest(caseA, fixture.orgA);

    caseObjectKey = `case/${caseA}/${randomUUID()}`;
    await putObject(caseObjectKey, "MV-190 collaboration bytes");

    ownObjectKey = `${actor("counsellorAssignedA").id}/mv190/${randomUUID()}.txt`;
    await putObject(ownObjectKey, "MV-190 control bytes");
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    if (createdObjects.length) await fixture.admin.storage.from(BUCKET).remove(createdObjects);
    if (createdRequests.length) await fixture.admin.from(REQUESTS).delete().in("id", createdRequests);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The migration landed in the shape spec §6.2 describes
  // ===================================================================================
  describe("the migration landed", () => {
    it("grants `id` on the versions INSERT, so the client can name the object before it writes the row", () => {
      const cols = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${VERSIONS}' and privilege_type = 'INSERT' order by 1;
      `);
      // `id` is here and `created_at` is not, and the asymmetry is the decision: the id is a NAME
      // FOR BYTES THAT MUST EXIST FIRST (upload, then insert — a failed upload writes no row),
      // while `created_at` stays the server's account of when the file arrived.
      expect(cols).toEqual([
        "case_id",
        "content_type",
        "document_id",
        "file_size",
        "id",
        "organization_id",
        "original_name",
        "request_id",
        "storage_path",
        "uploaded_by",
      ]);
    });

    it("leaves the reviews INSERT grant exactly as MV-185 wrote it", () => {
      const cols = sqlLines(`
        select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = '${REVIEWS}' and privilege_type = 'INSERT' order by 1;
      `);
      // MV-190 widens ONE grant on ONE table. A review id is issued by the server because nothing
      // names an object after it.
      expect(cols).toEqual(["case_id", "decision", "note", "organization_id", "reviewed_by", "version_id"]);
    });

    it("adds no UPDATE grant to either collaboration table", () => {
      const rows = sqlLines(`
        select table_name || '.' || column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('${VERSIONS}', '${REVIEWS}') and privilege_type = 'UPDATE' order by 1;
      `);
      // Both tables stay append-only. MV-185's derivation only re-runs on INSERT, so an UPDATE
      // grant would let the newest-version answer change with no trigger firing.
      expect(rows).toEqual([]);
    });

    it("adds no DELETE grant to either collaboration table", () => {
      // DELETE is table-level and never appears in `column_privileges` at all — reading it from
      // the wrong catalogue is a filter that can never fail (MV-168 §4 (4)).
      const rows = sqlLines(`
        select table_name from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name in ('${VERSIONS}', '${REVIEWS}') and privilege_type = 'DELETE' order by 1;
      `);
      expect(rows).toEqual([]);
    });

    it("bounds storage_path to the row's own case with a VALIDATED check constraint", () => {
      const rows = sqlLines(`
        select con.contype::text || '|' || con.convalidated::text || '|' ||
               pg_get_constraintdef(con.oid)
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = '${VERSIONS}'
          and con.conname = '${PATH_CONSTRAINT}';
      `);
      expect(rows).toHaveLength(1);
      const [row] = rows;
      // NOT VALID would let pre-existing rows escape it, and a trigger-shaped substitute would not
      // bind `service_role`. Both halves are asserted, not assumed.
      expect(row).toMatch(/^c\|true\|/);
      expect(row).toContain("storage_path");
      expect(row).toContain("case_id");
    });
  });

  // ===================================================================================
  // The constraint bites — every denial paired with the positive that proves it discriminates
  // ===================================================================================
  describe("the storage_path bound", () => {
    it("ADMITS a version whose path sits under its own case, written with a client-chosen id", async () => {
      const id = randomUUID();
      const client = actor("counsellorAssignedA").client;
      const { error } = await client.from(VERSIONS).insert(
        versionRow({
          id,
          caseId: caseA,
          organizationId: fixture.orgA,
          requestId: requestA,
          uploadedBy: actor("counsellorAssignedA").id,
          storagePath: `case/${caseA}/${id}`,
        }) as never,
      );
      // THE POSITIVE. Without it every refusal below is satisfied by a table nobody can write at
      // all, which is the state a denial-only suite cannot tell from a correct one.
      expect(error).toBeNull();

      const stored = await fixture.admin.from(VERSIONS).select("id, storage_path").eq("id", id).maybeSingle();
      expect(stored.data?.id).toBe(id);
      expect(stored.data?.storage_path).toBe(`case/${caseA}/${id}`);
    });

    it("REFUSES a version on this case whose storage_path names ANOTHER case", async () => {
      const client = actor("counsellorAssignedA").client;
      const { error } = await client.from(VERSIONS).insert(
        versionRow({
          caseId: caseA,
          organizationId: fixture.orgA,
          requestId: requestA,
          uploadedBy: actor("counsellorAssignedA").id,
          // The row is case A's to every case-scoped query; the bytes are case B's. An
          // authorization on case A would mint a signed URL for case B's file.
          storagePath: `case/${caseB}/${randomUUID()}`,
        }) as never,
      );
      expect(error?.code).toBe("23514");
      expect(error?.message ?? "").toContain(PATH_CONSTRAINT);
    });

    it("REFUSES a version whose storage_path is an owner-keyed vault path rather than case-keyed", async () => {
      const client = actor("counsellorAssignedA").client;
      const { error } = await client.from(VERSIONS).insert(
        versionRow({
          caseId: caseA,
          organizationId: fixture.orgA,
          requestId: requestA,
          uploadedBy: actor("counsellorAssignedA").id,
          // A vault object belongs to whoever owns the uid folder — reachable by them DIRECTLY
          // through the live `Users read own document files` policy, forever, with no case check.
          storagePath: `${actor("counsellorAssignedA").id}/passport/${randomUUID()}.pdf`,
        }) as never,
      );
      expect(error?.code).toBe("23514");
    });

    it("binds `service_role` too, which is the half a policy conjunct could not reach", async () => {
      const id = randomUUID();
      // The ONLY assertion in this file issued on the admin client, and deliberately: a WITH CHECK
      // conjunct binds `authenticated` alone, and the upload half of this model runs as
      // `service_role`. A CHECK is the only instrument that closes that door.
      const { error } = await fixture.admin.from(VERSIONS).insert(
        versionRow({
          id,
          caseId: caseA,
          organizationId: fixture.orgA,
          requestId: requestA,
          uploadedBy: actor("adminA").id,
          storagePath: `case/${caseB}/${randomUUID()}`,
        }) as never,
      );
      expect(error?.code).toBe("23514");
    });
  });

  // ===================================================================================
  // Criterion 5 — the `case/` prefix is unreadable by a direct Storage call, WITH A CONTROL
  // ===================================================================================
  describe("the case/ prefix is deny-by-default in Storage", () => {
    it("really has the bytes behind it — the service role reads the object", async () => {
      // The existence proof. Without it "the counsellor saw nothing" is satisfied by an object
      // that was never uploaded, and the whole section measures a typo.
      const { data, error } = await fixture.admin.storage.from(BUCKET).download(caseObjectKey);
      expect(error).toBeNull();
      expect(await data!.text()).toBe("MV-190 collaboration bytes");
    });

    it("REFUSES a direct download of a case/ object to the counsellor who may staff that case", async () => {
      const { data, error } = await actor("counsellorAssignedA").client.storage
        .from(BUCKET)
        .download(caseObjectKey);
      // `(storage.foldername(name))[1]` is the literal `case`, which equals no `auth.uid()`. The
      // ONLY route to these bytes is a signed URL minted after `checkCasePermission` — spec §6.1.
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it("CONTROL — the same actor, same client, same run CAN download their own uid-keyed object", async () => {
      const { data, error } = await actor("counsellorAssignedA").client.storage
        .from(BUCKET)
        .download(ownObjectKey);
      // Without this the refusal above is indistinguishable from a broken client, a wrong bucket
      // or a token the Storage service never accepted.
      expect(error).toBeNull();
      expect(await data!.text()).toBe("MV-190 control bytes");
    });

    it("REFUSES a direct download of a case/ object to an outsider as well", async () => {
      const { data, error } = await actor("outsider").client.storage.from(BUCKET).download(caseObjectKey);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it("REFUSES a case/ object to the anonymous client", async () => {
      const { data, error } = await fixture.anon.storage.from(BUCKET).download(caseObjectKey);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  // ===================================================================================
  // D4 — the `storage.objects` policy surface is exactly what the note says it is
  // ===================================================================================
  describe("the storage.objects surface", () => {
    it("carries exactly the three known policies, each bound to the verb it claims", () => {
      const rows = sqlLines(`
        select p.polname || '|' || p.polcmd::text
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'storage' and c.relname = 'objects' order by 1;
      `);
      // `polcmd::text` and not the policy's name: a policy renamed to look like a SELECT while
      // being created FOR ALL is the shape that reads correct and is not.
      expect(rows).toEqual([
        "Service uploads document files|a",
        "Users delete own document files|d",
        "Users read own document files|r",
      ]);
    });

    it("admits no non-service_role policy that fails to key on auth.uid()", () => {
      const rows = sqlLines(`
        select p.polname
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'storage' and c.relname = 'objects'
          and not (
            array_length(p.polroles, 1) = 1
            and exists (select 1 from pg_roles r where r.oid = any (p.polroles) and r.rolname = 'service_role')
          )
          and coalesce(pg_get_expr(p.polqual, c.oid), '') ||
              coalesce(pg_get_expr(p.polwithcheck, c.oid), '') not like '%auth.uid()%'
        order by 1;
      `);
      // The invariant behind D4: direct client access to this bucket is uid-keyed, or it does not
      // exist. A `case/`-prefix policy would land here the moment somebody added one.
      expect(rows).toEqual([]);
    });

    it("carries no policy that names the case prefix, in either spelling", () => {
      const rows = sqlLines(`
        select p.polname
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'storage' and c.relname = 'objects'
          and (
            coalesce(pg_get_expr(p.polqual, c.oid), '') ||
            coalesce(pg_get_expr(p.polwithcheck, c.oid), '') like '%case/%'
            or
            coalesce(pg_get_expr(p.polqual, c.oid), '') ||
            coalesce(pg_get_expr(p.polwithcheck, c.oid), '') like '%''case''%'
          )
        order by 1;
      `);
      // D4 stated as a guard rather than as prose, and it catches the policy the auth.uid() guard
      // above cannot: one that keys on `auth.uid()` somewhere and STILL admits the `case/` prefix.
      //
      // BOTH SPELLINGS, because the obvious one is not the one an author writes. A path-prefix
      // policy is spelled `(storage.foldername(name))[1] = 'case'` — the folder name, NO SLASH —
      // and `%case/%` alone sails past it. Measured: the `storage_case_read` mutant slipped this
      // test until the quoted-token pattern was added, which is exactly the silent permissiveness
      // the card warns `storage.objects` is prone to.
      expect(rows).toEqual([]);
    });
  });

  // ===================================================================================
  // The fence MV-190 promised not to cross
  // ===================================================================================
  describe("the fence", () => {
    it("leaves documents_case_kind_idx in place, UNIQUE and FULL", () => {
      const rows = sqlLines(`
        select ic.relname || '|' || i.indisunique::text || '|' || (i.indpred is null)::text
        from pg_index i
        join pg_class ic on ic.oid = i.indexrelid
        join pg_class tc on tc.oid = i.indrelid
        join pg_namespace n on n.oid = tc.relnamespace
        where n.nspname = 'public' and tc.relname = 'documents'
          and ic.relname = 'documents_case_kind_idx';
      `);
      // supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE` and the arbiter index
      // must exist and be FULL. Drop it or make it partial and every vault upsert fails at PLAN
      // time — 42501/42P10, measured three times (MV-155, MV-168).
      expect(rows).toEqual(["documents_case_kind_idx|true|true"]);
    });

    it("leaves the `documents` grant surface untouched", () => {
      const cols = sqlLines(`
        select privilege_type || ':' || column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public' and table_name = 'documents'
        order by 1;
      `);
      // SELECT-only at column scope: no INSERT and no UPDATE, exactly as Stage 2 left it. MV-190
      // touches Storage OBJECTS, never the vault's table.
      expect(cols).toEqual([
        "SELECT:case_id",
        "SELECT:created_at",
        "SELECT:file_path",
        "SELECT:file_size",
        "SELECT:id",
        "SELECT:kind",
        "SELECT:original_name",
        "SELECT:owner",
      ]);
    });

    it("leaves the %_case policy census reading 27 policies on 9 tables", () => {
      const counts = sqlLines(`
        select count(*)::text || '|' || count(distinct c.relname)::text
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and p.polname like '%\\_case';
      `);
      // Seven rollback scripts assert totals against this census. MV-190 adds no policy anywhere,
      // so it must be invisible to all of them.
      expect(counts).toEqual(["27|9"]);
    });
  });
});
