import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listOrgCases } from "@/lib/cases/list-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * The data half of access-matrix cell 7 — the org-scoped student list.
 *
 * These run against an in-memory fake and prove this layer's SEMANTICS: what it
 * asks the database for, and what it does with the answer. They are
 * *categorically incapable* of proving the database refuses a cross-tenant read
 * (`lib/cases/README.md` §"The SQL half is not optional"); that half is
 * `cases_select_accessor` and is pinned by `tests/integration/case-rls.itest.ts`,
 * which this slice does not touch.
 *
 * THE VACUITY TRAP, from spec §9.2 row E2, and why every fixture below looks the
 * way it does: a fixture holding ONE case, or an "unassigned" counsellor holding
 * NO membership at all, turns an assignment test into a tenancy test that Stage 1
 * already passes. So the organization always holds **two** cases, and the
 * unassigned counsellor always holds an **active** membership in it.
 *
 * The property these prove that a green integration suite would not: the app
 * layer applies the `assigned` scope ITSELF. `cases_select_accessor`'s first
 * disjunct is `student_user_id = auth.uid()`, so RLS alone would hand a
 * counsellor any case in the organization that they happen to be the student of —
 * which cell 7 does not give them.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const COUNSELLOR = "counsellor-user-id";
const CASE_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const CASE_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const CASE_OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000003";

/** Two cases in ORG_A and one in ORG_B — never one case, see the vacuity note. */
function orgFixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE_2,
        organization_id: ORG_A,
        display_name: "Sita Rai",
        email: "sita@example.test",
        operational_status: "in_progress",
        student_user_id: null,
        archived_at: null,
      },
      {
        id: CASE_1,
        organization_id: ORG_A,
        display_name: "Anil Gurung",
        email: null,
        operational_status: "new",
        student_user_id: "student-user-id",
        archived_at: null,
      },
      {
        id: CASE_OTHER_ORG,
        organization_id: ORG_B,
        display_name: "Bikash Thapa",
        email: null,
        operational_status: "new",
        student_user_id: null,
        archived_at: null,
      },
    ],
    ...overrides,
  };
}

const names = (result: Awaited<ReturnType<typeof listOrgCases>>): string[] =>
  result.ok ? result.data.map((row) => row.displayName) : [`NOT OK: ${result.reason}`];

describe("listOrgCases — all-org scope (owner and admin)", () => {
  test("returns every case in the selected organization, and none from another", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client);
    expect(names(result)).toEqual(["Anil Gurung", "Sita Rai"]);
  });

  test("is sorted by name, and the fixture is seeded out of order so the sort is load-bearing", async () => {
    // The MV-169 lesson: a pre-sorted fixture lets `.sort()` be deleted from the
    // repository with every assertion still green. `Sita` is seeded first above.
    const { client } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client);
    expect(names(result)[0]).toBe("Anil Gurung");
  });

  test("does not read `case_assignments` at all — an admin's reach is the organization", async () => {
    const { client, queries } = fakeCaseDb(orgFixture());
    await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client);
    expect(queries.some((query) => query.table === "case_assignments")).toBe(false);
  });
});

describe("listOrgCases — assigned scope (counsellor)", () => {
  test("returns the assigned case and NOT the other case in the same organization", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_assignments: [
          { id: "asg-1", case_id: CASE_1, user_id: COUNSELLOR, assignment_role: "primary_counsellor" },
        ],
      }),
    );
    const result = await listOrgCases(COUNSELLOR, ORG_A, "assigned", {}, client);
    expect(names(result)).toEqual(["Anil Gurung"]);
  });

  test("an ACTIVE but unassigned counsellor sees nothing, in an organization that holds cases", async () => {
    // Cell 7's `C− = ∅`. The organization holds two readable cases and the
    // membership is active — the ONLY thing that can empty this list is the
    // assignment filter, which is the point of the test.
    const { client } = fakeCaseDb(
      orgFixture({
        organization_memberships: [
          { id: "m-1", organization_id: ORG_A, user_id: COUNSELLOR, role: "counsellor", status: "active" },
        ],
        case_assignments: [],
      }),
    );
    const result = await listOrgCases(COUNSELLOR, ORG_A, "assigned", {}, client);
    expect(result).toEqual({ ok: true, data: [] });
  });

  test("an assignment in a DIFFERENT organization does not leak a case into this list", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_assignments: [
          {
            id: "asg-2",
            case_id: CASE_OTHER_ORG,
            user_id: COUNSELLOR,
            assignment_role: "primary_counsellor",
          },
        ],
      }),
    );
    const result = await listOrgCases(COUNSELLOR, ORG_A, "assigned", {}, client);
    expect(result).toEqual({ ok: true, data: [] });
  });

  test("another counsellor's assignment is not the actor's — the filter is on user_id", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_assignments: [
          {
            id: "asg-3",
            case_id: CASE_1,
            user_id: "somebody-else",
            assignment_role: "primary_counsellor",
          },
        ],
      }),
    );
    const result = await listOrgCases(COUNSELLOR, ORG_A, "assigned", {}, client);
    expect(result).toEqual({ ok: true, data: [] });
  });
});

