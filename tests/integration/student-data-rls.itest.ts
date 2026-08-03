/**
 * MV-159 — case-aware RLS on the nine migrated student-owned tables, evaluated as the
 * AUTHENTICATED USER against a real local Postgres.
 *
 * ## Why this file exists rather than 60 more cells in `tenant-isolation.itest.ts`
 *
 * Stage 1's harness proves 429 assertions about the six consultancy tables and **nothing** about
 * `profiles`, `assessments`, `plan_items`, `user_program_state`, `documents`, `document_status`,
 * `program_predictions`, `application_attempts` or `outcome_events` — the tables that actually
 * hold a student's data. The card asks for that gap to be closed. It is closed here, in a sibling
 * suite, for two reasons that are about MV-160 rather than about file size:
 *
 *  1. **MV-160 §D deletes exactly one `describe` block from this card's tests** — the transitional
 *     one at the foot — and is forbidden from editing any other expectation. A block that shares a
 *     file with the Stage 1 matrix makes that deletion a diff a reviewer has to read carefully
 *     instead of a file-scoped one they can check by eye.
 *  2. `tenant-isolation.itest.ts` owns a completeness guard keyed on `TENANCY_TABLES` and a CI
 *     floor of 400 assertions. Both stay untouched, so a regression in Stage 1's proof cannot be
 *     masked by a change made for Stage 2.
 *
 * The Stage 1 seam is preserved, not broken: this file owns the nine tables' *policy smoke* AND
 * their *matrix*, and duplicates neither from the two existing suites.
 *
 * ## The three properties that make any assertion here worth anything
 *
 *  1. **Every tenant query goes through an authenticated client.** `service_role` holds BYPASSRLS,
 *     so a green service-role test proves nothing at all. The admin client appears only to seed,
 *     to tear down, and to PROVE a denied read was denied rather than empty.
 *  2. **Denial is silent.** An RLS SELECT refusal returns zero rows and no error — indistinguishable
 *     from an empty table, a fixture that never seeded, or a policy that was never created. So
 *     every "sees nothing" assertion is paired with a service-role existence read, and hard
 *     denials assert `42501` rather than an absence.
 *  3. **A green suite is not evidence on its own.** Each policy was reverted on the live local
 *     database and the suite re-run; each revert turned a NAMED test red and nothing else. That
 *     table is on the card, not in this comment, because it is evidence rather than design.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  STUDENT_DATA_TABLES,
  assertLocalStack,
  createStudentDataSeeder,
  readGrantedWriteSurface,
  readUngrantedWriteTables,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type CaseKey,
  type CaselessRows,
  type StudentCaseRows,
  type StudentDataSeeder,
  type StudentDataTable,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("student-data-rls.itest.ts", url);

/**
 * The four helpers MV-159 adds. The first string is what
 * `pg_get_function_identity_arguments` renders (parameter NAME included, which is why it is not
 * just `uuid`); the second is the signature `has_function_privilege` accepts.
 */
const NEW_HELPERS: ReadonlyArray<readonly [name: string, identityArgs: string, signature: string]> = [
  ["actor_case_ids", "", "private.actor_case_ids()"],
  ["assessment_case_id", "p_assessment_id uuid", "private.assessment_case_id(uuid)"],
  ["prediction_case_id", "p_prediction_id uuid", "private.prediction_case_id(uuid)"],
  ["attempt_case_id", "p_attempt_id uuid", "private.attempt_case_id(uuid)"],
];

/** Every policy this card ships, by table. MV-160 §D re-creates this exact list. */
const EXPECTED_POLICIES: Record<StudentDataTable, ReadonlyArray<readonly [name: string, cmd: string]>> = {
  profiles: [
    ["profiles_select_case", "r"],
    ["profiles_update_case", "w"],
  ],
  assessments: [["assessments_select_case", "r"]],
  plan_items: [
    ["plan_items_select_case", "r"],
    ["plan_items_update_case", "w"],
  ],
  user_program_state: [
    ["ups_delete_case", "d"],
    ["ups_insert_case", "a"],
    ["ups_select_case", "r"],
    ["ups_update_case", "w"],
  ],
  documents: [
    // The service_role INSERT policy predates this card and survives it: upload has no
    // authenticated INSERT grant and no non-service INSERT policy (spec §4.5).
    ["Service inserts documents", "a"],
    ["documents_delete_case", "d"],
    ["documents_select_case", "r"],
  ],
  document_status: [
    ["ds_delete_case", "d"],
    ["ds_insert_case", "a"],
    ["ds_select_case", "r"],
    ["ds_update_case", "w"],
  ],
  program_predictions: [
    ["pp_delete_case", "d"],
    ["pp_insert_case", "a"],
    ["pp_select_case", "r"],
  ],
  application_attempts: [
    ["aa_delete_case", "d"],
    ["aa_insert_case", "a"],
    ["aa_select_case", "r"],
  ],
  outcome_events: [
    ["oe_delete_case", "d"],
    ["oe_insert_case", "a"],
    ["oe_select_case", "r"],
  ],
};

/**
 * The transitional disjunct, byte-exact as `pg_get_expr` renders it. MV-160 §D deletes this
 * clause from every predicate; asserting the rendered form here is what makes that a mechanical
 * edit rather than a judgement call.
 */
const TRANSITIONAL_DISJUNCT = "(owner = ( SELECT auth.uid() AS uid))";

