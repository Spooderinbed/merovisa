/**
 * MV-160 §A1 — SYNTHETIC before/after data equivalence. The permanent CI half of the
 * Stage 2 exit gate.
 *
 * Run locally:
 *   npx supabase start
 *   npm run test:integration
 *
 * ---------------------------------------------------------------------------------------
 * THIS SUITE NEVER SKIPS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 * There is no `describe.skipIf` here and no snapshot file is ever loaded. If the local
 * stack is unreachable this suite FAILS. Every other integration suite skips on a missing
 * env var; this one may not, because the design it replaced — load a gitignored snapshot,
 * skip when absent — would have skipped on every CI run for the life of the project, and
 * this lane's fail-closed guards score a skipped suite as RED. See MV-160 card §A and
 * `scripts/stage2/capture-read-path-snapshot.mjs`'s header for the full reasoning.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A TEST REACHES A PRE-MIGRATION DATABASE AFTER THE MIGRATION IS ALREADY APPLIED
 * ---------------------------------------------------------------------------------------
 * The card's §A1 says "capture against the pre-migration schema state, apply the Stage 2
 * migrations, replay and diff". By the time any suite runs, `supabase start` has applied
 * every migration in the tree, so there is no un-applied state to capture from and no way
 * to un-apply one for a single suite without wrecking the shared local database that the
 * other nine integration files run against.
 *
 * So the boundary is crossed the other way round, inside ONE transaction that is always
 * rolled back:
 *
 *   begin
 *     ├─ apply supabase/rehearsal/MV-160-rollback.sql   → the database is now PRE-tighten
 *     ├─ assert the pre-state was actually reached      → a wrong rollback fails HERE, loudly
 *     ├─ seed a production-shaped corpus, including shapes that CANNOT EXIST post-migration
 *     ├─ capture, per user × per domain, RLS-scoped as that user
 *     ├─ apply supabase/migrations/20260805140000_…sql  → the real migration file, verbatim
 *     ├─ capture again, identically
 *   rollback
 *
 * Two things this buys that the literal reading does not:
 *   1. THE ROLLBACK SCRIPT IS EXECUTED. A reverse script that is only ever read is the
 *      artifact least likely to be correct and most likely to be needed during an incident.
 *      Here every CI run runs it and then proves the state it produced.
 *   2. §B's SWEEP TEST AND §C's COUNTERFACTUAL BECOME CI TESTS rather than rehearsal
 *      scripts. Both need an owned, `case_id`-null row — a shape this card's whole purpose
 *      is to make unseedable — and inside the pre-state window it is seedable again.
 *
 * What it does not buy: this is the MV-160 boundary (pre-tighten → post-tighten), not the
 * whole-of-Stage-2 boundary (pre-MV-155 → post-MV-160). Reversing MV-155/156/158/159 would
 * need four reverse scripts that do not exist. The whole-stage boundary is §A2's job, on
 * the rehearsal host, against real data — which is why §A2 is the exit gate and this is the
 * regression net. Recorded here so the asymmetry reads as a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 * It proves the MECHANISM: that the comparison is real, that it goes red when a field
 * moves, that the sweep repairs residue rows to THEIR OWN owner's case, and that a student
 * reads byte-identical rows across the migration. It cannot prove that the REAL students'
 * REAL rows survived — synthetic fixtures cannot carry a `profile_snapshot` from an early
 * rule version, an attnum gap behind a dropped column, or a document row whose Storage
 * object is one of the two known orphans. That is §A2, and §A1 passing is never a
 * substitute for it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXCLUDED_FIELDS,
  MIGRATED_TABLES,
  READ_PATHS,
  captureSnapshot,
  diffSnapshots,
  formatDiff,
  hashPayload,
  isExcluded,
  rowKey,
} from "../../scripts/stage2/capture-read-path-snapshot.mjs";
import { assertLocalStack } from "./fixtures/tenancy";

assertLocalStack("stage2-data-equivalence.itest.ts", process.env.SUPABASE_TEST_URL);

const MIGRATION_PATH = "supabase/migrations/20260805140000_stage2_tighten_case_mandatory.sql";
const ROLLBACK_PATH = "supabase/rehearsal/MV-160-rollback.sql";
/** Where §A2 writes its live-data payload. Gitignored, and the ignore is asserted below. */
const SNAPSHOT_DIR = "docs/migrations/stage2/snapshots/";

