/**
 * MV-156 — `owner` nullable on the eight, and the predictions→attempts→outcome_events chain
 * re-based onto `case_id`, against a REAL local Postgres with the real migrations applied.
 *
 * WHY THIS SUITE IS THE PROOF. Every guarantee this card makes is a property of a live Postgres:
 * a column's nullability, which index a planner will accept as an `ON CONFLICT` arbiter, whether a
 * MATCH SIMPLE composite key actually bites, and whether a policy still fails closed once the column
 * it keys on can be NULL. `npm test` cannot observe any of them — jsdom has no database.
 *
 * FIVE PROPERTIES ARE LOAD-BEARING AND EACH HAS A NAMED FAILURE MODE:
 *
 *  1. **The compensating check is the DISJUNCT, not `check (case_id is not null)`.** The flat form
 *     is role-independent, so it would raise 23514 on every live owner-only outcomes insert —
 *     `service_role` included — for the whole MV-156 → MV-157 window. §E asserts the pre-MV-157
 *     write shape still SUCCEEDS, as both roles. That is the assertion that would have caught it.
 *  2. **The MATCH SIMPLE hole is real and is covered by two things, not one.** §F removes both
 *     covers in a rolled-back transaction and shows the database then ACCEPTS a cross-case attempt.
 *     A comment saying "do not remove this check" is advisory; a test that goes red is not.
 *  3. **The legacy owner chain is RETAINED and load-bearing.** It is the only cover for owner-set /
 *     case-less rows, which is every row a pre-MV-157 writer produces. §C pins it as present.
 *  4. **The two replacement uniques must be FULL, never partial.** A partial unique is not
 *     inferrable from PostgREST's bare `on_conflict=`, so the partial form the card and spec §4.4 /
 *     §4.6 prescribe takes the LIVE document checklist and shortlist down with 42P10. §J pins the
 *     positive against the real tables AND the counterfactual on a scratch table.
 *  5. **Relaxing `owner` must not open a read path.** §G seeds a NULL-owner row on each of the eight
 *     and asserts every authenticated and anonymous read returns zero. Case-aware access is MV-159;
 *     the interim posture is fail-closed and that is correct, not a bug to "fix" here.
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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The eight tables whose `owner` this card relaxes. `assessments` is the ninth and is NOT one. */
const EIGHT = [
  "profiles",
  "plan_items",
  "user_program_state",
  "documents",
  "document_status",
  "program_predictions",
  "application_attempts",
  "outcome_events",
] as const;

/**
 * LOCALHOST HARD GUARD — copied from `anon-purge.itest.ts`, and it throws at IMPORT time rather
 * than inside a test so no runner configuration can skip past it. This suite creates Auth users,
 * seeds rows across every student-owned table, and performs DDL (it drops and restores constraints
 * inside a rolled-back transaction). None of that may ever touch a hosted project.
 */
