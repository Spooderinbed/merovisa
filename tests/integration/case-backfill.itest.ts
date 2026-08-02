/**
 * MV-155 — Stage 2 personal cases, `case_id`, and the owner→case backfill, against a REAL local
 * Postgres with the real migrations applied.
 *
 * WHY THIS SUITE CARRIES THE WHOLE PROOF. `20260802120000_stage2_case_id_and_personal_cases.sql`
 * is INERT on a fresh database — `supabase db reset` leaves no `auth.users`, so the backfill
 * creates 0 cases and updates 0 rows. A green migration apply proves the DDL and NOTHING about the
 * data movement. This suite constructs its own pre-migration world (owner-only rows across all
 * nine tables), runs the backfill against it, and asserts the outcome; the rehearsal against a
 * production-shaped copy is the other half and lives on the card.
 *
 * FOUR PROPERTIES ARE LOAD-BEARING AND EACH HAS A NAMED FAILURE MODE:
 *
 *  1. **Anonymous assessments stay case-less — and there are ZERO of them in production**, so the
 *     branch cannot be exercised by real data at rehearsal (spec §9.6). It is provable ONLY by the
 *     synthetic seed here. Giving an unclaimed row a case would take it out of MV-135's
 *     `owner is null` purge predicate and turn a shipped 3-day retention promise into a lie.
 *  2. **`case_id` is not client-writable.** The hazard is RE-POINTING, and re-pointing is UPDATE —
 *     so the assertion is asymmetric on purpose: UPDATE naming `case_id` is refused on every
 *     update-granted table, and INSERT carrying `case_id` SUCCEEDS on every insert-granted one.
 *     The positive half exists because a later reviewer "tidying" `case_id` out of the INSERT lists
 *     would silently break MV-157's dual-write with no card owning the regression.
 *  3. **The four `ON CONFLICT` arbiter indexes are FULL, not partial.** The positive alone is green
 *     against both designs, so it is paired with a counterfactual on a scratch table: the partial
 *     form really does raise 42P10 against a bare column list.
 *  4. **The UPSERT-seam trigger fires only `when (new.owner is not null)`.** Both branches are
 *     pinned — see the `owner IS NULL` block for why half of it has to run on a scratch table until
 *     MV-156 relaxes `owner`.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. Excluded from `npm test`; run only by
 * `npm run test:integration`.
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
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import { ANON_RETENTION_DAYS } from "@/lib/assessments/purge";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

/**
 * The right-to-delete test below drives the REAL `/api/account/delete` route against this stack,
 * rather than replaying its delete sequence in the test — a replayed sequence proves the test and
 * the route agree today and nothing about tomorrow, and the whole point of that test is that the
 * route must not drift back into leaving a case behind.
 *
 * `createSupabaseAdminClient()` reads these two vars, so pointing them at the local stack is enough
 * to make the route's own admin client the right one. Only `createSupabaseServerClient` is mocked
 * (below): it wants Next's cookie store, and the route uses it for nothing but `getUser`/`signOut`.
 */
if (url && serviceKey) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
}

const routeAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: routeAuth }),
}));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The nine student-owned tables Stage 2 re-keys. Order is the migration's. */
const NINE = [
  "profiles",
  "assessments",
  "plan_items",
  "user_program_state",
  "documents",
  "document_status",
  "program_predictions",
  "application_attempts",
  "outcome_events",
] as const;

/**
 * The exact column-grant surface `authenticated` must hold on the nine AFTER this migration.
 * Asserted column-by-column out of `information_schema`, so a later migration cannot re-open the
 * hole silently — and MV-159 must be told THIS is the baseline, not the pre-MV-155 table-level set.
 *
 * `case_id` appears in every INSERT list and in NO update list. That asymmetry is the point.
 */
const EXPECTED_WRITE_SURFACE: ReadonlyArray<string> = [
  "application_attempts.insert(case_id)",
  "application_attempts.insert(created_at)",
  "application_attempts.insert(destination)",
  "application_attempts.insert(external_ref)",
  "application_attempts.insert(id)",
  "application_attempts.insert(institution_id)",
  "application_attempts.insert(intake)",
  "application_attempts.insert(owner)",
  "application_attempts.insert(prediction_id)",
  "application_attempts.insert(program_id)",
  "document_status.insert(case_id)",
  "document_status.insert(kind)",
  "document_status.insert(obtained)",
  "document_status.insert(owner)",
  "document_status.update(kind)",
  "document_status.update(obtained)",
  "document_status.update(owner)",
  "outcome_events.insert(attempt_id)",
  "outcome_events.insert(case_id)",
  "outcome_events.insert(decision_authority)",
  "outcome_events.insert(detail)",
  "outcome_events.insert(event_type)",
  "outcome_events.insert(gate)",
  "outcome_events.insert(id)",
  "outcome_events.insert(occurred_at)",
  "outcome_events.insert(occurred_on)",
  "outcome_events.insert(owner)",
  "outcome_events.insert(reason_code)",
  "outcome_events.insert(recorded_at)",
  "outcome_events.insert(source)",
  "outcome_events.insert(supersedes_event_id)",
  "outcome_events.insert(verified_at)",
  "outcome_events.insert(verified_by)",
  "plan_items.update(completed_at)",
  "plan_items.update(started_at)",
  "plan_items.update(status)",
  "profiles.update(completeness)",
  "profiles.update(sections)",
  "program_predictions.insert(assessment_id)",
  "program_predictions.insert(case_id)",
  "program_predictions.insert(id)",
  "program_predictions.insert(owner)",
  "program_predictions.insert(program_id)",
  "program_predictions.insert(rule_version)",
  "program_predictions.insert(score_snapshot)",
  "program_predictions.insert(supersedes_prediction_id)",
  "program_predictions.insert(verdict)",
  "user_program_state.insert(case_id)",
  "user_program_state.insert(notes)",
  "user_program_state.insert(owner)",
  "user_program_state.insert(program_id)",
  "user_program_state.insert(status)",
  "user_program_state.update(notes)",
  "user_program_state.update(owner)",
  "user_program_state.update(program_id)",
  "user_program_state.update(status)",
];

/** The three new `private` definer objects, with their argument lists. */
const NEW_DEFINERS: ReadonlyArray<readonly [name: string, args: string]> = [
  ["mv155_backfill_personal_cases", ""],
  ["mv155_assert_case_backfill", ""],
  ["mv155_derive_case_id_from_owner", ""],
] as const;

/**
 * HARD localhost guard — not a comment, a gate. Call it at MODULE level so the suite refuses to
 * LOAD rather than at the first assertion.
 *
 * This file mints auth users, writes across all nine student-owned tables, and calls
 * `private.mv155_backfill_personal_cases()` — a SECURITY DEFINER function that writes `case_id` on
 * every row in the database and inserts a `cases` row for every `auth.users` row. Pointed at a real
 * project by a stale SUPABASE_TEST_URL it would mint personal cases for real students and rewrite
 * live data. Refuse to run anywhere but a local stack.
 */
const isLocalStack = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const { hostname } = new URL(u);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
};