/** Fixed ids so a failure message points at a recognisable row rather than a fresh uuid. */
const STUDENTS = [
  { label: "student-A", userId: "aaaa0160-0000-4000-8000-000000000001", caseId: "aaaa0160-0000-4000-8000-0000000000c1" },
  { label: "student-B", userId: "bbbb0160-0000-4000-8000-000000000002", caseId: "bbbb0160-0000-4000-8000-0000000000c2" },
  /**
   * THE FIXTURE THE WHOLE PROOF TURNS ON. Student C owns rows on all nine tables and has
   * NO case at all — the exact residue of the MV-157 → MV-158 window and of any lost
   * dual-write, and the population MV-158 delegates to "MV-160's reconciliation sweep".
   *
   * Pre-migration C's rows are visible ONLY through MV-159's transitional owner disjunct.
   * Post-migration that disjunct is gone and they are visible ONLY through the case the
   * sweep minted. If the sweep does not run, or runs late, or attaches the rows to the
   * wrong case, C reads a DIFFERENT payload — silently, with no error. That is the Stage 2
   * exit-gate failure this card exists to prevent, and C is how it is measured.
   */
  { label: "student-C-residue", userId: "cccc0160-0000-4000-8000-000000000003", caseId: null },
] as const;

const ANON_ASSESSMENT_ID = "0000e160-0000-4000-8000-00000000000a";

/**
 * The three `updated_at` columns are seeded to a FIXED PAST INSTANT, and that is load-bearing
 * rather than cosmetic. The whole capture → migrate → replay sequence runs inside one
 * transaction, and `now()` is transaction-start time — constant throughout. Seeded with
 * `now()` the timestamps would be byte-identical before and after NO MATTER WHAT the triggers
 * did, so both halves of the exclusion list's stated reason ("`profiles` and
 * `user_program_state` move, `document_status` does not") would pass vacuously. From an old
 * value, a trigger that fires moves it to the transaction clock and one that does not leaves
 * it in January. It is also the more production-shaped fixture: real rows are not all new.
 */
const SEEDED_AT = "2026-01-15T00:00:00+00:00";

interface RawRows {
  [phase: string]: { [label: string]: { [table: string]: Array<Record<string, unknown>> } };
}

/**
 * The shared module is plain JS, so these mirror its shapes for the type-checker. They are
 * declared here rather than as `.d.mts` because `captureSnapshot` builds its object
 * incrementally and TypeScript's inference over that is narrower than the real value.
 */
interface DomainSnapshot {
  table: string;
  rowCount: number;
  rows: Array<{ key: string; row: Record<string, unknown> }>;
  hash: string;
}
interface Snapshot {
  users: Record<string, { domains: Record<string, DomainSnapshot>; hash: string }>;
  anonymousAssessmentIds: string[];
  hash: string;
}
interface DiffEntry {
  user: string;
  domain: string;
  key: string;
  field: string;
  before: string | null;
  after: string | null;
}

