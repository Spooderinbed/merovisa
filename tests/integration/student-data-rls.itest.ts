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
  type CaseKey,  type StudentCaseRows,
  type StudentDataSeeder,
  type StudentDataTable,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("student-data-rls.itest.ts", url);

/**
 * The five helpers MV-159 adds. The first string is what
 * `pg_get_function_identity_arguments` renders (parameter NAME included, which is why it is not
 * just `uuid`); the second is the signature `has_function_privilege` accepts.
 *
 * `case_student_id` is the round-3 addition and the only one that answers about the OWNER axis
 * rather than the case axis — it is what the INSERT `WITH CHECK`s (five at MV-159, seven since
 * MV-168) and §1b clause (c) both read, so the INSERT and UPDATE halves of "owner may only be the
 * case's own student" cannot drift.
 */
const NEW_HELPERS: ReadonlyArray<readonly [name: string, identityArgs: string, signature: string]> = [
  ["actor_case_ids", "", "private.actor_case_ids()"],
  // MV-196's write-side twin of `actor_case_ids` — the same set minus a linked student's
  // ORG-OWNED cases, so a consultancy's case is readable by its student and writable only by its
  // staff. Listed here so it inherits all three hardening assertions below rather than being a
  // definer function nobody audited: a new `private.*` helper defaults to EXECUTE for PUBLIC
  // (which includes `anon`), and an owner without BYPASSRLS makes it under-read in silence.
  ["actor_writable_case_ids", "", "private.actor_writable_case_ids()"],
  ["assessment_case_id", "p_assessment_id uuid", "private.assessment_case_id(uuid)"],
  ["prediction_case_id", "p_prediction_id uuid", "private.prediction_case_id(uuid)"],
  ["attempt_case_id", "p_attempt_id uuid", "private.attempt_case_id(uuid)"],
  ["case_student_id", "p_case_id uuid", "private.case_student_id(uuid)"],
  // MV-161's fourth parent-case helper. The three above answer "which case is my PARENT in";
  // `outcome_events.supersedes_event_id` points at the same table, so it needs the self-referential
  // one. `prediction_case_id` already served that role for the prediction pointer, which is why
  // MV-161 adds one helper and not two.
  ["outcome_event_case_id", "p_event_id uuid", "private.outcome_event_case_id(uuid)"],
];

/**
 * The OWNER-axis bound the INSERT `WITH CHECK`s carry, byte-exact as `pg_get_expr` renders it —
 * MV-159's five, plus MV-168's `profiles` and `plan_items`, which copy the same conjunct. MV-160 §D
 * re-creates the five and must keep this; §13 (4) of that migration and §4 (1) of
 * `20260808120000_stage3_consultancy_write_grants.sql` assert the same property at APPLY time for
 * the five and the two respectively, so a re-creation that drops it cannot even land.
 */
const OWNER_BOUND_INSERT = "(owner IS NULL) OR (owner = private.case_student_id(case_id))";

/**
 * MV-161 — the PARENT-POINTER axis, byte-exact, on the two INSERT surfaces that carry a pointer.
 *
 * WHY THIS ONE NEEDS A STRUCTURAL ASSERTION MORE THAN THE OTHER TWO AXES DO. The case axis is
 * self-announcing: drop it and the counsellor suite goes red immediately. The owner axis is quieter
 * — MV-159 §13 (4) records that every legitimate writer derives `owner` from the case, so only an
 * attacker notices. THE POINTER AXIS IS QUIETER STILL: `grep -rn supersedes lib/ app/` finds NO
 * WRITER AT ALL, so dropping this conjunct breaks no live path and no positive test anywhere in the
 * suite. Behaviourally it is invisible except to the two probes in §H that aim at it deliberately.
 * MV-160 §D re-creates both policies; the migration asserts this at apply time and this asserts it
 * in CI, because a clause with no legitimate caller is the exact clause a later refactor deletes.
 */
const POINTER_BOUND_INSERT: ReadonlyArray<readonly [policy: string, clause: string]> = [
  [
    "program_predictions.pp_insert_case",
    "(supersedes_prediction_id IS NULL) OR (private.prediction_case_id(supersedes_prediction_id) = case_id)",
  ],
  [
    "outcome_events.oe_insert_case",
    "(supersedes_event_id IS NULL) OR (private.outcome_event_case_id(supersedes_event_id) = case_id)",
  ],
];

/**
 * MV-161's ENUMERATION PASS, and the larger half of that card: every column a client may WRITE on
 * an INSERT surface, that NO policy clause mentions, recorded here with the reason it is free.
 *
 * WHY A LIST AND NOT A DOCUMENT. The card's finding was not "this one pointer is unbounded" — it
 * was that nobody had ever enumerated the write surface COLUMN BY COLUMN, so the pointer had been
 * unexamined by every policy this project has shipped, including the legacy ones. A document
 * records that once; this list makes the omission FAIL CI the next time a column appears.
 *
 * THE GUARD IS A CHANGE DETECTOR, NOT A PROOF OF SAFETY, and the distinction matters. "Mentioned by
 * the WITH CHECK" is necessary, not sufficient — a clause could name a column and bound it badly.
 * Sufficiency comes from the behavioural probes (§F, §H); what this adds is that a client-writable
 * column can never again be BOTH unbounded AND unnoticed. Every entry below is a decision somebody
 * has to re-take when it stops being true, not a column somebody forgot.
 */
const CLIENT_WRITABLE_EXEMPTIONS: Readonly<Record<string, string>> = {
  // ---- the client-chosen primary keys. PostgREST's upsert compilation sends the key column, so
  // the grant is forced rather than chosen. Free is SAFE here for a reason that is about the verb:
  // an INSERT naming an EXISTING id is 23505 on the primary key, never an overwrite, because there
  // is no UPDATE grant and no UPDATE policy on any of these three tables. So the worst a chosen id
  // buys is a self-inflicted collision on a value the victim's rows draw from gen_random_uuid().
  "program_predictions.id": "client-chosen PK; a collision is 23505 and there is no UPDATE path to overwrite through",
  "application_attempts.id": "client-chosen PK; same reasoning as program_predictions.id",
  "outcome_events.id": "client-chosen PK; same reasoning as program_predictions.id",

  // ---- CLIENT-SETTABLE TIMESTAMPS. Named by the card as the same "unbounded because
  // unenumerated" family as the pointer, and deliberately left free rather than closed: both are
  // self-scoped (the row is already bound to a reachable case and that case's own student), so the
  // worst they buy is a mis-ordered ledger inside the actor's OWN case. Recorded because "cosmetic
  // today" is a fact about the surfaces that read them, not about the grant.
  "application_attempts.created_at": "client-settable timestamp; self-scoped, orders only the actor's own case",
  "outcome_events.recorded_at": "client-settable ledger timestamp; self-scoped, same family as application_attempts.created_at",

  // ---- THE TWO VERIFICATION-ADJACENT COLUMNS, and they are the sharpest entries in this list.
  // Both are free, and both are harmless ONLY because the same predicate pins `source =
  // 'self_reported'` and `verified_by IS NULL` two conjuncts above them. A row that names
  // `decision_authority = 'dha'` and a `verified_at` is still, on its face, a STUDENT'S CLAIM —
  // that is what `source` says and no client can change it. THE DAY STAGE 3 LETS `source` BE
  // ANYTHING ELSE, BOTH OF THESE BECOME LOAD-BEARING AND MUST BE RE-DECIDED HERE.
  "outcome_events.decision_authority": "CHECK-constrained but free; carries no authority while source is pinned self_reported — REVISIT WITH STAGE 3 VERIFICATION",
  "outcome_events.verified_at": "settable while verified_by is pinned NULL; carries no authority while source is pinned self_reported — REVISIT WITH STAGE 3 VERIFICATION",

  // ---- the payload columns. What the row SAYS, as opposed to whose row it is and what it points
  // at. Free by design on every one of the five: a student's own record is theirs to write, the
  // domain CHECK constraints bound the values, and no policy has ever examined them.
  "program_predictions.program_id": "payload: FK to the public programs catalogue",
  "program_predictions.rule_version": "payload: which scoring version produced the row",
  "program_predictions.score_snapshot": "payload: the scoring breakdown this row records",
  "program_predictions.verdict": "payload; CHECK-constrained to strong/possible/reach",
  "user_program_state.notes": "payload: the student's own note on a shortlisted program",
  "user_program_state.program_id": "payload: FK to the public programs catalogue",
  "user_program_state.status": "payload: the student's own shortlist status for a program",
  // `kind` is half of the `(owner, kind)` unique index round 3 weaponised — closed by the OWNER
  // bound, which is why bounding `kind` itself buys nothing.
  "document_status.kind": "payload; the (owner, kind) collision it enabled is closed by the owner bound, not by bounding kind",
  "document_status.obtained": "payload: the student's own checklist tick for a document kind",
  "application_attempts.destination": "payload: which destination country the attempt targets",
  "application_attempts.external_ref": "payload: the student's own reference for the application",
  "application_attempts.institution_id": "payload: which institution the attempt targets",
  "application_attempts.intake": "payload: which intake the attempt targets",
  "application_attempts.program_id": "payload: FK to the public programs catalogue",
  "outcome_events.detail": "payload: the free-form jsonb body of the student's self-report",
  "outcome_events.event_type": "payload; CHECK-constrained to the eleven ledger events",
  "outcome_events.gate": "payload; CHECK-constrained to admission/visa",
  "outcome_events.occurred_at": "payload: the student's report of when it happened",
  "outcome_events.occurred_on": "payload: the student's report of the date it happened",
  "outcome_events.reason_code": "payload: the student's stated reason on a refusal or withdrawal",

  // ---- MV-168 (Stage 3 slice 1) OPENED TWO MORE INSERT SURFACES, and these nine columns are the
  // whole of what it newly made client-writable. Three of them — `profiles.sections`,
  // `profiles.completeness`, `plan_items.status` — the client could ALREADY write, because Stage 2
  // left `authenticated` an UPDATE grant on each; for those the INSERT grant adds a verb, not a
  // column. The other six are new. All nine are free for the same reason the five older surfaces'
  // payload columns are: the row is already pinned to a case the actor may reach and to that
  // case's own student by the two conjuncts above them, so what the row SAYS is self-scoped.
  "profiles.sections": "payload: the student's own 13-section profile jsonb; already UPDATE-granted, so INSERT adds a verb not a column",
  "profiles.completeness": "payload: the derived completeness meter; already UPDATE-granted, and it steers no verdict",
  "plan_items.kind": "payload: which plan step this is; no CHECK, and the step is self-scoped to the actor's own reachable case",
  "plan_items.impact": "payload; CHECK-constrained to high/medium/low",
  "plan_items.title": "payload: the step's own headline text",
  "plan_items.body": "payload: the step's own body text",
  // The INSERT grant deliberately omits `completed_at`/`started_at` (migration §2), so a row created
  // `status='done'` carries no client-chosen completion TIME. The status itself was already
  // client-writable through the Stage 2 UPDATE grant, so this buys nothing new.
  "plan_items.status": "payload; CHECK-constrained to todo/done/dismissed and already UPDATE-granted; the timestamps stay ungranted",
  "plan_items.lift_estimate": "payload: the step's own estimated lift, free text the student reads",
  "plan_items.time_estimate": "payload: the step's own estimated time, free text the student reads",
};

