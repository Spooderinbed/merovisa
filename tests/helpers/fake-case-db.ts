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
};

export type RecordedQuery = { table: string; filters: Array<[string, unknown]> };

type Row = Record<string, unknown>;

export function fakeCaseDb(fixture: CaseDbFixture = {}, options: FakeCaseDbOptions = {}) {
  const queries: RecordedQuery[] = [];
  const errorOn = options.errorOn ?? {};
  const throwOn = new Set<string>(options.throwOn ?? []);

  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const record: RecordedQuery = { table, filters };
    queries.push(record);

    const rowsFor = (): Row[] => {
      const all = (fixture[table as CaseDbTable] ?? []) as Row[];
      return all.filter((row) => filters.every(([column, value]) => row[column] === value));
    };

    const resolve = (mode: "many" | "one") => {
      if (throwOn.has(table)) {
        throw new Error(`fakeCaseDb: query on "${table}" threw`);
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

    // PostgREST builders are chainable AND awaitable; every chain method returns
    // the same builder and only a terminal (or an await) resolves.
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit"]) {
      builder[method] = vi.fn(() => builder);
    }
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
  return { client, queries, from };
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