describe("MV-160 §A1 — Stage 2 before/after data equivalence (synthetic)", () => {
  let dbContainer: string;
  let raw: RawRows;
  let probes: Map<string, string>;
  let before: Snapshot;
  let after: Snapshot;
  let diffs: DiffEntry[];

  const psql = (sql: string): string =>
    execFileSync(
      "docker",
      ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAX", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { encoding: "utf8", input: sql, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );

  /**
   * Strip the file's own `begin;`/`commit;` so it can be nested inside this suite's single
   * always-rolled-back transaction. Both counts are asserted rather than assumed: if the
   * rollback script ever grows a second transaction, or loses its first, this throws
   * instead of silently COMMITTING a rollback of the tighten migration onto the shared
   * local database — which would leave every later suite running against a Stage 1 schema.
   */
  const unwrapTransaction = (sql: string, label: string): string => {
    let begins = 0;
    let commits = 0;
    const kept = sql.split(/\r?\n/).filter((line) => {
      if (/^\s*begin\s*;\s*$/i.test(line)) return (begins += 1), false;
      if (/^\s*commit\s*;\s*$/i.test(line)) return (commits += 1), false;
      return true;
    });
    if (begins !== 1 || commits !== 1) {
      throw new Error(
        `HARNESS DEFECT: ${label} has ${begins} begin; and ${commits} commit; — expected exactly one ` +
          "of each. This suite nests it in its own transaction and must not commit anything.",
      );
    }
    return kept.join("\n");
  };

  const readSql = (rel: string): string => readFileSync(path.join(process.cwd(), rel), "utf8");

  /** Every `select *` a student-facing read path performs, RLS-scoped as that user. */
  const captureSql = (phase: string): string => {
    const parts: string[] = [];
    for (const student of STUDENTS) {
      parts.push(
        `select set_config('request.jwt.claims', '{"sub":"${student.userId}","role":"authenticated"}', true);`,
        "set local role authenticated;",
      );
      for (const { table } of READ_PATHS) {
        parts.push(
          `select 'SNAP|${phase}|${student.label}|${table}|' || ` +
            `coalesce((select json_agg(row_to_json(t) order by t.id) from public.${table} t)::text, '[]');`,
        );
      }
      parts.push("reset role;");
    }
    parts.push(
      `select 'SNAP|${phase}|<anonymous>|assessments|' || ` +
        "coalesce((select json_agg(a.id order by a.id) from public.assessments a where a.owner is null)::text, '[]');",
    );
    return parts.join("\n");
  };

  const probeSql = (phase: string): string => {
    const nine = MIGRATED_TABLES.map((t) => `'${t}'`).join(",");
    const cCase = `(select c.id from public.cases c where c.organization_id is null and c.student_user_id = '${STUDENTS[2].userId}')`;
    const lines = [
      `select 'PROBE|${phase}|profiles_case_id_notnull|' || (select case when a.attnotnull then 'yes' else 'no' end ` +
        `from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attname = 'case_id');`,
      `select 'PROBE|${phase}|axis_present_checks|' || (select count(*)::text from pg_constraint ` +
        `where conname like '%\\_ownership\\_axis\\_present');`,
      `select 'PROBE|${phase}|policies_reading_auth_uid|' || (select count(*)::text from pg_policy p ` +
        `join pg_class c on c.oid = p.polrelid where c.relname in (${nine}) and ` +
        `(coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%uid()%' or ` +
        `coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%uid()%'));`,
      `select 'PROBE|${phase}|student_c_personal_case|' || coalesce(${cCase}::text, '<none>');`,
    ];
    for (const table of MIGRATED_TABLES) {
      lines.push(
        `select 'PROBE|${phase}|residue_${table}|' || (select ` +
          `count(*) filter (where t.case_id is not distinct from ${cCase})::text || '/' || count(*)::text ` +
          `from public.${table} t where t.owner = '${STUDENTS[2].userId}');`,
      );
    }
    return lines.join("\n");
  };

  /**
   * A production-SHAPED corpus. Students A and B are fully case-bound (the ordinary
   * post-MV-157 shape); C is pure residue (see the STUDENTS comment); and one assessment is
   * anonymous — `owner IS NULL`, `case_id IS NULL`, unclaimed — the state MV-135's purge
   * keys on and the one row that must stay case-less on BOTH sides of the migration.
   */
  const seedSql = (programA: string, programB: string): string => {
    const [a, b, c] = STUDENTS;
    const parts: string[] = [];

    for (const s of STUDENTS) {
      parts.push(
        `insert into auth.users (id, email) values ('${s.userId}', 'mv160-${s.label}@equivalence.test');`,
      );
    }
    for (const s of [a, b]) {
      parts.push(
        `insert into public.cases (id, organization_id, student_user_id, display_name, email) ` +
          `values ('${s.caseId}', null, '${s.userId}', '${s.label}', 'mv160-${s.label}@equivalence.test');`,
      );
    }

    // `caseCol` is the whole fixture design in one expression: A and B name their case, C
    // names nothing, and every other column below is identical across the three.
    const seedFor = (s: (typeof STUDENTS)[number], programId: string, n: number): void => {
      const cid = s.caseId ? `'${s.caseId}'` : "null";
      const assessmentId = `${n}0000160-0000-4000-8000-00000000a55e`;
      const predictionId = `${n}0000160-0000-4000-8000-0000000000d1`;
      const attemptId = `${n}0000160-0000-4000-8000-0000000000a1`;
      parts.push(
        `insert into public.profiles (owner, case_id, sections, completeness, created_at, updated_at) values ` +
          `('${s.userId}', ${cid}, '{"academic":{"gpa":"3.4"},"english":{"ielts":"7.0"}}'::jsonb, 62, ` +
          `'${SEEDED_AT}', '${SEEDED_AT}');`,
        `insert into public.assessments (id, owner, case_id, result, rule_version, expires_at, claimed_at, ` +
          `destination_id, is_primary, profile_snapshot) values ('${assessmentId}', '${s.userId}', ${cid}, ` +
          `'{"verdict":"possible"}'::jsonb, 'v1', now() + interval '3 days', now(), 'AU', true, ` +
          `'{"academic":{"gpa":"3.4"}}'::jsonb);`,
        `insert into public.plan_items (owner, case_id, kind, impact, title, status) values ` +
          `('${s.userId}', ${cid}, 'english', 'high', 'Sit IELTS again', 'todo');`,
        `insert into public.plan_items (owner, case_id, kind, impact, title, status, completed_at) values ` +
          `('${s.userId}', ${cid}, 'finance', 'medium', 'Collect bank statement', 'done', now());`,
        `insert into public.user_program_state (owner, case_id, program_id, status, notes, created_at, updated_at) ` +
          `values ('${s.userId}', ${cid}, '${programId}', 'shortlisted', 'mv160 note', '${SEEDED_AT}', '${SEEDED_AT}');`,
        `insert into public.documents (owner, case_id, kind, file_path, file_size, original_name) values ` +
          `('${s.userId}', ${cid}, 'passport', '${s.userId}/passport.pdf', 1024, 'passport.pdf');`,
        `insert into public.document_status (owner, case_id, kind, obtained, updated_at) values ` +
          `('${s.userId}', ${cid}, 'passport', true, '${SEEDED_AT}');`,
        `insert into public.document_status (owner, case_id, kind, obtained, updated_at) values ` +
          `('${s.userId}', ${cid}, 'oshc', false, '${SEEDED_AT}');`,
        `insert into public.program_predictions (id, owner, case_id, assessment_id, program_id, verdict, ` +
          `rule_version, score_snapshot) values ('${predictionId}', '${s.userId}', ${cid}, '${assessmentId}', ` +
          `'${programId}', 'possible', 'v1', '{"score":61}'::jsonb);`,
        `insert into public.application_attempts (id, owner, case_id, prediction_id, program_id, intake) values ` +
          `('${attemptId}', '${s.userId}', ${cid}, '${predictionId}', '${programId}', '2026-S1');`,
        `insert into public.outcome_events (owner, case_id, attempt_id, event_type, gate, occurred_at, source) ` +
          `values ('${s.userId}', ${cid}, '${attemptId}', 'applied', 'admission', now(), 'self_reported');`,
      );
    };

    seedFor(a, programA, 1);
    seedFor(b, programB, 2);
    seedFor(c, programA, 3);

    parts.push(
      `insert into public.assessments (id, owner, case_id, result, rule_version, expires_at, claimed_at, ` +
        `destination_id, is_primary, profile_snapshot) values ('${ANON_ASSESSMENT_ID}', null, null, ` +
        `'{"verdict":"reach"}'::jsonb, 'v1', now() + interval '3 days', null, 'AU', false, '{}'::jsonb);`,
    );
    return parts.join("\n");
  };

  const parse = (output: string): { raw: RawRows; probes: Map<string, string> } => {
    const rows: RawRows = {};
    const seen = new Map<string, string>();
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("SNAP|")) {
        const [, phase, label, table, ...rest] = trimmed.split("|");
        rows[phase!] ??= {};
        rows[phase!]![label!] ??= {};
        rows[phase!]![label!]![table!] = JSON.parse(rest.join("|"));
      } else if (trimmed.startsWith("PROBE|")) {
        const [, phase, key, ...rest] = trimmed.split("|");
        seen.set(`${phase}.${key}`, rest.join("|"));
      }
    }
    return { raw: rows, probes: seen };
  };

  beforeAll(async () => {
    dbContainer =
      process.env.SUPABASE_TEST_DB_CONTAINER ??
      execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
        .split(/\r?\n/)
        .map((n) => n.trim())
        .filter(Boolean)[0]!;

    if (!dbContainer) {
      throw new Error(
        "MV-160 §A1 cannot reach a local Supabase database container. This suite does NOT skip — a " +
          "skipped integration suite is a red run here. Start the stack with `npx supabase start`.",
      );
    }

    const programs = psql("select id from public.programs order by id limit 2;")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (programs.length < 2) throw new Error("HARNESS DEFECT: fewer than 2 programs seeded by the migrations");

    const script = [
      "begin;",
      unwrapTransaction(readSql(ROLLBACK_PATH), ROLLBACK_PATH),
      probeSql("pre"),
      seedSql(programs[0]!, programs[1]!),
      captureSql("before"),
      readSql(MIGRATION_PATH),
      probeSql("post"),
      captureSql("after"),
      "rollback;",
    ].join("\n");

    const parsed = parse(psql(script));
    raw = parsed.raw;
    probes = parsed.probes;

    const read = (phase: string) => async (table: string, userId: string) => {
      const label = STUDENTS.find((s) => s.userId === userId)!.label;
      return raw[phase]?.[label]?.[table] ?? [];
    };
    const readAnon = (phase: string) => async () =>
      (raw[phase]?.["<anonymous>"]?.assessments ?? []) as unknown as string[];

    const users = STUDENTS.map((s) => ({ label: s.label, userId: s.userId }));
    before = (await captureSnapshot({
      users,
      read: read("before"),
      readAnonymousAssessmentIds: readAnon("before"),
    })) as Snapshot;
    after = (await captureSnapshot({
      users,
      read: read("after"),
      readAnonymousAssessmentIds: readAnon("after"),
    })) as Snapshot;
    diffs = diffSnapshots(before, after) as DiffEntry[];
  }, 180_000);

  describe("the comparison itself", () => {
    it("the exclusion list is exactly the enumerated fields, each with a reason", () => {
      // The list is where a proof of this shape gets quietly hollowed out. Pinning the exact
      // membership means growing it is an edit to this test, in the same PR, by the same author.
      expect(EXCLUDED_FIELDS.map((e) => e.field).sort()).toEqual(
        [
          "application_attempts.case_id",
          "assessments.case_id",
          "document_status.case_id",
          "document_status.id",
          "documents.case_id",
          "outcome_events.case_id",
          "plan_items.case_id",
          "profiles.case_id",
          "program_predictions.case_id",
          "user_program_state.case_id",
          "user_program_state.id",
        ].sort(),
      );
      for (const entry of EXCLUDED_FIELDS) {
        expect(entry.reason.length, `${entry.field} has no reason string`).toBeGreaterThan(20);
        expect(entry.field, "a whole-table or wildcard exclusion turns a byte-diff into a vibe check").toContain(".");
      }
    });

    it("NO `updated_at` is excluded — the card's and spec §9.2's stated reason does not hold", () => {
      // MV-160 §A and spec §9.2 both excluded `profiles.updated_at` and
      // `user_program_state.updated_at` because "the backfill UPDATE fires
      // `private.set_updated_at()`". Measured: it does not — MV-155 disables both triggers
      // for the duration of the backfill (see the structural assertion in §B below). So all
      // three `updated_at` columns are compared exactly. Both documents are amended in this PR.
      expect(isExcluded("profiles", "updated_at")).toBe(false);
      expect(isExcluded("user_program_state", "updated_at")).toBe(false);
      expect(isExcluded("document_status", "updated_at")).toBe(false);
    });

    it("M5 — perturbing one field on one user turns the diff red and NAMES the user, domain and field", () => {
      // Without this the equivalence proof is a hash comparison nobody has ever seen fail.
      const perturbed = JSON.parse(JSON.stringify(after)) as typeof after;
      const target = perturbed.users["student-A"]!.domains.profile!;
      target.rows[0]!.row.completeness = 99;
      target.hash = hashPayload(target.rows);
      perturbed.users["student-A"]!.hash = hashPayload(perturbed.users["student-A"]!.domains);

      const red = diffSnapshots(before, perturbed);
      expect(red.length).toBeGreaterThan(0);
      expect(red.some((d) => d.user === "student-A" && d.domain === "profile" && d.field === "completeness")).toBe(true);
      expect(formatDiff(red)).toContain("completeness");
      expect(formatDiff([])).toBe("EQUIVALENT — zero differences.");
    });

    it("M5b — a vanished row is named as a vanished row, not netted away", () => {
      const truncated = JSON.parse(JSON.stringify(after)) as typeof after;
      const plan = truncated.users["student-C-residue"]!.domains.plan!;
      plan.rows = plan.rows.slice(1);
      plan.hash = hashPayload(plan.rows);
      truncated.users["student-C-residue"]!.hash = hashPayload(truncated.users["student-C-residue"]!.domains);

      const red = diffSnapshots(before, truncated);
      expect(red.some((d) => d.user === "student-C-residue" && d.field === "<row vanished>")).toBe(true);
    });
  });

  describe("the pre-migration state was genuinely reached", () => {
    it("the rollback script executed and put the database back in the transitional window", () => {
      // If this fails, everything below is comparing post-migration against post-migration and
      // would pass vacuously. It is the first assertion for that reason.
      expect(probes.get("pre.profiles_case_id_notnull")).toBe("no");
      expect(Number(probes.get("pre.axis_present_checks"))).toBe(8);
      expect(Number(probes.get("pre.policies_reading_auth_uid"))).toBeGreaterThan(0);
    });

    it("the migration then closed it — NOT NULL applied, checks gone, no policy reads auth.uid()", () => {
      expect(probes.get("post.profiles_case_id_notnull")).toBe("yes");
      expect(Number(probes.get("post.axis_present_checks"))).toBe(0);
      expect(Number(probes.get("post.policies_reading_auth_uid"))).toBe(0);
    });

    it("the corpus is production-SHAPED — every read path has rows on both sides", () => {
      // A snapshot of nine empty lists is byte-identical to another snapshot of nine empty
      // lists. Pin that the fixture actually reached every domain before trusting the diff.
      for (const phase of [before, after]) {
        for (const student of STUDENTS) {
          for (const { domain } of READ_PATHS) {
            expect(
              phase.users[student.label]!.domains[domain]!.rowCount,
              `${student.label} has no ${domain} rows — the diff over this domain proves nothing`,
            ).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe("§A1 — the equivalence itself", () => {
    it("THE DIFF IS ZERO — every student reads byte-identical rows across the migration", () => {
      expect(formatDiff(diffs)).toBe("EQUIVALENT — zero differences.");
      expect(before.hash).toBe(after.hash);
    });

    it("row-count AND identity parity per user per domain — nothing destroyed, nothing added", () => {
      for (const student of STUDENTS) {
        for (const { domain } of READ_PATHS) {
          const b = before.users[student.label]!.domains[domain]!;
          const a = after.users[student.label]!.domains[domain]!;
          expect(a.rowCount, `${student.label}/${domain} row count moved`).toBe(b.rowCount);
          expect(a.rows.map((r) => r.key).sort(), `${student.label}/${domain} row identity moved`).toEqual(
            b.rows.map((r) => r.key).sort(),
          );
        }
      }
    });

    it("the anonymous assessment stayed anonymous, case-less and present — BY ID, not by count", () => {
      // MV-135's purge boundary has to be provable rather than netted away: a row the purge
      // legitimately removes mid-window must be legible as that row, not as a count delta.
      expect(before.anonymousAssessmentIds).toEqual([ANON_ASSESSMENT_ID]);
      expect(after.anonymousAssessmentIds).toEqual([ANON_ASSESSMENT_ID]);
      // And it is invisible to every authenticated client on both sides — the assessments
      // domain of every student excludes it.
      for (const phase of [before, after]) {
        for (const student of STUDENTS) {
          const ids = phase.users[student.label]!.domains.assessments!.rows.map((r) => r.key);
          expect(ids).not.toContain(ANON_ASSESSMENT_ID);
        }
      }
    });

    it("the two excluded surrogate ids were in fact STABLE here — the exclusion hides nothing", () => {
      // The shared list excludes `user_program_state.id` and `document_status.id` because they
      // do not exist on the pre-MV-155 side of §A2's boundary. On THIS boundary they do exist,
      // so assert directly that they did not move — otherwise the shared exclusion would be
      // silently covering for a real change on the half that runs in CI.
      for (const student of STUDENTS) {
        for (const table of ["user_program_state", "document_status"] as const) {
          const b = raw.before![student.label]![table]!.map((r) => String(r.id)).sort();
          const a = raw.after![student.label]![table]!.map((r) => String(r.id)).sort();
          expect(a, `${student.label}/${table}.id moved across the migration`).toEqual(b);
        }
      }
    });
  });

  describe("§B — the reconciliation sweep is tested, not trusted", () => {
    it("the sweep minted student C a personal case and repaired every residue row onto it", () => {
      const personalCase = probes.get("post.student_c_personal_case");
      expect(personalCase, "the sweep did not mint a personal case for the residue owner").not.toBe("<none>");
      expect(probes.get("pre.student_c_personal_case")).toBe("<none>");

      for (const table of MIGRATED_TABLES) {
        const [repaired, total] = probes.get(`post.residue_${table}`)!.split("/").map(Number);
        expect(total, `HARNESS DEFECT: no residue row was seeded on ${table}`).toBeGreaterThan(0);
        expect(repaired, `${table}: ${total! - repaired!} residue row(s) did NOT land on their owner's case`).toBe(
          total,
        );
      }
    });

    it("residue rows were case-less BEFORE the migration — the fixture is the real shape", () => {
      // Without this the test above passes against a fixture that was already repaired, which
      // is the "seeded the answer" failure. `0/N` pre-migration is what makes `N/N` mean anything.
      for (const table of MIGRATED_TABLES) {
        const [repaired] = probes.get(`pre.residue_${table}`)!.split("/").map(Number);
        expect(repaired, `${table}: residue rows already carried a case before the sweep`).toBe(0);
      }
    });

    it("NO `updated_at` moved on ANY of the three — not even on the rows the sweep rewrote", () => {
      // The corrected claim, on the one fixture that can expose it: student C's rows were
      // UPDATEd by the sweep (their `case_id` changed), and their `updated_at` still reads
      // January. "when did this student last edit their profile / shortlist" survives the
      // migration. These three fields are NOT on the exclusion list, so a regression here also
      // turns the main diff red — this test just names which column it was.
      for (const student of STUDENTS) {
        for (const table of ["profiles", "user_program_state", "document_status"] as const) {
          const b = raw.before![student.label]![table]!.map((r) => String(r.updated_at)).sort();
          const a = raw.after![student.label]![table]!.map((r) => String(r.updated_at)).sort();
          expect(a, `${student.label}: ${table}.updated_at moved across the migration`).toEqual(b);
          expect(b[0], `HARNESS DEFECT: ${table}.updated_at was not seeded to a past instant, so ` +
            "this assertion would pass vacuously — `now()` is constant inside one transaction").toContain("2026-01-15");
        }
      }
    });

    it("and the MECHANISM is pinned: MV-155's backfill disables the two `set_updated_at` triggers", () => {
      // Without this, the test above is a true observation with no stated cause, and the first
      // author to delete the `disable trigger` pair as "dead weight" would move every existing
      // student's profile timestamp to migration time — unrecoverably, since the rollback takes
      // the column and not the clock. `document_status` needs no such mechanism: it has no
      // trigger to disable, which is why only two names appear here and not three.
      const body = psql("select pg_get_functiondef('private.mv155_backfill_personal_cases'::regproc);");
      expect(body).toContain("disable trigger profiles_set_updated_at");
      expect(body).toContain("disable trigger user_program_state_set_updated_at");
      expect(body).toContain("enable trigger profiles_set_updated_at");
      expect(body).toContain("enable trigger user_program_state_set_updated_at");
      expect(body, "document_status has no set_updated_at trigger to disable").not.toContain(
        "document_status_set_updated_at",
      );
    });

    it("M7 — with the sweep removed, the apply FAILS on the residue instead of succeeding", () => {
      // The counterfactual. Without it the sweep is decoration: an apply that succeeds either
      // way proves nothing about the step that supposedly made it succeed.
      const migration = readSql(MIGRATION_PATH);
      const start = migration.indexOf("-- (a)");
      const end = migration.indexOf("-- (b)");
      expect(start, "the migration no longer marks its steps `-- (a)` / `-- (b)`").toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const excised = migration.slice(start, end);
      expect(excised, "the excised block is not the sweep").toContain("mv155_backfill_personal_cases");

      const sweepless = migration.slice(0, start) + migration.slice(end);
      const programs = psql("select id from public.programs order by id limit 2;")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let message = "";
      try {
        psql(
          [
            "begin;",
            unwrapTransaction(readSql(ROLLBACK_PATH), ROLLBACK_PATH),
            seedSql(programs[0]!, programs[1]!),
            sweepless,
            "rollback;",
          ].join("\n"),
        );
      } catch (error) {
        message = String((error as { stderr?: string }).stderr ?? error);
      }
      expect(message, "the sweepless migration APPLIED — the sweep is not what carries the residue").not.toBe("");
      expect(message).toMatch(/23502|contains null values|not-null/i);
    }, 180_000);
  });

  describe("§A1 — what the shared module guarantees for §A2", () => {
    it("row identity on the two surrogate-keyed tables is the NATURAL key, not `id`", () => {
      // §A2's pre-migration side has no `id` on these two at all. Keying on a column only one
      // side has would make every row read as added-and-removed and the whole replay red.
      expect(rowKey("user_program_state", { program_id: "adelaide-maf", id: "x" })).toBe("adelaide-maf");
      expect(rowKey("document_status", { kind: "passport", id: "x" })).toBe("passport");
      expect(rowKey("profiles", { id: "p1" })).toBe("p1");
    });

    it("the §A2 snapshot path is gitignored, and no snapshot has ever been committed", () => {
      // The payload is per-user detail for REAL students and git history is permanent. This
      // assertion is the difference between "we intend not to commit it" and "committing it
      // fails". It also fails if someone moves the path without moving the ignore.
      const ignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
      expect(ignore.split(/\r?\n/)).toContain(SNAPSHOT_DIR);

      const tracked = execFileSync("git", ["ls-files", "--", "docs/migrations/stage2/"], {
        encoding: "utf8",
        cwd: process.cwd(),
      })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      expect(
        tracked.filter((f) => f.startsWith(SNAPSHOT_DIR)),
        "a raw equivalence snapshot is TRACKED. It is real student PII and git history cannot be " +
          "undone — stop and escalate rather than deleting the file in a follow-up commit.",
      ).toEqual([]);
      // The pseudonymous report is the committed artifact, and it must exist.
      expect(tracked).toContain("docs/migrations/stage2/equivalence-report.md");
    });

    it("the serializer is order-insensitive across key order but not across values", () => {
      // psql's `row_to_json` and PostgREST's response can order keys differently for the same
      // row. If that alone changed the hash, §A2 would report a diff on every field of every row.
      expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
      expect(hashPayload({ a: 1, b: 2 })).not.toBe(hashPayload({ a: 1, b: 3 }));
    });
  });
});
