/**
 * MV-160 §A — the Stage 2 before/after data-equivalence proof: the shared model.
 *
 * ## What this file is
 *
 * ONE serializer, ONE hash function and ONE exclusion list, imported by BOTH
 * halves of the proof:
 *
 *   §A1  `tests/integration/stage2-data-equivalence.itest.ts` — the SYNTHETIC
 *        half. Seeds a production-shaped corpus, captures pre-migration,
 *        applies the real migration file, replays, diffs. Runs on every CI run
 *        and NEVER skips.
 *
 *   §A2  `npm run stage2:equivalence` — the LIVE half, driven by the CLI in the
 *        sibling `./capture-read-path-snapshot.mjs`. Run BY HAND by the
 *        integrator on the rehearsal host, against a restored copy of
 *        production, as a gate on the production apply. That file's header
 *        carries the reasoning for why it is deliberately not a test, and not
 *        in CI.
 *
 * A synthetic proof running different comparison code from the real one proves
 * that the fixtures are equal, not that the comparison is right. Hence one
 * module, two drivers.
 *
 * ## WHY THIS IS A SEPARATE FILE FROM THE CLI (MV-192)
 *
 * The CLI needs `#!/usr/bin/env node`; this module has to be importable by a
 * test. Those two requirements cannot share a file. Vitest's SSR transform does
 * not correctly strip a `#!` line that ends in CRLF, and the module then fails to
 * parse. So for as long as the two lived together, §A1 died on a Windows checkout
 * with `SyntaxError: Invalid or unexpected token` and its nineteen tests did not
 * run at all — while Linux CI, whose checkout is LF, ticked every one of them.
 * Measured three ways (MV-192): CRLF shebang fails, the SAME shebang with an LF
 * ending parses, no shebang parses. The shebang stays on the thin CLI wrapper;
 * the importable model lives here.
 *
 * Do not fold this back into the CLI, and do not copy any of it across. §A's
 * whole guarantee is that the CI half and the rehearsal half run THE SAME code —
 * a duplicated serializer would prove the two copies agree with themselves.
 * `tests/scripts/mjs-imports-are-shebang-free.test.ts` keeps the shebang out of
 * the import path; only this comment keeps the duplication out.
 *
 * ## The unit of the proof
 *
 * Per user × per domain payload hashes, never per-table counts or checksums.
 * A row count — and even a per-table checksum — passes a backfill that attached
 * the right NUMBER of `case_id`s to the WRONG students, which is the worst
 * outcome Stage 2 can produce and the one aggregates cannot see. The unit is the
 * payload one student can read, read AS that student through an RLS-scoped
 * client. A service-role replay proves the rows exist; it does not prove the
 * student can still see them, and only the second one is the exit gate.
 */

import { createHash } from "node:crypto";

/**
 * Every student-facing read path, as the table it reads. The repositories
 * (`lib/profiles/repo.ts`, `lib/plan/repo.ts`, `lib/outcomes/repo.ts`, …) select
 * `*` on all nine, so the snapshot is every column of every visible row — the
 * strongest form of the comparison, and the reason the exclusion list below has
 * to be short and reasoned rather than convenient.
 */
export const READ_PATHS = Object.freeze([
  { domain: "profile", table: "profiles" },
  { domain: "assessments", table: "assessments" },
  { domain: "plan", table: "plan_items" },
  { domain: "shortlist", table: "user_program_state" },
  { domain: "documents", table: "documents" },
  { domain: "checklist", table: "document_status" },
  { domain: "predictions", table: "program_predictions" },
  { domain: "attempts", table: "application_attempts" },
  { domain: "outcomes", table: "outcome_events" },
]);

/** The nine migrated tables, in read-path order. */
export const MIGRATED_TABLES = Object.freeze(READ_PATHS.map((p) => p.table));

