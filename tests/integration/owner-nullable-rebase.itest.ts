/**
 * MV-156 — `owner` nullable on the eight, and the predictions→attempts→outcome_events chain
 * re-based onto `case_id`, against a REAL local Postgres with the real migrations applied.
 *
 * WHY THIS SUITE IS THE PROOF. Every guarantee this card makes is a property of a live Postgres:
 * a column's nullability, which index a planner will accept as an `ON CONFLICT` arbiter, whether a
 * MATCH SIMPLE composite key actually bites, and whether a policy still fails closed once the column
 * it keys on can be NULL. `npm test` cannot observe any of them — jsdom has no database.
 *
 * ---------------------------------------------------------------------------------------------
 * MV-160 NARROWED THIS SUITE, AND THE NARROWING IS ITSELF THE RECORD OF WHAT MV-156 OWNED ONLY
 * FOR THE DURATION OF THE NULLABLE-`case_id` WINDOW.
 *
 * MV-156 relaxed `owner` and rebased the chain onto `case_id` while `case_id` was still NULLABLE.
 * Four of this suite's original five headline properties were properties OF THAT WINDOW, and
 * `20260805140000_stage2_tighten_case_mandatory.sql` closes it: `case_id` is NOT NULL on all
 * eight, all eight `_ownership_axis_present` checks are gone, the legacy owner chain
 * (`*_id_owner_key` + the two `*_owner_fkey` composites) is gone, and the seven superseded
 * owner-keyed uniques are gone. Blocks §D (the compensating check), §F (the MATCH SIMPLE
 * demonstration), §C's "legacy chain retained" and §J's owner-keyed arbiter positives asserted
 * exactly those objects, so they were RETIRED here rather than rewritten — MV-160's own suite
 * (`stage2-tighten.itest.ts`) asserts each of them is ABSENT, and `case-backfill.itest.ts` §E
 * carries the surviving FULL-arbiter rule on the case axis, which is the axis live code now uses
 * (`onConflict: "case_id,kind"` / `"case_id,program_id"`).
 *
 * WHAT REMAINS IS MV-156'S OWN, AND MOST OF IT IS NOW *MORE* TRUE THAN WHEN IT WAS WRITTEN:
 *
 *  1. **`owner` IS STILL NULLABLE on the eight.** MV-160 dropped no column and relaxed nothing
 *     back. §A reads it from `information_schema`, per table.
 *  2. **The surrogate-`id` PRIMARY KEYs stand.** §B — `owner` is not a key column of any PK, and
 *     nothing ever pointed at the composite PKs that were replaced.
 *  3. **The case-side composite FKs `(prediction_id, case_id)` / `(attempt_id, case_id)` NOW
 *     ACTUALLY BITE.** They were MATCH-SIMPLE-skippable for any case-less row throughout the
 *     window; with `case_id` NOT NULL no row can skip them, so §C's two cross-case rejections are
 *     the only remaining cover for the chain and are strictly stronger than before.
 *  4. **Relaxing `owner` opens no read path.** §G seeds a NULL-owner row on each of the eight,
 *     inside a case NO ACTOR IS LINKED TO, and asserts every authenticated and anonymous read
 *     returns zero. Under MV-159/MV-160 this is a cross-tenant denial cell of the canonical
 *     access matrix, not the interim fail-closed posture it was written as.
 *  5. **The Auth cascade shrank deliberately** (§H) and **`program_predictions` is still
 *     immutable to `postgres` AND `service_role`** (§I — MV-160 step (i) restored the trigger's
 *     unconditional body, so this is now the guarantee's only live cover in this file).
 * ---------------------------------------------------------------------------------------------
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
   * Seed the CURRENT row shape — `owner` set AND `case_id` set — in each of the nine.
   * Service-role, because four of the nine hold no authenticated INSERT grant and this is fixture
   * construction, never an assertion.
   *
   * MV-160 CHANGED THIS FIXTURE, AND ONLY THIS FIXTURE. It used to seed the PRE-MIGRATION shape —
   * `owner` set, `case_id` UNTOUCHED — which is the shape MV-160 step (b) makes unrepresentable on
   * the eight (23502) and step (c) makes unrepresentable on an OWNED `assessments` row (23514, via
   * `assessments_case_required_when_owned`). The caller therefore mints the personal case FIRST
   * (`private.mv155_backfill_personal_cases()`) and passes it in.
   *
   * `user_program_state` and `document_status` would derive it anyway — MV-155 §6a's seam trigger
   * fires `when (new.owner is not null)` and OVERWRITES whatever the statement supplied — but the
   * derivation only works once the personal case exists, which is the same precondition. Passing it
   * on all nine keeps one rule rather than two.
   */
  const seedNine = async (owner: string, caseId: string, programId: string): Promise<Seed> => {
    const svc = async <T>(
      what: string,
      p: PromiseLike<{ data: T; error: { message: string } | null }>,
    ): Promise<NonNullable<T>> => {
      const { data, error } = await p;
      if (error) throw new Error(`fixture seed failed (${what}): ${error.message}`);
      if (data === null || data === undefined) throw new Error(`fixture seed failed (${what}): no row returned`);
      return data as NonNullable<T>;
    };

    await svc(
      "profiles",
      admin.from("profiles").insert({ owner, case_id: caseId, sections: {}, completeness: 10 }).select("id").single(),
    );

    const assessment = await svc(
      "assessments",
      admin
        .from("assessments")
        .insert({
          owner,
          case_id: caseId,
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
        .insert({ owner, case_id: caseId, kind: "english", impact: "high", title: "Sit IELTS", status: "todo" })
        .select("id")
        .single(),
    );
    await svc(
      "user_program_state",
      admin
        .from("user_program_state")
        .insert({ owner, case_id: caseId, program_id: programId, status: "shortlisted" })
        .select("id")
        .single(),
    );
    await svc(
      "documents",
      admin
        .from("documents")
        .insert({
          owner,
          case_id: caseId,
          kind: "passport",
          file_path: `${owner}/passport/p.pdf`,
          file_size: 10,
          original_name: "p.pdf",
        })
        .select("id")
        .single(),
    );
    await svc(
      "document_status",
      admin.from("document_status").insert({ owner, case_id: caseId, kind: "passport", obtained: true }).select("id").single(),
    );

    const prediction = await svc(
      "program_predictions",
      admin
        .from("program_predictions")
        .insert({
          owner,
          case_id: caseId,
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
        .insert({ owner, case_id: caseId, prediction_id: prediction.id, program_id: programId })
        .select("id")
        .single(),
    );
    const event = await svc(
      "outcome_events",
      admin
        .from("outcome_events")
        .insert({
          owner,
          case_id: caseId,
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

    // MV-160 INVERTED THIS ORDER, and the inversion is the whole fixture change in this file.
    // The backfill used to run AFTER `seedNine`, because the pre-tighten shape was "seed owner-only
    // rows, then watch MV-155 attach a case to them". Post-MV-160 that shape cannot be written at
    // all — `case_id` is NOT NULL on the eight and `assessments_case_required_when_owned` refuses an
    // OWNED case-less assessment — so the case has to exist BEFORE the first insert.
    //
    // `private.mv155_backfill_personal_cases()` mints one personal case per Auth user regardless of
    // whether that user owns any rows yet, so calling it here (rather than a hand-rolled
    // `insert into public.cases`) keeps the fixture on the same code path production uses.
    backfill();
    seeds.set(userA.id, await seedNine(userA.id, personalCaseOf(userA.id), programA));
    seeds.set(userB.id, await seedNine(userB.id, personalCaseOf(userB.id), programA));
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
      //
      // MV-160 WEAKENED THE FIRST HALF AND LEFT THE SECOND INTACT. `<table>_owner_<other>_idx` is
      // dropped outright by step (h), so "the owner-keyed rule has stopped binding" is now vacuous
      // rather than a NULL-distinctness result. It is kept because the COMPLEMENT below is not
      // vacuous: it is the live assertion that MV-155's case-keyed unique — the arbiter the current
      // `onConflict: "case_id,<other>"` call sites infer — still binds on `owner IS NULL` rows,
      // which are the Stage 3 consultancy shape this whole card exists to make storable.
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
      //
      // NARROWED BY MV-160, NOT WEAKENED. This used to expect FOUR rows — the two case-side keys
      // below plus `application_attempts (prediction_id,owner) -> program_predictions (id,owner)`
      // and `outcome_events (attempt_id,owner) -> application_attempts (id,owner)`. Those two are
      // the LEGACY owner chain, dropped by MV-160 step (f) once step (b) made `case_id` NOT NULL,
      // and their absence is asserted by `stage2-tighten.itest.ts`. The pair that remains is the
      // pair MV-156 added, and it is now the chain's ONLY cover — which is why this list is exact
      // rather than a `toContain`: a third key reappearing here is a finding.
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
        "outcome_events (attempt_id,case_id) -> application_attempts (id,case_id)",
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

    // RETIRED BY MV-160 — "the LEGACY owner chain is retained — it is the only cover for owner-set /
    // case-less rows". It pinned `program_predictions_id_owner_key`,
    // `application_attempts_id_owner_key`, `outcome_events_id_owner_key`,
    // `application_attempts_prediction_id_owner_fkey` and `outcome_events_attempt_id_owner_fkey` as
    // PRESENT, and its own comment named the condition on which it expires: "MV-160 drops these,
    // AFTER `case_id NOT NULL`, and not before." Steps (b), (f) and (g) of
    // `20260805140000_stage2_tighten_case_mandatory.sql` are exactly that, in exactly that order.
    // The population it covered — owner-set / case-less rows — is now unrepresentable, so this is a
    // property of the closed window and not an access-control cell. Its inverse (all five ABSENT)
    // is asserted by `stage2-tighten.itest.ts`; the guarantee it stood in for is asserted by the two
    // cross-case rejections below, which no longer have a MATCH SIMPLE escape.

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
      //
      // POST-MV-160 THE ISOLATION IS FREE — the legacy chain is gone entirely — but the NULL `owner`
      // is kept because it is now the interesting shape rather than the neutral one: a Stage 3
      // consultancy row carries no owner at all, and this is the assertion that the case chain, on
      // its own, refuses to hang such a row off another case's prediction.
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
  // D — RETIRED IN FULL BY MV-160
  // =====================================================================
  // The block was `describe("_ownership_axis_present")` and held two tests:
  //
  //   * "exists, is VALIDATED, and is the DISJUNCT on all eight — never `case_id is not null`"
  //   * `it.each(EIGHT)("%s: a row with BOTH axes null raises 23514")`
  //
  // Both named `<table>_ownership_axis_present` directly. MV-160 step (e) DROPS all eight, and its
  // own header states why the drop is safe rather than convenient: step (b) has just made
  // `case_id NOT NULL` on exactly those eight, so the disjunct's right branch is unconditionally
  // true and a check that can never fire is a constraint the next author plans around. This is the
  // definition of a property of the nullable window.
  //
  // NEITHER ASSERTION LOSES A GUARANTEE, and both replacements are stronger:
  //   * the constraint's absence is asserted by `stage2-tighten.itest.ts`, which also names any
  //     survivor rather than just counting;
  //   * "a row owned by nothing must be refused" is now enforced by the column itself — a both-axes-
  //     null insert raises 23502 on `case_id`, role-independently and with no CHECK to drop — and
  //     that is asserted table-by-table by MV-160's own suite. A 23514-and-this-constraint-name
  //     assertion here would now be testing an object that does not exist.

  // =====================================================================
  // E — the owner-only write path, after MV-160 closed the window
  // =====================================================================
  describe("the owner-only chain write path", () => {
    // RETIRED BY MV-160 — "service_role can still write owner-only rows on all three chain tables".
    // It inserted `owner` set / `case_id` ABSENT into program_predictions, application_attempts and
    // outcome_events as `service_role` and asserted all three SUCCEED, then asserted the prediction
    // "really did land case-less — the shape the disjunct must tolerate". Every one of those inserts
    // now raises 23502 by construction: MV-160 step (b) made `case_id` NOT NULL on all three.
    //
    // It is a window property in the most literal sense available — its own docblock scopes it
    // ("what … produce TODAY, and will keep producing until MV-157 deploys") and MV-157 has since
    // routed all three writers through `lib/cases/dual-write.ts`, which writes `case_id`
    // unconditionally and has no owner-only fallback. It is NOT an access-control cell: it asserted
    // a SCHEMA tolerance for a row shape, as the one role that bypasses RLS entirely, and the
    // service-role write path itself is unchanged — only the shape it must send is.

    /**
     * INVERTED BY MV-159, AND THE INVERSION IS THE POINT OF THE TEST NOW.
     *
     * This read "an authenticated user can still write owner-only rows on all three chain
     * tables", and it was true and necessary for the MV-156 → MV-157 window: the compensating
     * `_ownership_axis_present` disjunct had to tolerate an owner-set / case-less row because
     * that is what every live chain writer produced. **That window has closed on both ends.**
     * MV-157 routed every chain insert through `lib/cases/dual-write.ts`, which writes `case_id`
     * unconditionally and has no owner-only fallback (`caseWriteColumns` returning null makes the
     * caller return null, it does not degrade); and MV-159's `pp_insert_case` / `aa_insert_case` /
     * `oe_insert_case` re-assert CASE parentage —
     * `private.assessment_case_id(assessment_id) = case_id` (matrix spec §4.7-§4.9). A child with
     * a NULL `case_id` compares NULL against any parent, and a WITH CHECK admits a row only on
     * TRUE, so an authenticated client can no longer create one.
     *
     * `=` rather than `is not distinct from` is deliberate and is what closes a hole the legacy
     * policy's `a.owner = uid` used to close: an unclaimed ANONYMOUS assessment is
     * `owner NULL, case_id NULL` and its id travels in a shareable URL, so a NULL-tolerant
     * comparison would let any signed-in client hang a prediction-of-record off a stranger's
     * assessment.
     *
     * WHAT MV-156 ACTUALLY OWNED HERE WAS THE SCHEMA'S TOLERANCE OF AN OWNER-ONLY CHAIN ROW, and
     * MV-160 step (b) has now withdrawn it: `case_id` is NOT NULL on all three chain tables, so the
     * refusal below is over-determined — the policy refuses it first (PostgreSQL evaluates RLS
     * `WITH CHECK` before `ExecConstraints`), and the column would refuse it anyway.
     *
     * THE TEST IS KEPT BECAUSE ITS SECOND HALF IS AN ACCESS-CONTROL CELL, NOT A WINDOW PROPERTY:
     * the same actor, on the same three tables, CAN still write the case-scoped shape. That is the
     * positive control which stops the refusal above from being satisfied by a dead policy, a
     * missing grant, or MV-160 having over-tightened the chain — and it is the one assertion in
     * this file that exercises MV-160's re-created `pp_insert_case` / `aa_insert_case` /
     * `oe_insert_case` end to end as a real authenticated student.
     */
    it("no longer lets an AUTHENTICATED client write an owner-only chain row — MV-159's case parentage", async () => {
      const { assessmentId } = seedOf(userA.id);
      const prediction = await userA.client.from("program_predictions").insert({
        owner: userA.id,
        assessment_id: assessmentId,
        program_id: programB,
        verdict: "strong",
        rule_version: "v-auth-only",
        score_snapshot: { total: 80 },
      });
      expect(prediction.error?.code, "a case-less prediction has no case parentage to prove").toBe("42501");
      expect(prediction.error?.message, "refused by the POLICY, not by a grant").toMatch(/row-level security policy/i);

      // The same actor CAN write the case-scoped shape — so the refusal above is a boundary, not
      // a dead policy. `case_id` must match the parent assessment's, which the backfill guarantees.
      const caseId = sqlOne(
        `select case_id::text from public.assessments where id = '${assessmentId}';`,
      );
      expect(caseId, "HARNESS DEFECT: the seeded assessment carries no case").not.toBe("");
      const scoped = await userA.client
        .from("program_predictions")
        .insert({
          owner: userA.id,
          case_id: caseId,
          assessment_id: assessmentId,
          program_id: programB,
          verdict: "strong",
          rule_version: "v-auth-cased",
          score_snapshot: { total: 80 },
        })
        .select("id")
        .single();
      expect(scoped.error, `the case-scoped shape must still be writable: ${scoped.error?.message}`).toBeNull();

      const attempt = await userA.client
        .from("application_attempts")
        .insert({ owner: userA.id, case_id: caseId, prediction_id: scoped.data!.id, program_id: programB })
        .select("id")
        .single();
      expect(attempt.error, `application_attempts as authenticated: ${attempt.error?.message}`).toBeNull();

      const event = await userA.client
        .from("outcome_events")
        .insert({
          owner: userA.id,
          case_id: caseId,
          attempt_id: attempt.data!.id,
          event_type: "applied",
          source: "self_reported",
          occurred_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      expect(event.error, `outcome_events as authenticated: ${event.error?.message}`).toBeNull();

      sql(`delete from public.outcome_events where id='${event.data!.id}';`);
      sql(`delete from public.application_attempts where id='${attempt.data!.id}';`);
      sql(`delete from public.program_predictions where id='${scoped.data!.id}';`);
    });
  });

  // =====================================================================
  // F — RETIRED IN FULL BY MV-160
  // =====================================================================
  // The block was `describe("the MATCH SIMPLE hole")` and held two tests:
  //
  //   * "accepts a cross-case attempt once BOTH the check and the legacy owner FK are gone"
  //   * "and the rollback restored both covers — the fixture is intact"
  //
  // It DEMONSTRATED the hole rather than describing it: inside a rolled-back transaction it dropped
  // `application_attempts_ownership_axis_present` and
  // `application_attempts_prediction_id_owner_fkey`, inserted `(owner null, case_id null,
  // prediction_id <A's>)`, and showed the database accepted a row owned by nothing that pointed
  // across cases.
  //
  // THE HOLE IT DEMONSTRATED NO LONGER EXISTS, and neither do the two objects it dropped — MV-160
  // step (e) drops the check and step (f) drops the FK, so both `alter table` statements now raise
  // 42704 and take the fixture with them. MATCH SIMPLE only skips a composite key when a REFERENCING
  // COLUMN IS NULL; `case_id` is NOT NULL on all three chain tables after step (b), so
  // `(prediction_id, case_id)` and `(attempt_id, case_id)` can no longer be skipped by any row that
  // can be written. That is a property of the closed window in both directions: the hole was real
  // ONLY while `case_id` was nullable, and this is the migration that made it nullable no longer.
  //
  // WHAT REPLACES IT IS STRICTLY STRONGER AND IS ALREADY IN THIS FILE — §C's two cross-case
  // rejections ("REJECTS an attempt whose case_id diverges from its prediction's" and its
  // outcome_events twin). Those used to be the weak half of this pair, provable only because the
  // test hand-picked a non-NULL `case_id`; they are now the general case. `stage2-tighten.itest.ts`
  // additionally pins that the case-side FKs BITE, which is the claim this block existed to make
  // conditional.

  // =====================================================================
  // G — RLS still fails closed on NULL-owner rows
  // =====================================================================
  describe("relaxing owner opens no read path", () => {
    /**
     * THE MECHANISM CHANGED UNDER THIS BLOCK TWICE; THE ASSERTIONS DID NOT, AND THEY ARE NOT
     * TOUCHED HERE. Recording both readings because the difference is what makes this a matrix cell
     * rather than a window property.
     *
     * AS WRITTEN (MV-156): every policy on these tables was `(select auth.uid()) = owner`. Against
     * a NULL owner that predicate evaluates to NULL, which Postgres refuses exactly like FALSE, so
     * the row was invisible to everyone — the intended fail-closed INTERIM posture.
     *
     * AS IT READS NOW (MV-159 + MV-160): every policy is
     * `case_id is not null and case_id = any (private.actor_case_ids())`, with the transitional
     * `owner = (select auth.uid())` disjunct removed by MV-160 step (d). The probe case below is
     * minted with `student_user_id` NULL and NO assignment, so it is in no actor's
     * `actor_case_ids()` and the eight rows stay invisible — now by CASE-TENANCY, which is the
     * canonical access matrix's cross-tenant denial cell, and no longer by an interim accident of
     * NULL comparison. `anon`, which holds no grant on any of the eight, is refused before any
     * policy is consulted, exactly as before.
     *
     * So the emptiness this block asserts is load-bearing under BOTH regimes, and it is precisely
     * the assertion that would go red if MV-160's policy rewrite had widened a USING clause. It
     * stays as it is.
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

      // A REFUSED QUERY AND AN EMPTY RESULT ARE DIFFERENT FACTS, and the first draft of this block
      // collapsed them: `expect(result.data ?? [], …).toEqual([])` is satisfied by a transport
      // failure, a typo in the table name, a dropped table, or a 42501, exactly as well as by RLS
      // doing its job. A fail-closed assertion that passes when the query never ran is not
      // fail-closed — it is unfalsifiable. Each leg below therefore says which mechanism it saw.
      //
      // The two roles legitimately fail closed by DIFFERENT mechanisms, which is why they are not
      // asserted identically — and the anon half is the reason this rewrite is not cosmetic.
      //
      //   * `authenticated` HOLDS a SELECT grant on all eight, so PostgREST runs the query and RLS
      //     FILTERS the row out. The correct outcome is `error === null` AND zero rows; an error
      //     there would mean something other than the policy produced the emptiness.
      //   * `anon` holds no grant at all (spec §4, "anon = —"), so the request is REFUSED before
      //     any policy is consulted. MEASURED against this stack on 2026-08-03: all eight return
      //     **HTTP 401 / 42501**, never an empty array. So the old `expect(data ?? [], …)
      //     .toEqual([])` on this leg was passing on the `?? []` and asserting nothing about
      //     visibility — it would have passed identically against a dropped table or a typo'd
      //     name. The denial is real, but the test was not proving it.
      //
      // Both mechanisms are fail-closed. The test now records WHICH it saw and rejects an
      // unexpected error code either way, rather than accepting any falsy result as success.
      const GRANT_OR_RLS_DENIAL = ["42501", "PGRST301", "PGRST116", "PGRST205"];
      const anonMechanism: string[] = [];

      try {
        for (const [table, id] of targets) {
          // The row exists — asserted through service-role/psql, so "zero rows" below cannot be a
          // fixture that never landed.
          expect(sqlOne(`select count(*) from public.${table} where id='${id}';`), `${table} seed`).toBe("1");

          const asOwner = await userA.client.from(table).select("id").eq("id", id);
          expect(
            asOwner.error,
            `${table}: the owner's read must be FILTERED by RLS, not REJECTED — an error here means the emptiness below proves nothing about the policy (got ${asOwner.error?.code}: ${asOwner.error?.message})`,
          ).toBeNull();
          expect(asOwner.data, `${table}: invisible even to the case's own student`).toEqual([]);

          const asAnon = await anon.from(table).select("id").eq("id", id);
          if (asAnon.error) {
            expect(
              GRANT_OR_RLS_DENIAL,
              `${table}: anon was refused, but not by a grant/RLS denial — code ${asAnon.error.code}: ${asAnon.error.message}`,
            ).toContain(asAnon.error.code);
            expect(asAnon.data ?? [], `${table}: a refused anon read must also carry no rows`).toEqual([]);
            anonMechanism.push(`${table}=refused(${asAnon.error.code})`);
          } else {
            expect(asAnon.data, `${table}: invisible to anon`).toEqual([]);
            anonMechanism.push(`${table}=empty`);
          }
        }

        // Whichever mechanism fired, it fired for all eight — a table that behaved differently from
        // its seven siblings is a finding, not a detail, and this is what surfaces it in the log.
        expect(anonMechanism, "anon fail-closed mechanism, per table").toHaveLength(targets.length);

        // And it cannot be created through an authenticated client either. As written the reason was
        // "`with check` refuses a NULL owner, NULL is not TRUE"; under MV-160's `ups_insert_case` the
        // reason is the CASE axis — `case_id = any (private.actor_case_ids())` is FALSE for a case
        // this actor has no link to — and MV-160's retained owner-axis bound
        // (`owner is null or owner = private.case_student_id(case_id)`) is a second, independent
        // refusal. The assertion is unchanged because it is the same cell either way: an
        // authenticated client may not mint a row into a case that is not theirs.
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
      // MV-160: same inversion as the shared `beforeAll` — the personal case must exist BEFORE the
      // first insert, because `case_id` is NOT NULL on the eight from step (b).
      backfill();
      const theCase = personalCaseOf(userC.id);
      seeds.set(userC.id, await seedNine(userC.id, theCase, programA));

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
    it("still raises on an UPDATE, as postgres AND as service_role", async () => {
      // DDL does not fire row-level triggers, so nothing in MV-156 should have touched this — but
      // "should not have" and "did not" are different claims.
      const predictionId = seedOf(userA.id).predictionId;

      // As `postgres` — a superuser, the strongest role available.
      expect(sqlError(`update public.program_predictions set verdict='strong' where id='${predictionId}';`)).toMatch(
        /program_predictions is immutable/i,
      );

      // And as `service_role` through PostgREST, which is the assertion that actually pins the
      // property `20260620000000` exists to guarantee: the guard is SECURITY INVOKER, so
      // service_role's BYPASSRLS buys it nothing here. A regression to SECURITY DEFINER, or a
      // "fix" shaped as a policy, would be invisible to the postgres-only probe above.
      const viaServiceRole = await admin
        .from("program_predictions")
        .update({ verdict: "strong" })
        .eq("id", predictionId);
      expect(viaServiceRole.error?.message, "service_role must NOT bypass the immutability trigger").toMatch(
        /program_predictions is immutable/i,
      );

      // Untouched by either attempt.
      expect(sqlOne(`select verdict from public.program_predictions where id='${predictionId}';`)).toBe("possible");
    });
  });

  // =====================================================================
  // J — the "a partial arbiter is not inferrable" rule, on a scratch table
  // =====================================================================
  describe("ON CONFLICT inference", () => {
    /**
     * THE FINDING THIS CARD SHIPPED A CORRECTION FOR. The card and spec §4.4/§4.6 both prescribed
     * `unique index … where owner is not null` as the replacement for the dropped composite PKs.
     * That form is UNEXECUTABLE against live code: Postgres infers a PARTIAL unique index as an
     * `ON CONFLICT` arbiter only when the statement supplies the index predicate, and PostgREST's
     * `on_conflict=` emits a bare column list. It is the same failure spec §4 rule 1 already records
     * for the case-keyed indexes, arriving on the owner axis.
     *
     * THREE OWNER-AXIS TESTS WERE RETIRED FROM THIS BLOCK BY MV-160, and the rule they enforced is
     * NOT retired with them — it moved axes along with the live code:
     *
     *   * "neither replacement unique carries a predicate" — read `indexdef` for
     *     `user_program_state_owner_program_idx` and `document_status_owner_kind_idx`. MV-160 step
     *     (h) DROPS both by name (each superseded by MV-155's case-keyed mirror), so `sqlOne` now
     *     finds no row and throws.
     *   * "setObtained's bare on_conflict still resolves — the LIVE authenticated path" and
     *     "upsertProgramState's bare on_conflict still resolves" — both drove
     *     `{ onConflict: "owner,kind" }` / `{ onConflict: "owner,program_id" }`. Those arbiters no
     *     longer exist, so both would raise the very 42P10 they were written to exclude. Crucially
     *     they no longer describe live code either: `lib/documents/status-repo.ts` now sends
     *     `{ onConflict: "case_id,kind" }` and `lib/matches/repo.ts` `{ onConflict:
     *     "case_id,program_id" }` (MV-157). Their replacements — the same two upserts, against the
     *     case-keyed FULL arbiters, executed twice so the INSERT and DO UPDATE branches are both
     *     reached — live in `case-backfill.itest.ts` §E and `case-data-access.itest.ts`.
     *
     * What is KEPT below is the counterfactual, because it is the half that is axis-independent: it
     * proves on a scratch table that the PARTIAL shape genuinely fails and the FULL shape genuinely
     * succeeds, which is the rule that governs the case-keyed arbiters live code now infers. It
     * touches none of the nine tables and nothing MV-160 changed.
     */
    it("COUNTERFACTUAL: the partial form really does raise 42P10 against a bare column list", () => {
      // A positive test is green against BOTH designs if the live code happens not to run, so it is
      // paired with the counterfactual that shows the rejected shape genuinely fails.
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