/** The case-scoped half, likewise byte-exact — what must SURVIVE MV-160's edit. */
const CASE_BRANCH =
  "(case_id IS NOT NULL) AND (case_id = ANY (( SELECT private.actor_case_ids() AS actor_case_ids)::uuid[]))";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-159 case-aware RLS on the nine student-owned tables", () => {
  let fixture: TenancyFixture;
  let seeder: StudentDataSeeder;
  let dbContainer: string;

  /** Student data, one set per case. Keyed by the fixture's own case key. */
  const data = {} as Record<
    "orgAssignedA" | "orgUnassignedA" | "personalA" | "revocableWorkA" | "inactiveStudentA" | "orgAssignedB" | "crossStudentB",
    StudentCaseRows
  >;
  let anonymousAssessment: string;
  let caseless: CaselessRows;
  let spareProgram: string;
  let spareProgram2: string;

  const actor = (key: ActorKey): Actor => fixture.actors[key];
  const caseId = (key: CaseKey): string => fixture.cases[key];

  const psql = (statement: string): string =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { encoding: "utf8", input: statement },
    );

  const sqlLines = (statement: string): string[] =>
    psql(statement)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const sqlOne = (statement: string): string => sqlLines(statement)[0] ?? "";

  /**
   * Run a statement as the given Auth user, exactly as PostgREST does it: set the JWT claims,
   * assume the `authenticated` role, and let RLS and the column grants apply. This is the ONLY
   * way to ask a `private` helper what it returns for a real actor — `private` is not an exposed
   * PostgREST schema, which is itself a property `case-rls.itest.ts` asserts.
   */
  const sqlAs = (userId: string, statement: string): string[] =>
    sqlLines(`
      begin;
      set local request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
      set local role authenticated;
      ${statement}
      rollback;
    `)
      // psql prints a command tag for every non-SELECT statement even under `-tA`. Left in, the
      // four tags around the transaction read as four extra result rows and every count assertion
      // is off by four — a harness defect that would have made a real shortfall invisible.
      .filter((line) => !/^(BEGIN|SET|ROLLBACK|COMMIT|DO|CREATE|INSERT|UPDATE|DELETE|ANALYZE)\b/.test(line));

  /**
   * Row ids of `table` visible to `who`, sorted, AS TEXT — `plan_items.id` is a bigint and the
   * other eight are uuids, so the harness normalises to text and compares text.
   */
  const visible = async (who: Actor, table: StudentDataTable): Promise<string[]> => {
    const { data: rows, error } = await who.client.from(table).select("id");
    // An RLS denial is zero rows and NO error. An error here is a harness defect or a grant
    // problem, and reading it as "denied" is how a suite proves nothing.
    expect(error, `${who.key} reading ${table} errored (that is not a denial): ${error?.message}`).toBeNull();
    return ((rows ?? []) as Array<{ id: string | number }>).map((r) => String(r.id)).sort();
  };

  /** `plan_items.id` is a bigint, so PostgREST filters on it need the numeric form. */
  const planId = (id: string): number => Number(id);

  /** Turns "the fixture never seeded this" into a loud failure instead of a passing negative. */
  const proveExists = async (table: StudentDataTable, id: string): Promise<void> => {
    const { data: row, error } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`service-role existence proof failed on ${table}: ${error.message}`);
    if (!row) {
      throw new Error(
        `HARNESS DEFECT: ${table} row ${id} does not exist, so "sees nothing" proves nothing. ` +
          "A silent RLS denial and a missing fixture are the same observation — fix the fixture.",
      );
    }
  };

  /** Every seeded row id of a table, across every case — the universe a denial is measured against. */
  const allSeeded = (table: StudentDataTable): string[] => {
    const pick = (rows: StudentCaseRows): string[] => {
      switch (table) {
        case "profiles":
          return [rows.profile];
        case "assessments":
          return [rows.primaryAssessment, rows.secondaryAssessment];
        case "plan_items":
          return [rows.openPlanItem, rows.donePlanItem];
        case "user_program_state":
          return [rows.programState];
        case "documents":
          return [rows.document];
        case "document_status":
          return [rows.documentStatus];
        case "program_predictions":
          return [rows.prediction];
        case "application_attempts":
          return [rows.attempt];
        case "outcome_events":
          return [rows.outcomeEvent];
      }
    };
    return Object.values(data).flatMap(pick);
  };

  /** The rows of `table` that belong to the named cases. */
  const rowsOf = (table: StudentDataTable, keys: ReadonlyArray<keyof typeof data>): string[] => {
    const pick = (rows: StudentCaseRows): string[] => {
      switch (table) {
        case "profiles":
          return [rows.profile];
        case "assessments":
          return [rows.primaryAssessment, rows.secondaryAssessment];
        case "plan_items":
          return [rows.openPlanItem, rows.donePlanItem];
        case "user_program_state":
          return [rows.programState];
        case "documents":
          return [rows.document];
        case "document_status":
          return [rows.documentStatus];
        case "program_predictions":
          return [rows.prediction];
        case "application_attempts":
          return [rows.attempt];
        case "outcome_events":
          return [rows.outcomeEvent];
      }
    };
    return keys.flatMap((k) => pick(data[k])).sort();
  };

  beforeAll(async () => {
    dbContainer =
      process.env.SUPABASE_TEST_DB_CONTAINER ??
      execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean)[0]!;

    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    seeder = createStudentDataSeeder(fixture);

    const programs = sqlLines("select id from public.programs order by id limit 9;");
    expect(programs.length, "HARNESS DEFECT: fewer than 9 programs seeded by the migrations").toBe(9);
    spareProgram = programs[7]!;
    spareProgram2 = programs[8]!;

    // `owner` is NULL on every ORG case. That is the consultancy row shape (MV-156), and it is
    // also forced: MV-155 §H's derive triggers on `user_program_state` / `document_status` fire
    // `when (new.owner is not null)` and would rewrite `case_id` to the owner's PERSONAL case.
    data.orgAssignedA = await seeder.seedStudentCase({
      label: "orgA-assigned",
      caseId: caseId("orgAssignedA"),
      owner: null,
      programId: programs[0]!,
      documentKind: "passport",
    });
    data.orgUnassignedA = await seeder.seedStudentCase({
      label: "orgA-unassigned",
      caseId: caseId("orgUnassignedA"),
      owner: null,
      programId: programs[1]!,
      documentKind: "coe",
    });
    data.revocableWorkA = await seeder.seedStudentCase({
      label: "orgA-revocable",
      caseId: caseId("revocableWorkA"),
      owner: null,
      programId: programs[2]!,
      documentKind: "medical",
    });
    data.inactiveStudentA = await seeder.seedStudentCase({
      label: "orgA-revoked-members-own",
      caseId: caseId("inactiveStudentA"),
      owner: null,
      programId: programs[3]!,
      documentKind: "oshc",
    });
    data.orgAssignedB = await seeder.seedStudentCase({
      label: "orgB-assigned",
      caseId: caseId("orgAssignedB"),
      owner: null,
      programId: programs[4]!,
      documentKind: "birth-certificate",
    });
    data.crossStudentB = await seeder.seedStudentCase({
      label: "orgB-student-is-orgA-admin",
      caseId: caseId("crossStudentB"),
      owner: null,
      programId: programs[5]!,
      documentKind: "offer-letter",
    });
    // The personal case is the ONE that carries `owner`, exactly as MV-155's backfill produces it.
    data.personalA = await seeder.seedStudentCase({
      label: "personal",
      caseId: caseId("personalA"),
      owner: actor("studentA").id,
      programId: programs[6]!,
      documentKind: "ielts",
    });

    anonymousAssessment = await seeder.seedAnonymousAssessment();
    caseless = await seeder.seedCaselessRows({ owner: actor("studentA").id, documentKind: "pte" });
  }, 180_000);

  afterAll(async () => {
    // MUST precede teardown: every one of the nine references `cases` ON DELETE RESTRICT.
    if (seeder) await seeder.cleanup();
    if (fixture) await fixture.teardown();
  }, 120_000);

  // ===================================================================================
  // A  the swap landed — catalogue shape, read from pg_catalog rather than assumed
  // ===================================================================================
  describe("the policy swap landed on all nine", () => {
    it("keeps RLS enabled AND forced on every one of the nine after the swap", () => {
      const rows = sqlLines(`
        select c.relname || '=' || c.relrowsecurity || '/' || c.relforcerowsecurity
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      // `documents` only gained FORCE in a later fix migration, so it is the one most likely to
      // lose it in a policy rewrite. Asserted from the catalogue, never assumed.
      expect(rows).toEqual(STUDENT_DATA_TABLES.map((t) => `${t}=true/true`).sort());
    });

    it("leaves no legacy owner-only policy behind on any of the nine", () => {
      const survivors = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
           and (p.polname like '%\\_own' or p.polname in ('Users read own documents', 'Users delete own documents'))
         order by 1;
      `);
      expect(survivors).toEqual([]);
    });

    it.each(STUDENT_DATA_TABLES)("ships exactly the expected policy set on %s, one per command", (table) => {
      const rows = sqlLines(`
        select p.polname || '|' || p.polcmd::text
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = '${table}'
         order by 1;
      `);
      expect(rows).toEqual(EXPECTED_POLICIES[table].map(([name, cmd]) => `${name}|${cmd}`).sort());

      // One policy per table per command: two PERMISSIVE policies for the same command OR
      // together, so a second one can only ever WIDEN — the `multiple_permissive_policies`
      // advisor finding, asserted structurally instead of read off a dashboard.
      const cmds = EXPECTED_POLICIES[table].map(([, cmd]) => cmd);
      expect(new Set(cmds).size, `${table} has two policies for one command`).toBe(cmds.length);
    });

    it("scopes every new policy to `authenticated` — the `documents` PUBLIC hole is closed", () => {
      // The two legacy `documents` policies carried NO `to` clause, so they applied to PUBLIC,
      // which includes `anon`. Nothing was exploitable because `anon` holds no grant here — that
      // is exactly the latent-grant class MV-152 found on helper EXECUTE, and it is one grant
      // edit away from mattering. Spec §9.9 records the mirror case (`storage.objects`) where
      // the net does NOT exist.
      const roles = sqlLines(`
        select c.relname || '.' || p.polname || ' -> ' ||
               coalesce((select string_agg(r.rolname, ',' order by r.rolname)
                           from pg_roles r where r.oid = any(p.polroles)), 'PUBLIC')
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      const notAuthenticated = roles.filter((r) => !r.endsWith("-> authenticated"));
      // Exactly one exception, and it is named: the pre-existing service_role INSERT on documents.
      expect(notAuthenticated).toEqual(["documents.Service inserts documents -> service_role"]);
    });

    it("carries both USING and WITH CHECK on every UPDATE policy", () => {
      const bad = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
           and p.polcmd = 'w'
           and (p.polqual is null or p.polwithcheck is null)
         order by 1;
      `);
      expect(bad).toEqual([]);
    });

    it("keeps program_predictions and outcome_events free of any UPDATE policy, permanently", () => {
      const updatePolicies = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('program_predictions', 'application_attempts', 'outcome_events')
           and p.polcmd in ('w', '*')
         order by 1;
      `);
      expect(updatePolicies).toEqual([]);
    });

    it("puts no inline subquery against a public table in any predicate — every lookup is a helper", () => {
      // THE RECURSION LANDMINE, structurally. `pp_insert_own`, `aa_insert_own` and `oe_insert_own`
      // each carried an inline `exists` against a peer table; those peers now have policies of
      // their own. Two failures follow: 42P17 for a predicate that reads a table whose policy
      // reads back, and — the quieter one — a SILENT DENIAL, because a table referenced inside a
      // policy expression has its own RLS applied.
      const offenders = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
           and (
             coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '(FROM|JOIN)\\s+(public\\.)?(${STUDENT_DATA_TABLES.join("|")}|cases|organization_memberships|case_assignments)\\M'
             or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '(FROM|JOIN)\\s+(public\\.)?(${STUDENT_DATA_TABLES.join("|")}|cases|organization_memberships|case_assignments)\\M'
           )
         order by 1;
      `);
      expect(offenders).toEqual([]);
    });
  });

  // ===================================================================================
  // B  the transitional disjunct is uniform, so MV-160's removal is a predicate edit
  // ===================================================================================
  describe("MV-160 can retire the owner disjunct with a predicate edit and nothing else", () => {
    it("writes the disjunct identically in every predicate, as the outermost OR", () => {
      const predicates = sqlLines(`
        select c.relname || '.' || p.polname || '@' || kind || '::' ||
               replace(replace(expr, e'\\n', ' '), '  ', ' ')
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral (
            values ('using', pg_get_expr(p.polqual, p.polrelid)),
                   ('check', pg_get_expr(p.polwithcheck, p.polrelid))
          ) as v(kind, expr)
         where n.nspname = 'public'
           and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
           and p.polname <> 'Service inserts documents'
           and v.expr is not null
         order by 1;
      `);

      // 24 policies; every SELECT/INSERT/DELETE contributes one expression and every UPDATE two.
      expect(predicates.length, "every new policy must carry a predicate").toBe(28);

      for (const line of predicates) {
        const expr = line.split("::").slice(1).join("::");
        expect(expr, `${line}: the transitional disjunct is missing or reshaped`).toContain(TRANSITIONAL_DISJUNCT);
        expect(expr, `${line}: the case branch is missing or reshaped`).toContain(CASE_BRANCH);
        // Exactly once. A second copy would mean the disjunct was woven into the case branch, and
        // MV-160's edit would have to restructure rather than delete.
        expect(
          expr.split(TRANSITIONAL_DISJUNCT).length - 1,
          `${line}: the owner disjunct appears more than once`,
        ).toBe(1);
        // And it is the LEFT operand of the outermost OR: everything before it is opening
        // parentheses. A predicate MV-160 has to restructure is a predicate MV-160 will get wrong.
        const prefix = expr.slice(0, expr.indexOf(TRANSITIONAL_DISJUNCT));
        expect(prefix.replace(/[\s(]/g, ""), `${line}: the owner disjunct is not the outermost OR`).toBe("");
      }
    });
  });

  // ===================================================================================
  // C  the four new definer helpers
  // ===================================================================================
  describe("the new private helpers are hardened the same way MV-152's are", () => {
    it.each(NEW_HELPERS)(
      "ships private.%s(%s) SECURITY DEFINER + STABLE with a pinned empty search_path",
      (name, identityArgs) => {
        const row = sqlOne(`
        select p.prosecdef::text || '|' || p.provolatile::text || '|' ||
               coalesce(array_to_string(p.proconfig, ','), 'NO-CONFIG')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private' and p.proname = '${name}'
           and pg_get_function_identity_arguments(p.oid) = '${identityArgs}';
      `);
        expect(row, `private.${name}(${identityArgs}) is missing`).not.toBe("");
        const [secdef, volatility, config] = row.split("|");
        expect(secdef, "must be SECURITY DEFINER — that is the anti-recursion mechanism").toBe("true");
        expect(volatility, "must be STABLE").toBe("s");
        // Rendered as `search_path=""`. A hostile search_path cannot redirect a definer's reads.
        expect(config, "must pin an empty search_path").toContain("search_path=");
      },
    );

    it("revokes EXECUTE from PUBLIC and grants it to authenticated only", () => {
      // A new function's EXECUTE defaults to PUBLIC and `anon` is in PUBLIC. MV-152 shipped that
      // latent grant on its first green and only caught it with an assertion; this inherits it.
      for (const [, , signature] of NEW_HELPERS) {
        expect(sqlOne(`select has_function_privilege('anon', '${signature}', 'execute');`), `anon on ${signature}`).toBe(
          "f",
        );
        expect(
          sqlOne(`select has_function_privilege('authenticated', '${signature}', 'execute');`),
          `authenticated on ${signature}`,
        ).toBe("t");
      }
    });

    it("owns them with a role that actually holds BYPASSRLS", () => {
      // Without it the helpers' reads are re-filtered by the policies that called them — which is
      // not an abort, it is a SILENT under-read that empties every client.
      for (const [name, identityArgs] of NEW_HELPERS) {
        expect(
          sqlOne(`
            select r.rolbypassrls from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              join pg_roles r on r.oid = p.proowner
             where n.nspname = 'private' and p.proname = '${name}'
               and pg_get_function_identity_arguments(p.oid) = '${identityArgs}';
          `),
          `private.${name}(${identityArgs}) owner must hold BYPASSRLS`,
        ).toBe("t");
      }
    });
  });

  // ===================================================================================
  // D  actor_case_ids() IS can_access_case, set-wise — measured, not asserted by comment
  // ===================================================================================
  describe("private.actor_case_ids() cannot drift from private.can_access_case", () => {
    it("returns exactly the cases can_access_case admits, for every actor and every case", () => {
      const everyCase = Object.values(fixture.cases);
      const mismatches: string[] = [];
      for (const key of Object.keys(fixture.actors) as ActorKey[]) {
        const id = fixture.actors[key].id;
        const rows = sqlAs(
          id,
          `select c.id::text || '|' || (c.id = any(private.actor_case_ids()))::text || '|' ||
                  private.can_access_case(c.id)::text
             from (select unnest(array[${everyCase.map((c) => `'${c}'::uuid`).join(",")}]) as id) c
            order by 1;`,
        );
        expect(rows.length, `HARNESS DEFECT: no rows for ${key}`).toBe(everyCase.length);
        for (const row of rows) {
          const [cid, inSet, accessible] = row.split("|");
          if (inSet !== accessible) mismatches.push(`${key} / ${cid}: actor_case_ids=${inSet} can_access_case=${accessible}`);
        }
      }
      expect(mismatches, "actor_case_ids() and can_access_case have diverged").toEqual([]);
    });

    it("does NOT gate the student-link arm on membership status — the dual-role rule, and MV-160's safety", () => {
      // Load-bearing twice: it is the canonical dual-role rule (a revoked staff member who is the
      // linked student of their own case keeps that case), AND it is what makes MV-160's removal
      // of the owner disjunct safe — `owner = auth.uid()` implies the case branch ONLY because a
      // personal case is always reachable by its linked student.
      const revoked = actor("dualInactiveA");
      const reachable = sqlAs(revoked.id, "select unnest(private.actor_case_ids())::text order by 1;");
      expect(reachable, "the revoked member's OWN case survives revocation").toContain(caseId("inactiveStudentA"));
      // …and the org half is gone: the case they were assigned to as staff is not reachable.
      expect(reachable, "a revoked membership confers nothing on the org side").not.toContain(caseId("inactiveWorkA"));

      // The personal case is reachable ONLY through this arm: it has organization_id null, so the
      // admin arm cannot match it and the assignment arm's membership join has no org to join on.
      const student = actor("studentA");
      expect(
        sqlAs(student.id, "select unnest(private.actor_case_ids())::text order by 1;"),
        "a student's personal case must be reachable, or MV-160 hides every student's own data",
      ).toContain(caseId("personalA"));
    });
  });

  // ===================================================================================
  // E  the positive matrix — as the authenticated user, on all nine
  // ===================================================================================
  describe("the positive matrix: everyone reaches exactly the cases they may", () => {
    const REACHES: ReadonlyArray<{ actor: ActorKey; cases: ReadonlyArray<keyof typeof data>; why: string }> = [
      {
        actor: "studentA",
        cases: ["personalA", "orgAssignedA"],
        why: "the linked student of one org case, and the student of their own personal case",
      },
      {
        actor: "ownerA",
        cases: ["orgAssignedA", "orgUnassignedA", "revocableWorkA", "inactiveStudentA"],
        why: "an org owner reaches every case in their organization",
      },
      {
        actor: "adminA",
        cases: ["orgAssignedA", "orgUnassignedA", "revocableWorkA", "inactiveStudentA"],
        why: "an org admin reaches every case in their organization",
      },
      {
        actor: "counsellorAssignedA",
        cases: ["orgAssignedA"],
        why: "an ASSIGNED counsellor reaches their assigned case's student data and no other",
      },
      { actor: "counsellorUnassignedA", cases: [], why: "an active membership alone reaches no case's student data" },
      { actor: "studentB", cases: ["orgAssignedB"], why: "a student reaches only the case linked to their account" },
      {
        actor: "crossTenantDual",
        cases: ["orgAssignedA", "orgUnassignedA", "revocableWorkA", "inactiveStudentA", "crossStudentB"],
        why: "org A admin (staff) PLUS the linked student of an org B case — additive, never laundered",
      },
      { actor: "outsider", cases: [], why: "no membership, no link, no rows" },
      {
        actor: "forger",
        cases: [],
        why: "app_metadata claiming org ownership is not authorization — only membership rows are",
      },
    ];

    for (const { actor: actorKey, cases: reachable, why } of REACHES) {
      it.each(STUDENT_DATA_TABLES)(`${actorKey} sees exactly their cases' %s rows — ${why}`, async (table) => {
        const who = actor(actorKey);
        const expected = rowsOf(table, reachable);
        const seen = await visible(who, table);
        // Rows this actor may NOT see, proven to EXIST — otherwise an empty result is worthless.
        const denied = allSeeded(table).filter((id) => !expected.includes(id));
        for (const id of denied) await proveExists(table, id);
        expect(seen.filter((id) => allSeeded(table).includes(id))).toEqual(expected);
        for (const id of denied) {
          expect(seen, `${actorKey} must not see ${table} row ${id}`).not.toContain(id);
        }
      });
    }

    it("shows anon nothing on any of the nine — the `to authenticated` clause, doing its job", async () => {
      for (const table of STUDENT_DATA_TABLES) {
        const { data: rows } = await fixture.anon.from(table).select("id");
        expect(rows ?? [], `anon must see no ${table}`).toEqual([]);
      }
      // Paired existence proof: the rows are there, anon simply cannot have them.
      await proveExists("profiles", data.orgAssignedA.profile);
      await proveExists("documents", data.orgAssignedA.document);
    });
  });

  // ===================================================================================
  // F  cross-tenant WRITE denial, and the completeness guard that keeps it honest
  // ===================================================================================
  describe("cross-tenant write denial on every verb `authenticated` actually holds", () => {
    const attempted = new Set<string>();
    const record = (key: string) => attempted.add(key);

    /** Service-role read-back that fails loudly rather than reading as "the write did not land". */
    const rowStill = async (table: StudentDataTable, id: string): Promise<Record<string, unknown> | null> => {
      const { data: row, error } = await fixture.admin.from(table).select("*").eq("id", id).maybeSingle();
      expect(error, `HARNESS DEFECT: service-role read of ${table} failed — that is not a denial`).toBeNull();
      return row as Record<string, unknown> | null;
    };

    it("refuses org A's owner and admin every write against org B's student data", async () => {
      const victim = data.orgAssignedB;
      for (const attackerKey of ["ownerA", "adminA", "counsellorAssignedA"] as const) {
        const attacker = actor(attackerKey);

        // ---- UPDATE, column by column, exactly as the grants are ---------------------------
        const updates: Array<[StudentDataTable, string, Record<string, unknown>, string[]]> = [
          ["profiles", victim.profile, { sections: { hacked: true }, completeness: 99 }, ["sections", "completeness"]],
          [
            "plan_items",
            victim.openPlanItem,
            { status: "done", completed_at: new Date().toISOString(), started_at: new Date().toISOString() },
            ["status", "completed_at", "started_at"],
          ],
          [
            "user_program_state",
            victim.programState,
            { status: "withdrawn", notes: "hacked", owner: attacker.id, program_id: victim.programId },
            ["status", "notes", "owner", "program_id"],
          ],
          [
            "document_status",
            victim.documentStatus,
            { obtained: false, owner: attacker.id, kind: victim.documentKind },
            ["obtained", "owner", "kind"],
          ],
        ];
        for (const [table, id, patch, columns] of updates) {
          for (const column of columns) record(`${table}.update(${column})`);
          const before = await rowStill(table, id);
          await attacker.client
            .from(table)
            .update(patch as never)
            .eq("id", id);
          // An UPDATE the policy's USING clause does not match affects ZERO rows and returns no
          // error — silent, like every other denial here. The proof is the row, not the error.
          expect(await rowStill(table, id), `${attackerKey} changed ${table} across the boundary`).toEqual(before);
        }

        // ---- DELETE -------------------------------------------------------------------------
        const deletes: Array<[StudentDataTable, string]> = [
          ["documents", victim.document],
          ["user_program_state", victim.programState],
          ["document_status", victim.documentStatus],
          ["outcome_events", victim.outcomeEvent],
          ["application_attempts", victim.attempt],
          ["program_predictions", victim.prediction],
        ];
        for (const [table, id] of deletes) {
          record(`${table}.delete`);
          await attacker.client.from(table).delete().eq("id", id);
          expect(await rowStill(table, id), `${attackerKey} deleted ${table} across the boundary`).not.toBeNull();
        }

        // ---- INSERT into the victim's case ---------------------------------------------------
        const inserts: Array<[StudentDataTable, Record<string, unknown>]> = [
          [
            "user_program_state",
            { owner: null, case_id: victim.caseId, program_id: victim.programId, status: "withdrawn" },
          ],
          ["document_status", { owner: null, case_id: victim.caseId, kind: "loan-sanction", obtained: true }],
          [
            "program_predictions",
            {
              owner: null,
              case_id: victim.caseId,
              assessment_id: victim.primaryAssessment,
              program_id: victim.programId,
              verdict: "strong",
              rule_version: "mv159-attack",
              score_snapshot: {},
            },
          ],
          [
            "application_attempts",
            { owner: null, case_id: victim.caseId, prediction_id: victim.prediction, program_id: victim.programId },
          ],
          [
            "outcome_events",
            {
              owner: null,
              case_id: victim.caseId,
              attempt_id: victim.attempt,
              event_type: "visa_granted",
              gate: "visa",
              source: "self_reported",
              occurred_at: new Date().toISOString(),
            },
          ],
        ];
        for (const [table, row] of inserts) {
          record(`${table}.insert`);
          const { error } = await attacker.client.from(table).insert(row as never);
          // INSERT is the one verb whose denial is LOUD: a WITH CHECK rejection is 42501.
          expect(error?.code, `${attackerKey} inserted into ${table} across the boundary`).toBe("42501");
        }
      }
    }, 120_000);

    // The three ungranted `assessments` verbs. Declared BEFORE the completeness guard because
    // vitest runs `it`s in declaration order and the guard counts what has actually run.
    it("refuses every assessments write — the refusal is the missing grant, not a predicate", async () => {
      const student = actor("studentA");
      record("assessments.insert");
      record("assessments.update");
      record("assessments.delete");
      const own = data.personalA.primaryAssessment;

      const insert = await student.client.from("assessments").insert({
        owner: student.id,
        case_id: caseId("personalA"),
        result: {},
        rule_version: "x",
        destination_id: "AU",
        profile_snapshot: {},
        expires_at: new Date().toISOString(),
      } as never);
      expect(insert.error?.code, "assessments INSERT is Stage 3 (spec §6)").toBe("42501");

      const update = await student.client.from("assessments").update({ is_primary: false } as never).eq("id", own);
      expect(update.error?.code, "assessments UPDATE is Stage 3 (spec §6)").toBe("42501");

      const del = await student.client.from("assessments").delete().eq("id", own);
      expect(del.error?.code, "assessments DELETE is Stage 3 (spec §6)").toBe("42501");
      expect(await rowStill("assessments", own), "and the row survived every one").not.toBeNull();
    });

    it("attempted every write verb the LIVE GRANT SET hands `authenticated` on the nine", () => {
      // Both sides derived: the grant list comes out of `information_schema` at run time and the
      // probe list is recorded by the probes that actually ran. Add a grant to any of the nine
      // and this fails until somebody probes it. That mechanism is MV-153's, generalised rather
      // than re-implemented — round 2 shipped a hand-written literal and the claim was false.
      //
      // MV-159 had to FIX the reader to make it true here: INSERT was read from
      // `role_table_grants`, and MV-155 §H's column-level INSERT grants write no row there, so
      // five of the nine reported "no INSERT grant" while holding one.
      const granted = readGrantedWriteSurface(STUDENT_DATA_TABLES);
      expect(granted.length, "HARNESS DEFECT: the grant catalogue query returned nothing").toBeGreaterThan(0);

      const ungranted = readUngrantedWriteTables<StudentDataTable>(STUDENT_DATA_TABLES);
      // `assessments` holds SELECT and nothing else, so its refusal is the ABSENCE of a grant
      // rather than a policy — attempted anyway, immediately above.
      expect(ungranted, "assessments is the only one of the nine with no write grant").toEqual(["assessments"]);

      const required = [...granted, ...ungranted.flatMap((t) => [`${t}.insert`, `${t}.update`, `${t}.delete`])].sort();
      expect([...attempted].sort(), "every write verb `authenticated` holds must be probed across the boundary").toEqual(
        required,
      );
    });
  });

  // ===================================================================================
  // F2  the POSITIVE half of INSERT and DELETE — without which the negatives above are inert
  // ===================================================================================
  // MUTATION TESTING FOUND THIS GAP, WHICH IS THE ONLY REASON IT EXISTS. Dropping
  // `ups_delete_case` on the live database turned only STRUCTURAL tests red — the catalogue and
  // the disjunct-shape check — and no behavioural one. The reason is exact and it is the classic
  // silent-RLS trap: with the DELETE policy GONE, nobody can delete, so the cross-tenant probe's
  // "the row survived" assertion passes just as happily against a table with no policy at all as
  // against a correct one. The same held for `ups_insert_case` and `ds_insert_case`, whose only
  // behavioural coverage was a 42501 that an absent policy also produces.
  //
  // A negative-only probe cannot distinguish "correctly denied" from "denied because the policy
  // is missing". Each verb therefore needs an authorized actor exercising it successfully, on
  // disposable rows so a success cannot take the fixture with it.
  describe("the granted verbs actually work for an authorized actor", () => {
    it("lets an assigned counsellor INSERT the two upsert-seam tables, consultancy-shaped", async () => {
      const counsellor = actor("counsellorAssignedA");
      const target = caseId("orgAssignedA");

      const ups = await counsellor.client
        .from("user_program_state")
        .insert({ owner: null, case_id: target, program_id: spareProgram, status: "shortlisted" } as never)
        .select("id, owner, case_id")
        .single();
      expect(ups.error, `user_program_state INSERT must succeed: ${ups.error?.message}`).toBeNull();
      expect(ups.data!.owner, "the row carries no Auth user — spec §7.2's write half").toBeNull();
      expect(ups.data!.case_id).toBe(target);

      const ds = await counsellor.client
        .from("document_status")
        .insert({ owner: null, case_id: target, kind: "loan-sanction", obtained: true } as never)
        .select("id, owner, case_id")
        .single();
      expect(ds.error, `document_status INSERT must succeed: ${ds.error?.message}`).toBeNull();
      expect(ds.data!.owner).toBeNull();
      expect(ds.data!.case_id).toBe(target);

      // …and the same actor can DELETE what it just created, which is the other half of the pair.
      //
      // A DENIED DELETE IS SILENT — zero rows affected, no error — so `expect(error).toBeNull()`
      // passes just as happily against a table with no DELETE policy at all. The row must be read
      // back through the service role and shown GONE. The first version of this test checked the
      // read-back for `user_program_state` only, and mutation testing caught it immediately:
      // dropping `ds_delete_case` left the suite behaviourally green.
      for (const [table, id] of [
        ["user_program_state", ups.data!.id],
        ["document_status", ds.data!.id],
      ] as Array<[StudentDataTable, string]>) {
        const { error } = await counsellor.client.from(table).delete().eq("id", id);
        expect(error, `${table} DELETE must succeed: ${error?.message}`).toBeNull();
        const { data: still } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
        expect(still, `${table}: the delete did not remove the row — proved service-role, not by absence`).toBeNull();
      }
    });

    it("lets an assigned counsellor DELETE a document and the whole prediction chain of their case", async () => {
      const counsellor = actor("counsellorAssignedA");
      const target = data.orgAssignedA;

      // Disposable rows, seeded service-role so a failure here is a fixture failure rather than a
      // policy result. Distinct kind / program / rule_version so no uniqueness rule collides with
      // the rows the rest of the suite depends on.
      const { data: doc, error: docSeed } = await fixture.admin
        .from("documents")
        .insert({
          owner: null,
          case_id: target.caseId,
          kind: "loan-sanction",
          file_path: "mv159/loan-sanction/disposable.pdf",
          file_size: 1,
          original_name: "disposable.pdf",
        } as never)
        .select("id")
        .single();
      expect(docSeed, `HARNESS DEFECT: could not seed a disposable document: ${docSeed?.message}`).toBeNull();

      const { data: pred } = await fixture.admin
        .from("program_predictions")
        .insert({
          owner: null,
          case_id: target.caseId,
          assessment_id: target.primaryAssessment,
          program_id: spareProgram2,
          verdict: "reach",
          rule_version: "mv159-disposable",
          score_snapshot: {},
        } as never)
        .select("id")
        .single();
      const { data: att } = await fixture.admin
        .from("application_attempts")
        .insert({ owner: null, case_id: target.caseId, prediction_id: pred!.id, program_id: spareProgram2 } as never)
        .select("id")
        .single();
      const { data: evt } = await fixture.admin
        .from("outcome_events")
        .insert({
          owner: null,
          case_id: target.caseId,
          attempt_id: att!.id,
          event_type: "applied",
          gate: "admission",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();

      // Child before parent: the single-column FKs cascade, but deleting in this order is what
      // proves each policy separately instead of letting one cascade stand in for three.
      for (const [table, id] of [
        ["outcome_events", evt!.id],
        ["application_attempts", att!.id],
        ["program_predictions", pred!.id],
        ["documents", doc!.id],
      ] as Array<[StudentDataTable, string]>) {
        const { error } = await counsellor.client.from(table).delete().eq("id", id);
        expect(error, `${table} DELETE must succeed for the assigned counsellor: ${error?.message}`).toBeNull();
        const { data: still } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
        expect(still, `${table}: the delete did not remove the row`).toBeNull();
      }
    });

    it("lets the linked student delete their OWN case's document, and refuses an unassigned counsellor", async () => {
      const student = actor("studentA");
      const unassigned = actor("counsellorUnassignedA");

      const { data: doc } = await fixture.admin
        .from("documents")
        .insert({
          owner: student.id,
          case_id: caseId("personalA"),
          kind: "sponsor-income",
          file_path: `${student.id}/sponsor-income/x.pdf`,
          file_size: 1,
          original_name: "x.pdf",
        } as never)
        .select("id")
        .single();

      // Silent denial first, paired with the existence proof that makes it mean anything.
      await unassigned.client.from("documents").delete().eq("id", doc!.id);
      await proveExists("documents", doc!.id);

      const { error } = await student.client.from("documents").delete().eq("id", doc!.id);
      expect(error, `the owner must be able to delete their own document: ${error?.message}`).toBeNull();
      const { data: still } = await fixture.admin.from("documents").select("id").eq("id", doc!.id).maybeSingle();
      expect(still).toBeNull();
    });
  });

  // ===================================================================================
  // G  the Stage 3 deferral, asserted as a NEGATIVE so it cannot rot
  // ===================================================================================
  describe("the four deferred consultancy write paths stay 42501 (spec §6, §7.2)", () => {
    // An assigned counsellor IS the Postgres role `authenticated`. RLS narrows a grant and never
    // widens one, so these four are refused by the ABSENT GRANT and no policy on this card could
    // unblock them. When Stage 3 grants them this test goes red and forces the reviewer to the
    // grant decision instead of letting it land unnoticed.
    it.each([
      ["profiles", { case_id: null as string | null, sections: {}, completeness: 0 }],
      [
        "assessments",
        { case_id: null as string | null, result: {}, rule_version: "x", destination_id: "AU", profile_snapshot: {}, expires_at: new Date().toISOString() },
      ],
      ["plan_items", { case_id: null as string | null, kind: "mv159-deferred", impact: "low", title: "t", status: "todo" }],
      [
        "documents",
        { case_id: null as string | null, kind: "loan-sanction", file_path: "x/loan-sanction/x.pdf", file_size: 1, original_name: "x.pdf" },
      ],
    ] as const)("refuses an ASSIGNED counsellor INSERT on %s — no grant, therefore 42501", async (table, template) => {
      const counsellor = actor("counsellorAssignedA");
      const row = { ...template, owner: null, case_id: caseId("orgAssignedA") };
      const { error } = await counsellor.client.from(table as StudentDataTable).insert(row as never);
      expect(error?.code, `${table} INSERT must remain 42501 until Stage 3 grants it`).toBe("42501");
    });
  });

  // ===================================================================================
  // H  parent-case re-assertion on the prediction -> attempt -> outcome chain
  // ===================================================================================
  describe("child rows may only attach to a parent in a case the actor can reach", () => {
    const created: Array<[StudentDataTable, string]> = [];
    afterAll(async () => {
      for (const [table, id] of created.reverse()) await fixture.admin.from(table).delete().eq("id", id);
    });

    it("lets an assigned counsellor insert a CONSULTANCY-shaped chain: case_id set, owner NULL", async () => {
      // This is spec §7.2's "write half" on the three chain tables, and the property Stage 3
      // depends on: a write path that needs no Auth user at all.
      const counsellor = actor("counsellorAssignedA");
      const target = data.orgAssignedA;

      const { data: pred, error: predError } = await counsellor.client
        .from("program_predictions")
        .insert({
          owner: null,
          case_id: target.caseId,
          assessment_id: target.secondaryAssessment,
          program_id: target.programId,
          verdict: "strong",
          rule_version: "mv159-counsellor",
          score_snapshot: { total: 80 },
        } as never)
        .select("id, owner, case_id")
        .single();
      expect(predError, `counsellor prediction insert failed: ${predError?.message}`).toBeNull();
      created.push(["program_predictions", pred!.id]);
      expect(pred!.owner, "the row carries no Auth user").toBeNull();
      expect(pred!.case_id).toBe(target.caseId);

      const { data: att, error: attError } = await counsellor.client
        .from("application_attempts")
        .insert({ owner: null, case_id: target.caseId, prediction_id: pred!.id, program_id: target.programId } as never)
        .select("id")
        .single();
      expect(attError, `counsellor attempt insert failed: ${attError?.message}`).toBeNull();
      created.push(["application_attempts", att!.id]);

      const { data: evt, error: evtError } = await counsellor.client
        .from("outcome_events")
        .insert({
          owner: null,
          case_id: target.caseId,
          attempt_id: att!.id,
          event_type: "offer_received",
          gate: "admission",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      expect(evtError, `counsellor event insert failed: ${evtError?.message}`).toBeNull();
      created.push(["outcome_events", evt!.id]);
    });

    it("refuses a child whose parent lives in another case", async () => {
      const counsellor = actor("counsellorAssignedA");
      const mine = data.orgAssignedA;
      const theirs = data.orgAssignedB;

      // A prediction in MY case naming ANOTHER case's assessment.
      const crossParent = await counsellor.client.from("program_predictions").insert({
        owner: null,
        case_id: mine.caseId,
        assessment_id: theirs.primaryAssessment,
        program_id: mine.programId,
        verdict: "reach",
        rule_version: "mv159-cross",
        score_snapshot: {},
      } as never);
      expect(crossParent.error?.code, "case parentage must be re-asserted, not assumed").toBe("42501");

      const crossAttempt = await counsellor.client.from("application_attempts").insert({
        owner: null,
        case_id: mine.caseId,
        prediction_id: theirs.prediction,
        program_id: mine.programId,
      } as never);
      expect(crossAttempt.error?.code).toBe("42501");

      const crossEvent = await counsellor.client.from("outcome_events").insert({
        owner: null,
        case_id: mine.caseId,
        attempt_id: theirs.attempt,
        event_type: "applied",
        gate: "admission",
        source: "self_reported",
        occurred_at: new Date().toISOString(),
      } as never);
      expect(crossEvent.error?.code).toBe("42501");
    });

    it("refuses a prediction hung off an ANONYMOUS assessment — why the clause is `=` and not `is not distinct from`", async () => {
      // An unclaimed assessment is `owner NULL, case_id NULL` and its id travels in a shareable
      // URL. Under `is not distinct from`, a child with a NULL case_id would compare TRUE against
      // it and any signed-in client could hang a prediction-of-record off a stranger's
      // assessment — which the legacy policy's `a.owner = uid` refused. Plain `=` yields NULL,
      // and a WITH CHECK admits a row only on TRUE.
      await proveExists("assessments", anonymousAssessment);
      const student = actor("studentA");
      const { error } = await student.client.from("program_predictions").insert({
        owner: student.id,
        case_id: null,
        assessment_id: anonymousAssessment,
        program_id: data.personalA.programId,
        verdict: "strong",
        rule_version: "mv159-anon-parent",
        score_snapshot: {},
      } as never);
      expect(error?.code, "a case-less child must not attach to a case-less parent").toBe("42501");
    });

    it("keeps outcome_events' two non-ownership integrity clauses — no client self-certification", async () => {
      // `source = 'self_reported'` and `verified_by IS NULL` are not about ownership and spec §4.9
      // requires them to survive the rewrite. Dropping them while "making the policy case-aware"
      // would let a client record an `official_verified` visa grant.
      const student = actor("studentA");
      const own = data.personalA;
      const base = {
        owner: student.id,
        case_id: own.caseId,
        attempt_id: own.attempt,
        event_type: "visa_granted",
        gate: "visa",
        occurred_at: new Date().toISOString(),
      };

      const selfCertified = await student.client
        .from("outcome_events")
        .insert({ ...base, source: "official_verified" } as never);
      expect(selfCertified.error?.code, "a client may not self-certify an official verdict").toBe("42501");

      const preVerified = await student.client
        .from("outcome_events")
        .insert({ ...base, source: "self_reported", verified_by: student.id } as never);
      expect(preVerified.error?.code, "a client may not stamp its own verifier").toBe("42501");
    });
  });

  // ===================================================================================
  // I  no re-point: a row cannot be carried out of its case by any client on any path
  // ===================================================================================
  describe("re-pointing a row into another case is unexpressible, not merely rejected", () => {
    it("refuses an UPDATE naming case_id on every update-granted table — the column grant, 42501", async () => {
      const student = actor("studentA");
      const target = caseId("orgAssignedB");
      const probes: Array<[StudentDataTable, string]> = [
        ["profiles", data.personalA.profile],
        ["plan_items", data.personalA.openPlanItem],
        ["user_program_state", data.personalA.programState],
        ["document_status", data.personalA.documentStatus],
      ];
      for (const [table, id] of probes) {
        const { error } = await student.client
          .from(table)
          .update({ case_id: target } as never)
          .eq("id", id);
        expect(error?.code, `${table}: an authenticated UPDATE naming case_id must be 42501`).toBe("42501");
        const { data: row } = await fixture.admin.from(table).select("case_id").eq("id", id).single();
        expect((row as { case_id: string }).case_id, `${table} was re-pointed`).toBe(caseId("personalA"));
      }
    });

    it("refuses re-pointing `owner` at another user, on the two tables whose grant includes it", async () => {
      // MV-155 §H had to grant `update (owner, …)` because PostgREST puts every payload column in
      // an upsert's SET list. THE SAFETY ARGUMENT FOR THAT WIDENING NOW RESTS HERE: the derive
      // trigger re-derives `case_id` from the NEW owner's personal case, which is not in this
      // actor's `actor_case_ids()`, so the WITH CHECK refuses.
      const student = actor("studentA");
      const other = actor("studentB");
      const probes: Array<[StudentDataTable, string]> = [
        ["user_program_state", data.personalA.programState],
        ["document_status", data.personalA.documentStatus],
      ];
      for (const [table, id] of probes) {
        const { error } = await student.client
          .from(table)
          .update({ owner: other.id } as never)
          .eq("id", id);
        expect(error?.code, `${table}: re-pointing owner must be refused`).toBe("42501");
        expect(error?.message, `${table}: and refused by the POLICY, not by a grant`).toMatch(
          /row-level security policy/i,
        );
        const { data: row } = await fixture.admin.from(table).select("owner").eq("id", id).single();
        expect((row as { owner: string }).owner, `${table}.owner moved`).toBe(student.id);
      }
    });

    it("lets a legitimate in-case edit through — the denials above are not a dead policy", async () => {
      const student = actor("studentA");
      const { error } = await student.client
        .from("plan_items")
        .update({ status: "done" } as never)
        .eq("id", planId(data.personalA.openPlanItem));
      expect(error, `a student must still be able to close their own plan item: ${error?.message}`).toBeNull();
      const { data: row } = await fixture.admin
        .from("plan_items")
        .select("status")
        .eq("id", planId(data.personalA.openPlanItem))
        .single();
      expect((row as { status: string }).status).toBe("done");
      await fixture.admin.from("plan_items").update({ status: "todo" }).eq("id", planId(data.personalA.openPlanItem));
    });

    it("lets an assigned counsellor edit their case's profile and plan, and an unassigned one not", async () => {
      const assigned = actor("counsellorAssignedA");
      const unassigned = actor("counsellorUnassignedA");
      const target = data.orgAssignedA;

      const ok = await assigned.client
        .from("profiles")
        .update({ completeness: 77 } as never)
        .eq("id", target.profile);
      expect(ok.error, `an assigned counsellor manages the student profile: ${ok.error?.message}`).toBeNull();
      const { data: after } = await fixture.admin.from("profiles").select("completeness").eq("id", target.profile).single();
      expect((after as { completeness: number }).completeness).toBe(77);

      // Silent: an UPDATE whose USING clause matches nothing affects zero rows and errors not.
      await unassigned.client.from("profiles").update({ completeness: 1 } as never).eq("id", target.profile);
      const { data: still } = await fixture.admin.from("profiles").select("completeness").eq("id", target.profile).single();
      expect((still as { completeness: number }).completeness, "an UNASSIGNED counsellor changed a profile").toBe(77);
    });
  });

  // ===================================================================================
  // J  program_predictions immutability survives being touched twice
  // ===================================================================================
  describe("prediction immutability survives Stage 2", () => {
    it("refuses an authenticated UPDATE — no grant and no policy", async () => {
      const student = actor("studentA");
      const { error } = await student.client
        .from("program_predictions")
        .update({ verdict: "strong" } as never)
        .eq("id", data.personalA.prediction);
      expect(error?.code, "there is no UPDATE grant and there must never be one").toBe("42501");
    });

    it("still raises from the trigger for service_role, including in MV-155's narrowed form", () => {
      // "No UPDATE policy" is not immutability. The trigger is, and its function is SECURITY
      // INVOKER precisely so `service_role` does not bypass it. MV-155 narrowed the body to permit
      // a case_id-only backfill; this asserts the narrowing did not become a general hole.
      // The outcome is captured into a temp table rather than a `raise notice`, because psql
      // writes notices to STDERR and `execFileSync` hands back STDOUT — a notice-based probe
      // reads as an empty string whatever happened, which is a test that cannot fail.
      const out = sqlLines(`
        begin;
        create temp table mv159_immutability(outcome text) on commit drop;
        do $$
        begin
          -- The role is assumed around the UPDATE and nothing else: the temp table belongs to
          -- postgres, and service_role holds no grant on it. A plpgsql exception handler rolls
          -- the implicit subtransaction back, which restores the role too.
          set local role service_role;
          update public.program_predictions set verdict = 'strong' where id = '${data.personalA.prediction}';
          reset role;
          insert into mv159_immutability values ('ALLOWED — the trigger did not fire');
        exception when others then
          reset role;
          insert into mv159_immutability values ('REFUSED: ' || sqlerrm);
        end;
        $$;
        select outcome from mv159_immutability;
        rollback;
      `).filter((line) => line.startsWith("ALLOWED") || line.startsWith("REFUSED"));
      expect(out, "the immutability trigger must still raise for service_role").toEqual([
        "REFUSED: program_predictions is immutable (no UPDATE permitted)",
      ]);
    });
  });

  // ===================================================================================
  // K  revocation is immediate on student data, and the dual-role rule survives it
  // ===================================================================================
  describe("revocation and the dual-role rule, on student data", () => {
    it("empties a counsellor's view of their case's rows the moment the membership flips — no re-login", async () => {
      const counsellor = actor("revocableA");
      const target = data.revocableWorkA;

      const before = await visible(counsellor, "plan_items");
      expect(before, "HARNESS DEFECT: the assigned counsellor cannot see the case they are assigned to").toContain(
        target.openPlanItem,
      );

      const { error } = await fixture.admin
        .from("organization_memberships")
        .update({ status: "inactive" })
        .eq("organization_id", fixture.orgA)
        .eq("user_id", counsellor.id);
      expect(error, `failed to revoke: ${error?.message}`).toBeNull();

      // SAME client, SAME token, next statement.
      const after = await visible(counsellor, "plan_items");
      expect(after, "a revoked membership must grant nothing, immediately").not.toContain(target.openPlanItem);
      await proveExists("plan_items", target.openPlanItem);

      await fixture.admin
        .from("organization_memberships")
        .update({ status: "active" })
        .eq("organization_id", fixture.orgA)
        .eq("user_id", counsellor.id);
    });

    it("keeps a revoked staff member's OWN case's rows visible to them — the dual-role rule", async () => {
      // A fired counsellor loses the org. They do not lose their own file: they hold those rights
      // as a data subject, not as staff.
      const revoked = actor("dualInactiveA");
      const ownCase = data.inactiveStudentA;
      const workedCase = data.orgAssignedA;

      const seen = await visible(revoked, "profiles");
      expect(seen, "a revoked member keeps their own student case").toContain(ownCase.profile);
      expect(seen, "and gains nothing on the org side").not.toContain(workedCase.profile);
      await proveExists("profiles", workedCase.profile);
    });

    it("does not let an org A admin who is an org B STUDENT read org B's other cases", async () => {
      // The sharpest dual-role shape available: a staff role must not follow a person into the
      // tenant where they are merely the data subject.
      const dual = actor("crossTenantDual");
      const seen = await visible(dual, "documents");
      expect(seen, "their own org B case, as its student").toContain(data.crossStudentB.document);
      expect(seen, "but not org B's other cases").not.toContain(data.orgAssignedB.document);
      await proveExists("documents", data.orgAssignedB.document);
    });
  });

  // ===================================================================================
  // L  anonymous assessments stay invisible to every authenticated client
  // ===================================================================================
  describe("anonymous assessments are invisible to every authenticated client", () => {
    it("returns the unclaimed row to nobody — including the user about to claim it", async () => {
      await proveExists("assessments", anonymousAssessment);
      for (const key of Object.keys(fixture.actors) as ActorKey[]) {
        const seen = await visible(fixture.actors[key], "assessments");
        expect(seen, `${key} must not see an unclaimed anonymous assessment`).not.toContain(anonymousAssessment);
      }
      const { data: anonRows } = await fixture.anon.from("assessments").select("id");
      expect(anonRows ?? []).toEqual([]);
    });

    it("leaves the row readable by the service-role claim path and inside MV-135's purge predicate", () => {
      // Required, not incidental (spec §4.2): the claim path runs service_role and BYPASSRLS, and
      // MV-135's 3-day purge keys on `owner is null`. Giving an unclaimed row a case would take it
      // out of that predicate and turn a shipped retention promise into a lie.
      expect(
        sqlOne(`select count(*) from public.assessments where id = '${anonymousAssessment}' and owner is null and case_id is null;`),
      ).toBe("1");
    });
  });

  // ===================================================================================
  // N  the predicates plan efficiently — InitPlan, not per row; index, not Seq Scan
  // ===================================================================================
  describe("the predicates plan efficiently on all nine", () => {
    it("evaluates the helpers ONCE per statement and reaches every table by index", () => {
      // A plan taken on a ten-row table proves nothing — the planner picks Seq Scan for any
      // predicate. TENANT COUNT is the load-bearing fixture parameter, not row count: Postgres
      // cannot see inside `= ANY ($initplan)` and assumes ~10 array elements, so a fixture that is
      // too small measures the wrong plan and one that is too large hides a real regression
      // (MV-152's measured finding). 400 organizations x 25 cases is a realistic consultancy
      // population; the actor is an admin of exactly one of them.
      const PLAN_USER = "11111111-1111-1111-1111-111111111111";
      const plans = psql(`
        begin;
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                email_confirmed_at, created_at, updated_at,
                                raw_app_meta_data, raw_user_meta_data)
        values ('${PLAN_USER}', '00000000-0000-0000-0000-000000000000', 'authenticated',
                'authenticated', 'mv159-plan@example.test', 'x', now(), now(), now(), '{}', '{}');
        insert into public.organizations (name, slug)
          select 'mv159 plan '||g, 'mv159-plan-'||g from generate_series(1, 400) g;
        insert into public.organization_memberships (organization_id, user_id, role, status)
          select o.id, '${PLAN_USER}', 'admin', 'active'
            from public.organizations o where o.slug = 'mv159-plan-1';
        insert into public.cases (organization_id, display_name)
          select o.id, 'plan case '||g from public.organizations o, generate_series(1, 25) g
           where o.slug like 'mv159-plan-%';
        insert into public.profiles (case_id, sections, completeness)
          select c.id, '{}'::jsonb, 0 from public.cases c where c.display_name like 'plan case %';
        insert into public.assessments (case_id, result, rule_version, destination_id, profile_snapshot, expires_at)
          select c.id, '{}'::jsonb, 'plan', 'AU', '{}'::jsonb, now() + interval '3 days'
            from public.cases c where c.display_name like 'plan case %';
        insert into public.plan_items (case_id, kind, impact, title, status)
          select c.id, 'plan-kind', 'low', 'plan item', 'todo'
            from public.cases c where c.display_name like 'plan case %';
        insert into public.user_program_state (case_id, program_id, status)
          select c.id, (select id from public.programs order by id limit 1), 'shortlisted'
            from public.cases c where c.display_name like 'plan case %';
        insert into public.documents (case_id, kind, file_path, file_size, original_name)
          select c.id, 'passport', 'plan/passport/x.pdf', 1, 'x.pdf'
            from public.cases c where c.display_name like 'plan case %';
        insert into public.document_status (case_id, kind, obtained)
          select c.id, 'passport', true from public.cases c where c.display_name like 'plan case %';
        insert into public.program_predictions (case_id, assessment_id, program_id, verdict, rule_version, score_snapshot)
          select a.case_id, a.id, (select id from public.programs order by id limit 1), 'possible', 'plan', '{}'::jsonb
            from public.assessments a join public.cases c on c.id = a.case_id
           where c.display_name like 'plan case %';
        insert into public.application_attempts (case_id, prediction_id, program_id)
          select p.case_id, p.id, p.program_id from public.program_predictions p
            join public.cases c on c.id = p.case_id where c.display_name like 'plan case %';
        insert into public.outcome_events (case_id, attempt_id, event_type, gate, source, occurred_at)
          select a.case_id, a.id, 'applied', 'admission', 'self_reported', now()
            from public.application_attempts a join public.cases c on c.id = a.case_id
           where c.display_name like 'plan case %';
        analyze public.cases;
        analyze public.organization_memberships;
        ${STUDENT_DATA_TABLES.map((t) => `analyze public.${t};`).join("\n        ")}
        set local request.jwt.claims = '{"sub":"${PLAN_USER}","role":"authenticated"}';
        set local role authenticated;
        ${STUDENT_DATA_TABLES.map(
          (t) => `select '### ${t}'; explain (analyze, buffers) select id from public.${t};`,
        ).join("\n        ")}
        rollback;
      `);
      console.log(`\n[MV-159 EXPLAIN — every migrated table as an org admin, 400 orgs / 10k cases]\n${plans}`);

      // NO SEQ SCAN ON ANY OF THE NINE. Both disjuncts are indexed — the `owner` index each table
      // has carried since before Stage 2, and the MV-155 `case_id` index — so the planner can
      // answer "which rows may I see" with a BitmapOr instead of a heap sweep.
      for (const table of STUDENT_DATA_TABLES) {
        expect(plans, `${table} fell back to a Seq Scan`).not.toMatch(new RegExp(`Seq Scan on ${table}\\b`));
        expect(plans, `${table} did not use a BitmapOr over both disjuncts`).toMatch(
          new RegExp(`Bitmap Heap Scan on ${table}\\b`),
        );
      }
      // TWO InitPlans per statement — `auth.uid()` and `private.actor_case_ids()`, each evaluated
      // ONCE for the whole statement rather than once per row. Without them the definer helper is
      // a per-row call: the `auth_rls_initplan` finding, at tenancy scale.
      // The DECLARATION line only (`   InitPlan 2`), not the two references to it that appear in
      // the Recheck Cond and the Index Cond — counting those would report 27 and pass for the
      // wrong reason.
      const initPlanBlocks = plans.match(/^\s*InitPlan 2\s*$/gm) ?? [];
      expect(initPlanBlocks.length, "every one of the nine must hoist both helpers to an InitPlan").toBe(
        STUDENT_DATA_TABLES.length,
      );
    }, 180_000);
  });

  // ===================================================================================
  // M  MV-160 §E DELETES EXACTLY THE BLOCK BELOW, AND NOTHING ELSE IN THIS FILE.
  // ===================================================================================
  // It tests a STATE MV-160 removes, not a policy decision: after its `SET NOT NULL`s the fixture
  // here cannot be seeded at all (`23502`), so this block dies whether or not the disjunct is
  // dropped. It deliberately carries NO matrix cell — no cross-tenant denial, no dual-role, no
  // revocation, no anonymous invisibility — so the retirement is a block deletion rather than an
  // access-control edit. A SECOND red block during MV-160 is a finding, not an extension of this
  // exception.
  describe("transitional owner disjunct — retired by MV-160", () => {
    it("keeps a case-less row visible and updatable to its legacy owner, and to nobody else", async () => {
      const owner = actor("studentA");
      await proveExists("plan_items", caseless.planItem);

      const seen = await visible(owner, "plan_items");
      expect(seen, "a not-yet-backfilled row must stay visible to its owner").toContain(caseless.planItem);

      // …and updatable, through the grant the student actually holds.
      const { error } = await owner.client
        .from("plan_items")
        .update({ status: "dismissed" } as never)
        .eq("id", planId(caseless.planItem));
      expect(error, `the owner must still be able to act on it: ${error?.message}`).toBeNull();
      await fixture.admin.from("plan_items").update({ status: "todo" }).eq("id", planId(caseless.planItem));

      // Invisible to a cross-tenant admin AND to a case-scoped actor on the owner's own org case.
      for (const key of ["adminB", "ownerB", "adminA", "counsellorAssignedA", "outsider"] as const) {
        const other = await visible(actor(key), "plan_items");
        expect(other, `${key} must not see a case-less row`).not.toContain(caseless.planItem);
      }
    });

    it("hands the row to the case-scoped actor once its case_id is backfilled, and the owner keeps it", async () => {
      const owner = actor("studentA");
      const counsellor = actor("counsellorAssignedA");
      const target = caseId("orgAssignedA");

      expect(await visible(counsellor, "documents"), "precondition").not.toContain(caseless.document);

      const { error } = await fixture.admin.from("documents").update({ case_id: target }).eq("id", caseless.document);
      expect(error, `backfill failed: ${error?.message}`).toBeNull();

      expect(await visible(counsellor, "documents"), "the case branch must pick it up").toContain(caseless.document);
      expect(await visible(owner, "documents"), "and the owner must not lose it").toContain(caseless.document);

      await fixture.admin.from("documents").update({ case_id: null }).eq("id", caseless.document);
    });

    it("shows the case-less assessment to its owner and to no case-scoped actor", async () => {
      const owner = actor("studentA");
      await proveExists("assessments", caseless.assessment);
      expect(await visible(owner, "assessments")).toContain(caseless.assessment);
      for (const key of ["adminA", "counsellorAssignedA", "adminB"] as const) {
        expect(await visible(actor(key), "assessments"), `${key} must not see a case-less assessment`).not.toContain(
          caseless.assessment,
        );
      }
    });
  });
});