/**
 * THE COMPLETE NORMALIZED/EXCLUDED FIELD LIST. Every field NOT on this list must
 * match exactly, byte for byte.
 *
 * This is where a proof of this shape gets quietly hollowed out, so three rules
 * are enforced by `tests/integration/stage2-data-equivalence.itest.ts` rather
 * than trusted: the list is exactly these entries, every entry carries a
 * non-empty reason, and no entry may name a whole table or use a wildcard.
 *
 * NO `updated_at` COLUMN IS EXCLUDED, on any of the nine, and that is a
 * CORRECTION to what MV-160 §A and spec §9.2 both specified — measured
 * 2026-08-06 against the live catalog rather than inherited.
 *
 * Both documents excluded `profiles.updated_at` and `user_program_state.updated_at`
 * on the stated ground that "the backfill UPDATE fires `private.set_updated_at()`".
 * It does not. `private.mv155_backfill_personal_cases()` opens with
 * `alter table … disable trigger profiles_set_updated_at` /
 * `… user_program_state_set_updated_at` and re-enables them before it returns —
 * MV-155 saw this coming and suppressed the movement, because stamping migration
 * time onto "when did this student last edit their profile" is unrecoverable
 * (the rollback takes the column, not the clock). So those two timestamps do not
 * move, and excluding them would have hidden it if a later edit ever dropped that
 * `disable trigger` pair — the exact "the proof deleting itself" failure the card
 * names as its own top risk. They are compared exactly, and §A1 asserts the
 * mechanism that holds them still.
 *
 * `document_status.updated_at` is likewise compared exactly. That table has an
 * `updated_at` column but carries no `set_updated_at` trigger at all, so nothing
 * moves it whether or not anything is disabled.
 */
export const EXCLUDED_FIELDS = Object.freeze([
  {
    field: "profiles.case_id",
    reason:
      "Stage 2 introduces the column (MV-155) and MV-160's opening sweep legitimately fills it on " +
      "any owned row still missing one. There is no pre-Stage-2 value to compare against, and under " +
      "the tighten boundary a null -> case transition is the migration working correctly. §A1 pins " +
      "the transition itself instead: every residue row resolves to ITS OWN owner's personal case.",
  },
  { field: "assessments.case_id", reason: "As `profiles.case_id`." },
  { field: "plan_items.case_id", reason: "As `profiles.case_id`." },
  { field: "user_program_state.case_id", reason: "As `profiles.case_id`." },
  { field: "documents.case_id", reason: "As `profiles.case_id`." },
  { field: "document_status.case_id", reason: "As `profiles.case_id`." },
  { field: "program_predictions.case_id", reason: "As `profiles.case_id`." },
  { field: "application_attempts.case_id", reason: "As `profiles.case_id`." },
  { field: "outcome_events.case_id", reason: "As `profiles.case_id`." },
  {
    field: "user_program_state.id",
    reason:
      "The surrogate key MV-156 added when it replaced the composite primary key `(owner, " +
      "program_id)`. It did not exist pre-Stage-2 and has nothing to compare against. Row identity " +
      "is carried by `program_id` instead — see `rowKey()`.",
  },
  {
    field: "document_status.id",
    reason:
      "As `user_program_state.id` — MV-156's surrogate replacing the composite primary key " +
      "`(owner, kind)`. Row identity is carried by `kind` instead.",
  },
]);

const EXCLUDED_FIELD_SET = new Set(EXCLUDED_FIELDS.map((entry) => entry.field));

/** True when `<table>.<column>` is on the exclusion list above. */
export function isExcluded(table, column) {
  return EXCLUDED_FIELD_SET.has(`${table}.${column}`);
}

/**
 * The stable identity of a row WITHIN one user's domain payload.
 *
 * `user_program_state` and `document_status` are keyed by their natural key
 * rather than by `id`, because `id` is MV-156's surrogate and does not exist on
 * the pre-Stage-2 side of the §A2 boundary at all. Keying on a column that only
 * one side has would make every row read as added-and-removed.
 */
export function rowKey(table, row) {
  if (table === "user_program_state") return String(row.program_id);
  if (table === "document_status") return String(row.kind);
  return String(row.id);
}

/** A row with its excluded fields dropped. Nothing else is touched. */
export function normalizeRow(table, row) {
  const out = {};
  for (const column of Object.keys(row)) {
    if (isExcluded(table, column)) continue;
    out[column] = row[column];
  }
  return out;
}

/**
 * Deterministic serialization: keys sorted at every depth, so two objects that
 * differ only in property order hash the same. `JSON.stringify` alone does not
 * guarantee that across a psql `row_to_json` and a PostgREST response.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** sha256 of the stable serialization. */
