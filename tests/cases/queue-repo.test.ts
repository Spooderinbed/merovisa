import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listCaseQueue, QUEUE_BATCH_SIZE } from "@/lib/cases/queue-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * The data half of MV-179's Day view: `listCaseQueue` sits ON TOP of
 * `listOrgCases` — the scope rules (cell 7) are inherited, never re-implemented —
 * and batches the three enrichments the queue needs: primary assignments,
 * membership standing, and open plan items.
 *
 * The enrichments are ORDERING-BEARING (attention tiers 1 and 6 read them), so a
 * failed enrichment fails the whole queue rather than silently rendering a wrong
 * order (spec §5: "Filter/count enrichment failure must not silently show zero").
 *
 * Same vacuity discipline as `list-repo.test.ts`: the org always holds at least
 * two cases, and negative fixtures hold an ACTIVE membership.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-user-id";
const COUNSELLOR_USER = "cccc1111-0000-4000-8000-000000000001";
const OWNER_USER = "aaaa1111-0000-4000-8000-000000000002";
const CASE_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const CASE_2 = "aaaaaaaa-0000-4000-8000-000000000002";

function orgFixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE_2,
        organization_id: ORG_A,
        display_name: "Sita Rai",
        email: "sita@example.test",
        operational_status: "in_progress",
        student_user_id: "student-user-id",
        archived_at: null,
        updated_at: "2026-08-10T00:00:00.000Z",
      },
      {
        id: CASE_1,
        organization_id: ORG_A,
        display_name: "Anil Gurung",
        email: null,
        operational_status: "new",
        student_user_id: null,
        archived_at: null,
        updated_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    organization_memberships: [
      { id: "m-owner", organization_id: ORG_A, user_id: OWNER_USER, role: "owner", status: "active" },
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

describe("listCaseQueue — composition on top of listOrgCases", () => {
  test("returns every org case for all-org scope, carrying updated_at through", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.id).sort()).toEqual([CASE_1, CASE_2].sort());
    expect(rowById(result, CASE_1).updatedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result.scopeIsEmpty).toBe(false);
    expect(result.truncated).toBe(false);
  });

  test("assigned scope narrows exactly as listOrgCases does — the security rule is inherited", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(COUNSELLOR_USER, ORG_A, "assigned", client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.id)).toEqual([CASE_1]);
  });

  test("a scope it has no query for is denied, not widened", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(ACTOR, ORG_A, "linked" as never, client);
    expect(result).toEqual({ ok: false, reason: "denied" });
  });

  test("zero cases in scope: an honest empty, and NO enrichment reads are issued", async () => {
    const { client, queries } = fakeCaseDb(
      orgFixture({
        cases: [],
        case_assignments: [],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(result).toEqual({ ok: true, rows: [], members: [], scopeIsEmpty: true, truncated: false });
    expect(queries.some((q) => q.table === "plan_items")).toBe(false);
    expect(queries.some((q) => q.table === "organization_memberships")).toBe(false);
  });
});

describe("listCaseQueue — assignment enrichment", () => {
  test("an assigned case carries the assignee's membership id, role and standing", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(rowById(result, CASE_1).assignment).toEqual({
      membershipId: "m-couns",
      userId: COUNSELLOR_USER,
      role: "counsellor",
      active: true,
    });
  });

  test("an unassigned case carries null", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
    expect(rowById(result, CASE_2).assignment).toBeNull();
  });

  test("an assignee whose membership was switched off is carried as INACTIVE, not dropped", async () => {
    // Spec §2: these cases belong in Needs assignment. Dropping the assignment
    // would render them identically to never-assigned — losing "access switched
    // off", which is a different sentence.
    const { client } = fakeCaseDb(
      orgFixture({
        organization_memberships: [
          { id: "m-owner", organization_id: ORG_A, user_id: OWNER_USER, role: "owner", status: "active" },
          {
            id: "m-couns",
            organization_id: ORG_A,
            user_id: COUNSELLOR_USER,
            role: "counsellor",
            status: "revoked",
          },
        ],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(rowById(result, CASE_1).assignment).toEqual({
      membershipId: "m-couns",
      userId: COUNSELLOR_USER,
      role: "counsellor",
      active: false,
    });
  });

  test("an assignee with NO membership row at all is inactive with a null membership id", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        organization_memberships: [
          { id: "m-owner", organization_id: ORG_A, user_id: OWNER_USER, role: "owner", status: "active" },
        ],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    const assignment = rowById(result, CASE_1).assignment;
    expect(assignment).not.toBeNull();
    expect(assignment?.active).toBe(false);
    expect(assignment?.membershipId).toBeNull();
  });

  test("only primary_counsellor rows are read — a future second role must not leak in", async () => {
    const { client, queries } = fakeCaseDb(orgFixture());
    await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    const assignmentReads = queries.filter((q) => q.table === "case_assignments");
    expect(assignmentReads.length).toBeGreaterThan(0);
    for (const read of assignmentReads) {
      expect(read.filters).toContainEqual(["assignment_role", "primary_counsellor"]);
    }
  });

  test("the org roster comes back for the page's assignee facet", async () => {
    const { client } = fakeCaseDb(orgFixture());
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.members).toEqual([
      { id: "m-owner", userId: OWNER_USER, role: "owner", status: "active" },
      { id: "m-couns", userId: COUNSELLOR_USER, role: "counsellor", status: "active" },
    ]);
  });
});

