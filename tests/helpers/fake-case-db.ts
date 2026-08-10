import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * A table-keyed in-memory stand-in for the authenticated Supabase client, for the
 * `lib/cases/` permission-boundary tests.
 *
 * The shared `tests/helpers/fake-supabase.ts` serves rows POSITIONALLY from one
 * queue, which would make `getCaseContext`'s internal query order load-bearing on
 * every assertion — a test that passes for the wrong reason as soon as the
 * implementation reorders two independent lookups. This fake instead answers from
 * fixtures keyed by table and filtered by the accumulated `.eq()` predicates, so
 * the tests assert on *semantics* and stay honest under refactoring.
 *
 * Fixture rows are typed against the generated `Database` types, so a column
 * renamed in a later migration breaks these tests rather than silently matching
 * nothing.
 *
 * Deliberately NOT the admin client: MV-151's boundary is defense in depth on top
 * of RLS, and a test that reached for service-role would prove nothing about the
 * authenticated path (card Risk notes, "getCaseContext as an accidental
 * service-role path").
 */

type Tables = Database["public"]["Tables"];
export type CaseDbTable = "cases" | "organization_memberships" | "case_assignments" | "organizations";

/** Partial fixture rows — supply only the columns a test cares about. */
export type CaseDbFixture = {
  cases?: Array<Partial<Tables["cases"]["Row"]>>;
  organization_memberships?: Array<Partial<Tables["organization_memberships"]["Row"]>>;
  case_assignments?: Array<Partial<Tables["case_assignments"]["Row"]>>;
  organizations?: Array<Partial<Tables["organizations"]["Row"]>>;
};

export type FakeCaseDbOptions = {
  /** Tables that answer with a PostgREST error instead of rows. */
  errorOn?: Partial<Record<CaseDbTable, { message: string }>>;
  /** Tables whose query throws outright (dropped connection, aborted request). */
  throwOn?: CaseDbTable[];
  /**
   * Tables whose INSERT answers with a PostgREST error. `code` matters: `23505`
   * is the lost-race branch a create-or-resolve helper must treat as a resolve.
   */
  insertError?: Partial<Record<CaseDbTable, { code?: string; message: string }>>;
  /**
   * Rows that only become visible AFTER an insert has been attempted — the
   * concurrent winner a losing racer re-reads. Without this a fake cannot tell
   * "resolved on the retry" from "returned a stale first read".
   */
  appearAfterInsert?: CaseDbFixture;
  /**
   * Tables whose UPDATE answers with a PostgREST error. `code` matters: `42501`
   * is a column-grant violation, `23505` a unique-constraint collision.
   *
   * NOTE an update refused by RLS is NOT an error — Postgres reports it as zero
   * rows affected. That case is modelled by the filters matching no row, which is
   * what lets a test tell "the write was denied" from "the write failed".
   */
  updateError?: Partial<Record<CaseDbTable, { code?: string; message: string }>>;
  /**
   * Tables whose DELETE answers with a PostgREST error. Same reading as
   * `updateError`: a delete the policy refuses is zero rows affected, not an
   * error, and is modelled by the filters matching no row.
   */
  deleteError?: Partial<Record<CaseDbTable, { code?: string; message: string }>>;
};

export type RecordedQuery = {
  table: string;
  filters: Array<[string, unknown]>;
  /** `.order(column, options)` calls in the order they were chained. */
  order: Array<[string, unknown]>;
  /**
   * The `.limit()` the query carried, or `null` for an unbounded read — which is
   * a real defect against PostgREST's `max_rows`, so the fake makes it visible
   * rather than equivalent.
   */
  limit: number | null;
};
export type RecordedInsert = { table: string; row: Record<string, unknown> };
export type RecordedUpdate = { table: string; patch: Record<string, unknown> };
export type RecordedDelete = { table: string; filters: Array<[string, unknown]> };

type Row = Record<string, unknown>;

export function fakeCaseDb(fixture: CaseDbFixture = {}, options: FakeCaseDbOptions = {}) {
  const queries: RecordedQuery[] = [];
  const inserts: RecordedInsert[] = [];
  const updates: RecordedUpdate[] = [];
  const deletes: RecordedDelete[] = [];
  const errorOn = options.errorOn ?? {};
  const insertError = options.insertError ?? {};
  const updateError = options.updateError ?? {};
  const deleteError = options.deleteError ?? {};
  const throwOn = new Set<string>(options.throwOn ?? []);
  // Mutable so an insert can make its own row readable to a later query, which is
  // what lets a test distinguish "read it back" from "returned what it wrote".
  const rows: Record<string, Row[]> = {};
  for (const [table, seed] of Object.entries(fixture)) {
    rows[table] = [...((seed ?? []) as Row[])];
  }
  let insertAttempts = 0;

  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const record: RecordedQuery = { table, filters, order: [], limit: null };
    queries.push(record);

    const rowsFor = (): Row[] => {
      const all = rows[table] ?? [];
      const matched = all.filter((row) => filters.every(([column, value]) => row[column] === value));
      // `.limit()` is HONOURED, not just recorded: a caller that asks for N+1 rows
      // to detect truncation is asserting on the size of the answer, and a fake
      // that ignored the limit would make that detection untestable.
      return record.limit === null ? matched : matched.slice(0, record.limit);
    };

    const resolve = (mode: "many" | "one") => {
      if (throwOn.has(table)) {
        throw new Error(`fakeCaseDb: query on "${table}" threw`);
      }
      if (insertFailure) return { data: null, error: insertFailure };
      if (inserted) return { data: mode === "one" ? inserted : [inserted], error: null };
      if (updatePatch !== null) {
        const failure = updateError[table as CaseDbTable];
        if (failure) return { data: null, error: failure };
        // An UPDATE the policy refuses is not an error — it matches no row and
        // reports zero affected. `rowsFor()` returning [] IS that case.
        const touched = rowsFor().map((row) => Object.assign(row, updatePatch));
        if (mode === "one") return { data: touched[0] ?? null, error: null };
        return { data: touched, error: null };
      }
      if (deleting) {
        const failure = deleteError[table as CaseDbTable];
        if (failure) return { data: null, error: failure };
        // Same reading as UPDATE: a refused DELETE is zero rows, not an error.
        // The rows really leave, so a later read cannot see what was removed —
        // which is what lets a test tell "replaced" from "inserted alongside".
        const removed = rowsFor();
        rows[table] = (rows[table] ?? []).filter((row) => !removed.includes(row));
        if (mode === "one") return { data: removed[0] ?? null, error: null };
        return { data: removed, error: null };
      }
      const failure = errorOn[table as CaseDbTable];
      if (failure) {
        return { data: null, error: failure };
      }
      const matches = rowsFor();
      if (mode === "one") {
        return { data: matches[0] ?? null, error: null };
      }
      return { data: matches, error: null };
    };

    // An insert resolves from the row it wrote rather than from the fixture, and
    // (unless it errored) makes that row visible to every later query.
    let inserted: Row | null = null;
    let insertFailure: { code?: string; message: string } | null = null;
    // An update resolves from the rows its filters matched, patched in place.
    let updatePatch: Row | null = null;
    // A delete resolves from the rows its filters matched, and removes them.
    let deleting = false;

    // PostgREST builders are chainable AND awaitable; every chain method returns
    // the same builder and only a terminal (or an await) resolves.
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.order = vi.fn((column: string, options?: unknown) => {
      record.order.push([column, options]);
      return builder;
    });
    builder.limit = vi.fn((count: number) => {
      record.limit = count;
      return builder;
    });
    builder.insert = vi.fn((row: Row) => {
      insertAttempts += 1;
      inserts.push({ table, row });
      const failure = insertError[table as CaseDbTable];
      if (failure) {
        insertFailure = failure;
        // The winner of a lost race becomes visible only now, so a re-read after
        // a 23505 sees it and a re-read that never happened cannot.
        for (const [t, late] of Object.entries(options.appearAfterInsert ?? {})) {
          rows[t] = [...(rows[t] ?? []), ...((late ?? []) as Row[])];
        }
        return builder;
      }
      inserted = { id: `fake-case-db-generated-${insertAttempts}`, ...row };
      rows[table] = [...(rows[table] ?? []), inserted];
      return builder;
    });
    builder.update = vi.fn((patch: Row) => {
      updatePatch = patch;
      updates.push({ table, patch });
      return builder;
    });
    builder.delete = vi.fn(() => {
      deleting = true;
      // `filters` is the same array the chained `.eq()` calls append to, and it
      // is read at resolve time — so the recorded delete carries its predicate.
      deletes.push({ table, filters });
      return builder;
    });
    for (const method of ["eq", "is"]) {
      builder[method] = vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      });
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(resolve("one")));
    builder.single = vi.fn(() => Promise.resolve(resolve("one")));
    builder.then = (onFulfilled: (r: unknown) => unknown) => onFulfilled(resolve("many"));
    return builder;
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, queries, inserts, updates, deletes, rows, from };
}

/** Did the fake see a query against `table` carrying every one of `filters`? */
export function sawQuery(
  queries: RecordedQuery[],
  table: CaseDbTable,
  filters: Array<[string, unknown]>,
): boolean {
  return queries.some(
    (query) =>
      query.table === table &&
      filters.every(([column, value]) =>
        query.filters.some(([c, v]) => c === column && v === value),
      ),
  );
}