export function hashPayload(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * Capture one snapshot.
 *
 * @param users   `[{ label, userId }]` — `label` is the PSEUDONYM that goes in
 *                the committed report; `userId` never does.
 * @param read    `(table, userId) => Promise<rows[]>` — MUST be RLS-scoped as
 *                that user. The two drivers supply different adapters (psql with
 *                `set role authenticated` for §A1, an anon-key client carrying
 *                the user's JWT for §A2) and share everything below.
 * @param readAnonymousAssessmentIds
 *                `() => Promise<string[]>` — service-role, because an anonymous
 *                row is invisible to every authenticated client by design. It is
 *                recorded BY ID, never absorbed into a count delta, so a row the
 *                MV-135 purge legitimately removed mid-window is legible as
 *                exactly that rather than as data loss.
 */
export async function captureSnapshot({ users, read, readAnonymousAssessmentIds }) {
  const snapshot = { users: {}, anonymousAssessmentIds: /** @type {string[]} */ ([]), hash: "" };

  for (const { label, userId } of users) {
    const domains = {};
    for (const { domain, table } of READ_PATHS) {
      const rows = (await read(table, userId)) ?? [];
      const normalized = rows
        .map((row) => ({ key: rowKey(table, row), row: normalizeRow(table, row) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      domains[domain] = {
        table,
        rowCount: normalized.length,
        rows: normalized,
        hash: hashPayload(normalized),
      };
    }
    snapshot.users[label] = { domains, hash: hashPayload(domains) };
  }

  if (readAnonymousAssessmentIds) {
    snapshot.anonymousAssessmentIds = [...((await readAnonymousAssessmentIds()) ?? [])].sort();
  }

  snapshot.hash = hashPayload({
    users: snapshot.users,
    anonymousAssessmentIds: snapshot.anonymousAssessmentIds,
  });
  return snapshot;
}

/**
 * The diff. Returns `[]` when the two snapshots are equal under the exclusion
 * list, and otherwise one entry per difference, naming the user, the domain, the
 * row and the FIELD that moved — so the founder reads what changed rather than
 * being handed a hash mismatch.
 */
export function diffSnapshots(before, after) {
  const diffs = [];
  const labels = [...new Set([...Object.keys(before.users), ...Object.keys(after.users)])].sort();

  for (const label of labels) {
    const beforeUser = before.users[label];
    const afterUser = after.users[label];
    if (!beforeUser) {
      diffs.push({ user: label, domain: "*", key: "*", field: "<user appeared>", before: null, after: "present" });
      continue;
    }
    if (!afterUser) {
      diffs.push({ user: label, domain: "*", key: "*", field: "<user vanished>", before: "present", after: null });
      continue;
    }
    if (beforeUser.hash === afterUser.hash) continue;

    for (const { domain } of READ_PATHS) {
      const b = beforeUser.domains[domain];
      const a = afterUser.domains[domain];
      if (!b || !a || b.hash === a.hash) continue;

      const beforeRows = new Map(b.rows.map((entry) => [entry.key, entry.row]));
      const afterRows = new Map(a.rows.map((entry) => [entry.key, entry.row]));
      for (const key of [...new Set([...beforeRows.keys(), ...afterRows.keys()])].sort()) {
        const br = beforeRows.get(key);
        const ar = afterRows.get(key);
        if (!ar) {
          diffs.push({ user: label, domain, key, field: "<row vanished>", before: "present", after: null });
          continue;
        }
        if (!br) {
          diffs.push({ user: label, domain, key, field: "<row appeared>", before: null, after: "present" });
          continue;
        }
        for (const field of [...new Set([...Object.keys(br), ...Object.keys(ar)])].sort()) {
          const bv = stableStringify(br[field] ?? null);
          const av = stableStringify(ar[field] ?? null);
          if (bv !== av) diffs.push({ user: label, domain, key, field, before: bv, after: av });
        }
      }
    }
  }

  const beforeAnon = new Set(before.anonymousAssessmentIds ?? []);
  const afterAnon = new Set(after.anonymousAssessmentIds ?? []);
  for (const id of [...beforeAnon].sort()) {
    if (!afterAnon.has(id)) {
      diffs.push({
        user: "<anonymous>",
        domain: "assessments",
        key: id,
        field: "<anonymous assessment vanished>",
        before: "present",
        after: null,
      });
    }
  }
  for (const id of [...afterAnon].sort()) {
    if (!beforeAnon.has(id)) {
      diffs.push({
        user: "<anonymous>",
        domain: "assessments",
        key: id,
        field: "<anonymous assessment appeared>",
        before: null,
        after: "present",
      });
    }
  }

  return diffs;
}

/** A non-empty diff, rendered so it can be pasted into the report as-is. */
export function formatDiff(diffs) {
  if (diffs.length === 0) return "EQUIVALENT — zero differences.";
  const lines = diffs
    .slice(0, 40)
    .map((d) => `  ${d.user} / ${d.domain} / row ${d.key} / ${d.field}:  ${d.before}  ->  ${d.after}`);
  if (diffs.length > 40) lines.push(`  … and ${diffs.length - 40} more`);
  return [`NOT EQUIVALENT — ${diffs.length} difference(s):`, ...lines].join("\n");
}
