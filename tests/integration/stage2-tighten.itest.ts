/**
 * MV-160 — Stage 2 tighten + exit gate.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the
 * default `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts).
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"   # needed to sign in as a real client role
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY — it writes
 * rows and deletes the ones it created.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, and the two things it deliberately does NOT
 * ---------------------------------------------------------------------------------------
 * It asserts the END STATE of `20260805140000_stage2_tighten_case_mandatory.sql` against the
 * LIVE CATALOG — `pg_constraint`, `pg_index`, `pg_policy`, `information_schema` — rather than by
 * grepping the migration. A grep passes against a policy that was never re-created; the catalog
 * cannot be fooled that way. Every structural assertion is paired with a behavioural one where a
 * behaviour exists, because MV-153's finding was that a structural claim nothing exercises is a
 * tautology.
 *
 * NOT HERE, and each has a home:
 *   * §B's SWEEP TEST needs a database in the PRE-migration state: its fixture is an owned,
 *     `case_id`-null row on one of the eight, which by the time this suite runs can no longer be
 *     SEEDED — precisely what this card set out to make true. It lives in
 *     `stage2-data-equivalence.itest.ts`, which reaches that state by applying
 *     `supabase/rehearsal/MV-160-rollback.sql` inside a transaction it always rolls back. (An
 *     earlier draft of this header said the sweep test and the counterfactual would ship as
 *     rehearsal scripts the integrator runs by hand. They are CI tests instead — better, and the
 *     rollback script gets executed on every run as a side effect, which is the artifact least
 *     likely to be correct and most likely to be needed during an incident.)
 *   * §C's COUNTERFACTUAL is here after all, at the end of the §C block: it needs only the
 *     POST-migration state plus a re-widened column, so a rolled-back `ALTER` inside one
 *     transaction constructs it honestly.
 *   * §A's equivalence proof lives in `stage2-data-equivalence.itest.ts` (synthetic, §A1) and in
 *     `npm run stage2:equivalence` (live replay, §A2, rehearsal-only).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  assertLocalStack,
  createStudentDataSeeder,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type StudentCaseRows,
  type StudentDataSeeder,
  type StudentDataTable,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage2-tighten.itest.ts", url);

/** The eight whose `case_id` this card makes mandatory. `assessments` is the ninth and is not here. */
const NOT_NULL_EIGHT = [
  "profiles",
  "plan_items",
  "user_program_state",
  "documents",
  "document_status",
  "program_predictions",
  "application_attempts",
  "outcome_events",
] as const;

/** All nine migrated tables. */
const NINE = [...NOT_NULL_EIGHT, "assessments"] as const;

/** The five surfaces `authenticated` may INSERT into — the ones carrying the owner-axis bound. */
const INSERT_SURFACES = [
  "user_program_state",
  "document_status",
  "program_predictions",
  "application_attempts",
  "outcome_events",
] as const;

/**
 * MV-159's policy set, enumerated by name so "removed the disjunct" cannot be satisfied by
 * DROPPING a policy. `Service inserts documents` is NOT MV-159's and is deliberately absent — it is
 * asserted separately as an untouched survivor.
 */
const MV159_POLICIES: ReadonlyArray<readonly [string, string, string]> = [
  ["profiles", "profiles_select_case", "r"],
  ["profiles", "profiles_update_case", "w"],
  ["assessments", "assessments_select_case", "r"],
  ["plan_items", "plan_items_select_case", "r"],
  ["plan_items", "plan_items_update_case", "w"],
  ["user_program_state", "ups_select_case", "r"],
  ["user_program_state", "ups_insert_case", "a"],
  ["user_program_state", "ups_update_case", "w"],
  ["user_program_state", "ups_delete_case", "d"],
  ["documents", "documents_select_case", "r"],
  ["documents", "documents_delete_case", "d"],
  ["document_status", "ds_select_case", "r"],
  ["document_status", "ds_insert_case", "a"],
  ["document_status", "ds_update_case", "w"],
  ["document_status", "ds_delete_case", "d"],
  ["program_predictions", "pp_select_case", "r"],
  ["program_predictions", "pp_insert_case", "a"],
  ["program_predictions", "pp_delete_case", "d"],
  ["application_attempts", "aa_select_case", "r"],
  ["application_attempts", "aa_insert_case", "a"],
  ["application_attempts", "aa_delete_case", "d"],
  ["outcome_events", "oe_select_case", "r"],
  ["outcome_events", "oe_insert_case", "a"],
  ["outcome_events", "oe_delete_case", "d"],
];

/**
 * MV-168's three ADDITIONS. Enumerated separately rather than folded into the list above, because
 * the assertion these two feed is "MV-159's policies were not DELETED" and that sentence must stay
 * checkable after later stages add their own. A Stage 4 policy goes in a third list, not in either
 * of these; a name that vanishes from EITHER list still fails.
 */
const MV168_POLICIES: ReadonlyArray<readonly [string, string, string]> = [
  ["profiles", "profiles_insert_case", "a"],
  ["plan_items", "plan_items_insert_case", "a"],
  ["assessments", "assessments_update_case", "w"],
];