describe("listCaseQueue — plan-item enrichment", () => {
  const planItem = (
    id: number,
    caseId: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id,
    case_id: caseId,
    owner: null,
    kind: `kind-${id}`,
    impact: "high",
    title: `Item ${id}`,
    body: null,
    lift_estimate: null,
    time_estimate: null,
    status: "todo",
    created_at: "2026-08-01T00:00:00.000Z",
    completed_at: null,
    started_at: null,
    ...overrides,
  });

  test("the earliest actionable open item becomes the case's next step", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        plan_items: [planItem(2, CASE_2), planItem(1, CASE_2)] as CaseDbFixture["plan_items"],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    const next = rowById(result, CASE_2).nextStep;
    expect(next.state).toBe("next");
    expect(next.item?.title).toBe("Item 1");
  });

  test("every open item underway reads as waiting, and a case with no items is caught up", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        plan_items: [
          planItem(1, CASE_2, { started_at: "2026-08-01T00:00:00.000Z" }),
        ] as CaseDbFixture["plan_items"],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(rowById(result, CASE_2).nextStep.state).toBe("waiting");
    expect(rowById(result, CASE_1).nextStep.state).toBe("caught-up");
  });

  test("only OPEN items are read — done and dismissed rows never leave the database", async () => {
    const { client, queries } = fakeCaseDb(orgFixture());
    await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    const planReads = queries.filter((q) => q.table === "plan_items");
    expect(planReads.length).toBeGreaterThan(0);
    for (const read of planReads) {
      expect(read.filters).toContainEqual(["status", "todo"]);
    }
  });

  test("one case's items never bleed into another's", async () => {
    const { client } = fakeCaseDb(
      orgFixture({
        plan_items: [planItem(1, CASE_2)] as CaseDbFixture["plan_items"],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
    expect(rowById(result, CASE_1).nextStep.state).toBe("caught-up");
  });
});

describe("listCaseQueue — an enrichment that failed fails the QUEUE, never the ORDER", () => {
  test.each(["case_assignments", "organization_memberships", "plan_items"] as const)(
    "a failed %s read is an outage, not an empty or misordered queue",
    async (table) => {
      const { client } = fakeCaseDb(orgFixture(), { errorOn: { [table]: { message: "boom" } } });
      const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
      expect(result).toEqual({ ok: false, reason: "lookup-failed" });
    },
  );

  test("a base list failure passes through unchanged", async () => {
    const { client } = fakeCaseDb(orgFixture(), { errorOn: { cases: { message: "boom" } } });
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);
    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });
});

describe("listCaseQueue — batching", () => {
  test("enrichment reads are BATCHED: a 2-case queue costs one read per enrichment table, not per case", async () => {
    const { client, queries } = fakeCaseDb(orgFixture());
    await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(queries.filter((q) => q.table === "case_assignments")).toHaveLength(1);
    expect(queries.filter((q) => q.table === "organization_memberships")).toHaveLength(1);
    expect(queries.filter((q) => q.table === "plan_items")).toHaveLength(1);
  });

  test("past QUEUE_BATCH_SIZE cases, the id list is chunked and every case is still enriched", async () => {
    const count = QUEUE_BATCH_SIZE + 5;
    const cases = Array.from({ length: count }, (_, i) => ({
      id: `case-${String(i).padStart(4, "0")}`,
      organization_id: ORG_A,
      display_name: `Student ${String(i).padStart(4, "0")}`,
      email: null,
      operational_status: "in_progress",
      student_user_id: "student-user-id",
      archived_at: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    }));
    // The LAST case by name lands in the second chunk; its assignment proves the
    // second read really ran and was really merged.
    const lastId = cases[count - 1]!.id;
    const { client, queries } = fakeCaseDb(
      orgFixture({
        cases,
        case_assignments: [
          { id: "asg-x", case_id: lastId, user_id: COUNSELLOR_USER, assignment_role: "primary_counsellor" },
        ],
      }),
    );
    const result = await listCaseQueue(ACTOR, ORG_A, "all-org", client);

    expect(queries.filter((q) => q.table === "case_assignments").length).toBe(2);
    expect(rowById(result, lastId).assignment?.userId).toBe(COUNSELLOR_USER);
  });
});