describe("listOrgCases — what a row carries", () => {
  test("reports whether a student can edit this case's name and email, without carrying their id", async () => {
    // Spec F-3 reading (a). `cases_update_accessor`'s student disjunct is
    // `student_user_id = auth.uid()`, so nullness of that column is exactly
    // "a student can write display_name/email here". The id itself is neither
    // useful to a counsellor nor safe in markup, so it does not leave this layer.
    const { client } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.hasLinkedStudent).toBe(true);
    expect(result.data[1]?.hasLinkedStudent).toBe(false);
    expect(JSON.stringify(result.data)).not.toContain("student-user-id");
  });

  test("carries the status and the archive stamp verbatim", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        cases: [
          {
            id: CASE_1,
            organization_id: ORG_A,
            display_name: "Anil Gurung",
            email: "anil@example.test",
            operational_status: "ready_for_review",
            student_user_id: null,
            archived_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client);

    expect(result.ok && result.data[0]).toEqual({
      id: CASE_1,
      displayName: "Anil Gurung",
      email: "anil@example.test",
      operationalStatus: "ready_for_review",
      hasLinkedStudent: false,
      archivedAt: "2026-08-01T00:00:00.000Z",
    });
  });
});

describe("listOrgCases — the status filter", () => {
  test("sends a known status to the database as a predicate", async () => {
    const { client, queries } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", { status: "in_progress" }, client);

    expect(names(result)).toEqual(["Sita Rai"]);
    expect(
      queries.some(
        (query) =>
          query.table === "cases" &&
          query.filters.some(([column, value]) => column === "operational_status" && value === "in_progress"),
      ),
    ).toBe(true);
  });

  test("a status outside the check constraint is IGNORED, never sent as a predicate", async () => {
    // It can only arrive from a hand-edited query string. Sending it would query
    // for a value the column cannot hold; dropping it shows the unfiltered list,
    // which is what the page then says out loud.
    const { client, queries } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(COUNSELLOR, ORG_A, "all-org", { status: "archived" }, client);

    expect(names(result)).toEqual(["Anil Gurung", "Sita Rai"]);
    expect(
      queries.some(
        (query) =>
          query.table === "cases" && query.filters.some(([column]) => column === "operational_status"),
      ),
    ).toBe(false);
  });
});

describe("listOrgCases — the search", () => {
  test("matches part of the name, case-insensitively", async () => {
    const { client } = fakeCaseDb(orgFixture());
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "gur" }, client))).toEqual([
      "Anil Gurung",
    ]);
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "SITA" }, client))).toEqual([
      "Sita Rai",
    ]);
  });

  test("matches the email address too", async () => {
    const { client } = fakeCaseDb(orgFixture());
    expect(
      names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "sita@example" }, client)),
    ).toEqual(["Sita Rai"]);
  });

  test("treats `%` and `_` as characters, not as wildcards", async () => {
    // A search for `100%` that quietly matches every student is worse than one
    // that matches nobody: the counsellor reads the whole list as a result.
    const { client } = fakeCaseDb(orgFixture());
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "%" }, client))).toEqual([]);
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "_" }, client))).toEqual([]);
  });

  test("a blank or whitespace-only term is not a filter", async () => {
    const { client } = fakeCaseDb(orgFixture());
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "   " }, client))).toEqual([
      "Anil Gurung",
      "Sita Rai",
    ]);
  });

  test("a term that matches nothing returns an empty list, not everything", async () => {
    const { client } = fakeCaseDb(orgFixture());
    expect(names(await listOrgCases(COUNSELLOR, ORG_A, "all-org", { query: "zzz" }, client))).toEqual([]);
  });
});

describe("listOrgCases — refusing to guess", () => {
  test("a scope this layer does not recognise DENIES rather than widening to all-org", async () => {
    // `checkOrgPermission` returns the scope and the caller must use it. A cast,
    // or a matrix edit handing some role a scope this function has no query for,
    // must not fall through to the widest one.
    const { client, queries } = fakeCaseDb(orgFixture());
    const result = await listOrgCases(
      COUNSELLOR,
      ORG_A,
      "linked" as unknown as "all-org",
      {},
      client,
    );
    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(queries).toEqual([]);
  });

  test("a failed `cases` lookup is a FAILURE, not an empty organization", async () => {
    const { client } = fakeCaseDb(orgFixture(), { errorOn: { cases: { message: "boom" } } });
    expect(await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a failed `case_assignments` lookup is a FAILURE, not 'you are assigned to nobody'", async () => {
    const { client } = fakeCaseDb(orgFixture(), { errorOn: { case_assignments: { message: "boom" } } });
    expect(await listOrgCases(COUNSELLOR, ORG_A, "assigned", {}, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a thrown client denies rather than escaping to the caller", async () => {
    const { client } = fakeCaseDb(orgFixture(), { throwOn: ["cases"] });
    expect(await listOrgCases(COUNSELLOR, ORG_A, "all-org", {}, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("a blank actor id or organization id earns no query at all", async () => {
    for (const [actor, org] of [
      ["   ", ORG_A],
      [COUNSELLOR, "  "],
    ] as const) {
      const { client, queries } = fakeCaseDb(orgFixture());
      expect(await listOrgCases(actor, org, "all-org", {}, client)).toEqual({
        ok: false,
        reason: "lookup-failed",
      });
      expect(queries).toEqual([]);
    }
  });
});