/**
 * The tables the enumeration pass covers — the ones `authenticated` may INSERT into.
 *
 * SEVEN, NOT FIVE, since MV-168. The first five are MV-159's; `profiles` and `plan_items` are the
 * Stage 3 write grants (spec §6.1 rows 1 and 5). They are LISTED rather than left out, because
 * leaving them out is exactly the failure this guard exists to prevent: MV-168 made nine columns
 * client-writable, and a five-table list would have enumerated none of them while still reading as
 * a complete enumeration.
 */
const INSERT_SURFACES = [
  "user_program_state",
  "document_status",
  "program_predictions",
  "application_attempts",
  "outcome_events",
  "profiles", // MV-168
  "plan_items", // MV-168
] as const;

/**
 * Does `expr` mention `col` as a WHOLE identifier? The boundary class is what stops `id` matching
 * inside `case_id` and `prediction_id` matching inside `supersedes_prediction_id` — both of which
 * are live in these predicates, and either false positive would report an unbounded column as
 * bounded, which is the one failure mode this guard must not have.
 */
const mentionsColumn = (expr: string, col: string): boolean =>
  new RegExp(`(^|[^A-Za-z0-9_])${col}([^A-Za-z0-9_]|$)`).test(expr);

/**
 * Every policy this card ships, by table. MV-160 §D re-creates this exact list, and **MV-168 adds
 * the three marked below** — the Stage 3 write grants (spec §6.1 rows 1, 3, 5). They are listed
 * here rather than exempted, so that dropping one still turns this red.
 */