/** The seven superseded owner-keyed uniqueness rules §D drops. Three constraints, four indexes. */
const DROPPED_OWNER_UNIQUES = [
  "profiles_owner_key",
  "documents_owner_kind_key",
  "program_predictions_owner_assessment_id_program_id_rule_ver_key",
  "assessments_primary_idx",
  "plan_items_kind_open_idx",
  "user_program_state_owner_program_idx",
  "document_status_owner_kind_idx",
] as const;

/**
 * Plain `owner` LOOKUP indexes that MUST SURVIVE, with the reader that needs each one. A test that
 * would go green on their deletion is not testing §D — the criterion is deliberately about UNIQUE /
 * PK / FK-target keys, not about every index that mentions `owner`.
 */
const SURVIVING_OWNER_INDEXES: ReadonlyArray<readonly [string, string]> = [
  ["assessments_anon_purge_idx", "MV-135's 3-day purge, pinned to the `owner is null` predicate by MV-158"],
  ["assessments_owner_idx", "the owner-keyed assessment scan"],
  ["profiles_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["plan_items_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["user_program_state_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["documents_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["document_status_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["program_predictions_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["application_attempts_owner_idx", "app/api/account/delete's Auth-account teardown"],
  ["outcome_events_owner_idx", "app/api/account/delete's Auth-account teardown"],
];

describe.skipIf(!url || !serviceKey || !anonKey)("MV-160 Stage 2 tighten + exit gate", () => {
  let dbContainer: string;
  let fixture: TenancyFixture;
  let seeder: StudentDataSeeder;
  let personal: StudentCaseRows;
  let consultancy: StudentCaseRows;
  let programId: string;
  let spareProgram: string;

  const psql = (statement: string): string =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { encoding: "utf8", input: statement },
    );

  const sqlLines = (statement: string): string[] =>
    psql(statement)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const sqlOne = (statement: string): string => sqlLines(statement)[0] ?? "";

  /**
   * Run a statement as the given Auth user, exactly as PostgREST does it. The ONLY way to ask a
   * `private` helper what it returns for a real actor — `private` is not a PostgREST-exposed schema.
   */
  const sqlAs = (userId: string, statement: string): string[] =>
    sqlLines(`
      begin;
      set local request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
      set local role authenticated;
      ${statement}
      rollback;
    `).filter((line) => !/^(BEGIN|SET|ROLLBACK|COMMIT|DO|CREATE|INSERT|UPDATE|DELETE|ANALYZE)\b/.test(line));

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  /** Row ids of `table` visible to `who`, as text. An RLS denial is zero rows and NO error. */
  const visible = async (who: Actor, table: StudentDataTable): Promise<string[]> => {
    const { data: rows, error } = await who.client.from(table).select("id");
    expect(error, `${who.key} reading ${table} errored (that is not a denial): ${error?.message}`).toBeNull();
    return ((rows ?? []) as Array<{ id: string | number }>).map((r) => String(r.id)).sort();
  };

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

  beforeAll(async () => {
    dbContainer =
      process.env.SUPABASE_TEST_DB_CONTAINER ??
      execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean)[0]!;

    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    seeder = createStudentDataSeeder(fixture);

    const programs = sqlLines("select id from public.programs order by id limit 9;");
    expect(programs.length, "HARNESS DEFECT: fewer than 9 programs seeded by the migrations").toBe(9);
    programId = programs[0]!;
    spareProgram = programs[1]!;

    // The PERSONAL student shape: `organization_id IS NULL`, `student_user_id = owner`, rows owned.
    personal = await seeder.seedStudentCase({
      label: "mv160-personal",
      caseId: fixture.cases.personalA,
      owner: actor("studentA").id,
      programId,
      documentKind: "ielts",
    });

    // The CONSULTANCY shape — the operational half of "no longer depends on actor equals student":
    // `organization_id` SET, `student_user_id` NULL, and `owner` NULL on every seeded row. This is
    // the case `counsellorAssignedA` is the primary counsellor of.
    consultancy = await seeder.seedStudentCase({
      label: "mv160-consultancy",
      caseId: fixture.cases.unclaimedA,
      owner: null,
      programId: spareProgram,
      documentKind: "passport",
    });
  }, 180_000);

  afterAll(async () => {
    // MUST precede teardown: every one of the nine references `cases` ON DELETE RESTRICT.
    if (seeder) await seeder.cleanup();
    if (fixture) await fixture.teardown();
  }, 120_000);

  // ===================================================================================
  // §B — `case_id` mandatory where the domain requires it
  // ===================================================================================
  describe("§B — case_id mandatory where the domain requires it", () => {
    it("has case_id NOT NULL on all EIGHT tables whose domain requires it", () => {
      const nullable = sqlLines(`
        select table_name
          from information_schema.columns
         where table_schema = 'public'
           and column_name = 'case_id'
           and is_nullable = 'YES'
           and table_name in (${NOT_NULL_EIGHT.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(
        nullable,
        "these tables still allow a case-less row, so §C's redundancy argument for dropping " +
          "`_ownership_axis_present` is FALSE and the MATCH SIMPLE hole on the chain is still open",
      ).toEqual([]);
    });

    it("KEEPS assessments.case_id NULLABLE — a successful NOT NULL here would mean the anonymous rows are gone", () => {
      expect(
        sqlOne(`
          select is_nullable from information_schema.columns
           where table_schema='public' and table_name='assessments' and column_name='case_id';
        `),
        "assessments.case_id must stay nullable: anonymous rows are case-less by design until " +
          "claimed (MV-158) or purged (MV-135). A migration that succeeded in setting this NOT NULL " +
          "destroyed them, and that is a failure wearing a success's clothes.",
      ).toBe("YES");
    });

    it("carries the assessments CHECK that expresses the REAL rule instead", () => {
      const def = sqlOne(`
        select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'assessments_case_required_when_owned';
      `);
      expect(def, "the assessments CHECK is missing entirely").not.toBe("");
      expect(def.replace(/\s+/g, " ")).toContain("case_id IS NOT NULL");
      expect(def.replace(/\s+/g, " ")).toContain("claimed_at IS NULL");
    });

    it("BITES: an OWNED assessment with a null case_id is refused (23514)", async () => {
      const { error } = await fixture.admin.from("assessments").insert({
        owner: actor("studentA").id,
        case_id: null,
        result: { verdict: "possible", band: "possible" },
        rule_version: "mv160-check",
        destination_id: "AU",
        is_primary: false,
        profile_snapshot: {},
        expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      } as never);
      expect(error?.code, "an owned, case-less assessment must be refused by the CHECK").toBe("23514");
    });

    it("ADMITS: an ANONYMOUS, unclaimed assessment with a null case_id still inserts — the exception is real", async () => {
      const { data, error } = await fixture.admin
        .from("assessments")
        .insert({
          owner: null,
          case_id: null,
          claimed_at: null,
          result: { verdict: "possible", band: "possible" },
          rule_version: "mv160-anon",
          destination_id: "AU",
          is_primary: false,
          profile_snapshot: {},
          expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        } as never)
        .select("id")
        .single();
      expect(
        error,
        "the anonymous, case-less row is the whole reason assessments.case_id stays nullable. " +
          "If this is refused, the CHECK is over-tight and the anonymous funnel is broken.",
      ).toBeNull();
      if (data) await fixture.admin.from("assessments").delete().eq("id", (data as { id: string }).id);
    });
  });

  // ===================================================================================
  // §C — compensating checks dropped, composite FKs proven live, trigger restored
  // ===================================================================================
  describe("§C — compensating checks dropped and the FKs proven to bite", () => {
    it("has dropped ALL EIGHT `_ownership_axis_present` checks, and names any survivor", () => {
      const survivors = sqlLines(`
        select conrelid::regclass::text || '.' || conname
          from pg_constraint where conname like '%\\_ownership\\_axis\\_present' order by 1;
      `);
      // Enumerated, not counted: a count-only assertion passes on seven-of-eight, and the one left
      // behind is a constraint the next author reads as load-bearing and plans around.
      expect(
        survivors,
        "every one of the eight compensating checks must be gone — §B made the disjunct's right " +
          "branch unconditionally true on exactly these eight, so a survivor can never fire",
      ).toEqual([]);
    });

    it("BITES: an attempt whose case_id differs from its prediction's is refused 23503 by the case-side composite FK", async () => {
      const { error } = await fixture.admin.from("application_attempts").insert({
        owner: null,
        case_id: consultancy.caseId,
        prediction_id: personal.prediction, // a prediction living in the OTHER case
        program_id: spareProgram,
        destination: "AU",
      } as never);
      expect(
        error?.code,
        "with case_id NOT NULL the MATCH SIMPLE skip is closed, so `(prediction_id, case_id)` must " +
          "now bite. This is the evidence that dropping `_ownership_axis_present` was safe.",
      ).toBe("23503");
    });

    it("BITES: an outcome event whose case_id differs from its attempt's is refused 23503", async () => {
      const { error } = await fixture.admin.from("outcome_events").insert({
        owner: null,
        case_id: consultancy.caseId,
        attempt_id: personal.attempt,
        event_type: "applied",
        gate: "admission",
        source: "self_reported",
        occurred_at: new Date().toISOString(),
      } as never);
      expect(error?.code).toBe("23503");
    });

    it("THE COUNTERFACTUAL: re-widen `case_id` and the same insert is admitted — the NOT NULL is what carries it", () => {
      // The two BITES above prove the FK now refuses a mismatched child. They do NOT prove that
      // the NOT NULL is what made that true — the redundancy argument for dropping
      // `_ownership_axis_present` rests on exactly that, and the plan's own warning (line 326) is
      // that a composite key including a nullable column is UNENFORCED for null rows. So the
      // claim is falsified rather than argued: with the column re-widened, a null-`case_id` child
      // whose parent lives in another case inserts freely, because MATCH SIMPLE skips the check
      // entirely. Only the pair establishes that dropping the compensating check was safe.
      //
      // Run as the superuser inside a transaction that is always rolled back: the point is the
      // CONSTRAINT layer, not RLS, and the ALTER never leaves this statement.
      const admitted = sqlLines(`
        begin;
        alter table public.application_attempts alter column case_id drop not null;
        insert into public.application_attempts (owner, case_id, prediction_id, program_id, destination)
        values (null, null, '${personal.prediction}', '${spareProgram}', 'AU');
        select 'ADMITTED|' || (select count(*)::text from public.application_attempts where case_id is null);
        rollback;
      `).filter((line) => line.startsWith("ADMITTED|"));

      expect(
        admitted,
        "with `case_id` nullable the composite FK is skipped for the null row and the insert is " +
          "ADMITTED. If this ever fails, something OTHER than the NOT NULL is carrying the " +
          "enforcement and §C's safety argument for dropping the eight checks has to be rewritten.",
      ).toEqual(["ADMITTED|1"]);

      // And the column really is NOT NULL outside that transaction — otherwise the counterfactual
      // above would just be describing the shipped state.
      expect(
        sqlOne(
          "select case when attnotnull then 'yes' else 'no' end from pg_attribute " +
            "where attrelid = 'public.application_attempts'::regclass and attname = 'case_id';",
        ),
      ).toBe("yes");
    });
  });

  describe("§C — private.reject_prediction_update() restored to its unconditional body", () => {
    it("has NO conditional branch left in the function body", () => {
      const body = sqlOne(`
        select replace(pg_get_functiondef(p.oid), E'\\n', ' ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private' and p.proname = 'reject_prediction_update';
      `);
      expect(body, "the function is missing").not.toBe("");
      expect(
        body.toLowerCase(),
        "MV-155 §D narrowed this trigger so its backfill could run and said twice that MV-160 " +
          "restores it. A surviving `if` means Stage 2 exited with a narrowed immutability guard " +
          "on the one table whose design property is that a prediction-of-record cannot be rewritten.",
      ).not.toContain("old.case_id is null");
      // Postgres renders this as `SET search_path TO ''`; match case-insensitively rather than
      // pinning the catalog's rendering.
      expect(body.toLowerCase(), "the search_path pin must survive the restore").toContain("set search_path");
    });

    it("REFUSES the exact case_id-only null->not-null UPDATE that MV-155 had permitted, as service_role", () => {
      // service_role, not `authenticated`: the function is SECURITY INVOKER, so service_role does
      // NOT bypass it, and that is the property 20260620000000 exists to guarantee. Asserting only
      // the `authenticated` case would pass against a trigger that was DROPPED rather than restored.
      let raised = "";
      try {
        psql(`
          begin;
          set local role service_role;
          update public.program_predictions set case_id = case_id where id = '${personal.prediction}';
          rollback;
        `);
      } catch (e) {
        raised = String((e as { stderr?: Buffer; message?: string }).stderr ?? (e as Error).message);
      }
      expect(raised, "a service_role UPDATE on program_predictions must raise").toContain(
        "program_predictions is immutable",
      );
    });

    it("REFUSES an UPDATE as authenticated too — at the GRANT layer, which is a stronger refusal", () => {
      // MEASURED, NOT ASSUMED, and the distinction matters. `authenticated` holds NO UPDATE grant on
      // `program_predictions` and MV-159 states that is permanent, so an authenticated UPDATE never
      // reaches the trigger at all — it is refused as `permission denied` (42501) one layer earlier.
      //
      // An earlier draft of this test asserted the TRIGGER's message for `authenticated` and would
      // have failed post-migration for a reason that has nothing to do with this card. Worse, the
      // obvious "fix" — granting UPDATE so the trigger can speak — would widen the client write
      // surface on the one table whose design property is immutability. The honest assertion is:
      // `authenticated` is refused by the grant, and `service_role` (which HAS the grant) is refused
      // by the restored trigger. Both are covered; neither is vacuous.
      let raised = "";
      try {
        psql(`
          begin;
          set local request.jwt.claims = '{"sub":"${actor("studentA").id}","role":"authenticated"}';
          set local role authenticated;
          update public.program_predictions set rule_version = 'tampered' where id = '${personal.prediction}';
          rollback;
        `);
      } catch (e) {
        raised = String((e as { stderr?: Buffer; message?: string }).stderr ?? (e as Error).message);
      }
      expect(raised, "an authenticated UPDATE on program_predictions must be refused").toMatch(
        /permission denied|program_predictions is immutable/,
      );
    });
  });

  // ===================================================================================
  // §D — legacy owner assumptions removed (catalog)
  // ===================================================================================
  describe("§D — no unique constraint, PK or FK target on the nine is keyed on owner", () => {
    it("has NO owner-keyed unique or primary key left on any of the nine, and names any survivor", () => {
      // Read from pg_index, not from index NAMES: a rename must not launder an owner-keyed rule.
      const survivors = sqlLines(`
        select c.relname || '.' || i.relname
          from pg_index x
          join pg_class i on i.oid = x.indexrelid
          join pg_class c on c.oid = x.indrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${NINE.map((t) => `'${t}'`).join(",")})
           and (x.indisunique or x.indisprimary)
           and exists (
                 select 1 from unnest(x.indkey) k
                   join pg_attribute a on a.attrelid = x.indrelid and a.attnum = k
                  where a.attname = 'owner')
         order by 1;
      `);
      expect(
        survivors,
        "an owner-keyed uniqueness rule on a migrated table is exactly what plan step 13 removes. " +
          "Note this assertion fails on precisely the ones nobody enumerated — that has now " +
          "happened twice on this card.",
      ).toEqual([]);
    });

    it("has dropped each of the SEVEN superseded owner-keyed uniqueness rules BY NAME", () => {
      const present = sqlLines(`
        select conname from pg_constraint
         where conname in (${DROPPED_OWNER_UNIQUES.map((n) => `'${n}'`).join(",")})
        union all
        select i.relname from pg_class i
          join pg_namespace n on n.oid = i.relnamespace
         where n.nspname = 'public'
           and i.relname in (${DROPPED_OWNER_UNIQUES.map((n) => `'${n}'`).join(",")})
         order by 1;
      `);
      expect(present, "these owner-keyed uniqueness rules should all be gone").toEqual([]);
    });

    it("has dropped the two legacy composite FKs and their three `unique (id, owner)` targets", () => {
      const survivors = sqlLines(`
        select conname from pg_constraint
         where conname in (
           'application_attempts_prediction_id_owner_fkey',
           'outcome_events_attempt_id_owner_fkey',
           'program_predictions_id_owner_key',
           'application_attempts_id_owner_key',
           'outcome_events_id_owner_key')
         order by 1;
      `);
      expect(survivors).toEqual([]);
    });

    it("has dropped the now-orphaned covering index outcome_events_attempt_id_owner_idx", () => {
      expect(
        sqlLines(`
          select i.relname from pg_class i join pg_namespace n on n.oid = i.relnamespace
           where n.nspname='public' and i.relname = 'outcome_events_attempt_id_owner_idx';
        `),
      ).toEqual([]);
    });

    it("KEEPS every plain owner LOOKUP index — a test that goes green on their deletion is not testing §D", () => {
      // The criterion is deliberately NOT "no index has owner as a key column". At least three of
      // these are load-bearing after this card, and a deleted one is a regression, not a tidy-up.
      const present = new Set(
        sqlLines(`
          select i.relname from pg_class i
            join pg_namespace n on n.oid = i.relnamespace
           where n.nspname = 'public'
             and i.relname in (${SURVIVING_OWNER_INDEXES.map(([n]) => `'${n}'`).join(",")})
           order by 1;
        `),
      );
      const missing = SURVIVING_OWNER_INDEXES.filter(([name]) => !present.has(name)).map(
        ([name, reader]) => `${name} (needed by: ${reader})`,
      );
      expect(missing, "these owner lookup indexes must SURVIVE the tightening").toEqual([]);
    });

    it("KEEPS the per-table `<table>_owner_fkey` references to auth.users — the provenance link and the delete cascade", () => {
      // These have `owner` as an FK SOURCE column referencing `auth.users(id)`; the KEY column is
      // auth.users.id, not owner. The §D criterion is about FK TARGETS on the nine. Dropping these
      // would break `app/api/account/delete`'s teardown, which is a right-to-delete obligation.
      //
      // Asserted BY NAME rather than by count. A count is satisfied by the wrong nine: the two
      // legacy composite FKs this card drops are ALSO named `%_owner_fkey`
      // (`application_attempts_prediction_id_owner_fkey`, `outcome_events_attempt_id_owner_fkey`),
      // so a `= 9` count passes pre-migration at 11 and post-migration at 9 for different reasons
      // and would keep passing if a real one were swapped for a legacy one.
      const live = sqlLines(`
        select conname from pg_constraint
         where contype = 'f'
           and conname in (${NINE.map((t) => `'${t}_owner_fkey'`).join(",")})
         order by 1;
      `);
      expect(live, "all nine owner -> auth.users FKs must survive").toEqual(
        NINE.map((t) => `${t}_owner_fkey`).sort(),
      );
    });

    it("BITES: the case-keyed replacements enforce the rules the dropped ones used to", async () => {
      // Two primary assessments in ONE case -> 23505 on assessments_case_primary_idx.
      const { error: dupPrimary } = await fixture.admin.from("assessments").insert({
        owner: actor("studentA").id,
        case_id: personal.caseId,
        result: { verdict: "possible", band: "possible" },
        rule_version: "mv160-dup-primary",
        destination_id: "AU",
        is_primary: true,
        profile_snapshot: {},
        expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      } as never);
      expect(dupPrimary?.code, "a second primary assessment in one case must be 23505").toBe("23505");

      // Two open plan items of one kind in ONE case -> 23505 on plan_items_case_kind_open_idx.
      const kind = sqlOne(`select kind from public.plan_items where id = ${Number(personal.openPlanItem)};`);
      const { error: dupOpen } = await fixture.admin.from("plan_items").insert({
        owner: actor("studentA").id,
        case_id: personal.caseId,
        kind,
        impact: "low",
        status: "todo",
        title: "mv160 duplicate open item",
      } as never);
      expect(dupOpen?.code, "a second open plan item of one kind in one case must be 23505").toBe("23505");
    });
  });

  // ===================================================================================
  // §D — the policy rewrite
  // ===================================================================================
  describe("§D — the policy rewrite drops the transitional owner disjunct", () => {
    it("has NO policy predicate on the nine that uses `owner` as an AUTHORIZATION SOURCE", () => {
      // THE DISTINCTION THIS CARD TURNS ON, and it is exact. `owner = auth.uid()` asks "is the ACTOR
      // this row's owner" — actor-equals-student, the assumption Stage 2 deletes. `owner =
      // private.case_student_id(case_id)` asks "is this row's owner the STUDENT OF THE CASE IT
      // NAMES" — a statement about the ROW, with no reference to the actor. So the test is for
      // `auth.uid()`, NOT for the token `owner`. Written the other way it would go red against
      // MV-159's correct round-3 output, and the only way to green it would be to delete the
      // owner-axis bound — i.e. to fail a test about a P0 by re-opening the P0.
      const offenders = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${NINE.map((t) => `'${t}'`).join(",")})
           and (coalesce(pg_get_expr(p.polqual, p.polrelid), '')
             || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) like '%uid()%'
         order by 1;
      `);
      expect(
        offenders,
        "these policies still consult the ACTOR's identity directly. The case helpers are the only " +
          "authorization source after this card.",
      ).toEqual([]);
    });

    it("has the SAME policy names, per table per command, that MV-159 shipped — the removal cannot be a deletion", () => {
      const live = sqlLines(`
        select c.relname || '|' || p.polname || '|' || p.polcmd::text
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${NINE.map((t) => `'${t}'`).join(",")})
           and p.polname <> 'Service inserts documents'
         order by 1;
      `);
      const expected = [...MV159_POLICIES, ...MV168_POLICIES].map(([t, n, c]) => `${t}|${n}|${c}`).sort();
      expect(
        live.sort(),
        '"no predicate reads owner" must not be satisfiable by DROPPING a policy instead of ' +
          "rewriting it. Same names, same commands, same count.",
      ).toEqual(expected);
    });

    it("KEEPS the owner-axis bound on all FIVE INSERT predicates — dropping it re-opens a P0", () => {
      // NOT the transitional disjunct, and it carries no `delete this line` marker. It is what stops
      // `owner = <a victim>, case_id = <the actor's own case>` — measured ADMITTED on all five
      // tables before it existed. Invisible to every legitimate caller; only an attacker notices.
      const bounded = sqlLines(`
        select c.relname
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and p.polcmd = 'a'
           and p.polname <> 'Service inserts documents'
           and c.relname in (${INSERT_SURFACES.map((t) => `'${t}'`).join(",")})
           and pg_get_expr(p.polwithcheck, p.polrelid) like '%case_student_id%'
         order by 1;
      `);
      expect(bounded, "every INSERT surface must still bound the OWNER axis").toEqual([...INSERT_SURFACES].sort());
    });

    it("KEEPS MV-161's parent-pointer bounds on pp_insert_case and oe_insert_case", () => {
      const pp = sqlOne(`
        select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy p
          join pg_class c on c.oid = p.polrelid where p.polname = 'pp_insert_case';
      `);
      const oe = sqlOne(`
        select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy p
          join pg_class c on c.oid = p.polrelid where p.polname = 'oe_insert_case';
      `);
      expect(pp, "MV-161's supersedes_prediction_id bound must survive the rewrite").toContain(
        "prediction_case_id",
      );
      expect(pp).toContain("supersedes_prediction_id");
      expect(oe, "MV-161's supersedes_event_id bound must survive the rewrite").toContain("outcome_event_case_id");
      expect(oe).toContain("supersedes_event_id");
    });

    it("KEEPS oe_insert_case's two non-ownership integrity clauses (spec §4.9)", () => {
      const oe = sqlOne(`
        select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy p where p.polname = 'oe_insert_case';
      `);
      expect(oe, "self_reported pin stops a client self-certifying an official_verified outcome").toContain(
        "self_reported",
      );
      expect(oe).toContain("verified_by");
    });

    it("KEEPS assessments' `case_id is not null` guard — the one table where the null branch is reachable", () => {
      const a = sqlOne(`
        select pg_get_expr(p.polqual, p.polrelid) from pg_policy p where p.polname = 'assessments_select_case';
      `);
      expect(a).toContain("case_id IS NOT NULL");
    });

    it("PRECONDITION (iii): actor_case_ids()'s student-link arm is NOT gated on membership status", () => {
      // The fragile precondition of the whole disjunct removal. If a later edit ever gates the
      // student arm on membership status, dropping the disjunct hides every personal student's own
      // data from them — silently — and nothing else in this card would catch it.
      const reached = sqlAs(
        actor("studentA").id,
        "select case when $$" + personal.caseId + "$$ = any (private.actor_case_ids()) then 'yes' else 'no' end;",
      );
      expect(
        reached[0],
        "a personal student must reach their own case through actor_case_ids() with no membership " +
          "anywhere. This is what makes `owner = uid()` redundant rather than load-bearing.",
      ).toBe("yes");
    });

    it("BEHAVIOUR: the personal student still sees exactly their own rows on all nine tables", async () => {
      const owned: Record<string, string> = {
        profiles: personal.profile,
        assessments: personal.primaryAssessment,
        plan_items: personal.openPlanItem,
        user_program_state: personal.programState,
        documents: personal.document,
        document_status: personal.documentStatus,
        program_predictions: personal.prediction,
        application_attempts: personal.attempt,
        outcome_events: personal.outcomeEvent,
      };
      for (const table of NINE) {
        await proveExists(table, owned[table]!);
        expect(
          await visible(actor("studentA"), table),
          `the disjunct removal must be behaviour-preserving: studentA lost sight of their own ${table} row`,
        ).toContain(owned[table]!);
      }
    }, 120_000);

    it("BEHAVIOUR: an unrelated org's admin still sees none of them", async () => {
      for (const table of NINE) {
        const seen = await visible(actor("adminB"), table);
        expect(seen, `adminB must not see org A / personal rows in ${table}`).not.toContain(
          table === "profiles" ? personal.profile : personal.primaryAssessment,
        );
      }
    }, 120_000);

    it("TIGHTENING BITES: an INSERT naming a case the actor cannot reach is refused on all five INSERT surfaces", async () => {
      // The rewrite is strictly tighter on INSERT than the transitional form was. It must be SHOWN
      // to bite, or "removed the disjunct" is indistinguishable from a no-op.
      const unreachable = fixture.cases.orgAssignedB;
      const { error: ups } = await actor("studentA").client.from("user_program_state").insert({
        owner: actor("studentA").id,
        case_id: unreachable,
        program_id: spareProgram,
        status: "shortlisted",
      } as never);
      expect(ups?.code, "a cross-case INSERT must be refused by the policy (42501)").toBe("42501");

      const { error: ds } = await actor("studentA").client.from("document_status").insert({
        owner: actor("studentA").id,
        case_id: unreachable,
        kind: "toefl",
        obtained: true,
      } as never);
      expect(ds?.code).toBe("42501");
    }, 120_000);
  });

  // ===================================================================================
  // §D — the consultancy proof, in three parts
  // ===================================================================================
  describe("§D — the consultancy proof: no read path needs an Auth user", () => {
    it("READ HALF — an assigned counsellor reads all NINE tables on a student_user_id-NULL case", async () => {
      const rows: Record<string, string> = {
        profiles: consultancy.profile,
        assessments: consultancy.primaryAssessment,
        plan_items: consultancy.openPlanItem,
        user_program_state: consultancy.programState,
        documents: consultancy.document,
        document_status: consultancy.documentStatus,
        program_predictions: consultancy.prediction,
        application_attempts: consultancy.attempt,
        outcome_events: consultancy.outcomeEvent,
      };
      for (const table of NINE) {
        await proveExists(table, rows[table]!);
        const seen = await visible(actor("counsellorAssignedA"), table);
        expect(
          seen,
          `0 rows on ${table} for an assigned counsellor is a FAILURE: this is the half that proves ` +
            "no read path needs an Auth user. Every seeded row here has owner IS NULL.",
        ).toContain(rows[table]!);
      }
    }, 120_000);

    it("READ HALF — every seeded consultancy row really does carry owner IS NULL", () => {
      // Without this the read half proves nothing: a row that quietly carried an owner would be
      // reachable by the legacy path and the test would pass for the wrong reason.
      const owned = sqlLines(`
        select 'profiles' from public.profiles where id = '${consultancy.profile}' and owner is not null
        union all select 'documents' from public.documents where id = '${consultancy.document}' and owner is not null
        union all select 'outcome_events' from public.outcome_events where id = '${consultancy.outcomeEvent}' and owner is not null;
      `);
      expect(owned, "HARNESS DEFECT: consultancy fixture rows must have owner IS NULL").toEqual([]);
    });

    it("WRITE HALF — the counsellor drives INSERT/UPDATE/DELETE on user_program_state with owner IS NULL", async () => {
      const c = actor("counsellorAssignedA").client;
      const { data: ins, error: insErr } = await c
        .from("user_program_state")
        .insert({ owner: null, case_id: consultancy.caseId, program_id: programId, status: "shortlisted" } as never)
        .select("id")
        .single();
      expect(insErr, `counsellor INSERT on user_program_state failed: ${insErr?.message}`).toBeNull();
      const id = (ins as { id: string }).id;

      const { error: updErr } = await c.from("user_program_state").update({ status: "applied" } as never).eq("id", id);
      expect(updErr, `counsellor UPDATE failed: ${updErr?.message}`).toBeNull();

      const { error: delErr } = await c.from("user_program_state").delete().eq("id", id);
      expect(delErr, `counsellor DELETE failed: ${delErr?.message}`).toBeNull();
    }, 120_000);

    it("WRITE HALF — the counsellor drives INSERT/UPDATE/DELETE on document_status with owner IS NULL", async () => {
      const c = actor("counsellorAssignedA").client;
      const { data: ins, error: insErr } = await c
        .from("document_status")
        // A real `kind` from `document_status_kind_check`, and NOT the one the fixture already
        // seeded on this case — `(case_id, kind)` is unique.
        .insert({ owner: null, case_id: consultancy.caseId, kind: "oshc", obtained: false } as never)
        .select("id")
        .single();
      expect(insErr, `counsellor INSERT on document_status failed: ${insErr?.message}`).toBeNull();
      const id = (ins as { id: string }).id;

      const { error: updErr } = await c.from("document_status").update({ obtained: true } as never).eq("id", id);
      expect(updErr, `counsellor UPDATE failed: ${updErr?.message}`).toBeNull();

      const { error: delErr } = await c.from("document_status").delete().eq("id", id);
      expect(delErr, `counsellor DELETE failed: ${delErr?.message}`).toBeNull();
    }, 120_000);

    it("WRITE HALF — the counsellor inserts the FULL prediction -> attempt -> outcome chain", async () => {
      // The full chain, not just the leaf, so the case-parentage WITH CHECK helpers are exercised.
      const c = actor("counsellorAssignedA").client;
      const { data: pred, error: pErr } = await c
        .from("program_predictions")
        .insert({
          owner: null,
          case_id: consultancy.caseId,
          assessment_id: consultancy.primaryAssessment,
          program_id: programId,
          rule_version: "mv160-chain",
          verdict: "possible",
          score_snapshot: { total: 50 },
        } as never)
        .select("id")
        .single();
      expect(pErr, `counsellor INSERT on program_predictions failed: ${pErr?.message}`).toBeNull();
      const predId = (pred as { id: string }).id;

      const { data: att, error: aErr } = await c
        .from("application_attempts")
        .insert({
          owner: null,
          case_id: consultancy.caseId,
          prediction_id: predId,
          program_id: programId,
          destination: "AU",
        } as never)
        .select("id")
        .single();
      expect(aErr, `counsellor INSERT on application_attempts failed: ${aErr?.message}`).toBeNull();
      const attId = (att as { id: string }).id;

      const { data: evt, error: eErr } = await c
        .from("outcome_events")
        .insert({
          owner: null,
          case_id: consultancy.caseId,
          attempt_id: attId,
          event_type: "applied",
          gate: "admission",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      expect(eErr, `counsellor INSERT on outcome_events failed: ${eErr?.message}`).toBeNull();

      // Teardown child-before-parent.
      if (evt) await fixture.admin.from("outcome_events").delete().eq("id", (evt as { id: string }).id);
      await fixture.admin.from("application_attempts").delete().eq("id", attId);
      await fixture.admin.from("program_predictions").delete().eq("id", predId);
    }, 120_000);

    it("WRITE HALF — the counsellor UPDATEs pre-seeded profiles and plan_items rows", async () => {
      const c = actor("counsellorAssignedA").client;
      const { error: pErr } = await c
        .from("profiles")
        .update({ completeness: 42 } as never)
        .eq("id", consultancy.profile);
      expect(pErr, `counsellor UPDATE on profiles failed: ${pErr?.message}`).toBeNull();

      const { error: plErr } = await c
        .from("plan_items")
        .update({ status: "done" } as never)
        .eq("id", Number(consultancy.openPlanItem));
      expect(plErr, `counsellor UPDATE on plan_items failed: ${plErr?.message}`).toBeNull();
      await fixture.admin.from("plan_items").update({ status: "todo" } as never).eq("id", Number(consultancy.openPlanItem));
    }, 120_000);

    it("REFUSED AND DEFERRED HALF — INSERT into assessments/documents is 42501, for two different reasons", async () => {
      // ---------------------------------------------------------------------------------
      // READ THIS BEFORE "FIXING" A RED HERE.
      // `authenticated` holds NO INSERT grant on these two. RLS narrows a grant; it never widens
      // one. This test began life covering FOUR tables and named all four "deferred to Stage 3".
      // MV-168 resolved the two that were genuinely deferred and the remaining two are not
      // deferred at all any more — they have dispositions, and the dispositions differ:
      //
      //   assessments INSERT — REFUSED PERMANENTLY (Stage 3 spec §6.1 row 2). `result` and
      //     `rule_version` are scoring outputs; a client that can write them mints its own
      //     verdict against the server-side rule. There is no later stage that grants this.
      //     A red here means somebody granted it — that is a trust regression, not progress.
      //
      //   documents INSERT — DEFERRED TO STAGE 4 (row 7), because the only caller must also
      //     write a Storage object and the bucket policy for that is Stage 4's. A red here
      //     means "go and make Stage 4's grant decision", not "the test is broken". Do not
      //     delete it; move it, with the grant, and update the matrix spec.
      //
      // THE PROFILES AND PLAN_ITEMS ASSERTIONS WERE NOT DELETED, THEY WERE INVERTED. They live
      // in `stage3-write-grants.itest.ts` as positive assertions — the counsellor now INSERTs
      // both with `owner IS NULL`. Deleting a decision gate and granting the verb in the same
      // PR is the failure mode; moving it is the discharge.
      // ---------------------------------------------------------------------------------
      const c = actor("counsellorAssignedA").client;

      const { error: asmt } = await c.from("assessments").insert({
        owner: null,
        case_id: consultancy.caseId,
        result: {},
        rule_version: "x",
        destination_id: "AU",
        is_primary: false,
        profile_snapshot: {},
      } as never);
      expect(asmt?.code, "assessments INSERT is refused permanently — a client must not mint a verdict").toBe("42501");

      const { error: docs } = await c.from("documents").insert({
        owner: null,
        case_id: consultancy.caseId,
        kind: "x",
        file_path: "x",
        file_size: 1,
        original_name: "x.pdf",
      } as never);
      expect(docs?.code, "documents INSERT stays ungranted until Stage 4").toBe("42501");
    }, 120_000);
  });
});
