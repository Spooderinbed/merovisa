import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listCaseQueue } from "@/lib/cases/queue-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-183 — the lodgement enrichment on the Day view queue (spec §2, the Lodgement
 * column).
 *
 * ## It is display-only, and that decides how a failure behaves
 *
 * Spec §5 gives an enrichment failure two options: "omit the failed optional
 * summary with an outage note, or fail the queue if it changes ordering". The
 * assignment and plan reads change ordering (attention tiers 1 and 6), so
 * `queue-repo.ts` fails the queue for those. The lodgement read does NOT — spec §2's
 * attention tier 4 ("has a named blocking item") stays unproduced in this slice, so
 * the sort is byte-for-byte what MV-179 shipped. A failed lodgement read therefore
 * leaves every other column true and marks its own column as an outage, which is
 * strictly more useful than blanking a working queue.
 *
 * WHAT IT MAY NEVER DO is come back empty and be spent as "nothing outstanding" —
 * that would print a reassuring word on a case that may well be blocked.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-user-id";
const COUNSELLOR_USER = "cccc1111-0000-4000-8000-000000000001";
const CASE_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const CASE_2 = "aaaaaaaa-0000-4000-8000-000000000002";

function orgFixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE_1,
        organization_id: ORG_A,
        display_name: "Anil Gurung",
        email: "anil@example.test",
        operational_status: "in_progress",
        student_user_id: "student-1",
        archived_at: null,
        updated_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: CASE_2,
        organization_id: ORG_A,
        display_name: "Sita Rai",
        email: "sita@example.test",
        operational_status: "in_progress",
        student_user_id: "student-2",
        archived_at: null,
        updated_at: "2026-08-10T00:00:00.000Z",
      },
    ],
    organization_memberships: [
      {
        id: "m-couns",
        organization_id: ORG_A,
        user_id: COUNSELLOR_USER,
        role: "counsellor",
        status: "active",
      },
    ],
    case_assignments: [
      { id: "asg-1", case_id: CASE_1, user_id: COUNSELLOR_USER, assignment_role: "primary_counsellor" },
      { id: "asg-2", case_id: CASE_2, user_id: COUNSELLOR_USER, assignment_role: "primary_counsellor" },
    ],
    ...overrides,
  };
}

const rowById = (result: Awaited<ReturnType<typeof listCaseQueue>>, id: string) => {
  if (!result.ok) throw new Error(`NOT OK: ${result.reason}`);
  const row = result.rows.find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe("listCaseQueue — the lodgement read on every row", () => {
  test("a case with an outstanding request is blocked by its soonest-due item", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_document_requests: [
          {
            id: "req-late",
            case_id: CASE_1,
            title: "Bank statement",
            status: "outstanding",
            due_at: "2026-09-01T00:00:00.000Z",
            created_at: "2026-08-01T00:00:00.000Z",
          },
          {
            id: "req-soon",
            case_id: CASE_1,
            title: "Passport bio page",
            status: "outstanding",
            due_at: "2026-08-20T00:00:00.000Z",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
    const lodgement = rowById(result, CASE_1).lodgement;

    expect(lodgement.state).toBe("blocked");
    if (lodgement.state !== "blocked") return;
    expect(lodgement.blocker.title).toBe("Passport bio page");
    expect(lodgement.otherOutstanding).toBe(1);
  });

  test("a case with no outstanding request reports none-outstanding, never 'clear'", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_document_requests: [
          {
            id: "req-done",
            case_id: CASE_2,
            title: "Bank statement",
            status: "resolved",
            due_at: null,
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    // The queue reads outstanding rows only, so it cannot know whether anything was
    // ever asked for. It says the weaker true thing.
    expect(rowById(result, CASE_2).lodgement.state).toBe("none-outstanding");
  });

  test("one case's requests never leak onto another's row", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        case_document_requests: [
          {
            id: "req-1",
            case_id: CASE_1,
            title: "Passport bio page",
            status: "outstanding",
            due_at: null,
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(rowById(result, CASE_1).lodgement.state).toBe("blocked");
    expect(rowById(result, CASE_2).lodgement.state).toBe("none-outstanding");
  });

  test("BATCHED: two cases cost one document-request query, not two", async () => {
    const { client, queries } = fakeCaseDb(orgFixture({ case_document_requests: [] }));

    await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(queries.filter((q) => q.table === "case_document_requests")).toHaveLength(1);
  });

  test("counsellor scope is inherited — an unassigned case brings no lodgement read either", async () => {
    const { client, queries } = fakeCaseDb(
      orgFixture({
        case_assignments: [
          {
            id: "asg-1",
            case_id: CASE_1,
            user_id: ACTOR,
            assignment_role: "primary_counsellor",
          },
        ],
        organization_memberships: [
          { id: "m-self", organization_id: ORG_A, user_id: ACTOR, role: "counsellor", status: "active" },
        ],
        case_document_requests: [
          {
            id: "req-2",
            case_id: CASE_2,
            title: "Sponsor letter",
            status: "outstanding",
            due_at: null,
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await listCaseQueue(ACTOR, ORG_A, "assigned", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.id)).toEqual([CASE_1]);
    // The read is scoped to the cases the queue actually returned, so an
    // out-of-scope case is never even asked about.
    const read = queries.find((q) => q.table === "case_document_requests");
    expect(read?.filters).toContainEqual(["case_id", [CASE_1]]);
  });
});

describe("listCaseQueue — a failed lodgement read is an outage on its own column", () => {
  test("the queue still renders, with every lodgement marked unavailable", async () => {
    const { client } = fakeCaseDb(orgFixture(), {
      errorOn: { case_document_requests: { message: "boom" } },
    });

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    // The rest of the queue is still true, so blanking it would cost more than it
    // saves (spec §5 — the failure changes no ordering).
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(rowById(result, CASE_1).lodgement.state).toBe("unavailable");
    expect(rowById(result, CASE_2).lodgement.state).toBe("unavailable");
  });

  test("a failed read is NEVER spent as 'nothing outstanding'", async () => {
    const { client } = fakeCaseDb(orgFixture(), {
      errorOn: { case_document_requests: { message: "boom" } },
    });

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const row of result.rows) {
      expect(row.lodgement.state).not.toBe("none-outstanding");
      expect(row.lodgement.state).not.toBe("clear");
    }
  });

  test("a thrown document-request read leaves the queue standing", async () => {
    const { client } = fakeCaseDb(orgFixture(), { throwOn: ["case_document_requests"] });

    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(rowById(result, CASE_1).lodgement.state).toBe("unavailable");
  });

  test("an ordering-bearing read still fails the WHOLE queue — that rule is unchanged", async () => {
    const { client } = fakeCaseDb(orgFixture(), {
      errorOn: { plan_items: { message: "boom" } },
    });

    await expect(listCaseQueue(ACTOR, ORG_A, "all-org", client)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});