const EXPECTED_POLICIES: Record<StudentDataTable, ReadonlyArray<readonly [name: string, cmd: string]>> = {
  profiles: [
    ["profiles_insert_case", "a"], // MV-168
    ["profiles_select_case", "r"],
    ["profiles_update_case", "w"],
  ],
  assessments: [
    ["assessments_select_case", "r"],
    ["assessments_update_case", "w"], // MV-168 — narrowed to `is_primary` by the GRANT, not the policy
  ],
  plan_items: [
    ["plan_items_insert_case", "a"], // MV-168
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
 * MV-160 §D RETIRED THE TRANSITIONAL DISJUNCT, and with it the three byte-exact constants that
 * pinned its rendered shape (`TRANSITIONAL_DISJUNCT`, its INSERT variant, and `CASE_BRANCH`). They
 * were consumed only by the §M block MV-160 §E deletes, and what they asserted is a PROPERTY OF THE
 * NULLABLE WINDOW — "every predicate still carries an `owner = auth.uid()` arm" — which is the exact
 * statement this card makes false on purpose. They are deleted rather than re-pointed because the
 * surviving property is not a string: the CASE arm is asserted structurally by the branch guard in
 * §F (`ownershipArms`), which fails both if that arm is lost and if a second arm ever reappears.
 */

/**
 * The INSERT policies whose WITH CHECK carries the round-3 owner-axis bound — SEVEN since MV-168,
 * which copied the same three-conjunct template onto `profiles` and `plan_items`. Listed here for
 * the reason the five were: the bound is invisible to every legitimate caller, so only an
 * enumeration keeps a later re-creation from dropping it.
 */
const INSERT_POLICIES: ReadonlySet<string> = new Set([
  "user_program_state.ups_insert_case",
  "document_status.ds_insert_case",
  "program_predictions.pp_insert_case",
  "application_attempts.aa_insert_case",
  "outcome_events.oe_insert_case",
  "profiles.profiles_insert_case", // MV-168
  "plan_items.plan_items_insert_case", // MV-168
]);

/**
 * Split a rendered predicate into its TOP-LEVEL ownership arms — the disjuncts of the
 * parenthesised ownership group, ignoring any integrity clauses `AND`ed alongside it.
 *
 * This exists because the completeness guard used to be VERB-aware and round 2 showed that is not
 * enough: every cross-boundary write probe on this card passed `owner: null`, so every WITH CHECK
 * was exercised through its CASE arm only, and the guard reported full coverage over probes that
 * all took one path. The OWNER arm of five INSERT policies was admitting cross-case rows and no
 * test could see it. A guard that enumerates ARMS out of the catalogue fails on an unprobed arm
 * whether or not anybody remembers to write the probe.
 */
const ownershipArms = (expr: string): string[] => {
  // Top-level split, paren-depth aware. `pg_get_expr` fully parenthesises, so the ownership
  // group is the single top-level operand that mentions the helper.
  const splitTop = (s: string, op: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      else if (depth === 0 && s.startsWith(op, i)) {
        out.push(s.slice(start, i));
        i += op.length - 1;
        start = i + 1;
      }
    }
    out.push(s.slice(start));
    return out.map((p) => p.trim()).filter(Boolean);
  };
  const unwrap = (s: string): string => {
    let t = s.trim();
    // Strip a wrapper paren only when it encloses the WHOLE expression.
    for (;;) {
      if (!t.startsWith("(") || !t.endsWith(")")) return t;
      let depth = 0;
      let wraps = true;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "(") depth++;
        else if (t[i] === ")") depth--;
        if (depth === 0 && i < t.length - 1) {
          wraps = false;
          break;
        }
      }
      if (!wraps) return t;
      t = t.slice(1, -1).trim();
    }
  };

  const body = unwrap(expr);
  const andParts = splitTop(body, " AND ");
  // MV-196 split the case predicate in two: reads keep `actor_case_ids()`, writes moved to
  // `actor_writable_case_ids()` (the same set minus a linked student's ORG-owned cases). Both
  // are "the case arm" as far as this classifier is concerned — what it exists to catch is a
  // NEW, unprobed arm, and neither of these is new. Note `actor_case_ids` is not a substring of
  // `actor_writable_case_ids`, so the second name genuinely has to be listed.
  const isCaseArm = (s: string): boolean =>
    s.includes("actor_case_ids") || s.includes("actor_writable_case_ids");

  const group = andParts.find(isCaseArm) ?? body;
  return splitTop(unwrap(group), " OR ").map((arm) => {
    const a = unwrap(arm);
    if (isCaseArm(a)) return "case";
    if (a.includes("auth.uid()")) return "owner";
    // Anything else is a NEW arm nobody has probed. Named so the guard's failure says what it is.
    return `unprobed-arm:${a}`;
  });
};

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
  // B  MOVED — see §M at the foot of this file.
  // ===================================================================================
  // The disjunct-shape assertion used to live here, and that made the card's central promise
  // FALSE: MV-160 was told it would delete exactly one `describe` block, while this block
  // asserted every predicate CONTAINS the disjunct MV-160 removes and would therefore go red
  // too. It now lives inside the one transitional block, so the promise is true by construction
  // rather than by hope. Nothing else moved.

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

    it("shows anon nothing on any of the nine — today by the absent grant, provably", async () => {
      for (const table of STUDENT_DATA_TABLES) {
        const { data: rows } = await fixture.anon.from(table).select("id");
        expect(rows ?? [], `anon must see no ${table}`).toEqual([]);
      }
      // Paired existence proof: the rows are there, anon simply cannot have them.
      await proveExists("profiles", data.orgAssignedA.profile);
      await proveExists("documents", data.orgAssignedA.document);
    });

    it("keeps anon out by the `to authenticated` CLAUSE even if the grant ever appears", () => {
      // ROUND 2 RENAMED THE TEST ABOVE AND ADDED THIS ONE. The old test was called "the `to
      // authenticated` clause, doing its job" and did not test that clause at all: `anon` holds
      // no grant on any of the nine, so its empty result is the GRANT refusing, and the
      // observation would have been byte-identical against the PUBLIC-scoped legacy policies
      // this card renamed. The rename is an acceptance criterion, so it needs a probe that fails
      // if it is reverted.
      //
      // The only way to see the clause work is to remove the thing that is masking it. This
      // grants `anon` SELECT inside a transaction, reads as `anon`, and ROLLS BACK — so the
      // grant never outlives the statement. Spec §9.9 records the mirror case where no such net
      // exists (`storage.objects`, where `anon` holds the full grant set), which is exactly why
      // this policy set must not depend on the grant staying absent.
      const seen = sqlLines(`
        begin;
        grant select on public.documents, public.profiles to anon;
        set local role anon;
        select 'documents=' || count(*) from public.documents;
        select 'profiles=' || count(*) from public.profiles;
        rollback;
      `)
        // psql prints a command tag for every non-SELECT statement even under `-tA`; left in,
        // the four tags around the transaction read as four extra result rows.
        .filter((line) => !/^(BEGIN|GRANT|SET|ROLLBACK)\b/.test(line));
      expect(seen, "with the grant present, only the `to authenticated` clause stands between anon and the rows").toEqual(
        ["documents=0", "profiles=0"],
      );

      // …and the grant really is gone again, so this test left no residue.
      const residue = sqlLines(`
        select table_name from information_schema.role_table_grants
         where table_schema = 'public' and grantee = 'anon'
           and table_name in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(residue, "the probe leaked a grant to anon").toEqual([]);
    });
  });

  // ===================================================================================
  // F  cross-tenant WRITE denial, and the completeness guard that keeps it honest
  // ===================================================================================
  describe("cross-tenant write denial on every verb `authenticated` actually holds", () => {
    const attempted = new Set<string>();
    const record = (key: string) => attempted.add(key);

    /** Service-role read-back that fails loudly rather than reading as "the write did not land". */
    const rowStill = async (table: StudentDataTable, id: string): Promise<Record<string, unknown>> => {
      const { data: row, error } = await fixture.admin.from(table).select("*").eq("id", id).maybeSingle();
      expect(error, `HARNESS DEFECT: service-role read of ${table} failed — that is not a denial`).toBeNull();
      // ROUND 2: this returned null happily, so every `toEqual(before)` below compared null with
      // null and PASSED VACUOUSLY against a row that was never seeded. A cross-tenant UPDATE
      // probe with no row to protect proves nothing, and it proves it silently.
      expect(
        row,
        `${table} row ${id} is absent. Either the attacker just deleted it — in which case this is ` +
          "a real cross-tenant write — or the fixture never seeded it and every assertion about " +
          "this row is vacuous. Both are failures, and neither is a denial.",
      ).not.toBeNull();
      return row as Record<string, unknown>;
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
          // The victim row carries `owner NULL` (consultancy shape), so the owner arm of the
          // UPDATE predicate is NULL and the case arm is the one refusing. The owner arm gets
          // its own probes below.
          record(`${table}.update@case`);
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
          // These name `owner: null`, so the OWNER arm is trivially false and the CASE arm is
          // what refuses. That is one branch of a two-branch predicate — see below.
          record(`${table}.insert@case`);
          const { error } = await attacker.client.from(table).insert(row as never);
          // INSERT is the one verb whose denial is LOUD: a WITH CHECK rejection is 42501.
          expect(error?.code, `${attackerKey} inserted into ${table} across the boundary`).toBe("42501");
        }

        // ---- INSERT into the victim's case, NAMING YOURSELF AS OWNER ------------------------
        // THE OTHER BRANCH, AND THE ONE ROUND 2 FOUND OPEN. Every probe above passes
        // `owner: null`, which makes `owner = auth.uid()` NULL and leaves the case arm as the
        // only thing under test. Name yourself instead and the owner arm is TRUE — under the
        // bare disjunct that ADMITTED the row, whatever case it named. Measured: a user who
        // could not SELECT another user's assessment inserted a prediction into their case and
        // the victim saw it in their own record. On `application_attempts` / `outcome_events`
        // the only thing refusing it was a legacy composite FK MV-160 DROPS.
        //
        // Nothing here is hypothetical about the future: this is the probe that fails if the
        // `and case_id is null` is ever removed from one of the five INSERT predicates.
        //
        // THE VALUES ARE VARIED OFF THE PROBES ABOVE ON PURPOSE. `user_program_state` is unique
        // on `(case_id, program_id)` and `document_status` on `(case_id, kind)`, so reusing the
        // victim's own program/kind makes a mutated (hole-restored) policy answer `23505`
        // instead of admitting the row — a red for the wrong reason, and one that would hide
        // whether the predicate is doing anything at all. Measured during mutation testing.
        const insertsNamingSelf: Array<[StudentDataTable, Record<string, unknown>]> = inserts.map(
          ([table, row]) => [
            table,
            {
              ...row,
              owner: attacker.id,
              ...(table === "user_program_state" ? { program_id: spareProgram2 } : {}),
              ...(table === "document_status" ? { kind: "sponsor-income" } : {}),
              ...(table === "program_predictions" ? { rule_version: "mv159-attack-self" } : {}),
            },
          ],
        );
        for (const [table, row] of insertsNamingSelf) {
          record(`${table}.insert@owner`);
          const { error } = await attacker.client.from(table).insert(row as never);
          expect(
            error?.code,
            `${attackerKey} named THEMSELVES owner and inserted into ${table} inside org B's case — ` +
              "the owner disjunct is admitting a row into a case the actor cannot reach",
          ).toBe("42501");
        }
      }
    }, 120_000);

    // ---------------------------------------------------------------------------------------
    // THE INSIDER RE-POINT. Every probe above is an OUTSIDER: the USING clause never matches, so
    // the row is unreachable and WITH CHECK is never consulted. The round-2 blocker needed the
    // opposite shape — an actor who legitimately REACHES the row and then carries it off — and
    // no probe in this file had it. `owner` IS in the UPDATE grant on the two upsert-seam tables
    // (MV-155 §H, forced by PostgREST), so this is a live client path, not a hypothetical.
    // ---------------------------------------------------------------------------------------
    it("refuses an actor INSIDE the case every attempt to move a row's ownership axes", async () => {
      const counsellor = actor("counsellorAssignedA");
      const student = actor("studentA");
      const consultancy = data.orgAssignedA; // owner NULL, case_id = a case the counsellor reaches
      const personal = data.personalA; // owner = studentA, case_id = studentA's personal case

      // (1) owner -> SELF on an OWNER-NULL CONSULTANCY ROW. THE MEASURED BLOCKER: one
      //     `PATCH /rest/v1/document_status?id=eq.<id>` with `{"owner":"<own uid>"}` was ADMITTED
      //     and re-pointed the client's row into the COUNSELLOR'S OWN PERSONAL CASE, where the
      //     client's org admin can no longer see it. The BEFORE ROW derive trigger fired before
      //     the WITH CHECK, so the check saw the already-re-pointed row and admitted it on
      //     `owner = auth.uid()`. No predicate in this migration could have caught that.
      for (const [table, id] of [
        ["document_status", consultancy.documentStatus],
        ["user_program_state", consultancy.programState],
      ] as Array<[StudentDataTable, string]>) {
        record(`${table}.update@owner`);
        const before = await rowStill(table, id);
        const { error } = await counsellor.client
          .from(table)
          .update({ owner: counsellor.id } as never)
          .eq("id", id);
        expect(
          error?.code,
          `${table}: an assigned counsellor took ownership of a client's consultancy row`,
        ).toBe("42501");
        expect(await rowStill(table, id), `${table}: the row moved`).toEqual(before);
        // And it is still in the CLIENT's case, which is the property that actually matters.
        expect((before as { case_id: string }).case_id).toBe(consultancy.caseId);
      }

      // (2) owner -> SELF on an OWNER-SET row belonging to somebody else's case. Same attack,
      //     the other actor shape the review asked to be pinned.
      for (const [table, id] of [
        ["document_status", personal.documentStatus],
        ["user_program_state", personal.programState],
      ] as Array<[StudentDataTable, string]>) {
        const before = await rowStill(table, id);
        const { error } = await counsellor.client
          .from(table)
          .update({ owner: counsellor.id } as never)
          .eq("id", id);
        // The counsellor cannot reach a personal case at all, so this one dies at USING —
        // silently, zero rows. Asserted on the ROW, which is the only honest proof.
        expect(error ?? null, `${table}: unexpected error shape`).toBeNull();
        expect(await rowStill(table, id), `${table}: a counsellor re-owned a personal row`).toEqual(before);
      }

      // (3) owner -> SELF by the row's OWN owner, on their OWN row. Legal, a no-op, and here so
      //     that (1) and (2) are not passing because the whole column is frozen.
      const okSelf = await student.client
        .from("document_status")
        .update({ owner: student.id } as never)
        .eq("id", personal.documentStatus);
      expect(okSelf.error, `re-affirming your own ownership must stay legal: ${okSelf.error?.message}`).toBeNull();

      // (4) owner -> ANOTHER USER. Previously refused because the derive trigger re-pointed
      //     `case_id` onto the other user's personal case and the WITH CHECK then failed. That
      //     argument died with the fix — `case_id` is no longer re-derived — so the refusal now
      //     has to come from the trigger's own guard, and this proves it does.
      const other = actor("studentB");
      const beforeOther = await rowStill("user_program_state", personal.programState);
      const reOwn = await student.client
        .from("user_program_state")
        .update({ owner: other.id } as never)
        .eq("id", personal.programState);
      expect(reOwn.error?.code, "handing your row to another user must be refused").toBe("42501");
      expect(await rowStill("user_program_state", personal.programState)).toEqual(beforeOther);

      // (5) owner -> NULL. Admitted before round 2, and it is not a provenance nicety: it
      //     PERMANENTLY BREAKS `/api/account/delete` for that user. Step 2 deletes by
      //     `.eq("owner", userId)` and removes 0 rows; step 3 then fails 23503 on
      //     `user_program_state_case_id_fkey`, because all nine carry `case_id ON DELETE
      //     RESTRICT`. One hand-rolled PATCH from a browser console and the account can never
      //     be deleted again.
      for (const [table, id] of [
        ["document_status", personal.documentStatus],
        ["user_program_state", personal.programState],
      ] as Array<[StudentDataTable, string]>) {
        const before = await rowStill(table, id);
        const { error } = await student.client
          .from(table)
          .update({ owner: null } as never)
          .eq("id", id);
        expect(error?.code, `${table}: clearing owner must be refused, not merely regretted`).toBe("42501");
        expect((await rowStill(table, id)) as { owner: string }, `${table}.owner was cleared`).toEqual(before);
      }
    }, 120_000);

    // ---------------------------------------------------------------------------------------
    // THE MIRROR OF THE ROUND-2 INSERT BLOCKER, and round 3 measured it open on ALL FIVE.
    //
    // Round 2 closed "name YOURSELF owner, point `case_id` at the VICTIM'S case" by bounding
    // WHICH CASE a row may name. Nothing bounded WHICH OWNER. The mirror is "name the VICTIM
    // owner, point `case_id` at YOUR OWN case" — every predicate said yes, because the case is
    // reachable and `owner` was never looked at — and the victim then saw the row through the
    // transitional `owner = (select auth.uid())` SELECT disjunct.
    //
    // WHY THIS FILE'S EXISTING PROBES COULD NOT SEE IT. `owner: null → victim's case` and
    // `owner: self → victim's case` are both here; `owner: victim → the actor's OWN case` was
    // not, and it is the only one of the three that aims at the owner axis with the case axis
    // SATISFIED. Legacy `ups_insert_own` (`with check (owner = auth.uid())`) refused it, so it
    // was a REGRESSION rather than a pre-existing gap.
    //
    // EVERY ASSERTION HERE IS `42501` AND THAT IS THE POINT, NOT PEDANTRY. On
    // `application_attempts` and `outcome_events` the legacy composite owner FKs
    // (`…_prediction_id_owner_fkey`, `…_attempt_id_owner_fkey`) refuse SOME shapes of this attack
    // with `23503` — and MV-160 DROPS BOTH. A test that accepted "any error" would stay green
    // through MV-160 and go quietly wrong; these two probes name their own parents inside the
    // actor's own case so both FKs are satisfiable, which leaves the policy as the only thing
    // that can refuse.
    // ---------------------------------------------------------------------------------------
    it("refuses naming ANOTHER USER as owner on a row in a case the actor CAN reach", async () => {
      // ATTACKER is studentB, writing into the org case they are the linked student of; VICTIM is
      // studentA, who holds a PERSONAL case — which is what lets the last probe drive the REAL
      // `setObtained` payload (`owner`, never `case_id`; status-repo.ts) rather than an
      // approximation of it.
      const student = actor("studentB");
      const victim = actor("studentA");
      const own = data.orgAssignedB; // the attacker's OWN reachable case
      const ownCase = caseId("orgAssignedB");
      const plantedKind = "coe"; // unused by every fixture row, on both unique axes

      const mirrors: Array<[StudentDataTable, Record<string, unknown>]> = [
        [
          "user_program_state",
          { owner: victim.id, case_id: ownCase, program_id: spareProgram, status: "applied" },
        ],
        ["document_status", { owner: victim.id, case_id: ownCase, kind: plantedKind, obtained: true }],
        [
          "program_predictions",
          {
            owner: victim.id,
            case_id: ownCase,
            assessment_id: own.primaryAssessment, // the ACTOR'S OWN parent — parentage agrees
            program_id: spareProgram,
            verdict: "strong",
            rule_version: "mv159-mirror",
            score_snapshot: {},
          },
        ],
        [
          "application_attempts",
          { owner: victim.id, case_id: ownCase, prediction_id: own.prediction, program_id: own.programId },
        ],
        [
          "outcome_events",
          {
            owner: victim.id,
            case_id: ownCase,
            attempt_id: own.attempt,
            event_type: "visa_granted", // a fabricated OUTCOME OF RECORD in the victim's data
            occurred_at: new Date().toISOString(),
            source: "self_reported",
          },
        ],
      ];

      for (const [table, row] of mirrors) {
        record(`${table}.insert@case`);
        const { error } = await student.client.from(table).insert(row as never);
        expect(
          error?.code,
          `${table}: naming another user as owner was admitted (or refused by an FK MV-160 drops, ` +
            `not by the policy) — got ${error?.code ?? "NO ERROR"}: ${error?.message ?? "admitted"}`,
        ).toBe("42501");
      }

      // The victim must see NOTHING of it, on their own authenticated client, through EITHER
      // SELECT disjunct. This is the assertion the transitional `owner = auth.uid()` arm makes
      // necessary: a planted row would be visible to them even though its case is not theirs.
      for (const [table] of mirrors) {
        const { data: seen, error } = await victim.client.from(table).select("id").eq("case_id", ownCase);
        expect(error ?? null, `${table}: unexpected read error`).toBeNull();
        expect(seen ?? [], `${table}: the victim can see a row planted in someone else's case`).toEqual([]);
      }

      // THE SHARPEST CONSEQUENCE, and why this is a blocker and not a tidiness note. A planted
      // `(owner = victim, kind = K)` row breaks the victim's OWN live checklist call for K
      // FOREVER: `setObtained` (lib/documents/status-repo.ts) upserts on the `(case_id, kind)`
      // arbiter, the violated index is `(owner, kind)`, so `ON CONFLICT` cannot absorb it and the
      // repo's case-scoped heal path can neither see nor remove the row. One REST call.
      // The payload is byte-for-byte what `setObtained` sends: `owner`, never `case_id` (naming
      // case_id puts it in the ON CONFLICT DO UPDATE SET list and is a 42501 on the ungranted
      // column), with MV-155 §H's definer trigger deriving the case.
      const heal = await victim.client
        .from("document_status")
        .upsert({ owner: victim.id, kind: plantedKind, obtained: true } as never, { onConflict: "case_id,kind" })
        .select("id");
      expect(
        heal.error,
        `the victim's own setObtained('${plantedKind}') must still work after the attempt was refused: ` +
          `${heal.error?.code} ${heal.error?.message}`,
      ).toBeNull();
      const healedId = (heal.data as Array<{ id: string }> | null)?.[0]?.id;
      if (healedId) await fixture.admin.from("document_status").delete().eq("id", healedId);
    }, 120_000);

    // The STRUCTURAL half of the same property. The behavioural probe above proves the bound
    // works; this proves it is still WRITTEN, on all seven, so MV-160 §D's re-creation cannot drop
    // it silently. §D re-creates MV-159's five only — MV-168's two are covered here because a
    // re-creation is not the only way a conjunct goes missing. Both halves are needed for the reason §F2 records: a negative-only probe
    // cannot tell "correctly denied" from "denied because the policy is missing".
    it("carries the OWNER-axis bound in all seven INSERT predicates — what MV-160 §D must keep", () => {
      const withChecks = sqlLines(`
        select c.relname || '.' || p.polname || '|' ||
               replace(replace(pg_get_expr(p.polwithcheck, p.polrelid), e'\\n', ' '), '  ', ' ')
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname || '.' || p.polname in (${[...INSERT_POLICIES].map((p) => `'${p}'`).join(",")})
         order by 1;
      `);
      expect(withChecks.length, "all seven INSERT policies must exist").toBe(INSERT_POLICIES.size);
      for (const line of withChecks) {
        const [name, ...rest] = line.split("|");
        expect(rest.join("|"), `${name}: the owner-axis bound is missing or reshaped`).toContain(OWNER_BOUND_INSERT);
      }
    });

    // MV-161 — the same structural argument for the THIRD axis. See POINTER_BOUND_INSERT's comment
    // for why this one needs the assertion most: no legitimate writer touches either column, so
    // deleting the conjunct leaves every other test in this file green.
    it("carries the POINTER-axis bound in the two INSERT predicates that have a pointer — what MV-160 §D must keep", () => {
      const withChecks = sqlLines(`
        select c.relname || '.' || p.polname || '|' ||
               replace(replace(pg_get_expr(p.polwithcheck, p.polrelid), e'\\n', ' '), '  ', ' ')
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname || '.' || p.polname in (${POINTER_BOUND_INSERT.map(([p]) => `'${p}'`).join(",")})
         order by 1;
      `);
      expect(withChecks.length, "both pointer-carrying INSERT policies must exist").toBe(2);

      for (const [policy, clause] of POINTER_BOUND_INSERT) {
        const line = withChecks.find((l) => l.startsWith(`${policy}|`));
        expect(line, `${policy}: no WITH CHECK found`).toBeDefined();
        expect(line!.split("|").slice(1).join("|"), `${policy}: the pointer-axis bound is missing or reshaped`).toContain(
          clause,
        );
      }

      // And the OTHER three INSERT policies must NOT have grown one — not tidiness, but the
      // statement that this card touched exactly the two predicates whose tables carry a pointer
      // column. `application_attempts.prediction_id` is a PARENT pointer MV-159 §10 already bounds;
      // `user_program_state` and `document_status` have no self-reference at all.
      const others = sqlLines(`
        select c.relname || '.' || p.polname
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and p.polname in ('ups_insert_case', 'ds_insert_case', 'aa_insert_case')
           and pg_get_expr(p.polwithcheck, p.polrelid) like '%supersedes%'
         order by 1;
      `);
      expect(others, "only the two pointer-carrying tables may name a supersedes column").toEqual([]);
    });

    // The two UPDATE-granted tables whose grant does NOT include `owner`. Their WITH CHECK
    // carries the same two arms, but the OWNER arm is unreachable because the COLUMN is
    // ungranted — which is a fact about the grant set that can change, so it is probed rather
    // than assumed. This is what supplies `profiles.update@owner` / `plan_items.update@owner`.
    it("refuses to name yourself owner on the two tables whose UPDATE grant omits the column", async () => {
      const student = actor("studentA");
      for (const [table, id] of [
        ["profiles", data.personalA.profile],
        ["plan_items", data.personalA.openPlanItem],
      ] as Array<[StudentDataTable, string]>) {
        record(`${table}.update@owner`);
        const { error } = await student.client
          .from(table)
          .update({ owner: student.id } as never)
          .eq("id", table === "plan_items" ? (planId(id) as unknown as string) : id);
        expect(error?.code, `${table}: UPDATE(owner) is not granted and must stay that way`).toBe("42501");
      }
    });

    // The two PERMANENTLY ungranted `assessments` verbs, plus the two scoring columns MV-168's
    // narrowed UPDATE grant deliberately excludes. Declared BEFORE the completeness guard because
    // vitest runs `it`s in declaration order and the guard counts what has actually run.
    it("refuses every assessments write except `is_primary` — the refusal is the missing grant, not a predicate", async () => {
      const student = actor("studentA");
      record("assessments.insert");
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
      expect(insert.error?.code, "assessments INSERT is refused permanently (Stage 3 spec §6.1 row 2)").toBe("42501");

      // MV-168 GRANTED `UPDATE (is_primary)` AND NOTHING ELSE. These two are the reason the grant
      // is column-scoped: `result` and `rule_version` are the scoring engine's outputs, and a
      // client that can write them forges its own banded verdict.
      const forged = await student.client
        .from("assessments")
        .update({ result: { verdict: "strong" } } as never)
        .eq("id", own);
      expect(forged.error?.code, "a client must never be able to write `assessments.result`").toBe("42501");
      const version = await student.client
        .from("assessments")
        .update({ rule_version: "forged" } as never)
        .eq("id", own);
      expect(version.error?.code, "a client must never be able to write `assessments.rule_version`").toBe("42501");

      const del = await student.client.from("assessments").delete().eq("id", own);
      expect(del.error?.code, "assessments DELETE is refused (Stage 3 spec §6.1 row 4)").toBe("42501");
      expect(await rowStill("assessments", own), "and the row survived every one").not.toBeNull();
    });

    // MV-168's THREE NEW VERBS, probed across the tenant boundary and on the owner axis. The
    // completeness guards below derive what must be probed from `information_schema` and
    // `pg_policy` at run time, so this test is not optional decoration: without it they go red.
    it("refuses the three verbs Stage 3 granted, across the boundary and on the owner axis", async () => {
      const attacker = actor("counsellorAssignedA");
      const victim = data.orgAssignedB;
      const reachable = caseId("orgAssignedA");
      const foreignOwner = actor("studentB").id;

      // ---- CASE ARM: an INSERT naming a case the actor cannot reach ----------------------
      record("profiles.insert");
      record("profiles.insert@case");
      const profCross = await attacker.client
        .from("profiles")
        .insert({ owner: null, case_id: victim.caseId, sections: {}, completeness: 0 } as never);
      expect(profCross.error?.code, "profiles INSERT crossed the tenant boundary").toBe("42501");

      record("plan_items.insert");
      record("plan_items.insert@case");
      const planCross = await attacker.client.from("plan_items").insert({
        owner: null,
        case_id: victim.caseId,
        kind: "mv168-cross",
        impact: "low",
        title: "cross-tenant",
        status: "todo",
      } as never);
      expect(planCross.error?.code, "plan_items INSERT crossed the tenant boundary").toBe("42501");

      // ---- OWNER ARM: a REACHABLE case, but the row attributed to somebody else -----------
      // The arm the case arm cannot cover. `studentB` is not `orgAssignedA`'s student, so this
      // is the third conjunct — `owner is null or owner = private.case_student_id(case_id)` —
      // and without it an actor could write rows inside a case it may reach that name another
      // user as their author.
      record("profiles.insert@owner");
      const profOwner = await attacker.client
        .from("profiles")
        .insert({ owner: foreignOwner, case_id: reachable, sections: {}, completeness: 0 } as never);
      expect(profOwner.error?.code, "profiles INSERT accepted a foreign owner").toBe("42501");

      record("plan_items.insert@owner");
      const planOwner = await attacker.client.from("plan_items").insert({
        owner: foreignOwner,
        case_id: reachable,
        kind: "mv168-foreign-owner",
        impact: "low",
        title: "attributed to someone else",
        status: "todo",
      } as never);
      expect(planOwner.error?.code, "plan_items INSERT accepted a foreign owner").toBe("42501");
      const { data: leaked } = await fixture.admin
        .from("plan_items")
        .select("id")
        .eq("case_id", reachable)
        .eq("owner", foreignOwner);
      expect((leaked ?? []).length, "a foreign-owner row landed anyway").toBe(0);

      // ---- assessments UPDATE (is_primary) across the boundary ----------------------------
      // A USING clause that does not match affects ZERO rows and returns NO error, so the proof
      // is the row rather than the error.
      record("assessments.update(is_primary)");
      record("assessments.update@case");
      const before = await rowStill("assessments", victim.primaryAssessment);
      await attacker.client
        .from("assessments")
        .update({ is_primary: false } as never)
        .eq("id", victim.primaryAssessment);
      expect(
        await rowStill("assessments", victim.primaryAssessment),
        "org A's counsellor changed org B's assessment",
      ).toEqual(before);

      // ---- the owner axis on that UPDATE is bounded by the ABSENT COLUMN GRANT ------------
      // Same shape as `profiles.update@owner` / `plan_items.update@owner` above: the policy has
      // no owner conjunct because the client has no way to supply one, and that is a fact about
      // the grant set which can change — so it is probed rather than assumed.
      record("assessments.update@owner");
      const claimOwner = await attacker.client
        .from("assessments")
        .update({ owner: attacker.id } as never)
        .eq("id", data.orgAssignedA.primaryAssessment);
      expect(claimOwner.error?.code, "assessments UPDATE(owner) is not granted and must stay that way").toBe("42501");
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
      // MV-168 EMPTIED THIS LIST. `assessments` was the last of the nine holding no write grant
      // at all; the narrowed `UPDATE (is_primary)` moved it into the granted set, so the shape
      // "a wholly ungranted table" no longer occurs here.
      expect(ungranted, "every one of the nine now holds at least one write grant").toEqual([]);

      // THE VERBS THAT ARE PROBED BUT CANNOT BE DERIVED. `granted` is read from the catalogue and
      // can only name verbs that HOLD a grant; `ungranted` covers whole tables that hold none. A
      // table that is PARTIALLY granted — `assessments`, since MV-168 — falls through both, and
      // its two permanently refused verbs would then look like probes for a boundary that does
      // not exist. They are enumerated here, with their disposition, so the comparison below
      // stays bidirectional: a probe with no grant and no entry here is still a defect.
      const REFUSED_BUT_PROBED = [
        "assessments.insert", // Stage 3 spec §6.1 row 2 — refused permanently (verdict forgery)
        "assessments.delete", // row 4 — row removal is account teardown, Stage 6
      ];

      const required = [
        ...granted,
        ...REFUSED_BUT_PROBED,
        ...ungranted.flatMap((t) => [`${t}.insert`, `${t}.update`, `${t}.delete`]),
      ].sort();
      const verbLevel = [...attempted].filter((k) => !k.includes("@")).sort();
      expect(verbLevel, "every write verb `authenticated` holds must be probed across the boundary").toEqual(required);
    });

    it("attempted every BRANCH of every client-steerable predicate, not merely every verb", () => {
      // ROUND 2'S ACTUAL FINDING, TURNED INTO A GUARD. Verb-level completeness was green while
      // five WITH CHECK predicates had an unprobed OR arm that admitted cross-case rows: every
      // probe in the file passed `owner: null`, so the owner arm was NULL every time and only
      // the case arm was ever under test. "Full coverage" over probes that all take one path is
      // not coverage, and no count of verbs could have said so.
      //
      // SCOPED TO `WITH CHECK`, AND THAT IS A REASONED LINE RATHER THAN A CONVENIENT ONE. A
      // WITH CHECK is evaluated against the row the CLIENT SUPPLIES, so the client chooses which
      // arm it aims at, and every arm is therefore an attack surface that a probe must aim at
      // too. A USING clause is evaluated against a row that ALREADY EXISTS: the actor cannot
      // steer which arm matches, and both arms are already exercised by construction in the
      // positive matrix (§E), whose fixture holds owner-set personal rows AND owner-null
      // consultancy rows on all nine tables.
      //
      // Both sides derived: arms come out of `pg_policy` at run time, probes out of what ran.
      const checkPredicates = sqlLines(`
        select c.relname || '|' || p.polcmd::text || '|' ||
               replace(replace(pg_get_expr(p.polwithcheck, p.polrelid), e'\\n', ' '), '  ', ' ')
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in (${STUDENT_DATA_TABLES.map((t) => `'${t}'`).join(",")})
           and p.polname <> 'Service inserts documents'
           and p.polwithcheck is not null
         order by 1;
      `);
      // Nine at MV-160; TWELVE since MV-168 added `profiles_insert_case`, `plan_items_insert_case`
      // and `assessments_update_case`. The number is a floor against the catalogue going quiet,
      // not a claim about the design — every one of the twelve is enumerated by name in
      // `EXPECTED_POLICIES` above, and each contributes its own required probes below.
      expect(checkPredicates.length, "HARNESS DEFECT: no WITH CHECK predicates found").toBe(12);

      // MV-160 §D CHANGED THE ANSWER FROM TWO ARMS TO ONE, AND THAT IS A COUNT CHANGE RATHER THAN A
      // RETIREMENT. The guard is not asserting "there are two of something"; it is asserting that
      // EVERY arm the catalogue actually has is aimed at by a probe. MV-160 deleted the transitional
      // `owner = auth.uid()` arm from all nine predicates, so one is now the correct count and the
      // guard keeps its whole point: it goes red if the surviving CASE arm is ever lost, and red
      // again the moment a second arm — the transitional one restored, or a new one nobody has
      // thought about — appears with no probe aimed at it.
      const requiredBranches = new Set<string>();
      for (const line of checkPredicates) {
        const [table, cmd, ...rest] = line.split("|");
        const verb = cmd === "a" ? "insert" : "update";
        const arms = ownershipArms(rest.join("|"));
        expect(
          arms.length,
          `${table}.${verb}: expected exactly one ownership arm — MV-160 §D retired the transitional ` +
            `owner arm — got ${arms.length} (${arms.join(" / ")})`,
        ).toBe(1);
        expect(arms, `${table}.${verb}: the surviving arm must be the CASE arm`).toEqual(["case"]);
        for (const arm of arms) requiredBranches.add(`${table}.${verb}@${arm}`);

        // THE OWNER AXIS DID NOT LEAVE THE SURFACE WHEN IT LEFT THE DISJUNCTION, so its probe is
        // still required on every one of the nine — derived from the catalogue's own predicate list
        // rather than hand-written, exactly like the arms above. What changed is only WHERE the
        // axis is bounded, which is why it can no longer be READ OFF the disjunction: on the SEVEN
        // INSERTs it is the `owner is null or owner = private.case_student_id(case_id)` conjunct
        // (asserted structurally by the OWNER-axis test above — MV-168 copied that conjunct onto
        // `profiles` and `plan_items` along with the grant); on the two upsert-seam UPDATEs it is
        // MV-155 §H's trigger guard; on the `profiles` / `plan_items` UPDATEs it is still the
        // absent column grant, which MV-168 did NOT widen — `owner` is in both INSERT lists and in
        // neither UPDATE list.
        // A client can still steer `owner` on all of them, so all of them still need a probe.
        requiredBranches.add(`${table}.${verb}@owner`);
      }

      const probedBranches = [...attempted].filter((k) => k.includes("@")).sort();
      expect(
        probedBranches,
        "every OR arm of every client-supplied predicate must have a cross-boundary probe aimed at it",
      ).toEqual([...requiredBranches].sort());
    });

    // ===============================================================================
    // MV-161 — THE COLUMN AXIS. The third dimension of this guard, and the card's larger half.
    // ===============================================================================
    // THE PROGRESSION THIS COMPLETES, because each step exists only because the previous one was
    // green while something was wrong:
    //
    //   round 1  VERB-aware      — "every write verb `authenticated` holds is probed".  Green while
    //                              five WITH CHECKs had an unprobed OR arm admitting cross-case rows.
    //   round 2  BRANCH-aware    — "every ARM of every client-steerable predicate is probed".  Green
    //                              while `supersedes_prediction_id` let any signed-in user
    //                              permanently break an arbitrary victim's account deletion.
    //   MV-161   COLUMN-aware    — "every COLUMN a client may WRITE is bounded, or recorded free".
    //
    // The pointer was never a MISSING PROBE. It was a column no probe had a reason to aim at,
    // because nobody had ever listed the columns. A verb-aware guard cannot see that; a branch-aware
    // guard cannot either — both enumerate the PREDICATE, and the predicate is exactly where an
    // unexamined column leaves no trace. This one enumerates the GRANT, which is the side of the
    // question a client actually acts on.
    //
    // BOTH SIDES DERIVED, the mechanism this file uses everywhere: the columns come from
    // `information_schema.column_privileges` at run time and the clauses from `pg_policy` at run
    // time. Nothing here is a hand-written list of what the schema is believed to contain — the only
    // hand-written thing is the EXEMPTIONS, and the assertions below make a stale exemption fail
    // just as loudly as a missing one, so the list cannot rot into a rubber stamp.
    it("bounds or explicitly exempts every CLIENT-WRITABLE column on all seven INSERT surfaces", () => {
      const rows = sqlLines(`
        with pol as (
          select c.relname as tbl,
                 replace(replace(pg_get_expr(p.polwithcheck, p.polrelid), e'\\n', ' '), '  ', ' ') as expr
            from pg_policy p
            join pg_class c on c.oid = p.polrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and p.polcmd = 'a'
             and p.polname <> 'Service inserts documents'
             and c.relname in (${INSERT_SURFACES.map((t) => `'${t}'`).join(",")})
        )
        select cp.table_name || '|' || cp.column_name || '|' || pol.expr
          from information_schema.column_privileges cp
          join pol on pol.tbl = cp.table_name
         where cp.table_schema = 'public'
           and cp.grantee = 'authenticated'
           and cp.privilege_type = 'INSERT'
         order by 1;
      `);

      // Non-vacuity first. An empty or short result set would make every assertion below pass
      // silently, which is the failure mode a guard about unnoticed columns cannot afford —
      // `readGrantedWriteSurface`'s own history is that INSERT was read from the wrong catalogue
      // and five tables reported "no grant" while holding one.
      expect(rows.length, "HARNESS DEFECT: the column-grant catalogue query returned nothing").toBeGreaterThan(0);
      const tablesSeen = new Set(rows.map((r) => r.split("|")[0]));
      expect(
        [...tablesSeen].sort(),
        "every one of the seven INSERT surfaces must contribute columns",
      ).toEqual([...INSERT_SURFACES].sort());

      const bound: string[] = [];
      const unbounded: string[] = [];
      for (const row of rows) {
        const [table, column, ...rest] = row.split("|");
        const key = `${table}.${column}`;
        if (mentionsColumn(rest.join("|"), column!)) bound.push(key);
        else unbounded.push(key);
      }

      // (1) THE GUARD. Every client-writable column is either named by its policy or recorded free.
      const unaccounted = unbounded.filter((k) => !(k in CLIENT_WRITABLE_EXEMPTIONS)).sort();
      expect(
        unaccounted,
        "a client may write these columns and NO policy clause mentions them, and no exemption " +
          "records why that is safe. This is the MV-161 shape: add the bound, or add an exemption " +
          "with the reason it is deliberately free. Do not delete this assertion.",
      ).toEqual([]);

      // (2) NO STALE EXEMPTIONS — the half that stops the list becoming a rubber stamp. An entry
      //     for a column that is no longer client-writable, or that a policy has since started
      //     bounding, is a decision nobody re-took; both fail here rather than lingering.
      const live = new Set([...bound, ...unbounded]);
      const stale = Object.keys(CLIENT_WRITABLE_EXEMPTIONS)
        .filter((k) => !live.has(k) || bound.includes(k))
        .sort();
      expect(
        stale,
        "these exemptions no longer describe reality — the column is either no longer client-writable " +
          "or is now bounded by a policy clause. Delete the entry.",
      ).toEqual([]);

      // (3) NON-VACUITY of the exemption list itself: every reason is a real sentence, not "".
      //     A guard whose escape hatch accepts an empty reason is a guard with no escape hatch cost.
      const reasonless = Object.entries(CLIENT_WRITABLE_EXEMPTIONS)
        .filter(([, why]) => why.trim().length < 10)
        .map(([k]) => k);
      expect(reasonless, "an exemption must carry a reason, not a placeholder").toEqual([]);

      // (4) THE THREE OWNERSHIP/POINTER AXES ARE ON THE BOUND SIDE, ASSERTED POSITIVELY. Without
      //     this, the whole test would still pass if somebody "fixed" a failure by moving
      //     `case_id`, `owner` or a pointer into the exemption list.
      for (const table of INSERT_SURFACES) {
        expect(bound, `${table}.case_id must be bounded, never exempted`).toContain(`${table}.case_id`);
        expect(bound, `${table}.owner must be bounded, never exempted`).toContain(`${table}.owner`);
      }
      expect(bound, "the MV-161 pointer bound must be live").toContain("program_predictions.supersedes_prediction_id");
      expect(bound, "the MV-161 pointer bound must be live").toContain("outcome_events.supersedes_event_id");
      // The parentage clauses MV-159 shipped, restated on the column axis they actually bound.
      expect(bound).toContain("program_predictions.assessment_id");
      expect(bound).toContain("application_attempts.prediction_id");
      expect(bound).toContain("outcome_events.attempt_id");
      // `outcome_events`' two non-ownership integrity clauses (spec §4.9) are column bounds too.
      expect(bound).toContain("outcome_events.source");
      expect(bound).toContain("outcome_events.verified_by");
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
  describe("the two consultancy write paths that stay 42501 (spec §6, §7.2)", () => {
    // An assigned counsellor IS the Postgres role `authenticated`. RLS narrows a grant and never
    // widens one, so these are refused by the ABSENT GRANT and no policy on this card could
    // unblock them.
    //
    // MV-168 — THIS BLOCK COVERED FOUR TABLES AND IS NOW TWO, and the two that left were not
    // deleted but INVERTED into `stage3-write-grants.itest.ts` as positive assertions: the
    // counsellor INSERTs `profiles` and `plan_items` with `owner IS NULL`. THIS WAS A SECOND
    // COPY OF MV-160'S DECISION GATE. Stage 3 spec §6.1 located the pin in
    // `stage2-tighten.itest.ts` and said it was "one test, not eight" — true of that file, and
    // this pair here was missed. Both copies are discharged in the same PR; a grant that lands
    // while one copy still asserts its absence is the exact rot the gate exists to prevent.
    //
    // The two that remain are refused for DIFFERENT reasons and neither is "deferred to Stage 3"
    // any more: `assessments` INSERT is refused PERMANENTLY (row 2 — a client that can write
    // `result` mints its own verdict), and `documents` INSERT is deferred to STAGE 4 (row 7 —
    // its caller must also write a Storage object). A red on the first is a trust regression; a
    // red on the second is Stage 4 arriving.
    it.each([
      [
        "assessments",
        { case_id: null as string | null, result: {}, rule_version: "x", destination_id: "AU", profile_snapshot: {}, expires_at: new Date().toISOString() },
      ],
      [
        "documents",
        { case_id: null as string | null, kind: "loan-sanction", file_path: "x/loan-sanction/x.pdf", file_size: 1, original_name: "x.pdf" },
      ],
    ] as const)("refuses an ASSIGNED counsellor INSERT on %s — no grant, therefore 42501", async (table, template) => {
      const counsellor = actor("counsellorAssignedA");
      const row = { ...template, owner: null, case_id: caseId("orgAssignedA") };
      const { error } = await counsellor.client.from(table as StudentDataTable).insert(row as never);
      expect(error?.code, `${table} INSERT must stay ungranted — see this block's header`).toBe("42501");
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

    /**
     * Service-role presence check. §F's `rowStill` asserts the row IS there and is the right tool
     * for a denial probe; MV-161's delete probe needs to assert BOTH directions on the same row, so
     * it needs a reader that treats absence as an answer rather than as a harness defect. A failed
     * READ is still loud — that is the part neither version may drop.
     */
    const rowExists = async (table: StudentDataTable, id: string): Promise<boolean> => {
      const { data: row, error } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
      expect(error, `HARNESS DEFECT: service-role read of ${table} failed — that is not an absence`).toBeNull();
      return row !== null;
    };

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

    // ===============================================================================
    // MV-161 — the PARENT-POINTER axis. The same sentence as this block's title, about the
    // column nobody had enumerated.
    // ===============================================================================
    // WHAT MAKES THIS DIFFERENT FROM EVERY OTHER PROBE IN THE BLOCK, and why it was live on
    // production rather than a Stage 2 regression: the attacker satisfies EVERY axis MV-159 bounds.
    // Own case, own assessment, owned by themselves. The tests above all move a row across a case
    // boundary somewhere; this one does not. The row is entirely legitimate except for a pointer at
    // a stranger, and no predicate this project ever shipped — including legacy `pp_insert_own`,
    // whose `a.owner = auth.uid()` the attacker also satisfies — looked at it.
    it("refuses a row that supersedes a row in ANOTHER case — the pointer axis (MV-161)", async () => {
      const attacker = actor("studentA");
      const own = data.personalA;
      const victim = data.orgAssignedB;
      await proveExists("program_predictions", victim.prediction);
      await proveExists("outcome_events", victim.outcomeEvent);

      // Every bounded axis satisfied. The ONLY hostile column is `supersedes_prediction_id`.
      const plantPrediction = await attacker.client.from("program_predictions").insert({
        owner: attacker.id,
        case_id: own.caseId,
        assessment_id: own.primaryAssessment,
        program_id: spareProgram,
        verdict: "possible",
        rule_version: "mv161-plant",
        score_snapshot: {},
        supersedes_prediction_id: victim.prediction,
      } as never);
      expect(
        plantPrediction.error?.code,
        "a prediction may not supersede a prediction in a case the actor cannot reach — this is the " +
          "live P0: ON DELETE SET NULL makes it an UPDATE, which program_predictions_no_update " +
          "refuses forever, on a row the victim cannot see",
      ).toBe("42501");

      const plantEvent = await attacker.client.from("outcome_events").insert({
        owner: attacker.id,
        case_id: own.caseId,
        attempt_id: own.attempt,
        event_type: "offer_received",
        gate: "admission",
        source: "self_reported",
        occurred_at: new Date().toISOString(),
        supersedes_event_id: victim.outcomeEvent,
      } as never);
      expect(plantEvent.error?.code, "the same bound on outcome_events' pointer").toBe("42501");

      // Neither refusal may be an FK's. `supersedes_*` carries only a simple self-FK, so a
      // violation would be 23503 and NOT 42501 — the codes above already separate them, and this
      // asserts the row is genuinely absent rather than merely unreported.
      const { count } = await fixture.admin
        .from("program_predictions")
        .select("id", { count: "exact", head: true })
        .eq("supersedes_prediction_id", victim.prediction);
      expect(count, "nothing was written").toBe(0);
    });

    // THE CONTROL, and it is what stops the bound being satisfied by refusing the pointer outright.
    // `supersedes_*` exists FOR the correction path (spec §4.9: "a correction is a NEW row plus
    // supersedes_event_id"). A fix that closed the column would close the feature.
    it("lets a row supersede a row in its OWN case — the pointer bound is not a blanket refusal", async () => {
      const student = actor("studentA");
      const own = data.personalA;

      const { data: pred, error: predError } = await student.client
        .from("program_predictions")
        .insert({
          owner: student.id,
          case_id: own.caseId,
          assessment_id: own.primaryAssessment,
          program_id: spareProgram2,
          verdict: "reach",
          rule_version: "mv161-in-case-correction",
          score_snapshot: {},
          supersedes_prediction_id: own.prediction,
        } as never)
        .select("id, supersedes_prediction_id")
        .single();
      expect(predError, `the in-case correction shape must survive: ${predError?.message}`).toBeNull();
      created.push(["program_predictions", pred!.id]);
      expect(pred!.supersedes_prediction_id, "and it really carries the pointer").toBe(own.prediction);

      const { data: evt, error: evtError } = await student.client
        .from("outcome_events")
        .insert({
          owner: student.id,
          case_id: own.caseId,
          attempt_id: own.attempt,
          event_type: "offer_accepted",
          gate: "admission",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
          supersedes_event_id: own.outcomeEvent,
        } as never)
        .select("id, supersedes_event_id")
        .single();
      expect(evtError, `the in-case correction shape must survive: ${evtError?.message}`).toBeNull();
      created.push(["outcome_events", evt!.id]);
      expect(evt!.supersedes_event_id).toBe(own.outcomeEvent);
    });

    // THE CONSEQUENCE, PROVED IN BOTH DIRECTIONS. "The victim can delete their account" is worth
    // nothing on its own — it passes just as happily when the lock mechanism does not exist at all.
    // So the counterfactual runs first: a planted pointer is written through `service_role` (which
    // bypasses RLS, and is the only way to reach the pre-fix state now that the policy refuses it),
    // and the victim's delete is measured BLOCKED. Then the plant is removed and the same delete is
    // measured OK. Without the first half this is an inert assertion; without the second it is not
    // the property the card asks for.
    it("lets the victim's account-delete complete once no cross-case pointer survives — and not before", async () => {
      const victim = data.personalA;

      // A disposable prediction standing in for the victim's row that /api/account/delete step 2
      // would remove. Nothing in the fixture points at it.
      const { data: target, error: targetError } = await fixture.admin
        .from("program_predictions")
        .insert({
          owner: victim.owner,
          case_id: victim.caseId,
          assessment_id: victim.primaryAssessment,
          program_id: spareProgram,
          verdict: "strong",
          rule_version: "mv161-delete-target",
          score_snapshot: {},
        } as never)
        .select("id")
        .single();
      expect(targetError, `seed failed: ${targetError?.message}`).toBeNull();

      // (a) THE COUNTERFACTUAL. A planted row in the ATTACKER'S case pointing at it — exactly what
      //     the policy now refuses, forced in past RLS so the lock can be observed at all.
      const attackerCase = data.orgAssignedB;
      const { data: plant, error: plantError } = await fixture.admin
        .from("program_predictions")
        .insert({
          owner: null,
          case_id: attackerCase.caseId,
          assessment_id: attackerCase.primaryAssessment,
          program_id: spareProgram2,
          verdict: "possible",
          rule_version: "mv161-forced-plant",
          score_snapshot: {},
          supersedes_prediction_id: target!.id,
        } as never)
        .select("id")
        .single();
      expect(plantError, `forced plant failed: ${plantError?.message}`).toBeNull();

      // The victim's own delete — step 2 of `app/api/account/delete/route.ts`, same predicate.
      const blocked = await fixture.admin.from("program_predictions").delete().eq("id", target!.id);
      expect(
        blocked.error?.code,
        "THE LOCK MUST BE REAL, or the assertion below proves nothing: ON DELETE SET NULL fires an " +
          "UPDATE on the pointing row and private.reject_prediction_update() is SECURITY INVOKER, " +
          "so it raises for service_role too",
      ).toBe("P0001");
      expect(await rowExists("program_predictions", target!.id), "and the row survived").toBe(true);

      // (b) remove the plant — the shape the policy now refuses to create in the first place — and
      //     the identical delete completes.
      const unplant = await fixture.admin.from("program_predictions").delete().eq("id", plant!.id);
      expect(unplant.error, `removing the plant failed: ${unplant.error?.message}`).toBeNull();

      const allowed = await fixture.admin.from("program_predictions").delete().eq("id", target!.id);
      expect(allowed.error, `the victim's account-delete must complete: ${allowed.error?.message}`).toBeNull();
      expect(await rowExists("program_predictions", target!.id), "and the row is gone").toBe(false);
    });
  });

  // ===================================================================================
  // I  no re-point: a row cannot be carried out of its case by any client on any path
  // ===================================================================================
  // ROUND 2 RENAMED THIS BLOCK. It used to be titled "…is unexpressible, not merely rejected",
  // which was the migration's claim too, and both were FALSE: `case_id` is in no UPDATE grant,
  // but `owner` IS on two tables, and until §1b the derive trigger turned a legal `owner` write
  // into a `case_id` re-point BEFORE the WITH CHECK could look. Re-pointing takes TWO mechanisms
  // to close — the absent column grant AND the trigger's binding guard — so the block now names
  // both and probes both.
  describe("re-pointing a row into another case is closed by the grant AND by the binding guard", () => {
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

    it("refuses re-pointing `owner`, on the two tables whose grant includes it", async () => {
      // MV-155 §H had to grant `update (owner, …)` because PostgREST puts every payload column in
      // an upsert's SET list. THE SAFETY ARGUMENT FOR THAT WIDENING USED TO BE RECORDED HERE AS:
      // "the derive trigger re-derives `case_id` from the NEW owner's personal case, which is not
      // in this actor's `actor_case_ids()`, so the WITH CHECK refuses."
      //
      // THAT ARGUMENT WAS ONLY EVER TRUE FOR `owner -> ANOTHER USER`, AND IT INVERTED FOR
      // `owner -> SELF`: the re-derivation then landed the row in the ATTACKER'S OWN case, where
      // the WITH CHECK happily admitted it. That is the round-2 blocker, measured on
      // `document_status` with an assigned counsellor and one PATCH. The safety argument now
      // rests on §1b's binding guard, which refuses the change itself rather than relying on
      // where the re-derivation happens to land — so this asserts the TRIGGER's refusal, not the
      // policy's. `owner -> SELF` and `owner -> NULL` are probed in §F where the completeness
      // guard can see them.
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
        expect(error?.message, `${table}: and refused by the BINDING GUARD, with its reason`).toMatch(
          /owner is immutable once set/i,
        );
        const { data: row } = await fixture.admin.from(table).select("owner, case_id").eq("id", id).single();
        expect((row as { owner: string }).owner, `${table}.owner moved`).toBe(student.id);
        expect((row as { case_id: string }).case_id, `${table}.case_id moved`).toBe(caseId("personalA"));
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

      // NO SEQ SCAN ON ANY OF THE NINE, AND THE ACCESS PATH IS INDEX-DRIVEN. The predicate is
      // indexed — MV-155's `case_id` index on each table — so the planner answers "which rows may
      // I see" through an index rather than a heap sweep.
      //
      // AMENDED BY MV-160, AND IT IS THE SECOND TRANSITIONAL ASSERTION IN THIS BLOCK, NOT THE
      // FIRST. The `InitPlan 2` count immediately below carries MV-159's own note that the number
      // was transitional because MV-160 deletes the owner disjunct — the same sentence applies
      // verbatim to the node SHAPE, and that half was missed. The assertion used to demand
      // `Bitmap Heap Scan on <table>`, whose stated justification was a **BitmapOr over BOTH
      // disjuncts** (`owner` index OR `case_id` index). After MV-160 there is only ONE disjunct.
      // A single indexed `case_id = ANY (…)` is CHEAPER, and the planner is free to answer it with
      // a plain Index Scan, an Index Only Scan, or a bitmap pair — its choice varies with table
      // statistics and heap size, so pinning one node made a gating check depend on the cost
      // model. Measured: the full lane went red on `Bitmap Heap Scan` once and green on an
      // identical re-run, while the file passes in isolation every time.
      //
      // What is pinned instead is the property the comment always claimed to care about and which
      // survives the disjunct removal: NOT a sweep, and reached through an index. A genuine
      // regression — the helper going per-row, or an index being dropped — still turns this red
      // through the Seq Scan half and through the SubPlan assertion below.
      for (const table of STUDENT_DATA_TABLES) {
        expect(plans, `${table} fell back to a Seq Scan`).not.toMatch(new RegExp(`Seq Scan on ${table}\\b`));
        expect(plans, `${table} was not reached through an index`).toMatch(
          new RegExp(
            `(?:Bitmap Heap Scan|Index Scan using \\w+|Index Only Scan using \\w+) on ${table}\\b` +
              `|Bitmap Index Scan on ${table}_`,
          ),
        );
      }
      // THE HELPERS ARE HOISTED, EVALUATED ONCE PER STATEMENT RATHER THAN ONCE PER ROW. Without
      // that, the definer helper is a per-row call: the `auth_rls_initplan` finding, at tenancy
      // scale.
      //
      // THIS IS ASSERTED AS "AN InitPlan AND NO SubPlan", NOT AS A COUNT, AND THE CHANGE IS
      // DELIBERATE. It used to assert exactly nine `InitPlan 2` declarations — one per table,
      // two hoists each (`auth.uid()` and `private.actor_case_ids()`). That number is
      // TRANSITIONAL: MV-160 deletes the owner disjunct, `auth.uid()` leaves the predicate, and
      // the count becomes nine `InitPlan 1` and ZERO `InitPlan 2`. So the old assertion made
      // this block a SECOND casualty of MV-160, silently contradicting the card's promise that
      // MV-160 deletes one block and edits nothing else.
      //
      // The property actually worth pinning survives that edit unchanged, and is strictly
      // stronger than the count: the helper must never be a SubPlan. A count of InitPlans cannot
      // even see a per-row SubPlan; this can.
      const perTable = plans.split(/^### /m).slice(1);
      expect(perTable.length, "HARNESS DEFECT: the EXPLAIN output did not split per table").toBe(
        STUDENT_DATA_TABLES.length,
      );
      for (const [i, section] of perTable.entries()) {
        const table = STUDENT_DATA_TABLES[i]!;
        expect(
          (section.match(/^\s*InitPlan \d+\s*$/gm) ?? []).length,
          `${table} hoisted no helper to an InitPlan — the predicate is being evaluated per row`,
        ).toBeGreaterThanOrEqual(1);
        expect(section, `${table} evaluates a helper as a per-row SubPlan`).not.toMatch(/^\s*SubPlan \d+\s*$/m);
      }
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
  //
  // ROUND 2 MADE THAT PROMISE TRUE INSTEAD OF NEARLY TRUE. Two other blocks were coupled to the
  // disjunct and would have gone red as well, which is precisely the "second red block" the
  // paragraph above calls a finding:
  //
  //   * the disjunct-SHAPE assertion, which asserted all 28 predicates CONTAIN the clause
  //     MV-160 removes. MOVED INTO THIS BLOCK — it is the first test below.
  //   * the EXPLAIN block's `InitPlan 2` count, which is 2 only while `auth.uid()` is in the
  //     predicate and becomes 1 after MV-160. REWRITTEN as "an InitPlan and no SubPlan", which
  //     is both MV-160-durable and a strictly stronger statement of the property.
  //
  // So the inherited work is once again exactly this block, deleted whole.
});