if (url && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(url)) {
  throw new Error(
    `owner-nullable-rebase.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "This suite performs DDL against public tables and mints Auth users. Point it at a local " +
      "`npx supabase start` stack, or unset the variable.",
  );
}

type Actor = { id: string; email: string; client: SupabaseClient<Database> };

describe.skipIf(!url || !serviceKey || !anonKey)("MV-156 owner nullable + composite-FK rebase", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let dbContainer: string;

  const stamp = Date.now();
  const password = `pw-${stamp}-Aa!`;
  const seededUserIds: string[] = [];
  const seededAssessmentIds: string[] = [];

  let userA: Actor;
  let userB: Actor;
  let programA: string;
  let programB: string;

  /** Per-user handles on the seeded chain, so assertions name THIS row rather than a global count. */
  type Seed = { assessmentId: string; predictionId: string; attemptId: string; eventId: string };
  const seeds = new Map<string, Seed>();

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
   * Run SQL as `postgres` inside the stack's DB container. `pg_catalog` and `information_schema`
   * are not PostgREST-exposed, so a catalogue question cannot be asked through supabase-js at all.
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
   * `insert … returning id` through psql prints the tuple AND the `INSERT 0 1` command tag, so
   * `sqlOne` sees two lines. Wrapping in a CTE makes the statement a SELECT, which prints only the
   * tuple — the same trick MV-155's migration uses to capture `personal_case_ids`.
   */
  const insertReturningId = (table: string, columns: string, values: string): string =>
    sqlOne(`with ins as (insert into public.${table} ${columns} values ${values} returning id) select id from ins;`);

  const backfill = (): void => {
    sql("select private.mv155_backfill_personal_cases();");
  };
  const personalCaseOf = (userId: string): string =>
    sqlOne(`select id from public.cases where organization_id is null and student_user_id = '${userId}';`);

  const mint = async (label: string): Promise<Actor> => {
    const email = `mv156-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `MV156 ${label}` },
    });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);

    // A throwaway client for the sign-in round trip only, so the shared anon client never acquires
    // a session — §G's "anon reads zero" depends on it staying genuinely anonymous.
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
   * Seed the PRE-MIGRATION row shape — `owner` set, `case_id` untouched — in each of the nine.
   * Service-role, because four of the nine hold no authenticated INSERT grant and this is fixture
   * construction, never an assertion.
   */
  const seedNine = async (owner: string, programId: string): Promise<Seed> => {
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
          rule_version: "v0.5.0-mv156",
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
      admin.from("user_program_state").insert({ owner, program_id: programId, status: "shortlisted" }).select("id").single(),
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
      admin.from("document_status").insert({ owner, kind: "passport", obtained: true }).select("id").single(),
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
          rule_version: "v0.5.0-mv156",
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
    const event = await svc(
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

    return { assessmentId: assessment.id, predictionId: prediction.id, attemptId: attempt.id, eventId: event.id };
  };

  const seedOf = (userId: string): Seed => {
    const s = seeds.get(userId);
    if (!s) throw new Error(`no seed recorded for ${userId}`);
    return s;
  };

  beforeAll(async () => {
    dbContainer = resolveDbContainer();
    admin = createClient<Database>(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    anon = createClient<Database>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    const programs = sql("select id from public.programs order by id limit 2;");
    programA = programs[0]!;
    programB = programs[1]!;

    userA = await mint("a");
    userB = await mint("b");
    seeds.set(userA.id, await seedNine(userA.id, programA));
    seeds.set(userB.id, await seedNine(userB.id, programA));

    // Mint the personal cases and populate `case_id`. MV-156's chain rebase is only observable
    // against cased rows, and MV-155's backfill is the only path that produces them.
    backfill();
  });

  afterAll(async () => {
    if (!admin) return;

    // NULL-owner rows are invisible to `on delete cascade` — that is §H's whole point — and they
    // hold their case down through `case_id`'s ON DELETE RESTRICT. So they must be swept by hand,
    // BEFORE the users and cases go, or the teardown leaks a case per run.
    //
    // Children first: outcome_events → application_attempts → program_predictions is a real FK
    // chain, and sweeping a parent before its child raises 23503 rather than cleaning up.
    const caseIds = seededUserIds.map((id) => personalCaseOfSafe(id)).filter(Boolean);
    if (caseIds.length) {
      const inList = caseIds.map((c) => `'${c}'`).join(",");
      const sweepOrder = [
        "outcome_events",
        "application_attempts",
        "program_predictions",
        "profiles",
        "plan_items",
        "user_program_state",
        "documents",
        "document_status",
      ] as const;
      for (const table of sweepOrder) {
        try {
          sql(`delete from public.${table} where owner is null and case_id in (${inList});`);
        } catch {
          // Best-effort teardown: a failure here must not mask the run's real result.
        }
      }
    }

    if (seededAssessmentIds.length) await admin.from("assessments").delete().in("id", seededAssessmentIds);
    for (const id of seededUserIds) {
      // Capture the case id while the links still exist: `cases.student_user_id` and `created_by`
      // are both ON DELETE SET NULL, so after `deleteUser` neither column can find the row.
      const { data: cases } = await admin
        .from("cases")
        .select("id")
        .is("organization_id", null)
        .or(`student_user_id.eq.${id},created_by.eq.${id}`);
      const ids = (cases ?? []).map((c) => (c as { id: string }).id);
      await admin.auth.admin.deleteUser(id);
      if (ids.length) await admin.from("cases").delete().in("id", ids);
    }
  });

  /** Teardown-only: the case may already be gone, and a throw there would mask the real result. */
  function personalCaseOfSafe(userId: string): string {
    try {
      return personalCaseOf(userId);
    } catch {
      return "";
    }
  }

  // =====================================================================
  // A — nullability, one named assertion per table
  // =====================================================================
  describe("owner is nullable on the eight", () => {
    it.each(EIGHT)("%s.owner is nullable, read from information_schema", (table) => {
      // Read from the catalogue rather than the DDL: the card asks for `is_nullable = 'YES'`
      // specifically so a migration that *looks* right but did not apply cannot pass.
      expect(
        sqlOne(`select is_nullable from information_schema.columns
                 where table_schema='public' and table_name='${table}' and column_name='owner';`),
        `${table}.owner must be nullable after MV-156`,
      ).toBe("YES");
    });

    it("leaves public.assessments alone — it is the ninth table, not one of the eight", () => {
      // `assessments.owner` has been nullable since 20260603011208; that is what an anonymous
      // assessment IS. The assertion that matters is that it carries NO ownership-axis check:
      // an unclaimed row is `owner IS NULL AND case_id IS NULL` by design, so the disjunct would
      // reject exactly the population MV-135's 3-day purge exists to collect.
      expect(
        sqlOne(`select is_nullable from information_schema.columns
                 where table_schema='public' and table_name='assessments' and column_name='owner';`),
      ).toBe("YES");
      expect(
        sql(`select conname from pg_constraint where conrelid='public.assessments'::regclass
              and conname like '%ownership_axis_present';`),
        "assessments must NOT carry the ownership-axis check",
      ).toEqual([]);
    });
  });

  // =====================================================================
  // B — the two PRIMARY KEY replacements
  // =====================================================================
  describe("primary key replacement (the seventh schema obstacle)", () => {
    it.each(["user_program_state", "document_status"] as const)(
      "%s: the PK is now the surrogate id, and owner has left it",
      (table) => {
        expect(
          sqlOne(`select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid='public.${table}'::regclass and contype='p';`),
        ).toBe("PRIMARY KEY (id)");

        // `owner` must no longer be a key column of ANY primary key — the property that made
        // `drop not null` impossible in the first place.
        expect(
          sqlOne(`select count(*) from information_schema.key_column_usage k
                   join information_schema.table_constraints c
                     on c.constraint_name = k.constraint_name and c.constraint_schema = k.constraint_schema
                  where c.constraint_type='PRIMARY KEY' and k.table_schema='public'
                    and k.table_name='${table}' and k.column_name='owner';`),
          `${table}.owner must no longer be a PRIMARY KEY column`,
        ).toBe("0");

        expect(
          sqlOne(`select data_type from information_schema.columns
                   where table_schema='public' and table_name='${table}' and column_name='id';`),
        ).toBe("uuid");
      },
    );

    it("no FK anywhere targeted either replaced PK, so the swap re-points nothing", () => {
      // Verified against pg_constraint rather than assumed — the card is explicit that this is the
      // difference between a key replacement and a silent re-pointing of somebody else's data.
      expect(
        sql(`select c.conname from pg_constraint c join pg_class rt on rt.oid=c.confrelid
              where c.contype='f' and rt.relname in ('user_program_state','document_status');`),
      ).toEqual([]);
    });

    it.each([
      ["user_program_state", "program_id", "user_program_state_owner_program_idx", "user_program_state_case_program_idx"],
      ["document_status", "kind", "document_status_owner_kind_idx", "document_status_case_kind_idx"],
    ] as const)("%s: a duplicate for a NON-NULL owner is still rejected (23505)", (table, other, ownerIdx, caseIdx) => {
      const value = table === "user_program_state" ? programA : "passport";
      const cols =
        table === "user_program_state"
          ? `(owner, program_id, status) values ('${userA.id}', '${value}', 'shortlisted')`
          : `(owner, kind, obtained) values ('${userA.id}', '${value}', true)`;
      const err = sqlError(`insert into public.${table} ${cols};`);
      expect(err, `${table}: a duplicate (owner, ${other}) must still raise 23505`).toMatch(
        /duplicate key value violates unique constraint/i,
      );

      // WHICH index names the violation is not fixed, and asserting one specific name would be a
      // false precision. For an owner-SET row MV-155's seam trigger derives `case_id` from `owner`,
      // so the owner-keyed rule and the case-keyed rule are CO-EXTENSIVE on exactly these rows —
      // whichever index Postgres probes first reports it. That co-extensiveness is the reason
      // MV-160 can drop the owner-keyed one at all: once `case_id` is NOT NULL the case-keyed rule
      // already covers every row the owner-keyed rule covered.
      expect(
        err.includes(ownerIdx) || err.includes(caseIdx),
        `${table}: the violation must be reported by ${ownerIdx} or ${caseIdx}, got: ${err.trim()}`,
      ).toBe(true);
    });

    it.each([
      ["user_program_state", "program_id"],
      ["document_status", "kind"],
    ] as const)("%s: NULL-owner rows sharing the other key column are accepted (the owner rule stops binding)", (table, other) => {
      // NULLs are distinct in a unique index, which is the entire mechanism that lets the legacy
      // rule survive as a plain unique while consultancy rows exist. This shape was unrepresentable
      // before MV-156 — `owner` was a PRIMARY KEY column, so it could not be NULL at all.
      //
      // THE TWO ROWS SIT IN DIFFERENT CASES, and that is a real constraint rather than test
      // convenience: MV-155's `unique (case_id, <other>)` is FULL, so two NULL-owner rows sharing
      // the other key column WITHIN one case are still correctly rejected. Only the OWNER-keyed
      // rule has stopped binding — which is precisely the claim, and putting both rows in one case
      // would have tested MV-155's index instead of MV-156's relaxation.
      const caseA = personalCaseOf(userA.id);
      const caseB = personalCaseOf(userB.id);
      const value = table === "user_program_state" ? programB : "medical";
      const insert = (theCase: string): string =>
        table === "user_program_state"
          ? `insert into public.user_program_state (owner, case_id, program_id, status) values (null, '${theCase}', '${value}', 'shortlisted');`
          : `insert into public.document_status (owner, case_id, kind, obtained) values (null, '${theCase}', '${value}', true);`;
      try {
        sql(insert(caseA));
        sql(insert(caseB));
        expect(
          sqlOne(`select count(*) from public.${table}
                   where owner is null and case_id in ('${caseA}','${caseB}') and ${other}='${value}';`),
          `${table}: two NULL-owner rows sharing ${other} must coexist across cases`,
        ).toBe("2");

        // The complement, so the claim is bounded rather than open-ended: a SECOND NULL-owner row
        // for the same pair inside ONE case is still refused, by MV-155's case-keyed unique.
        expect(sqlError(insert(caseA)), `${table}: the case-keyed rule must still bind`).toMatch(
          /duplicate key value violates unique constraint/i,
        );
      } finally {
        sql(`delete from public.${table}
              where owner is null and case_id in ('${caseA}','${caseB}') and ${other}='${value}';`);
      }
    });
  });

  // =====================================================================
  // C — the composite-FK rebase
  // =====================================================================
  describe("chain rebased onto case_id", () => {
    it("both new composite FKs exist and reference unique (id, case_id) — asserted from confkey, not by name", () => {
      // By column pair rather than by constraint name: a rename would not change the guarantee, and
      // a key pointing at the WRONG pair would keep the name while losing it entirely.
      const shape = sql(`
        select c.conrelid::regclass::text || ' (' ||
               (select string_agg(a.attname, ',' order by x.ord)
                  from unnest(c.conkey) with ordinality x(attnum, ord)
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum) ||
               ') -> ' || c.confrelid::regclass::text || ' (' ||
               (select string_agg(a.attname, ',' order by x.ord)
                  from unnest(c.confkey) with ordinality x(attnum, ord)
                  join pg_attribute a on a.attrelid = c.confrelid and a.attnum = x.attnum) || ')'
          from pg_constraint c
         where c.contype = 'f' and array_length(c.conkey, 1) = 2
           and c.conrelid in ('public.application_attempts'::regclass, 'public.outcome_events'::regclass)
         order by 1;
      `);
      expect(shape).toEqual([
        "application_attempts (prediction_id,case_id) -> program_predictions (id,case_id)",
        "application_attempts (prediction_id,owner) -> program_predictions (id,owner)",
        "outcome_events (attempt_id,case_id) -> application_attempts (id,case_id)",
        "outcome_events (attempt_id,owner) -> application_attempts (id,owner)",
      ]);
    });

    it("the three unique (id, case_id) targets exist", () => {
      // Redundant as uniqueness — `id` is already the PK on all three — and that is exactly the
      // role `unique (id, owner)` has played since 20260620000000: a composite-FK target, nothing
      // more. `outcome_events` gets one for the same reason its owner-keyed twin exists (spec §4.9,
      // §10.1 R5), even though nothing references it yet.
      for (const table of ["program_predictions", "application_attempts", "outcome_events"] as const) {
        expect(
          sqlOne(`select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid='public.${table}'::regclass and conname='${table}_id_case_id_key';`),
        ).toBe("UNIQUE (id, case_id)");
      }
    });

    it("each new composite FK has a covering index on its EXACT column pair", () => {
      // `20260620010000_index_application_attempts_composite_fk.sql` exists solely because this was
      // missed once already on this exact chain.
      expect(
        sqlOne(`select indexdef from pg_indexes where schemaname='public'
                 and indexname='application_attempts_prediction_id_case_id_idx';`),
      ).toContain("USING btree (prediction_id, case_id)");
      expect(
        sqlOne(`select indexdef from pg_indexes where schemaname='public'
                 and indexname='outcome_events_attempt_id_case_id_idx';`),
      ).toContain("USING btree (attempt_id, case_id)");
    });

    it("the LEGACY owner chain is retained — it is the only cover for owner-set / case-less rows", () => {
      // Load-bearing, not vestigial: every row a pre-MV-157 writer produces has `case_id` NULL, and
      // under MATCH SIMPLE the case chain enforces nothing for those. MV-160 drops these, AFTER
      // `case_id NOT NULL`, and not before.
      for (const name of [
        "program_predictions_id_owner_key",
        "application_attempts_id_owner_key",
        "outcome_events_id_owner_key",
        "application_attempts_prediction_id_owner_fkey",
        "outcome_events_attempt_id_owner_fkey",
      ]) {
        expect(sql(`select 1 from pg_constraint where conname='${name}';`), `${name} must survive MV-156`).toEqual(["1"]);
      }
    });

    it("the single-column CASCADE FKs survive — they carry the delete semantics the composites do not", () => {
      expect(
        sqlOne(`select confdeltype from pg_constraint
                 where conname='application_attempts_prediction_id_fkey';`),
        "prediction_id must still be ON DELETE CASCADE",
      ).toBe("c");
      expect(
        sqlOne(`select confdeltype from pg_constraint where conname='outcome_events_attempt_id_fkey';`),
        "attempt_id must still be ON DELETE CASCADE",
      ).toBe("c");
    });

    it("REJECTS an attempt whose case_id diverges from its prediction's (23503)", () => {
      // `owner` is left NULL deliberately, so the LEGACY owner chain is trivially satisfied under
      // MATCH SIMPLE and the only constraint that can refuse this is the NEW case chain. Without
      // that isolation the test would pass just as happily against the pre-MV-156 schema.
      const caseB = personalCaseOf(userB.id);
      const predictionOfA = seedOf(userA.id).predictionId;
      const err = sqlError(
        `insert into public.application_attempts (owner, case_id, prediction_id, program_id)
         values (null, '${caseB}', '${predictionOfA}', '${programA}');`,
      );
      expect(err).toMatch(/violates foreign key constraint/i);
      expect(err, "and it must be the CASE chain that refuses it").toContain(
        "application_attempts_prediction_id_case_id_fkey",
      );
    });

    it("REJECTS an outcome event whose case_id diverges from its attempt's (23503)", () => {
      const caseB = personalCaseOf(userB.id);
      const attemptOfA = seedOf(userA.id).attemptId;
      const err = sqlError(
        `insert into public.outcome_events (owner, case_id, attempt_id, event_type, source, occurred_at)
         values (null, '${caseB}', '${attemptOfA}', 'applied', 'self_reported', now());`,
      );
      expect(err).toMatch(/violates foreign key constraint/i);
      expect(err).toContain("outcome_events_attempt_id_case_id_fkey");
    });

    it("ACCEPTS the same rows when the case_id AGREES — the positive control", () => {
      // Without this, an always-failing constraint would pass the two tests above.
      const caseA = personalCaseOf(userA.id);
      const { predictionId } = seedOf(userA.id);
      const attemptId = insertReturningId(
        "application_attempts",
        "(owner, case_id, prediction_id, program_id)",
        `(null, '${caseA}', '${predictionId}', '${programA}')`,
      );
      const eventId = insertReturningId(
        "outcome_events",
        "(owner, case_id, attempt_id, event_type, source, occurred_at)",
        `(null, '${caseA}', '${attemptId}', 'applied', 'self_reported', now())`,
      );
      expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
      sql(`delete from public.outcome_events where id='${eventId}';`);
      sql(`delete from public.application_attempts where id='${attemptId}';`);
    });
  });

  // =====================================================================
  // D — the compensating check bites on exactly the shape it targets
  // =====================================================================
  describe("_ownership_axis_present", () => {
    it("exists, is VALIDATED, and is the DISJUNCT on all eight — never `case_id is not null`", () => {
      // board.json's MV-156 summary still states the rejected flat form (spec §9.5). Asserting the
      // predicate text is what stops a future migration from being written against a name that will
      // never be in the database — or, worse, from shipping the flat form.
      const rows = sql(`
        select conrelid::regclass::text || '|' || convalidated::text || '|' || pg_get_constraintdef(oid)
          from pg_constraint where conname like '%_ownership_axis_present' order by 1;
      `);
      expect(rows).toEqual(
        [...EIGHT]
          .sort()
          .map((t) => `${t}|true|CHECK (((owner IS NOT NULL) OR (case_id IS NOT NULL)))`),
      );
    });

    it.each(EIGHT)("%s: a row with BOTH axes null raises 23514", (table) => {
      const { assessmentId, predictionId, attemptId } = seedOf(userA.id);
      const payload: Record<(typeof EIGHT)[number], string> = {
        profiles: "(owner, case_id) values (null, null)",
        plan_items: "(owner, case_id, kind, impact, title) values (null, null, 'finance', 'high', 'x')",
        user_program_state: `(owner, case_id, program_id, status) values (null, null, '${programA}', 'shortlisted')`,
        documents: "(owner, case_id, kind, file_path, file_size, original_name) values (null, null, 'other', 'x/o.pdf', 1, 'o.pdf')",
        document_status: "(owner, case_id, kind, obtained) values (null, null, 'other', true)",
        program_predictions: `(owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot) values (null, null, '${assessmentId}', '${programA}', 'possible', 'v-axis', '{}'::jsonb)`,
        application_attempts: `(owner, case_id, prediction_id, program_id) values (null, null, '${predictionId}', '${programA}')`,
        outcome_events: `(owner, case_id, attempt_id, event_type, source, occurred_at) values (null, null, '${attemptId}', 'applied', 'self_reported', now())`,
      };
      const err = sqlError(`insert into public.${table} ${payload[table]};`);
      expect(err, `${table}: a row owned by nothing must be refused`).toMatch(/violates check constraint/i);
      expect(err).toContain(`${table}_ownership_axis_present`);
    });
  });

  // =====================================================================
  // E — the pre-MV-157 write shape still succeeds, as BOTH roles
  // =====================================================================
  describe("the live owner-only write path survives the window", () => {
    /**
     * THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT A FLAT `check (case_id is not null)`.
     *
     * The shape below — `owner` set, `case_id` absent — is what `lib/outcomes/on-apply.ts`
     * captureApplication, `lib/outcomes/freeze.ts` and `app/api/outcomes/{prediction,attempt,event}`
     * produce TODAY, and will keep producing until MV-157 deploys. A CHECK is role-independent, so
     * the `service_role` pass is not redundant with the `authenticated` one: it is the pass that
     * proves the outcomes API routes, which run through the admin client, survive this window.
     */
    it("service_role can still write owner-only rows on all three chain tables", async () => {
      const { assessmentId } = seedOf(userB.id);
      const prediction = await admin
        .from("program_predictions")
        .insert({
          owner: userB.id,
          assessment_id: assessmentId,
          program_id: programB,
          verdict: "reach",
          rule_version: "v-svc-only",
          score_snapshot: { total: 20 },
        })
        .select("id")
        .single();
      expect(prediction.error, "program_predictions owner-only insert").toBeNull();

      const attempt = await admin
        .from("application_attempts")
        .insert({ owner: userB.id, prediction_id: prediction.data!.id, program_id: programB })
        .select("id")
        .single();
      expect(attempt.error, "application_attempts owner-only insert").toBeNull();

      const event = await admin
        .from("outcome_events")
        .insert({
          owner: userB.id,
          attempt_id: attempt.data!.id,
          event_type: "applied",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      expect(event.error, "outcome_events owner-only insert").toBeNull();

      // And the rows really did land case-less — the shape the disjunct must tolerate.
      expect(sqlOne(`select case_id is null from public.program_predictions where id='${prediction.data!.id}';`)).toBe("t");

      sql(`delete from public.outcome_events where id='${event.data!.id}';`);
      sql(`delete from public.application_attempts where id='${attempt.data!.id}';`);
      sql(`delete from public.program_predictions where id='${prediction.data!.id}';`);
    });

    it("an authenticated user can still write owner-only rows on all three chain tables", async () => {
      const { assessmentId } = seedOf(userA.id);
      const prediction = await userA.client
        .from("program_predictions")
        .insert({
          owner: userA.id,
          assessment_id: assessmentId,
          program_id: programB,
          verdict: "strong",
          rule_version: "v-auth-only",
          score_snapshot: { total: 80 },
        })
        .select("id")
        .single();
      expect(prediction.error, "program_predictions as authenticated").toBeNull();

      const attempt = await userA.client
        .from("application_attempts")
        .insert({ owner: userA.id, prediction_id: prediction.data!.id, program_id: programB })
        .select("id")
        .single();
      expect(attempt.error, "application_attempts as authenticated").toBeNull();

      const event = await userA.client
        .from("outcome_events")
        .insert({
          owner: userA.id,
          attempt_id: attempt.data!.id,
          event_type: "applied",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      expect(event.error, "outcome_events as authenticated").toBeNull();

      sql(`delete from public.outcome_events where id='${event.data!.id}';`);
      sql(`delete from public.application_attempts where id='${attempt.data!.id}';`);
      sql(`delete from public.program_predictions where id='${prediction.data!.id}';`);
    });
  });

  // =====================================================================
  // F — the MATCH SIMPLE hole, DEMONSTRATED
  // =====================================================================
  describe("the MATCH SIMPLE hole", () => {
    /**
     * The card's headline risk, shown rather than described. Postgres composite FKs default to
     * MATCH SIMPLE: a multi-column key is satisfied WITHOUT ANY LOOKUP when any referencing column
     * is NULL. So with `case_id` nullable the case chain enforces nothing for case-less rows, and
     * the constraint sits in `pg_constraint` looking healthy.
     *
     * Both covers are removed inside a transaction that is ROLLED BACK, following MV-153's
     * precedent that a surprise success must not take the fixture down with it. Two coupled facts
     * fall out, and both belong in the PR body: removing the check re-opens the hole, and the ONLY
     * thing covering owner-set / case-less rows meanwhile is the retained owner chain — which is
     * why MV-160 may not drop that chain before `case_id` is NOT NULL.
     */
    it("accepts a cross-case attempt once BOTH the check and the legacy owner FK are gone", () => {
      const predictionOfA = seedOf(userA.id).predictionId;
      const out = sql(`
        begin;
        alter table public.application_attempts drop constraint application_attempts_ownership_axis_present;
        alter table public.application_attempts drop constraint application_attempts_prediction_id_owner_fkey;
        insert into public.application_attempts (owner, case_id, prediction_id, program_id)
        values (null, null, '${predictionOfA}', '${programA}');
        select 'HOLE-OPEN:' || count(*)::text
          from public.application_attempts
         where owner is null and case_id is null and prediction_id = '${predictionOfA}';
        rollback;
      `);
      // The database ACCEPTED a row owned by nothing, pointing across cases, with no error.
      expect(out, "with both covers removed the hole is wide open").toContain("HOLE-OPEN:1");
    });

    it("and the rollback restored both covers — the fixture is intact", () => {
      // "The demonstration ran" and "the demonstration cleaned up after itself" are different
      // claims. Only this one proves the second, and every later test depends on it.
      for (const name of ["application_attempts_ownership_axis_present", "application_attempts_prediction_id_owner_fkey"]) {
        expect(sql(`select 1 from pg_constraint where conname='${name}';`), `${name} must be back`).toEqual(["1"]);
      }
      // And the hole is shut again, by the check this time.
      const predictionOfA = seedOf(userA.id).predictionId;
      expect(
        sqlError(`insert into public.application_attempts (owner, case_id, prediction_id, program_id)
                  values (null, null, '${predictionOfA}', '${programA}');`),
      ).toContain("application_attempts_ownership_axis_present");
    });
  });

  // =====================================================================
  // G — RLS still fails closed on NULL-owner rows
  // =====================================================================
  describe("relaxing owner opens no read path", () => {
    /**
     * Every policy on these tables is `(select auth.uid()) = owner`. Against a NULL owner that
     * predicate evaluates to NULL, which Postgres refuses exactly like FALSE — so a consultancy-
     * shaped row is invisible to every authenticated client, INCLUDING the student whose personal
     * case it names. That is the intended fail-closed interim posture, not a bug: case-aware access
     * is MV-159's, and a policy written here would be written against no canonical matrix cell.
     */
    it("a NULL-owner row on each of the eight is invisible to authenticated and to anon", async () => {
      const { assessmentId } = seedOf(userA.id);

      // A case with NO `student_user_id` AT ALL — the exact Stage 3 shape this card exists to make
      // storable, and the reason it cannot reuse a personal case: `profiles`, `documents` and
      // `user_program_state` all carry FULL per-case uniques, so `seedNine`'s owner-set rows
      // already occupy those slots in the student's own case. `cases_personal_student_idx` is
      // partial on `organization_id is null` and NULLs are distinct, so a student-less personal
      // case is expressible today.
      const theCase = sqlOne(
        `with ins as (
           insert into public.cases (organization_id, student_user_id, created_by, display_name)
           values (null, null, null, 'MV-156 fail-closed probe ${stamp}')
           returning id
         ) select id from ins;`,
      );

      // Build a complete NULL-owner chain inside one case, so the case-side composite FKs are
      // genuinely satisfied rather than side-stepped.
      const predId = insertReturningId(
        "program_predictions",
        "(owner, case_id, assessment_id, program_id, verdict, rule_version, score_snapshot)",
        `(null, '${theCase}', '${assessmentId}', '${programB}', 'possible', 'v-null-owner', '{}'::jsonb)`,
      );
      const attId = insertReturningId(
        "application_attempts",
        "(owner, case_id, prediction_id, program_id)",
        `(null, '${theCase}', '${predId}', '${programB}')`,
      );
      const evtId = insertReturningId(
        "outcome_events",
        "(owner, case_id, attempt_id, event_type, source, occurred_at)",
        `(null, '${theCase}', '${attId}', 'applied', 'self_reported', now())`,
      );
      const profId = insertReturningId(
        "profiles",
        "(owner, case_id, sections, completeness)",
        `(null, '${theCase}', '{}'::jsonb, 0)`,
      );
      const planId = insertReturningId(
        "plan_items",
        "(owner, case_id, kind, impact, title)",
        `(null, '${theCase}', 'visa', 'low', 'x')`,
      );
      const upsId = insertReturningId(
        "user_program_state",
        "(owner, case_id, program_id, status)",
        `(null, '${theCase}', '${programB}', 'shortlisted')`,
      );
      const docId = insertReturningId(
        "documents",
        "(owner, case_id, kind, file_path, file_size, original_name)",
        `(null, '${theCase}', 'other', 'x/o.pdf', 1, 'o.pdf')`,
      );
      const dsId = insertReturningId(
        "document_status",
        "(owner, case_id, kind, obtained)",
        `(null, '${theCase}', 'other', true)`,
      );

      const targets: Array<[(typeof EIGHT)[number], string]> = [
        ["profiles", profId],
        ["plan_items", planId],
        ["user_program_state", upsId],
        ["documents", docId],
        ["document_status", dsId],
        ["program_predictions", predId],
        ["application_attempts", attId],
        ["outcome_events", evtId],
      ];

      try {
        for (const [table, id] of targets) {
          // The row exists — asserted through service-role/psql, so "zero rows" below cannot be a
          // fixture that never landed.
          expect(sqlOne(`select count(*) from public.${table} where id='${id}';`), `${table} seed`).toBe("1");

          const asOwner = await userA.client.from(table).select("id").eq("id", id);
          expect(asOwner.data ?? [], `${table}: invisible even to the case's own student`).toEqual([]);

          const asAnon = await anon.from(table).select("id").eq("id", id);
          expect(asAnon.data ?? [], `${table}: invisible to anon`).toEqual([]);
        }

        // And it cannot be created through an authenticated client either: `with check` on the
        // insert-granted tables refuses a NULL owner for the same reason (NULL is not TRUE).
        const attempted = await userA.client
          .from("user_program_state")
          .insert({ owner: null, case_id: theCase, program_id: programB, status: "shortlisted" });
        expect(attempted.error?.code, "an authenticated client cannot mint a NULL-owner row").toBeDefined();
      } finally {
        // Children before parents, then the case last: `case_id` is ON DELETE RESTRICT, so the
        // probe case cannot go until every row naming it has.
        sql(`delete from public.outcome_events where id='${evtId}';`);
        sql(`delete from public.application_attempts where id='${attId}';`);
        sql(`delete from public.program_predictions where id='${predId}';`);
        sql(`delete from public.profiles where id='${profId}';`);
        sql(`delete from public.plan_items where id='${planId}';`);
        sql(`delete from public.user_program_state where id='${upsId}';`);
        sql(`delete from public.documents where id='${docId}';`);
        sql(`delete from public.document_status where id='${dsId}';`);
        sql(`delete from public.cases where id='${theCase}';`);
      }
    });
  });

  // =====================================================================
  // H — cascade coverage shrinks, deliberately
  // =====================================================================
  describe("Auth cascade", () => {
    it("still clears an owner-set row, and leaves a NULL-owner row in the same case standing", async () => {
      // The desired semantics (plan line 514): deleting a student's Auth account must not delete a
      // consultancy case's data. The consequence — MV-05's right-to-delete and Stage 6's case
      // deletion can no longer use the Auth cascade as their sweep — is recorded on the card.
      const userC = await mint("c");
      seeds.set(userC.id, await seedNine(userC.id, programA));
      backfill();
      const theCase = personalCaseOf(userC.id);

      const ownedPlanId = sqlOne(`select id from public.plan_items where owner='${userC.id}' limit 1;`);
      const orphanPlanId = insertReturningId(
        "plan_items",
        "(owner, case_id, kind, impact, title)",
        `(null, '${theCase}', 'visa', 'low', 'consultancy row')`,
      );

      await admin.auth.admin.deleteUser(userC.id);

      expect(sqlOne(`select count(*) from public.plan_items where id='${ownedPlanId}';`), "owner-set row cascades away").toBe(
        "0",
      );
      expect(sqlOne(`select count(*) from public.plan_items where id='${orphanPlanId}';`), "NULL-owner row survives").toBe("1");

      sql(`delete from public.plan_items where id='${orphanPlanId}';`);
      sql(`delete from public.cases where id='${theCase}';`);
    });
  });

  // =====================================================================
  // I — the predictions immutability trigger survived the DDL
  // =====================================================================
  describe("program_predictions immutability", () => {
    it("still raises on an UPDATE, for service_role too", () => {
      // DDL does not fire row-level triggers, so nothing in MV-156 should have touched this — but
      // "should not have" and "did not" are different claims. `private.reject_prediction_update()`
      // is SECURITY INVOKER precisely so `service_role` does not bypass it; psql runs as `postgres`,
      // which is the strongest role available and therefore the strictest test of that property.
      const predictionId = seedOf(userA.id).predictionId;
      expect(sqlError(`update public.program_predictions set verdict='strong' where id='${predictionId}';`)).toMatch(
        /program_predictions is immutable/i,
      );
    });
  });

  // =====================================================================
  // J — the replacement uniques are FULL, and the live upserts still infer them
  // =====================================================================
  describe("ON CONFLICT inference on the replaced primary keys", () => {
    /**
     * THE FINDING THIS CARD SHIPPED A CORRECTION FOR. The card and spec §4.4/§4.6 both prescribe
     * `unique index … where owner is not null` as the replacement for the dropped composite PKs.
     * That form is UNEXECUTABLE against the live code: Postgres infers a PARTIAL unique index as an
     * `ON CONFLICT` arbiter only when the statement supplies the index predicate, and PostgREST's
     * `on_conflict=` emits a bare column list. It is the same failure spec §4 rule 1 already records
     * for the case-keyed indexes, arriving on the owner axis.
     *
     * The predicate was never load-bearing — NULLs are distinct in a unique index, so the FULL form
     * permits unlimited NULL-owner rows anyway (proved in §B above).
     */
    it("neither replacement unique carries a predicate", () => {
      for (const name of ["user_program_state_owner_program_idx", "document_status_owner_kind_idx"]) {
        const def = sqlOne(`select indexdef from pg_indexes where schemaname='public' and indexname='${name}';`);
        expect(def, `${name} must be UNIQUE`).toContain("CREATE UNIQUE INDEX");
        expect(def, `${name} is an ON CONFLICT arbiter for live pre-MV-157 code and MUST NOT be partial`).not.toContain(
          "WHERE",
        );
      }
    });

    it("setObtained's bare on_conflict still resolves — the LIVE authenticated path", async () => {
      // `app/api/documents/status/route.ts` → `lib/documents/status-repo.ts:36` drives exactly this
      // through the AUTHENTICATED client today. A partial replacement index takes the document
      // checklist down with 42P10 the day MV-156 applies — not at some future flip.
      // `oshc` rather than the seeded `passport`, so the first call genuinely exercises the INSERT
      // branch — the branch that raises 42P10 at PLAN time with no row present.
      const first = await userA.client
        .from("document_status")
        .upsert({ owner: userA.id, kind: "oshc", obtained: true }, { onConflict: "owner,kind" });
      expect(first.error?.code, "first call — the INSERT branch must not raise 42P10").not.toBe("42P10");
      expect(first.error, "first call must succeed outright").toBeNull();

      const second = await userA.client
        .from("document_status")
        .upsert({ owner: userA.id, kind: "oshc", obtained: false }, { onConflict: "owner,kind" });
      expect(second.error, "second call — the DO UPDATE branch").toBeNull();

      expect(
        sqlOne(`select count(*) from public.document_status where owner='${userA.id}' and kind='oshc';`),
        "the upsert must have merged, not duplicated",
      ).toBe("1");
      sql(`delete from public.document_status where owner='${userA.id}' and kind='oshc';`);
    });

    it("upsertProgramState's bare on_conflict still resolves", async () => {
      // `lib/matches/repo.ts:28`. Driven through the service-role client here because
      // `app/api/shortlist/route.ts` still does (spec §4.4, corrected 2026-08-03); MV-157 flips it.
      //
      // Cleared first so the first call is genuinely the INSERT branch regardless of what earlier
      // blocks in this file left behind — that is the branch 42P10 fires on.
      sql(`delete from public.user_program_state where owner='${userB.id}' and program_id='${programB}';`);
      const first = await admin
        .from("user_program_state")
        .upsert({ owner: userB.id, program_id: programB, status: "shortlisted" }, { onConflict: "owner,program_id" });
      expect(first.error, "first call").toBeNull();
      const second = await admin
        .from("user_program_state")
        .upsert({ owner: userB.id, program_id: programB, status: "applied" }, { onConflict: "owner,program_id" });
      expect(second.error, "second call").toBeNull();
      expect(
        sqlOne(`select count(*) from public.user_program_state where owner='${userB.id}' and program_id='${programB}';`),
      ).toBe("1");
      sql(`delete from public.user_program_state where owner='${userB.id}' and program_id='${programB}';`);
    });

    it("COUNTERFACTUAL: the partial form really does raise 42P10 against a bare column list", () => {
      // The positive tests above are green against BOTH designs if the live code happens not to run,
      // so they are paired with the counterfactual that shows the rejected shape genuinely fails.
      // Same idiom as MV-155's 42P10 block. Scratch table, dropped in `finally`.
      const scratch = `mv156_arbiter_${stamp}`;
      try {
        sql(`create table public.${scratch} (id uuid primary key default gen_random_uuid(), owner uuid, kind text);
             create unique index ${scratch}_partial on public.${scratch} (owner, kind) where owner is not null;`);
        const err = sqlError(
          `insert into public.${scratch} (owner, kind) values (gen_random_uuid(), 'ielts')
           on conflict (owner, kind) do update set kind = excluded.kind;`,
        );
        expect(err, "a PARTIAL unique is not inferrable from a bare column list").toMatch(
          /no unique or exclusion constraint matching the ON CONFLICT specification/i,
        );

        // And the same statement against the FULL form succeeds — both directions, as spec §4
        // rule 1 was established.
        sql(`drop index public.${scratch}_partial;
             create unique index ${scratch}_full on public.${scratch} (owner, kind);`);
        sql(`insert into public.${scratch} (owner, kind) values (gen_random_uuid(), 'ielts')
             on conflict (owner, kind) do update set kind = excluded.kind;`);
        expect(sqlOne(`select count(*) from public.${scratch};`)).toBe("1");
      } finally {
        sql(`drop table if exists public.${scratch};`);
      }
    });
  });

  // =====================================================================
  // K — MV-155's reconciliation still holds after the relaxation
  // =====================================================================
  describe("MV-155's invariant survives", () => {
    it("private.mv155_assert_case_backfill() is still clean", () => {
      // The detector is cross-table and cannot be a CHECK, so it is the only thing that would catch
      // a relaxation that accidentally detached an owned row from its case.
      expect(() => sql("select private.mv155_assert_case_backfill();")).not.toThrow();
    });
  });
});