if (url && !isLocalStack(url)) {
  throw new Error(
    `case-backfill.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "This suite calls private.mv155_backfill_personal_cases(), which writes case_id across every " +
      "student-owned table and mints a personal case for every Auth user. Point it at a local " +
      "`npx supabase start` stack, or unset the variable.",
  );
}

type Actor = { id: string; email: string; client: SupabaseClient<Database> };

describe.skipIf(!url || !serviceKey || !anonKey)("MV-155 personal cases + case_id backfill", () => {
  let admin: SupabaseClient<Database>;
  let dbContainer: string;

  const stamp = Date.now();
  const password = `pw-${stamp}-Aa!`;
  const seededUserIds: string[] = [];
  const seededAssessmentIds: string[] = [];

  let userA: Actor;
  let userB: Actor;
  let programA: string;
  let programB: string;
  /** The one shape production has NONE of (spec §9.6): an unclaimed anonymous assessment. */
  let anonymousAssessmentId: string;

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
   * Run SQL as `postgres` inside the stack's DB container. `private` and `information_schema` are
   * not PostgREST-exposed, so a catalogue question cannot be asked through supabase-js at all.
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

  /**
   * Run SQL that is EXPECTED to raise, and return psql's error text. A helper rather than a
   * try/catch at each site because `execFileSync` throws an Error whose message hides stderr —
   * asserting on `err.message` would pass against the wrong error just as happily.
   */
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
   * `personal_case_ids` is the rollback's input, not telemetry: once MV-157 has merged, the only
   * non-destructive unwind is `-v personal_case_ids=…`, and nothing in the schema can reconstruct
   * which cases MV-155 minted. Hence the union type — the report is no longer counts-only.
   */
  type BackfillReport = {
    cases_created: number;
    personal_case_ids: string[];
    [table: string]: number | string[];
  };
  const backfill = (): BackfillReport => JSON.parse(sqlOne("select private.mv155_backfill_personal_cases();"));
  const reconcile = (): void => {
    sql("select private.mv155_assert_case_backfill();");
  };
  const personalCaseOf = (userId: string): string =>
    sqlOne(`select id from public.cases where organization_id is null and student_user_id = '${userId}';`);

  const mint = async (label: string): Promise<Actor> => {
    const email = `mv155-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `MV155 ${label}` },
    });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);

    // A throwaway client for the sign-in round trip only, so the shared anon client never
    // acquires a session (the `anon holds nothing` reasoning depends on it staying anonymous).
    const signIn = createClient<Database>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`failed to sign in ${label}: ${signInError?.message}`);

    return {
      id: data.user.id,
      email,
      client: createClient<Database>(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
      }),
    };
  };

  /**
   * Seed one row in each of the nine tables for `owner`, in the PRE-MIGRATION shape: `owner` set,
   * `case_id` untouched. Service-role, because four of the nine hold no authenticated INSERT grant
   * and this is fixture construction, never an assertion.
   */
  const seedNine = async (owner: string, programId: string): Promise<{ assessmentId: string }> => {
    // Throws on BOTH a reported error and a silently absent row: a fixture that half-seeded would
    // otherwise turn every downstream assertion into a test of the fixture, not of the migration.
    const svc = async <T>(
      what: string,
      p: PromiseLike<{ data: T; error: { message: string } | null }>,
    ): Promise<NonNullable<T>> => {
      const { data, error } = await p;
      if (error) throw new Error(`fixture seed failed (${what}): ${error.message}`);
      if (data === null || data === undefined) throw new Error(`fixture seed failed (${what}): no row returned`);
      return data as NonNullable<T>;
    };

    await svc("profiles", admin.from("profiles").insert({ owner, sections: {}, completeness: 10 }).select("id").single());

    const assessment = await svc(
      "assessments",
      admin
        .from("assessments")
        .insert({
          owner,
          result: { verdict: "possible" },
          rule_version: "v0.5.0-mv155",
          expires_at: new Date(Date.now() + 3 * MS_PER_DAY).toISOString(),
          destination_id: "australia",
          is_primary: true,
          profile_snapshot: { destination: "australia" },
        })
        .select("id")
        .single(),
    );
    seededAssessmentIds.push(assessment.id);

    await svc(
      "plan_items",
      admin
        .from("plan_items")
        .insert({ owner, kind: "english", impact: "high", title: "Sit IELTS", status: "todo" })
        .select("id")
        .single(),
    );
    await svc(
      "user_program_state",
      admin.from("user_program_state").insert({ owner, program_id: programId, status: "shortlisted" }).select("owner").single(),
    );
    await svc(
      "documents",
      admin
        .from("documents")
        .insert({ owner, kind: "passport", file_path: `${owner}/passport/p.pdf`, file_size: 10, original_name: "p.pdf" })
        .select("id")
        .single(),
    );
    await svc(
      "document_status",
      admin.from("document_status").insert({ owner, kind: "passport", obtained: true }).select("owner").single(),
    );

    const prediction = await svc(
      "program_predictions",
      admin
        .from("program_predictions")
        .insert({
          owner,
          assessment_id: assessment.id,
          program_id: programId,
          verdict: "possible",
          rule_version: "v0.5.0-mv155",
          score_snapshot: { total: 50 },
        })
        .select("id")
        .single(),
    );
    const attempt = await svc(
      "application_attempts",
      admin
        .from("application_attempts")
        .insert({ owner, prediction_id: prediction.id, program_id: programId })
        .select("id")
        .single(),
    );
    await svc(
      "outcome_events",
      admin
        .from("outcome_events")
        .insert({
          owner,
          attempt_id: attempt.id,
          event_type: "applied",
          gate: "admission",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );

    return { assessmentId: assessment.id };
  };

  beforeAll(async () => {
    dbContainer = resolveDbContainer();
    admin = createClient<Database>(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    const programs = sql("select id from public.programs order by id limit 2;");
    programA = programs[0]!;
    programB = programs[1]!;

    userA = await mint("a");
    userB = await mint("b");
    await seedNine(userA.id, programA);
    await seedNine(userB.id, programA);

    // The population production has none of. Backdated past every purge threshold so the MV-135
    // predicate genuinely selects it — a fresh row would prove nothing about the retention promise.
    const { data: anon, error } = await admin
      .from("assessments")
      .insert({
        result: { verdict: "reach" },
        rule_version: "v0.5.0-mv155",
        expires_at: new Date(Date.now() - MS_PER_DAY).toISOString(),
        created_at: new Date(Date.now() - (ANON_RETENTION_DAYS + 1) * MS_PER_DAY).toISOString(),
        destination_id: "australia",
        profile_snapshot: { destination: "australia" },
      })
      .select("id")
      .single();
    if (error || !anon) throw new Error(`failed to seed the anonymous assessment: ${error?.message}`);
    anonymousAssessmentId = anon.id;
    seededAssessmentIds.push(anon.id);
  });

  afterAll(async () => {
    if (!admin) return;
    if (seededAssessmentIds.length) await admin.from("assessments").delete().in("id", seededAssessmentIds);
    for (const id of seededUserIds) {
      // CAPTURE THE CASE ID FIRST — this order is the whole fix, and the earlier version had it
      // wrong in a way that was invisible. It ran `deleteUser` and then
      // `.delete().eq("created_by", id)`, but `cases.created_by` is ON DELETE **SET NULL** just like
      // `student_user_id`, so by the time that delete ran BOTH columns were already NULL and it
      // matched nothing. Every run leaked one personal case per seeded user, each still carrying a
      // `display_name` — the exact retention artifact the "right to delete" block above exists to
      // prove is gone. The teardown has to look the case up while the links still exist.
      const { data: cases } = await admin
        .from("cases")
        .select("id")
        .is("organization_id", null)
        .or(`student_user_id.eq.${id},created_by.eq.${id}`);
      const caseIds = (cases ?? []).map((c) => (c as { id: string }).id);

      // owner is ON DELETE CASCADE on all nine, so this clears the student-owned rows that would
      // otherwise hold the case down through `case_id`'s ON DELETE RESTRICT.
      await admin.auth.admin.deleteUser(id);
      if (caseIds.length) await admin.from("cases").delete().in("id", caseIds);
    }
  });

  // =====================================================================
  // A/B — structure
  // =====================================================================
  describe("structure", () => {
    it("adds a NULLABLE case_id to exactly the nine, FK → cases(id) ON DELETE RESTRICT", () => {
      const rows = sql(`
        select c.table_name || '|' || c.is_nullable || '|' || c.data_type
          from information_schema.columns c
         where c.table_schema = 'public' and c.column_name = 'case_id'
           and c.table_name in (${NINE.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(rows).toEqual([...NINE].sort().map((t) => `${t}|YES|uuid`));

      const fks = sql(`
        select tc.table_name || '|' || ccu.table_name || '.' || ccu.column_name || '|' || rc.delete_rule
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
          join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
          join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
         where tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'case_id'
           and tc.table_name in (${NINE.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(fks).toEqual([...NINE].sort().map((t) => `${t}|cases.id`).map((s) => `${s}|RESTRICT`));
    });

    it("gives NOTHING else a case_id — leads, universities, programs and the six tenancy tables are untouched", () => {
      const others = sql(`
        select table_name from information_schema.columns
         where table_schema = 'public' and column_name = 'case_id'
           and table_name not in (${NINE.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      // case_assignments / invitations / audit_events carried case_id since MV-150; nothing else may.
      expect(others).toEqual(["audit_events", "case_assignments", "invitations"]);
    });

    /**
     * BY COVERAGE, NOT BY NAME — the card's test plan says so explicitly, and it matters here: the
     * migration creates a dedicated `(case_id)` lookup index only where nothing else already LEADS
     * with case_id, exactly as 20260730120000's index-coverage note requires. A `unique (case_id,
     * program_id)` serves every `where case_id = ?` lookup and covers the FK by prefix match; a
     * duplicate single-column index would only cost write amplification.
     */
    it("covers every case_id lookup and every case_id FK with a leading-column index", () => {
      for (const table of NINE) {
        const covering = sql(`
          select indexname from pg_indexes
           where schemaname = 'public' and tablename = '${table}'
             and indexdef ~ 'USING btree \\(case_id[,)]'
           order by 1;
        `);
        expect(covering.length, `${table} has no index leading with case_id`).toBeGreaterThan(0);
      }
    });

    it("ships the per-case uniqueness rules BESIDE the per-owner ones, with the right partiality", () => {
      const definition = (name: string): string =>
        sqlOne(`select indexdef from pg_indexes where schemaname='public' and indexname='${name}';`);

      // The FOUR ON CONFLICT arbiters — FULL, no predicate. See the 42P10 block below for why.
      for (const [name, cols] of [
        ["profiles_case_idx", "(case_id)"],
        ["user_program_state_case_program_idx", "(case_id, program_id)"],
        ["documents_case_kind_idx", "(case_id, kind)"],
        ["document_status_case_kind_idx", "(case_id, kind)"],
      ] as const) {
        const def = definition(name);
        expect(def, `${name} must be UNIQUE`).toContain("CREATE UNIQUE INDEX");
        expect(def).toContain(`USING btree ${cols}`);
        expect(def, `${name} is an ON CONFLICT arbiter and MUST NOT be partial`).not.toContain("WHERE");
      }

      // The two that keep a predicate keep it on a DOMAIN column, never on `case_id is not null`.
      expect(definition("assessments_case_primary_idx")).toMatch(/CREATE UNIQUE INDEX .* \(case_id\) WHERE is_primary/);
      expect(definition("plan_items_case_kind_open_idx")).toMatch(
        /CREATE UNIQUE INDEX .* \(case_id, kind\) WHERE \(status = 'todo'::text\)/,
      );
      expect(definition("program_predictions_case_assessment_program_rule_idx")).toMatch(
        /CREATE UNIQUE INDEX .* \(case_id, assessment_id, program_id, rule_version\)$/,
      );

      // The legacy owner-keyed rules are still there — the swap is MV-160's, not this card's.
      for (const legacy of [
        "profiles_owner_key",
        "assessments_primary_idx",
        "plan_items_kind_open_idx",
        "documents_owner_kind_key",
        "user_program_state_pkey",
        "document_status_pkey",
        "program_predictions_owner_assessment_id_program_id_rule_ver_key",
      ]) {
        expect(sql(`select 1 from pg_indexes where schemaname='public' and indexname='${legacy}';`)).toEqual(["1"]);
      }
    });

    it("adds no RLS policy and changes none on the nine", () => {
      // MV-159 owns policies. This card's diff must show zero policy movement, so the shape is
      // asserted rather than trusted to a `git diff` a reviewer might skim.
      const policies = sql(`
        select tablename || '.' || policyname from pg_policies
         where schemaname = 'public' and tablename in (${NINE.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(policies).toEqual([
        "application_attempts.aa_delete_own",
        "application_attempts.aa_insert_own",
        "application_attempts.aa_select_own",
        "assessments.assessments_select_own",
        "document_status.ds_delete_own",
        "document_status.ds_insert_own",
        "document_status.ds_select_own",
        "document_status.ds_update_own",
        "documents.Service inserts documents",
        "documents.Users delete own documents",
        "documents.Users read own documents",
        "outcome_events.oe_delete_own",
        "outcome_events.oe_insert_own",
        "outcome_events.oe_select_own",
        "plan_items.plan_items_select_own",
        "plan_items.plan_items_update_own",
        "profiles.profiles_select_own",
        "profiles.profiles_update_own",
        "program_predictions.pp_delete_own",
        "program_predictions.pp_insert_own",
        "program_predictions.pp_select_own",
        "user_program_state.ups_delete_own",
        "user_program_state.ups_insert_own",
        "user_program_state.ups_select_own",
        "user_program_state.ups_update_own",
      ]);
    });
  });

  // =====================================================================
  // A/C — personal cases and the backfill
  // =====================================================================
  describe("backfill", () => {
    it("mints one personal case per Auth user and carries every owned row onto it", () => {
      const report = backfill();

      // Counts are >= the two users this suite seeded rather than == : the function is global by
      // construction (its population is `auth.users`), so asserting an exact total would make this
      // test a hostage to whatever else the run has already created.
      expect(report.cases_created).toBeGreaterThanOrEqual(2);
      for (const table of NINE) expect(report[table] as number, `${table} backfilled`).toBeGreaterThanOrEqual(2);

      // The rollback's id list, produced by the apply that minted them. Without this the
      // `-v personal_case_ids=…` path in MV-155-rollback.sql names an input nothing generates.
      expect(Array.isArray(report.personal_case_ids)).toBe(true);
      expect(report.personal_case_ids).toHaveLength(report.cases_created);
      for (const id of report.personal_case_ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);

      for (const actor of [userA, userB]) {
        const caseId = personalCaseOf(actor.id);
        expect(caseId).toMatch(/^[0-9a-f-]{36}$/);
        // Every case this call reported really is one it created.
        expect(report.personal_case_ids, `${actor.id}'s case must appear in the report`).toContain(caseId);

        const shape = sqlOne(`
          select organization_id is null and student_user_id = '${actor.id}' and created_by = '${actor.id}'
                 and email = '${actor.email}' and operational_status = 'new'
                 and display_name = 'MV155 ${actor.id === userA.id ? "a" : "b"}'
            from public.cases where id = '${caseId}';
        `);
        expect(shape, "the personal case must carry owner identity, the OAuth name, and the 'new' default").toBe("t");

        for (const table of NINE) {
          const owned = sqlOne(
            `select count(*) filter (where case_id = '${caseId}') || '/' || count(*)
               from public.${table} where owner = '${actor.id}';`,
          );
          // `^(\d+)/\1$` alone is satisfied by "0/0" — a table the fixture never seeded, or one a
          // future edit stops seeding, would pass while proving nothing. Both halves must be
          // non-zero AND equal, so the assertion needs the rows to exist before it can be met.
          expect(owned, `${table} rows for ${actor.id} must all point at their personal case`).toMatch(
            /^([1-9]\d*)\/\1$/,
          );
        }
      }

      reconcile();
    });

    it("is idempotent: a second call creates zero cases and updates zero rows", () => {
      const second = backfill();
      expect(second).toEqual({
        cases_created: 0,
        // Empty rather than absent: the key is always present, so a rollback operator reading a
        // re-apply's notice cannot mistake "created nothing" for "the report lost the field".
        personal_case_ids: [],
        profiles: 0,
        assessments: 0,
        plan_items: 0,
        user_program_state: 0,
        documents: 0,
        document_status: 0,
        program_predictions: 0,
        application_attempts: 0,
        outcome_events: 0,
      });
      reconcile();
    });

    it("only ever UPDATEs — per-table row counts are identical across a backfill that DOES work", async () => {
      // AS ORDERED, THIS TEST USED TO BE A GUARANTEED NO-OP. The suite's earlier cases have already
      // run the backfill to completion, so a bare `backfill()` here updates 0 rows and creates 0
      // cases — and "the row counts did not change" is then true of doing nothing at all. It would
      // have passed against a backfill that INSERTed, as long as that backfill had nothing left to
      // do. The fix is to give it work: mint a fresh user with rows across all nine, so this call
      // creates a case and moves real rows, and the parity claim is about a backfill that acted.
      const fresh = await mint("parity");
      await seedNine(fresh.id, programA);

      const counts = (): string[] => NINE.map((t) => `${t}=${sqlOne(`select count(*) from public.${t};`)}`);
      const before = counts();

      const report = backfill();
      expect(report.cases_created, "the backfill must have had work to do").toBeGreaterThanOrEqual(1);
      for (const table of NINE) {
        expect(report[table] as number, `${table} must have been backfilled by this call`).toBeGreaterThanOrEqual(1);
      }

      expect(counts()).toEqual(before);
      reconcile();
    });

    it("does not rewrite updated_at, and leaves set_updated_at enabled and working", async () => {
      // `private.set_updated_at()` is `new.updated_at = now()`, unconditionally, and it is a BEFORE
      // UPDATE trigger on exactly two of the nine. Left alone, the backfill stamps migration time
      // onto every profile and program-state row — 19 of them on the captured live inventory —
      // destroying "when did this student last edit this" for every existing user, and the rollback
      // cannot restore it: `drop column case_id` takes the column, not the clock.
      const fresh = await mint("updatedat");
      await seedNine(fresh.id, programA);

      const fingerprint = (): string =>
        sqlOne(`select md5(coalesce((select string_agg(updated_at::text, ',' order by owner)
                                       from public.profiles where owner = '${fresh.id}'), '')
                        || '|' ||
                        coalesce((select string_agg(updated_at::text, ',' order by program_id)
                                    from public.user_program_state where owner = '${fresh.id}'), ''));`);

      const before = fingerprint();
      const report = backfill();
      expect(report.profiles as number, "the backfill must have touched this user's profile").toBeGreaterThanOrEqual(1);
      expect(fingerprint(), "updated_at must survive the backfill byte-identical").toBe(before);

      // The disable is scoped to the backfill and reverted before it returns. If a later edit drops
      // the re-enable, this is what catches it — a permanently disabled set_updated_at would be
      // silent until someone noticed timestamps had stopped moving months later.
      for (const t of ["profiles_set_updated_at", "user_program_state_set_updated_at"] as const) {
        expect(sqlOne(`select tgenabled::text from pg_trigger where tgname = '${t}';`), `${t} re-enabled`).toBe("O");
      }
      // Enabled in the catalogue AND actually firing.
      sql(`update public.profiles set completeness = completeness where owner = '${fresh.id}';`);
      expect(fingerprint(), "an ordinary UPDATE must still bump updated_at").not.toBe(before);
      reconcile();
    });

    it("leaves anonymous assessments case-less, and MV-135's purge still selects them", () => {
      backfill();
      expect(sqlOne(`select case_id is null from public.assessments where id = '${anonymousAssessmentId}';`)).toBe("t");
      reconcile();

      // The MV-135 predicate itself (lib/assessments/purge.ts): owner is null AND created_at older
      // than the retention window. If the backfill had given the row a case this would still be
      // true — the promise breaks one slice LATER, when a case-scoped read resurrects it — so the
      // case_id assertion above is the real guard and this is the shipped-behaviour check.
      const selected = sqlOne(`
        select count(*) from public.assessments
         where owner is null
           and created_at < now() - interval '${ANON_RETENTION_DAYS} days'
           and id = '${anonymousAssessmentId}';
      `);
      expect(selected).toBe("1");
    });

    it("fails loudly when the invariant is broken — in both directions", () => {
      const caseId = personalCaseOf(userA.id);
      const otherCaseId = personalCaseOf(userB.id);

      // (1) an owned row with no case
      sql(`update public.profiles set case_id = null where owner = '${userA.id}';`);
      expect(sqlError("select private.mv155_assert_case_backfill();")).toContain("owned rows with case_id null");
      sql(`update public.profiles set case_id = '${caseId}' where owner = '${userA.id}';`);
      reconcile();

      // (2) a row pointed at somebody else's personal case. Driven on `application_attempts`
      //     because it is the one seeded table with no per-case uniqueness rule in MV-155 — on
      //     `plan_items` or `profiles` the re-point would be refused by 23505 before the
      //     reconciliation function ever ran, and the test would prove the index, not the guard.
      sql(`update public.application_attempts set case_id = '${otherCaseId}' where owner = '${userA.id}';`);
      expect(sqlError("select private.mv155_assert_case_backfill();")).toContain("is not the owner's personal case");
      sql(`update public.application_attempts set case_id = '${caseId}' where owner = '${userA.id}';`);
      reconcile();

      // (3) an anonymous assessment that acquired a case — the shape that would silently cancel
      //     MV-135's retention promise.
      sql(`update public.assessments set case_id = '${caseId}' where id = '${anonymousAssessmentId}';`);
      expect(sqlError("select private.mv155_assert_case_backfill();")).toContain(
        "anonymous rows (owner null) carry a case_id",
      );
      sql(`update public.assessments set case_id = null where id = '${anonymousAssessmentId}';`);
      reconcile();
    });
  });

  // =====================================================================
  // D — the program_predictions immutability trigger
  // =====================================================================
  describe("the narrowed immutability trigger", () => {
    /**
     * EVERY CASE IS DRIVEN TWICE — as `postgres` and as `service_role` — because the property
     * `20260620000000` exists to guarantee is that the guard is ROLE-INDEPENDENT. The function is
     * SECURITY INVOKER, so `service_role`'s BYPASSRLS buys it nothing here; a regression to
     * SECURITY DEFINER, or a policy-shaped "fix", would be invisible to a single-role test.
     *
     * Everything runs inside a rolled-back transaction, so the fixture the later blocks depend on
     * survives even the cases that are supposed to succeed.
     */
    const ROLES = [null, "service_role"] as const;
    const inTx = (statements: string, role: string | null): string =>
      `begin;${role ? ` set local role ${role};` : ""} ${statements} rollback;`;

    let predictionId: string;
    let assessmentId: string;
    let caseId: string;
    let otherCaseId: string;

    /** A fresh prediction with `case_id` NULL — the pre-backfill shape, inside the caller's tx. */
    const seedCaseless = (id: string, tag: string): string =>
      `insert into public.program_predictions
              (id, owner, assessment_id, program_id, verdict, rule_version, score_snapshot)
       values ('${id}', '${userA.id}', '${assessmentId}', '${programA}', 'possible', '${tag}', '{}'::jsonb);`;

    beforeAll(() => {
      backfill();
      caseId = personalCaseOf(userA.id);
      otherCaseId = personalCaseOf(userB.id);
      assessmentId = sqlOne(`select id from public.assessments where owner = '${userA.id}' limit 1;`);
      predictionId = sqlOne(`select id from public.program_predictions where owner = '${userA.id}' limit 1;`);
    });

    it("PERMITS the case_id-only null → not-null transition, for every role", () => {
      // The plan's obstacle, discharged: this is the one statement shape the backfill needs, and it
      // succeeds THROUGH the guard rather than around it.
      for (const role of ROLES) {
        const fresh = randomUUID();
        expect(
          () =>
            sql(
              inTx(
                `${seedCaseless(fresh, `v-permit-${role ?? "postgres"}`)}
                 update public.program_predictions set case_id = '${caseId}' where id = '${fresh}';`,
                role,
              ),
            ),
          `role=${role ?? "postgres"}`,
        ).not.toThrow();
      }
    });

    it("REFUSES null → a case that is NOT the row's own owner's personal case, for every role", () => {
      // The permitted transition is bounded to the row's OWN owner's personal case, not to "any
      // case". Without the `exists` clause in the guard the allowance reads null → ANY case, and a
      // mistyped `set case_id = <another student's case>` in the backfill itself would be PERMITTED
      // — caught only by the closing `mv155_assert_case_backfill()`, which is the right net at the
      // wrong layer. The guard exists so the backfill statement cannot damage a prediction-of-record
      // in the first place.
      for (const role of ROLES) {
        const fresh = randomUUID();
        expect(
          sqlError(
            inTx(
              `${seedCaseless(fresh, `v-wrongcase-${role ?? "postgres"}`)}
               update public.program_predictions set case_id = '${otherCaseId}' where id = '${fresh}';`,
              role,
            ),
          ),
          `role=${role ?? "postgres"}`,
        ).toContain("program_predictions is immutable");
      }
    });

    it("REFUSES a case_id change (not-null → other), for every role", () => {
      for (const role of ROLES) {
        expect(
          sqlError(
            inTx(`update public.program_predictions set case_id = '${otherCaseId}' where id = '${predictionId}';`, role),
          ),
          `role=${role ?? "postgres"}`,
        ).toContain("program_predictions is immutable");
      }
    });

    it("REFUSES not-null → null, for every role", () => {
      for (const role of ROLES) {
        expect(
          sqlError(inTx(`update public.program_predictions set case_id = null where id = '${predictionId}';`, role)),
          `role=${role ?? "postgres"}`,
        ).toContain("program_predictions is immutable");
      }
    });

    it("REFUSES a case_id update that ALSO touches another column, for every role", () => {
      // Driven on a case_id-NULL row so the ONLY clause that can refuse it is the jsonb equality —
      // on an already-cased row the null→not-null test would refuse it first and prove nothing.
      for (const role of ROLES) {
        const fresh = randomUUID();
        expect(
          sqlError(
            inTx(
              `${seedCaseless(fresh, `v-combo-${role ?? "postgres"}`)}
               update public.program_predictions
                  set case_id = '${caseId}', verdict = 'reach' where id = '${fresh}';`,
              role,
            ),
          ),
          `role=${role ?? "postgres"}`,
        ).toContain("program_predictions is immutable");
      }
    });

    it("REFUSES verdict, score_snapshot and rule_version updates on their own, for every role", () => {
      for (const assignment of ["verdict = 'strong'", `score_snapshot = '{"total": 99}'::jsonb`, "rule_version = 'v9'"]) {
        for (const role of ROLES) {
          expect(
            sqlError(inTx(`update public.program_predictions set ${assignment} where id = '${predictionId}';`, role)),
            `${assignment} · role=${role ?? "postgres"}`,
          ).toContain("program_predictions is immutable");
        }
      }
    });

    it("keeps the guard SECURITY INVOKER, enabled, and search_path-pinned", () => {
      // `create or replace` does NOT inherit the previous definition's configuration, so a narrowed
      // body that forgot to restate `set search_path = ''` would ship an advisor finding and a
      // hijacking vector. `O` = enabled for origin/local writes; `false` = SECURITY INVOKER.
      expect(
        sqlOne(`
          select t.tgenabled::text || '|' || p.prosecdef::text || '|'
                 || coalesce(array_to_string(p.proconfig, ','), 'NONE')
            from pg_trigger t join pg_proc p on p.oid = t.tgfoid
           where t.tgname = 'program_predictions_no_update';
        `),
      ).toBe('O|false|search_path=""');
    });
  });

  // =====================================================================
  // A — personal-case uniqueness
  // =====================================================================
  describe("personal-case uniqueness", () => {
    it("rejects a second personal case for the same student, and accepts a consultancy one", async () => {
      backfill();
      const { error: dup } = await admin
        .from("cases")
        .insert({ student_user_id: userA.id, display_name: "second personal case" });
      expect(dup?.code).toBe("23505");

      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({ name: `MV155 org ${stamp}`, slug: `mv155-org-${stamp}` })
        .select("id")
        .single();
      if (orgError || !org) throw new Error(`failed to seed org: ${orgError?.message}`);
      const { error: consultancy } = await admin
        .from("cases")
        .insert({ organization_id: org.id, student_user_id: userA.id, display_name: "consultancy case" });
      expect(consultancy, "a consultancy case for the same student is legitimate").toBeNull();

      await admin.from("cases").delete().eq("organization_id", org.id);
      await admin.from("organizations").delete().eq("id", org.id);
    });
  });

  // =====================================================================
  // E — the per-case uniqueness rules bite
  // =====================================================================
  describe("per-case uniqueness", () => {
    it("rejects a duplicate within one case and accepts the same shape in another", () => {
      backfill();
      const caseA = personalCaseOf(userA.id);
      const caseB = personalCaseOf(userB.id);

      // A second PRIMARY assessment on one case.
      expect(
        sqlError(`insert into public.assessments (owner, case_id, result, rule_version, expires_at, destination_id,
                    is_primary, profile_snapshot)
                  values ('${userA.id}', '${caseA}', '{}'::jsonb, 'v', now(), 'australia', true, '{}'::jsonb);`),
      ).toMatch(/duplicate key|23505/);

      // A second OPEN plan item of one kind on one case.
      expect(
        sqlError(`insert into public.plan_items (owner, case_id, kind, impact, title, status)
                  values ('${userA.id}', '${caseA}', 'english', 'high', 'dup', 'todo');`),
      ).toMatch(/duplicate key|23505/);

      // A second document of one kind on one case.
      expect(
        sqlError(`insert into public.documents (owner, case_id, kind, file_path, file_size, original_name)
                  values ('${userA.id}', '${caseA}', 'passport', 'x/passport/y.pdf', 1, 'y.pdf');`),
      ).toMatch(/duplicate key|23505/);

      // The same three shapes on a DIFFERENT case are accepted — the rule is per case, not global.
      // Driven inside a rolled-back transaction so the fixture the later blocks rely on survives.
      // (`owner` is deliberately userB's, because the composite owner-keyed legacy rules are still
      // live and would otherwise be what refuses the insert.)
      expect(() =>
        sql(`begin;
               insert into public.plan_items (owner, case_id, kind, impact, title, status)
               values ('${userB.id}', '${caseB}', 'finance', 'high', 'other case', 'todo');
               insert into public.documents (owner, case_id, kind, file_path, file_size, original_name)
               values ('${userB.id}', '${caseB}', 'ielts', 'x/ielts/y.pdf', 1, 'y.pdf');
             rollback;`),
      ).not.toThrow();
    });
  });

  // =====================================================================
  // C/F/H — PUBLIC EXECUTE is revoked on all three new definer objects
  // =====================================================================
  describe("the new private definer objects", () => {
    it("ships all three SECURITY DEFINER with a pinned empty search_path", () => {
      const rows = sql(`
        select p.proname || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), 'NONE')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private' and p.proname in (${NEW_DEFINERS.map(([n]) => `'${n}'`).join(",")})
         order by 1;
      `);
      expect(rows).toEqual(
        [...NEW_DEFINERS].sort(([a], [b]) => a.localeCompare(b)).map(([name]) => `${name}|true|search_path=""`),
      );
    });

    it("owns all three with a role that actually holds BYPASSRLS", () => {
      // All three read tables with FORCE ROW LEVEL SECURITY — `cases` and the nine. A SECURITY
      // DEFINER function executes as its OWNER, and it is that owner's BYPASSRLS (not ownership,
      // which FORCE deliberately defeats) that lets the reads see every row. Without it the failure
      // is SILENT, not loud: `mv155_derive_case_id_from_owner` would find no case and derive NULL,
      // and `mv155_assert_case_backfill` would scan an empty view of the tables and report clean.
      const rows = sql(`
        select p.proname || '|' || r.rolbypassrls::text
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_roles r on r.oid = p.proowner
         where n.nspname = 'private' and p.prosecdef
           and p.proname in (${NEW_DEFINERS.map(([n]) => `'${n}'`).join(",")})
         order by 1;
      `);
      expect(rows.length).toBe(NEW_DEFINERS.length);
      for (const row of rows) expect(row.endsWith("|true"), `definer owner lacks BYPASSRLS: ${row}`).toBe(true);
    });

    it("revokes PUBLIC EXECUTE on every one, and grants it to nobody", () => {
      // Same shape case-rls.itest.ts runs over MV-152's twelve helpers. `authenticated` already
      // holds USAGE on `private`, so an unrevoked definer function is directly callable from a
      // browser through PostgREST RPC.
      for (const [name, args] of NEW_DEFINERS) {
        const signature = `private.${name}(${args})`;
        expect(sqlOne(`select has_function_privilege('authenticated', '${signature}', 'execute')::text;`), signature).toBe(
          "false",
        );
        expect(sqlOne(`select has_function_privilege('anon', '${signature}', 'execute')::text;`), signature).toBe("false");
        // PUBLIC itself, read from the ACL rather than inferred from the two roles above.
        const publicEntries = sql(`
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
               lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where n.nspname = 'private' and p.proname = '${name}' and a.grantee = 0;
        `);
        expect(publicEntries, `${name} still carries a PUBLIC grant`).toEqual([]);
      }
    });

    it("refuses an authenticated PostgREST RPC call to the backfill — and the function still exists", async () => {
      // The catalogue assertion alone would pass against a function `authenticated` was separately
      // granted, or against a `private` schema someone later exposed. This is the behavioural half.
      const { error } = await userA.client.rpc("mv155_backfill_personal_cases" as never);
      expect(error, "an authenticated client must not be able to run the backfill").not.toBeNull();

      // `not.toBeNull()` ON ITS OWN IS SATISFIED BY SCHEMA EXPOSURE ALONE, which is the whole
      // problem with it: delete the function outright, or typo its name, and PostgREST still
      // returns an error and this test still goes green. So pin both halves of the actual claim.
      //
      // (a) The refusal is a REACHABILITY refusal, not a crash or a timeout. `private` is not in
      //     PostgREST's exposed schemas, so the surface answers PGRST202 / 404.
      expect(
        [error?.code, String(error?.message)].join(" "),
        "expected a not-exposed/not-found refusal from PostgREST",
      ).toMatch(/PGRST202|Could not find the function|schema must be one of/i);

      // (b) The function IS there and IS callable — by `postgres`, through psql. Without this the
      //     test cannot distinguish "authenticated cannot reach it" from "it does not exist".
      expect(
        sqlOne(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'mv155_backfill_personal_cases';`),
      ).toBe("1");
      expect(Array.isArray(backfill().personal_case_ids), "callable as postgres").toBe(true);

      // (c) Positive control on the SAME client: it can reach the exposed surface fine. Without
      //     this, a broken session or a down PostgREST would produce an error at (a) too, and the
      //     refusal above would be evidence of nothing.
      const control = await userA.client.from("programs").select("id").limit(1);
      expect(control.error, "the same authenticated client must still reach the exposed surface").toBeNull();

      // NOTE ON WHAT THIS TEST CAN AND CANNOT SEPARATE. `private` is not in PostgREST's exposed
      // schemas, so the 404 at (a) is a schema-boundary refusal and would look identical if the
      // EXECUTE grant were wide open. The grant is therefore asserted from the catalogue in the
      // sibling test above, and that is the load-bearing one; this test's job is to prove the
      // browser-reachable surface agrees with it today.
    });
  });

  // =====================================================================
  // H — the grant surface: case_id out of UPDATE, in to INSERT
  // =====================================================================
  describe("the client write surface", () => {
    it("matches the expected column-grant set exactly, column by column", () => {
      const surface = sql(`
        select table_name || '.' || lower(privilege_type) || '(' || column_name || ')'
          from information_schema.column_privileges
         where table_schema = 'public' and grantee = 'authenticated'
           and privilege_type in ('INSERT', 'UPDATE')
           and table_name in (${NINE.map((t) => `'${t}'`).join(",")})
         order by 1;
      `);
      expect(surface).toEqual([...EXPECTED_WRITE_SURFACE].sort());
    });

    it("refuses an authenticated UPDATE that names case_id, on every update-granted table", async () => {
      backfill();
      const caseId = personalCaseOf(userA.id);
      const probes: Array<[string, PromiseLike<{ error: { code?: string } | null }>]> = [
        ["profiles", userA.client.from("profiles").update({ case_id: caseId }).eq("owner", userA.id)],
        ["plan_items", userA.client.from("plan_items").update({ case_id: caseId }).eq("owner", userA.id)],
        ["user_program_state", userA.client.from("user_program_state").update({ case_id: caseId }).eq("owner", userA.id)],
        ["document_status", userA.client.from("document_status").update({ case_id: caseId }).eq("owner", userA.id)],
      ];
      for (const [table, p] of probes) {
        const { error } = await p;
        expect(error?.code, `${table}: an authenticated UPDATE naming case_id must be refused`).toBe("42501");
      }
    });

    // -------------------------------------------------------------------------------------
    // The `update (owner, …)` widening — the second-order consequence, pinned.
    // -------------------------------------------------------------------------------------
    // §4.4/§4.6 of the matrix spec specify `UPDATE (status, notes)` / `UPDATE (obtained)`. Both are
    // unexecutable against a PostgREST upsert (see the "leaves today's behaviour intact" test), so
    // MV-155 ships the payload lists, which include `owner`. THE WHOLE SAFETY ARGUMENT FOR THAT
    // WIDENING RESTS ON THE RLS `WITH CHECK` — and until now nothing anywhere asserted it. These
    // two tests are that assertion.
    it("refuses an authenticated UPDATE that re-points owner at another user — the WITH CHECK backstop", async () => {
      backfill();
      const probes: Array<[string, PromiseLike<{ error: { code?: string; message?: string } | null }>]> = [
        [
          "user_program_state",
          userA.client.from("user_program_state").update({ owner: userB.id }).eq("owner", userA.id),
        ],
        ["document_status", userA.client.from("document_status").update({ owner: userB.id }).eq("owner", userA.id)],
      ];
      for (const [table, p] of probes) {
        const { error } = await p;
        expect(error?.code, `${table}: re-pointing owner must be refused`).toBe("42501");
        expect(error?.message, `${table}: and refused by the POLICY, not by a grant`).toMatch(
          /row-level security policy/i,
        );
      }
      reconcile();
    });

    it("refuses an authenticated UPDATE that NULLs owner — the same WITH CHECK, and a NOT NULL under it", async () => {
      // THIS IS THE NON-OBVIOUS HALF, AND IT IS WHY THIS TEST EXISTS SEPARATELY FROM THE ONE ABOVE.
      // A reader can reasonably expect `with check ((select auth.uid()) = owner)` to catch only a
      // re-point to a DIFFERENT uid and to let NULL through, since `auth.uid() = null` is NULL
      // rather than false — which would mean `update (owner, …)` lets a student strip their own
      // row's owner, and the seam trigger would not fire to stop it because it is qualified
      // `when (new.owner is not null)`. Traced against the shipped policies: it does not hold.
      // Postgres admits a row only when a WITH CHECK evaluates to TRUE, and NULL is refused exactly
      // like FALSE.
      backfill();
      // THE CAST IS DELIBERATE AND IS ITSELF PART OF THE FINDING. `lib/supabase/types.ts` types
      // `owner` as non-nullable on both tables, so TypeScript refuses this payload outright — a
      // THIRD barrier, and the one a MeroVisa-authored caller meets first. It is also the weakest:
      // it binds our own code and nothing else, so a hand-rolled PostgREST request from a browser
      // never sees it. Casting past it is what makes the two runtime barriers below observable.
      const nullOwner = { owner: null } as unknown as { owner: string };
      const probes: Array<[string, PromiseLike<{ error: { code?: string; message?: string } | null }>]> = [
        ["user_program_state", userA.client.from("user_program_state").update(nullOwner).eq("owner", userA.id)],
        ["document_status", userA.client.from("document_status").update(nullOwner).eq("owner", userA.id)],
      ];
      for (const [table, p] of probes) {
        const { error } = await p;
        expect(error?.code, `${table}: nulling owner must be refused`).toBe("42501");
        expect(error?.message, `${table}: refused by the policy`).toMatch(/row-level security policy/i);
      }

      // THE SECOND, INDEPENDENT BARRIER — pinned so MV-156 cannot remove it silently. `owner` is
      // NOT NULL on both tables AND a PRIMARY KEY column (`(owner, program_id)` / `(owner, kind)`),
      // so even with grants and RLS entirely out of the picture a superuser `set owner = null`
      // raises 23502. MV-156 replaces those primary keys and relaxes `owner`; when it does, this
      // assertion goes red and the WITH CHECK above becomes the ONLY barrier left — which is
      // exactly the moment someone should re-read the two tests above rather than discover the
      // question later.
      for (const table of ["user_program_state", "document_status"] as const) {
        expect(
          sqlOne(`select is_nullable from information_schema.columns
                   where table_schema='public' and table_name='${table}' and column_name='owner';`),
          `${table}.owner is NOT NULL today; if MV-156 relaxed it, re-read the WITH CHECK tests above`,
        ).toBe("NO");
        expect(
          sqlOne(`select count(*) from information_schema.key_column_usage k
                   join information_schema.table_constraints c
                     on c.constraint_name = k.constraint_name and c.constraint_schema = k.constraint_schema
                  where c.constraint_type = 'PRIMARY KEY' and k.table_schema = 'public'
                    and k.table_name = '${table}' and k.column_name = 'owner';`),
          `${table}.owner is a PRIMARY KEY column today`,
        ).toBe("1");
      }
      reconcile();
    });

    it("ALLOWS an authenticated INSERT that carries case_id, on every insert-granted table", async () => {
      backfill();
      const caseId = personalCaseOf(userA.id);
      const assessmentId = sqlOne(`select id from public.assessments where owner = '${userA.id}' limit 1;`);

      // This is the assertion that fails loudly if a later reviewer "tidies" case_id out of the
      // INSERT lists and silently breaks MV-157's dual-write with no card owning the regression.
      const ups = await userA.client
        .from("user_program_state")
        .insert({ owner: userA.id, program_id: programB, status: "shortlisted", case_id: caseId });
      expect(ups.error, "user_program_state").toBeNull();

      const ds = await userA.client
        .from("document_status")
        .insert({ owner: userA.id, kind: "ielts", obtained: true, case_id: caseId });
      expect(ds.error, "document_status").toBeNull();

      const pp = await userA.client
        .from("program_predictions")
        .insert({
          owner: userA.id,
          assessment_id: assessmentId,
          program_id: programB,
          verdict: "reach",
          rule_version: "v0.5.0-mv155-insert",
          score_snapshot: { total: 1 },
          case_id: caseId,
        })
        .select("id")
        .single();
      expect(pp.error, "program_predictions").toBeNull();

      const aa = await userA.client
        .from("application_attempts")
        .insert({ owner: userA.id, prediction_id: pp.data!.id, program_id: programB, case_id: caseId })
        .select("id")
        .single();
      expect(aa.error, "application_attempts").toBeNull();

      const oe = await userA.client.from("outcome_events").insert({
        owner: userA.id,
        attempt_id: aa.data!.id,
        event_type: "applied",
        gate: "admission",
        source: "self_reported",
        occurred_at: new Date().toISOString(),
        case_id: caseId,
      });
      expect(oe.error, "outcome_events").toBeNull();

      reconcile();
    });

    it("leaves today's authenticated behaviour intact — the shortlist upsert and the checklist toggle", async () => {
      backfill();
      // EXACT payloads from lib/matches/repo.ts and lib/documents/status-repo.ts. The narrowed
      // UPDATE lists must still cover a PostgREST upsert, whose ON CONFLICT DO UPDATE SET names
      // every payload column INCLUDING the conflict target — spec §4.4/§4.6's `(status, notes)` and
      // `(obtained)` raise 42501 on the insert branch. Recorded in the migration; pinned here.
      const first = await userA.client
        .from("user_program_state")
        .upsert(
          { owner: userA.id, program_id: programA, status: "shortlisted", notes: null },
          { onConflict: "owner,program_id", ignoreDuplicates: false },
        );
      expect(first.error, "shortlist upsert, insert branch").toBeNull();
      const second = await userA.client
        .from("user_program_state")
        .upsert(
          { owner: userA.id, program_id: programA, status: "applied", notes: "n" },
          { onConflict: "owner,program_id", ignoreDuplicates: false },
        );
      expect(second.error, "shortlist upsert, conflict branch").toBeNull();

      const toggleOn = await userA.client
        .from("document_status")
        .upsert({ owner: userA.id, kind: "passport", obtained: true }, { onConflict: "owner,kind" });
      expect(toggleOn.error, "checklist toggle, conflict branch").toBeNull();
      const toggleOff = await userA.client.from("document_status").delete().eq("owner", userA.id).eq("kind", "other");
      expect(toggleOff.error, "checklist toggle off").toBeNull();
    });
  });

  // =====================================================================
  // H — the UPSERT seam, both branches of the WHEN clause
  // =====================================================================
  describe("the UPSERT-seam trigger", () => {
    it("carries the WHEN (new.owner IS NOT NULL) qualification on both tables", () => {
      // The clause is part of the specification, not an optimisation: unqualified, the overwrite
      // destroys the only case_id an `owner IS NULL` row could carry, and MV-160 §D's counsellor
      // write proof becomes unsatisfiable by construction.
      const defs = sql(`
        select t.tgname || '|' || pg_get_triggerdef(t.oid)
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal
           and t.tgname in ('user_program_state_derive_case_id', 'document_status_derive_case_id')
         order by 1;
      `);
      expect(defs.length).toBe(2);
      for (const def of defs) {
        expect(def).toMatch(/BEFORE INSERT OR UPDATE ON public\./);
        expect(def).toMatch(/WHEN \(\(new\.owner IS NOT NULL\)\)/);
        expect(def).toContain("EXECUTE FUNCTION private.mv155_derive_case_id_from_owner()");
      }
    });

    it("owner-set branch: derives case_id, and OVERWRITES a supplied one", async () => {
      backfill();
      const mine = personalCaseOf(userA.id);
      const theirs = personalCaseOf(userB.id);

      // (a) authenticated INSERT supplying NOTHING → derived.
      await admin.from("user_program_state").delete().eq("owner", userA.id).eq("program_id", programB);
      const derived = await userA.client
        .from("user_program_state")
        .insert({ owner: userA.id, program_id: programB, status: "shortlisted" });
      expect(derived.error).toBeNull();
      expect(sqlOne(`select case_id from public.user_program_state where owner='${userA.id}' and program_id='${programB}';`)).toBe(
        mine,
      );

      // (b) authenticated INSERT supplying the WRONG case → overwritten, not honoured. Permitted as
      //     a plain INSERT because case_id IS in the INSERT column list; that is the whole design.
      await admin.from("user_program_state").delete().eq("owner", userA.id).eq("program_id", programB);
      const wrong = await userA.client
        .from("user_program_state")
        .insert({ owner: userA.id, program_id: programB, status: "shortlisted", case_id: theirs });
      expect(wrong.error).toBeNull();
      expect(
        sqlOne(`select case_id from public.user_program_state where owner='${userA.id}' and program_id='${programB}';`),
        "a client-supplied case_id must be overwritten, never honoured, when owner is set",
      ).toBe(mine);

      // (c) service-role UPSERT supplying the wrong case → same answer. service_role bypasses RLS
      //     and holds every grant, so the trigger is the ONLY thing standing here.
      const svcUpsert = await admin
        .from("user_program_state")
        .upsert(
          { owner: userA.id, program_id: programB, status: "applied", case_id: theirs },
          { onConflict: "owner,program_id" },
        );
      expect(svcUpsert.error).toBeNull();
      expect(
        sqlOne(`select case_id from public.user_program_state where owner='${userA.id}' and program_id='${programB}';`),
      ).toBe(mine);

      // (d) the seam itself: an AUTHENTICATED upsert that NAMES case_id is refused by the grant
      //     before the trigger is ever reached. This is why MV-157 must keep case_id out of the
      //     upsertProgramState / setObtained payloads.
      const refused = await userA.client
        .from("user_program_state")
        .upsert(
          { owner: userA.id, program_id: programB, status: "applied", case_id: theirs },
          { onConflict: "owner,program_id" },
        );
      expect(refused.error?.code, "an authenticated upsert naming case_id must be 42501").toBe("42501");

      // The same three shapes on document_status.
      await admin.from("document_status").delete().eq("owner", userA.id).eq("kind", "medical");
      const dsDerived = await admin.from("document_status").insert({ owner: userA.id, kind: "medical", obtained: true, case_id: theirs });
      expect(dsDerived.error).toBeNull();
      expect(sqlOne(`select case_id from public.document_status where owner='${userA.id}' and kind='medical';`)).toBe(mine);

      reconcile();
    });

    /**
     * OWNER-NULL BRANCH — honoured, not touched.
     *
     * This one runs on a SCRATCH TABLE and that is a finding, not a shortcut: `owner` is `NOT NULL`
     * on both real tables today, and on both it is a PRIMARY KEY column, so an `owner IS NULL` row
     * is not insertable until MV-156 replaces those primary keys. The card's test plan asks for the
     * real-table form; it is unsatisfiable in MV-155's own state.
     *
     * What IS provable here is the property MV-160 §D depends on: the function plus the WHEN clause
     * honour a supplied `case_id` when `owner` is null, and leave it alone on a later UPDATE. The
     * scratch table carries the same two columns and the SAME trigger definition, so a regression in
     * the function or in the clause turns this red. The real-table replay is MV-156's to enable and
     * MV-160 §D's to perform.
     */
    it("owner-null branch: honours a supplied case_id and does not touch it on a later UPDATE", () => {
      backfill();
      const caseId = personalCaseOf(userA.id);
      const scratch = `mv155_seam_${stamp}`;

      try {
        sql(`
          create table public.${scratch} (
            id serial primary key,
            owner uuid,
            case_id uuid references public.cases(id) on delete restrict,
            note text
          );
          create trigger ${scratch}_derive_case_id
            before insert or update on public.${scratch}
            for each row when (new.owner is not null)
            execute function private.mv155_derive_case_id_from_owner();
        `);

        // owner NULL → the trigger does not fire, the supplied case_id survives.
        sql(`insert into public.${scratch} (owner, case_id, note) values (null, '${caseId}', 'consultancy');`);
        expect(sqlOne(`select case_id from public.${scratch} where note = 'consultancy';`)).toBe(caseId);

        // A later UPDATE of a non-case_id column leaves case_id alone.
        sql(`update public.${scratch} set note = 'edited' where note = 'consultancy';`);
        expect(sqlOne(`select case_id from public.${scratch} where note = 'edited';`)).toBe(caseId);

        // DELETE is unaffected.
        sql(`delete from public.${scratch} where note = 'edited';`);
        expect(sqlOne(`select count(*) from public.${scratch};`)).toBe("0");

        // And the contrast that makes the WHEN clause observable: owner SET on the same table
        // derives-and-overwrites, so the two branches genuinely differ.
        sql(`insert into public.${scratch} (owner, case_id, note)
             values ('${userB.id}', '${caseId}', 'personal');`);
        expect(sqlOne(`select case_id from public.${scratch} where note = 'personal';`)).toBe(personalCaseOf(userB.id));

        // THE BOUND ON THE owner-NULL BRANCH LIVES ELSEWHERE. Once MV-159 lands, an AUTHENTICATED
        // counsellor naming a case they cannot reach is rejected by the policy's WITH CHECK, not by
        // this trigger. MV-159 owns that assertion; MV-155 asserts only that the value survives —
        // read the honoured value as provenance, never as an unguarded write.
      } finally {
        sql(`drop table if exists public.${scratch};`);
      }
    });
  });

  // =====================================================================
  // E — the arbiter indexes are inferrable by a BARE ON CONFLICT (no 42P10)
  // =====================================================================
  describe("ON CONFLICT inference", () => {
    it("infers all four arbiters from a bare column list", () => {
      backfill();
      const caseA = personalCaseOf(userA.id);

      // Driven as `postgres` inside a rolled-back transaction so the question is purely about index
      // INFERENCE, isolated from the grant surface the block above owns.
      const runs: Array<[string, string]> = [
        [
          "profiles (case_id)",
          `insert into public.profiles (owner, case_id, sections, completeness)
             values ('${userA.id}', '${caseA}', '{}'::jsonb, 1)
             on conflict (case_id) do update set completeness = excluded.completeness;`,
        ],
        [
          "user_program_state (case_id, program_id)",
          `insert into public.user_program_state (owner, case_id, program_id, status)
             values ('${userA.id}', '${caseA}', '${programA}', 'applied')
             on conflict (case_id, program_id) do update set status = excluded.status;`,
        ],
        [
          "documents (case_id, kind)",
          `insert into public.documents (owner, case_id, kind, file_path, file_size, original_name)
             values ('${userA.id}', '${caseA}', 'passport', 'a/passport/b.pdf', 2, 'b.pdf')
             on conflict (case_id, kind) do update set file_size = excluded.file_size;`,
        ],
        [
          "document_status (case_id, kind)",
          `insert into public.document_status (owner, case_id, kind, obtained)
             values ('${userA.id}', '${caseA}', 'passport', true)
             on conflict (case_id, kind) do update set obtained = excluded.obtained;`,
        ],
      ];

      for (const [label, statement] of runs) {
        // Twice, so the DO UPDATE branch is genuinely taken.
        expect(() => sql(`begin; ${statement} ${statement} rollback;`), `${label} must not raise 42P10`).not.toThrow();
      }
    });

    /**
     * THE COUNTERFACTUAL. Without it the positive above is green against BOTH designs and proves
     * nothing — and the partial form is exactly what an earlier draft of §E specified, so it is the
     * shape a later editor is most likely to restore.
     */
    it("proves the partial form really does raise 42P10 against the same bare column list", () => {
      const scratch = `mv155_arbiter_${stamp}`;
      try {
        sql(`
          create table public.${scratch} (case_id uuid, program_id text, status text);
          create unique index ${scratch}_partial_idx on public.${scratch} (case_id, program_id)
            where case_id is not null;
        `);
        const bare = `insert into public.${scratch} (case_id, program_id, status)
                      values (gen_random_uuid(), 'p', 'a')
                      on conflict (case_id, program_id) do update set status = excluded.status;`;
        expect(sqlError(bare), "a PARTIAL unique is not inferrable from a bare column list").toMatch(
          /42P10|no unique or exclusion constraint matching/,
        );

        // Same table, same statement, FULL index → inferred.
        sql(`drop index public.${scratch}_partial_idx;
             create unique index ${scratch}_full_idx on public.${scratch} (case_id, program_id);`);
        expect(() => sql(bare), "a FULL unique on the same nullable columns IS inferrable").not.toThrow();
      } finally {
        sql(`drop table if exists public.${scratch};`);
      }
    });
  });

  // =====================================================================
  // Right to delete — the contract MV-155 would otherwise have broken
  // =====================================================================
  // `/api/account/delete` promises it "removes every trace of the signed-in user". Before MV-155
  // that was true by accident: `public.cases` held zero rows. MV-155 mints one personal case per
  // Auth user carrying `display_name` (their real name) and `email` (their real address), and
  // `cases.student_user_id` is ON DELETE **SET NULL** while all nine student tables are ON DELETE
  // CASCADE on `owner` — so deleting the Auth user cascades every owned row away and leaves the
  // cases row STANDING, unlinked, still carrying the identity. A privacy regression introduced by
  // this card, so this card closes it, and this is the test that proves it stays closed.
  //
  // It drives the REAL route (see the mock at the head of this file), not a replay of its delete
  // sequence, because a replay only ever proves the test and the route agree at the moment it was
  // written.
  describe("right to delete", () => {
    it("leaves no row anywhere carrying the student's name or email — cases included", async () => {
      const victim = await mint("rtbf");

      // A name nothing else in the database could plausibly hold, so the sweep at the end cannot
      // pass by accident and cannot be satisfied by some other fixture's row.
      const uniqueName = `RTBF Sentinel ${stamp} ${randomUUID()}`;
      await seedNine(victim.id, programA);
      // seedNine writes the profile row with `sections: {}`. Build the object outright rather than
      // `jsonb_set(…, '{personal,name}', …, true)` — jsonb_set will not create a MISSING
      // intermediate key, so against `{}` it silently returns `{}` and the sentinel never lands.
      sql(`update public.profiles
              set sections = jsonb_build_object('personal', jsonb_build_object('name', '${uniqueName}'))
            where owner = '${victim.id}';`);
      // The coalesce chain prefers the profile name, so this is the branch under test.
      expect(
        sqlOne(`select sections -> 'personal' ->> 'name' from public.profiles where owner = '${victim.id}';`),
      ).toBe(uniqueName);

      const report = backfill();
      expect(report.cases_created, "the victim must have got a personal case").toBeGreaterThanOrEqual(1);

      // Precondition — the artifact really exists before we delete. Without this the sweep below
      // would pass just as happily against a migration that never minted the case at all.
      const caseId = personalCaseOf(victim.id);
      expect(
        sqlOne(`select display_name || '|' || coalesce(email,'') from public.cases where id = '${caseId}';`),
        "the personal case carries the student's real name and email",
      ).toBe(`${uniqueName}|${victim.email}`);

      // Drive the real route.
      routeAuth.getUser.mockResolvedValue({ data: { user: { id: victim.id } } });
      const { POST } = await import("@/app/api/account/delete/route");
      const res = await POST(
        new Request("http://localhost/api/account/delete", {
          method: "POST",
          headers: { origin: "http://localhost" },
        }),
      );
      expect(await res.json(), "the delete must report complete success").toEqual({ ok: true });
      expect(res.status).toBe(200);

      // THE SWEEP. Not "the case row is gone" — "no row anywhere carries this person". `cases` is
      // scanned for BOTH columns, including rows whose `student_user_id` has been nulled, which is
      // exactly the shape the regression produced and the shape a link-based check would miss.
      expect(
        sqlOne(`select count(*) from public.cases
                 where display_name = '${uniqueName}' or email = '${victim.email}';`),
        "a case still carries the deleted student's name or email",
      ).toBe("0");
      expect(
        sqlOne(`select count(*) from public.cases where student_user_id is null and display_name = '${uniqueName}';`),
        "an UNLINKED case still carries the deleted student's name",
      ).toBe("0");

      // ...and nothing survives on the nine either, by owner or by the case they pointed at.
      for (const table of NINE) {
        expect(
          sqlOne(`select count(*) from public.${table} where owner = '${victim.id}';`),
          `${table} still holds rows for the deleted user`,
        ).toBe("0");
        expect(
          sqlOne(`select count(*) from public.${table} where case_id = '${caseId}';`),
          `${table} still points at the deleted user's case`,
        ).toBe("0");
      }

      // The auth identity itself.
      expect(sqlOne(`select count(*) from auth.users where id = '${victim.id}';`)).toBe("0");
      reconcile();
    });

    it("does NOT delete a consultancy case for the same student — that one belongs to the org", async () => {
      // The delete is scoped `organization_id is null`. A consultancy case is the organisation's
      // record, not the student's, and Stage 3 owns its lifecycle — deleting it here would destroy
      // an org's data because one of its students closed their MeroVisa account.
      const victim = await mint("rtbf-org");
      const slug = `rtbf-org-${stamp}`;
      // Wrapped in a CTE so the TOP-LEVEL command is a SELECT. A bare `insert … returning` prints
      // its `INSERT 0 1` command tag on stdout even under `-tAX`, which `sqlOne` counts as a second
      // row; every other call site in this file happens to be a plain SELECT.
      const orgId = sqlOne(`
        with ins as (
          insert into public.organizations (name, slug, created_by)
          values ('RTBF Org ${stamp}', '${slug}', '${victim.id}')
          returning id
        ) select id from ins;`);
      const orgCaseId = sqlOne(`
        with ins as (
          insert into public.cases (organization_id, student_user_id, created_by, email, display_name)
          values ('${orgId}', '${victim.id}', '${victim.id}', '${victim.email}', 'RTBF Org Case ${stamp}')
          returning id
        ) select id from ins;`);

      backfill();
      const personalId = personalCaseOf(victim.id);

      routeAuth.getUser.mockResolvedValue({ data: { user: { id: victim.id } } });
      const { POST } = await import("@/app/api/account/delete/route");
      const res = await POST(
        new Request("http://localhost/api/account/delete", {
          method: "POST",
          headers: { origin: "http://localhost" },
        }),
      );
      expect(res.status).toBe(200);

      expect(sqlOne(`select count(*) from public.cases where id = '${personalId}';`), "personal case deleted").toBe("0");
      expect(sqlOne(`select count(*) from public.cases where id = '${orgCaseId}';`), "consultancy case KEPT").toBe("1");

      sql(`delete from public.cases where id = '${orgCaseId}';
           delete from public.organizations where id = '${orgId}';`);
      reconcile();
    });
  });
});
