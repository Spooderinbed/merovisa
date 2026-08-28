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
export type CaseDbTable =
  | "cases"
  | "organization_memberships"
  | "case_assignments"
  | "organizations"
  | "plan_items"
  | "case_document_requests"
  | "case_document_versions"
  | "case_document_reviews"
  | "invitations";

/** Partial fixture rows — supply only the columns a test cares about. */
export type CaseDbFixture = {
  cases?: Array<Partial<Tables["cases"]["Row"]>>;
  organization_memberships?: Array<Partial<Tables["organization_memberships"]["Row"]>>;
  case_assignments?: Array<Partial<Tables["case_assignments"]["Row"]>>;
  organizations?: Array<Partial<Tables["organizations"]["Row"]>>;
  plan_items?: Array<Partial<Tables["plan_items"]["Row"]>>;
  case_document_requests?: Array<Partial<Tables["case_document_requests"]["Row"]>>;
  case_document_versions?: Array<Partial<Tables["case_document_versions"]["Row"]>>;
  case_document_reviews?: Array<Partial<Tables["case_document_reviews"]["Row"]>>;
  invitations?: Array<Partial<Tables["invitations"]["Row"]>>;
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
   * Tables whose DELETE answers with a PostgREST error — a column/table grant
   * violation (`42501`).
   */
  deleteError?: Partial<Record<CaseDbTable, { code?: string; message: string }>>;
  /**
   * Tables whose DELETE is refused by POLICY rather than by grant: it affects
   * **zero rows and raises nothing**, which is how Postgres reports an RLS
   * refusal. This is NOT the same as the filters matching no row, and modelling
   * it needs its own switch — a row can be READABLE and not DELETABLE. On
   * `case_assignments` that is a real shape: `case_assignments_select_accessor`
   * admits any staff member of the case, while `case_assignments_delete_admin`
   * requires `can_manage_case`. So an assigned counsellor sees the assignment
   * row they cannot remove.
   */
  deleteRefused?: CaseDbTable[];
  /**
   * Tables whose DELETE **lost a race**: another actor removed the row between our
   * read and our delete, so our predicate matches nothing, Postgres reports zero
   * rows and raises nothing — and a later read cannot see the row either.
   *
   * This needs its own switch because it differs from `deleteRefused` in exactly
   * one observable way, and that one way is the whole point: both affect zero rows,
   * but a REFUSED delete leaves the row IN PLACE while a LOST RACE leaves it GONE.
   * A caller that re-reads can therefore tell "you may not do this" from "somebody
   * else got there first" — and reporting the second as the first is a claim about
   * the user's permissions that is simply false.
   */
  deleteLostRace?: CaseDbTable[];
  /**
   * Tables whose ordinary reads answer with a PostgREST error once a DELETE has
   * been attempted. Models the disambiguating re-read after a zero-row delete
   * failing, so "we could not tell" cannot be dressed up as either of the two
   * answers it was asked to choose between.
   */
  errorAfterDelete?: CaseDbTable[];
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
  /**
   * Every `.select(columns)` this query chained, verbatim.
   *
   * MV-193 needs it and no earlier caller did. The fake answers from whole fixture
   * rows whatever a caller selects, so a repository that asked PostgREST for
   * `token_hash` and then merely declined to MAP it looks identical here to one
   * that never asked — while over the wire the two differ by a credential digest.
   * Recording the projection is what lets a test assert on the column list the
   * query actually carried rather than on what survived the mapping.
   */
  select: string[];
  /**
   * `.gt(column, value)` / `.lt(column, value)` predicates, in chain order.
   *
   * MV-194 needs them and no earlier caller did: the invitation compare-and-swap's
   * fourth predicate is `expires_at > now()`, and it must ride IN the statement —
   * an expiry checked in JavaScript after the update has already accepted the
   * invitation. Kept apart from `filters` because those are equalities matched by
   * `===`, and folding an inequality in there would make `rowsFor()` silently
   * compare a timestamp for identity and match nothing.
   *
   * Values are compared as instants when both sides parse as dates, and
   * lexically otherwise, so a fixture may write either an ISO string or a number.
   */
  comparisons: Array<[string, "gt" | "lt", unknown]>;
  /**
   * `.not(column, operator, value)` predicates, in chain order.
   *
   * MV-195 needs one and no earlier caller did: `listLinkedConsultancyCases` asks for
   * `organization_id IS NOT NULL` — the mirror image of the `is("organization_id", null)`
   * that keeps `resolvePersonalCaseId` off a consultancy case. It is recorded AND honoured
   * by `rowsFor()` below, because a fake that recorded it without applying it would let a
   * resolver missing the predicate return the personal case and still pass.
   */
  negations: Array<[string, string, unknown]>;
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
  const deleteRefused = new Set<string>(options.deleteRefused ?? []);
  const deleteLostRace = new Set<string>(options.deleteLostRace ?? []);
  const errorAfterDelete = new Set<string>(options.errorAfterDelete ?? []);
  const throwOn = new Set<string>(options.throwOn ?? []);
  // Mutable so an insert can make its own row readable to a later query, which is
  // what lets a test distinguish "read it back" from "returned what it wrote".
  const rows: Record<string, Row[]> = {};
  for (const [table, seed] of Object.entries(fixture)) {
    rows[table] = [...((seed ?? []) as Row[])];
  }
  let insertAttempts = 0;
  // Shared across `from()` calls, so a read issued AFTER a delete can answer
  // differently from the same read issued before one.
  let deleteAttempts = 0;

  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const comparisons: Array<[string, "gt" | "lt", unknown]> = [];
    const negations: Array<[string, string, unknown]> = [];
    const record: RecordedQuery = {
      table,
      filters,
      order: [],
      limit: null,
      select: [],
      comparisons,
      negations,
    };
    queries.push(record);

    /** One side of a `.gt()`/`.lt()` as a comparable number, or the raw string. */
    const comparable = (value: unknown): number | string => {
      if (typeof value === "number") return value;
      const parsed = Date.parse(String(value));
      return Number.isNaN(parsed) ? String(value) : parsed;
    };

    const rowsFor = (): Row[] => {
      const all = rows[table] ?? [];
      // An array-valued filter is an `.in()` predicate: the column must be one of
      // the listed values. Everything else is an equality from `.eq()`/`.is()`.
      const matched = all
        .filter((row) =>
          filters.every(([column, value]) =>
            Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
          ),
        )
        // `.not(column, "is", null)` — the only negation any caller issues today, and
        // the one `listLinkedConsultancyCases` leans on. Anything else is refused loudly
        // rather than silently matching every row, which is how a fake turns a missing
        // predicate into a green test.
        .filter((row) =>
          negations.every(([column, op, value]) => {
            if (op === "is" && value === null) {
              return row[column] !== null && row[column] !== undefined;
            }
            throw new Error(`fakeCaseDb: unsupported .not(${column}, ${op}, ${String(value)})`);
          }),
        )
        .filter((row) =>
          comparisons.every(([column, op, value]) => {
            // A null column satisfies no inequality, which is what Postgres does.
            if (row[column] === null || row[column] === undefined) return false;
            const left = comparable(row[column]);
            const right = comparable(value);
            return op === "gt" ? left > right : left < right;
          }),
        );
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
        deleteAttempts += 1;
        const failure = deleteError[table as CaseDbTable];
        if (failure) return { data: null, error: failure };
        // A DELETE the POLICY refuses: zero rows, no error, rows untouched.
        if (deleteRefused.has(table)) {
          return { data: mode === "one" ? null : [], error: null };
        }
        // A DELETE that LOST A RACE: zero rows, no error — and the row is gone,
        // because whoever won removed it. Same return value as the refusal above,
        // different state left behind, which is the only thing that tells them
        // apart afterwards.
        if (deleteLostRace.has(table)) {
          const gone = rowsFor();
          rows[table] = (rows[table] ?? []).filter((row) => !gone.includes(row));
          return { data: mode === "one" ? null : [], error: null };
        }
        // Same reading as UPDATE: a refused DELETE is zero rows, not an error.
        // The rows really leave, so a later read cannot see what was removed —
        // which is what lets a test tell "replaced" from "inserted alongside".
        const removed = rowsFor();
        rows[table] = (rows[table] ?? []).filter((row) => !removed.includes(row));
        if (mode === "one") return { data: removed[0] ?? null, error: null };
        return { data: removed, error: null };
      }
      if (errorAfterDelete.has(table) && deleteAttempts > 0) {
        return { data: null, error: { message: `fakeCaseDb: read on "${table}" failed after a delete` } };
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
    builder.select = vi.fn((columns?: unknown) => {
      // `.select()` with no argument is PostgREST's "everything", which is what a
      // write chains to read its own row back. Recorded as `*` so a projection
      // assertion cannot be satisfied by the absence of an argument.
      record.select.push(typeof columns === "string" ? columns : "*");
      return builder;
    });
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
    // `.in(column, values)` — recorded with its array value, matched by inclusion.
    builder.in = vi.fn((column: string, values: unknown[]) => {
      filters.push([column, values]);
      return builder;
    });
    for (const op of ["gt", "lt"] as const) {
      builder[op] = vi.fn((column: string, value: unknown) => {
        comparisons.push([column, op, value]);
        return builder;
      });
    }
    builder.not = vi.fn((column: string, op: string, value: unknown) => {
      negations.push([column, op, value]);
      return builder;
    });
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
