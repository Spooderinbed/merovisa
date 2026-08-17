import { describe, test, expect } from "vitest";

import {
  resolveNextAction,
  dependsOnPlan,
  NEXT_ACTION_KINDS,
  attentionTier,
  needsAction,
  sortQueue,
  filterByView,
  applyQueueFacets,
  matchesCaseSearch,
  summarizeWorkload,
  parseQueueSearchParams,
  buildQueueHref,
  QUEUE_VIEWS,
  type QueueCase,
} from "@/lib/cases/queue";

/**
 * The pure half of MV-179's Day view: next-action resolution and the attention
 * sort (spec §2 gives the exact orders), plus the view/facet filters and the
 * workload counts the page renders.
 *
 * Everything here is deterministic and side-effect free — the repository's job
 * is only to fetch the ingredients. The MISTAKES.md vacuity rule shapes the sort
 * tests: they assert on the RENDERED ORDER of whole lists seeded out of order,
 * never on "contains".
 */

const ASSIGNED = { membershipId: "m-1", userId: "11112222-aaaa-4aaa-8aaa-000000000001", role: "counsellor", active: true };

function qc(overrides: Partial<QueueCase> = {}): QueueCase {
  return {
    id: "case-1",
    displayName: "Anil Gurung",
    email: "anil@example.test",
    operationalStatus: "in_progress",
    hasLinkedStudent: true,
    archivedAt: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    assignment: ASSIGNED,
    nextStep: { state: "caught-up", item: null, openCount: 0, waitingCount: 0 },
    ...overrides,
  };
}

/** A plan selection whose next actionable item carries `title`. */
function planNext(title: string) {
  return {
    state: "next" as const,
    item: {
      id: 7,
      owner: null,
      kind: "ielts_booking",
      impact: "high" as const,
      title,
      body: null,
      liftEstimate: null,
      timeEstimate: null,
      status: "todo" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
      startedAt: null,
    },
    openCount: 3,
    waitingCount: 0,
  };
}

const PLAN_WAITING = { state: "waiting" as const, item: null, openCount: 2, waitingCount: 2 };

describe("resolveNextAction — the spec §2 resolution order, one action per row", () => {
  const canAssign = { canAssign: true };

  test("1. an archived case has no action, whatever else is true of it", () => {
    const action = resolveNextAction(
      qc({ archivedAt: "2026-08-01T00:00:00.000Z", operationalStatus: "ready_for_review", assignment: null }),
      canAssign,
    );
    expect(action).toEqual({ kind: "none", label: "No action" });
  });

  test("1. a closed case has no action either", () => {
    expect(resolveNextAction(qc({ operationalStatus: "closed" }), canAssign)).toEqual({
      kind: "none",
      label: "No action",
    });
  });

  test("2. no assignment at all, for a viewer who can assign", () => {
    expect(resolveNextAction(qc({ assignment: null }), canAssign)).toEqual({
      kind: "assign",
      label: "Assign a counsellor",
    });
  });

  test("2. an assignment whose membership is INACTIVE also needs assigning — access was switched off", () => {
    const action = resolveNextAction(qc({ assignment: { ...ASSIGNED, active: false } }), canAssign);
    expect(action).toEqual({ kind: "assign", label: "Assign a counsellor" });
  });

  test("2. beats 3: an unassigned ready-for-review case asks for a counsellor first", () => {
    const action = resolveNextAction(
      qc({ assignment: null, operationalStatus: "ready_for_review" }),
      canAssign,
    );
    expect(action.kind).toBe("assign");
  });

  test("2. never fires for a viewer who cannot assign — the resolution falls through", () => {
    // A counsellor's queue is assigned-by-construction, but the helper must not
    // rely on that: spec §2 scopes the sentence to owner/admin.
    const action = resolveNextAction(
      qc({ assignment: null, operationalStatus: "ready_for_review" }),
      { canAssign: false },
    );
    expect(action).toEqual({ kind: "review", label: "Review the case" });
  });

  test("3. ready for review", () => {
    expect(resolveNextAction(qc({ operationalStatus: "ready_for_review" }), canAssign)).toEqual({
      kind: "review",
      label: "Review the case",
    });
  });

  test("3. beats 4: review comes before inviting an unlinked student", () => {
    const action = resolveNextAction(
      qc({ operationalStatus: "ready_for_review", hasLinkedStudent: false }),
      canAssign,
    );
    expect(action.kind).toBe("review");
  });

  test("4. unlinked with an email on file invites the student", () => {
    expect(resolveNextAction(qc({ hasLinkedStudent: false }), canAssign)).toEqual({
      kind: "invite",
      label: "Invite the student",
    });
  });

  test("5. unlinked without an email asks for one", () => {
    expect(resolveNextAction(qc({ hasLinkedStudent: false, email: null }), canAssign)).toEqual({
      kind: "add-email",
      label: "Add an email to invite",
    });
  });

  test("4. beats 7: invitation outranks a plan item on an unlinked case", () => {
    const action = resolveNextAction(
      qc({ hasLinkedStudent: false, nextStep: planNext("Book an IELTS test") }),
      canAssign,
    );
    expect(action.kind).toBe("invite");
  });

  test("7. the selected plan item's title IS the action", () => {
    expect(resolveNextAction(qc({ nextStep: planNext("Book an IELTS test") }), canAssign)).toEqual({
      kind: "plan-item",
      label: "Book an IELTS test",
    });
  });

  test("7. beats 8: an actionable plan item outranks the waiting-on-student status", () => {
    const action = resolveNextAction(
      qc({ operationalStatus: "waiting_on_student", nextStep: planNext("Collect bank statements") }),
      canAssign,
    );
    expect(action).toEqual({ kind: "plan-item", label: "Collect bank statements" });
  });

  test("8. waiting on student, when no plan item is actionable", () => {
    expect(
      resolveNextAction(qc({ operationalStatus: "waiting_on_student", nextStep: PLAN_WAITING }), canAssign),
    ).toEqual({ kind: "waiting-on-student", label: "Waiting on student" });
  });

  test("9. every open plan item underway reads as underway, not as caught up", () => {
    expect(resolveNextAction(qc({ nextStep: PLAN_WAITING }), canAssign)).toEqual({
      kind: "plan-underway",
      label: "Plan items underway",
    });
  });

  test("10. nothing else true: open the case", () => {
    expect(resolveNextAction(qc(), canAssign)).toEqual({ kind: "open", label: "Open the case" });
  });
});

describe("attentionTier — the spec §2 tier order", () => {
  test("each tier, from its own minimal case", () => {
    expect(attentionTier(qc({ assignment: null }))).toBe(1);
    expect(attentionTier(qc({ assignment: { ...ASSIGNED, active: false } }))).toBe(1);
    expect(attentionTier(qc({ operationalStatus: "ready_for_review" }))).toBe(2);
    expect(attentionTier(qc({ hasLinkedStudent: false }))).toBe(3);
    expect(attentionTier(qc({ operationalStatus: "new" }))).toBe(5);
    expect(attentionTier(qc({ nextStep: planNext("Book an IELTS test") }))).toBe(6);
    expect(attentionTier(qc())).toBe(7);
    expect(attentionTier(qc({ operationalStatus: "waiting_on_student" }))).toBe(8);
    expect(attentionTier(qc({ operationalStatus: "closed" }))).toBe(9);
    expect(attentionTier(qc({ archivedAt: "2026-08-01T00:00:00.000Z" }))).toBe(10);
  });

  test("closed and archived outrank everything — a closed unassigned case is tier 9, not tier 1", () => {
    expect(attentionTier(qc({ operationalStatus: "closed", assignment: null }))).toBe(9);
    expect(
      attentionTier(qc({ archivedAt: "2026-08-01T00:00:00.000Z", operationalStatus: "closed" })),
    ).toBe(10);
  });

  test("needsAction draws the line after tier 6", () => {
    expect(needsAction(qc({ nextStep: planNext("Book an IELTS test") }))).toBe(true); // tier 6
    expect(needsAction(qc())).toBe(false); // tier 7
    expect(needsAction(qc({ operationalStatus: "waiting_on_student" }))).toBe(false); // tier 8
  });
});

describe("sortQueue — rendered ORDER, never mere presence", () => {
  test("attention sort walks the tiers; the fixture is seeded backwards so the sort is load-bearing", () => {
    const rows = [
      qc({ id: "c-archived", displayName: "Archived", archivedAt: "2026-08-01T00:00:00.000Z" }),
      qc({ id: "c-closed", displayName: "Closed", operationalStatus: "closed" }),
      qc({ id: "c-waiting", displayName: "Waiting", operationalStatus: "waiting_on_student" }),
      qc({ id: "c-quiet", displayName: "Quiet" }),
      qc({ id: "c-plan", displayName: "Plan", nextStep: planNext("Book an IELTS test") }),
      qc({ id: "c-new", displayName: "New", operationalStatus: "new" }),
      qc({ id: "c-unlinked", displayName: "Unlinked", hasLinkedStudent: false }),
      qc({ id: "c-review", displayName: "Review", operationalStatus: "ready_for_review" }),
      qc({ id: "c-unassigned", displayName: "Unassigned", assignment: null }),
    ];
    expect(sortQueue(rows, "attention").map((r) => r.id)).toEqual([
      "c-unassigned",
      "c-review",
      "c-unlinked",
      "c-new",
      "c-plan",
      "c-quiet",
      "c-waiting",
      "c-closed",
      "c-archived",
    ]);
  });

  test("within a tier: updated_at OLDEST first — neglect rises", () => {
    const rows = [
      qc({ id: "c-fresh", displayName: "Fresh", updatedAt: "2026-08-15T00:00:00.000Z" }),
      qc({ id: "c-stale", displayName: "Stale", updatedAt: "2026-07-01T00:00:00.000Z" }),
    ];
    expect(sortQueue(rows, "attention").map((r) => r.id)).toEqual(["c-stale", "c-fresh"]);
  });

  test("same tier and timestamp: display name, then case id", () => {
    const rows = [
      qc({ id: "c-b", displayName: "Sita Rai" }),
      qc({ id: "c-2", displayName: "Anil Gurung" }),
      qc({ id: "c-1", displayName: "Anil Gurung" }),
    ];
    expect(sortQueue(rows, "attention").map((r) => r.id)).toEqual(["c-1", "c-2", "c-b"]);
  });

  test("name sort ignores tiers", () => {
    const rows = [
      qc({ id: "c-z", displayName: "Zara", assignment: null }),
      qc({ id: "c-a", displayName: "Anil" }),
    ];
    expect(sortQueue(rows, "name").map((r) => r.id)).toEqual(["c-a", "c-z"]);
  });

  test("updated sort is most recent FIRST — the opposite tie-break of attention", () => {
    const rows = [
      qc({ id: "c-stale", updatedAt: "2026-07-01T00:00:00.000Z" }),
      qc({ id: "c-fresh", updatedAt: "2026-08-15T00:00:00.000Z" }),
    ];
    expect(sortQueue(rows, "updated").map((r) => r.id)).toEqual(["c-fresh", "c-stale"]);
  });

  test("does not mutate its input", () => {
    const rows = [qc({ id: "c-2", displayName: "B" }), qc({ id: "c-1", displayName: "A" })];
    sortQueue(rows, "name");
    expect(rows.map((r) => r.id)).toEqual(["c-2", "c-1"]);
  });
});

describe("filterByView — queue membership per spec §2", () => {
  const ARCHIVED = qc({ id: "c-archived", archivedAt: "2026-08-01T00:00:00.000Z" });
  const CLOSED = qc({ id: "c-closed", operationalStatus: "closed" });
  const WAITING = qc({ id: "c-waiting", operationalStatus: "waiting_on_student" });
  const READY = qc({ id: "c-ready", operationalStatus: "ready_for_review" });
  const UNASSIGNED = qc({ id: "c-unassigned", assignment: null });
  const INACTIVE_ASSIGNEE = qc({ id: "c-inactive", assignment: { ...ASSIGNED, active: false } });
  const CLOSED_UNASSIGNED = qc({ id: "c-closed-unassigned", operationalStatus: "closed", assignment: null });
  const QUIET = qc({ id: "c-quiet" });
  const ALL = [ARCHIVED, CLOSED, WAITING, READY, UNASSIGNED, INACTIVE_ASSIGNEE, CLOSED_UNASSIGNED, QUIET];

  test("needs-action keeps tiers 1–6 and drops archived, closed, waiting and quiet cases", () => {
    expect(filterByView(ALL, "needs-action").map((r) => r.id)).toEqual([
      "c-ready",
      "c-unassigned",
      "c-inactive",
    ]);
  });

  test("all admits closed cases but leaves archived to the All-cases directory", () => {
    // Spec §2's asymmetry: closed cases are only "omitted from the DEFAULT Day
    // view"; archived cases "appear only in All cases" — the /students
    // directory, not this tab. The strip's "All" count excludes archived, and
    // the tab sharing that word must agree with it.
    const ids = filterByView(ALL, "all").map((r) => r.id);
    expect(ids).toContain("c-closed");
    expect(ids).toContain("c-closed-unassigned");
    expect(ids).not.toContain("c-archived");
    expect(ids).toHaveLength(ALL.length - 1);
  });

  test("waiting-on-student and ready-for-review are status views, minus archived", () => {
    expect(filterByView(ALL, "waiting-on-student").map((r) => r.id)).toEqual(["c-waiting"]);
    expect(filterByView(ALL, "ready-for-review").map((r) => r.id)).toEqual(["c-ready"]);
    expect(
      filterByView([qc({ id: "x", archivedAt: "2026-08-01T00:00:00.000Z", operationalStatus: "ready_for_review" })], "ready-for-review"),
    ).toEqual([]);
  });

  test("needs-assignment includes the inactive-assignee case and excludes closed ones", () => {
    // Spec: "Needs assignment includes both cases with no primary assignment and
    // cases whose assigned membership is inactive."
    expect(filterByView(ALL, "needs-assignment").map((r) => r.id)).toEqual([
      "c-unassigned",
      "c-inactive",
    ]);
  });
});

describe("applyQueueFacets — search, status, link state, assignee", () => {
  const LINKED = qc({ id: "c-linked", displayName: "Anil Gurung", email: "anil@example.test" });
  const UNLINKED = qc({
    id: "c-unlinked",
    displayName: "Sita Rai",
    email: null,
    hasLinkedStudent: false,
    operationalStatus: "new",
    assignment: null,
  });
  const ROWS = [LINKED, UNLINKED];

  test("search matches name or email, case-insensitively, as a substring", () => {
    expect(applyQueueFacets(ROWS, { query: "sita" }).map((r) => r.id)).toEqual(["c-unlinked"]);
    expect(applyQueueFacets(ROWS, { query: "ANIL@" }).map((r) => r.id)).toEqual(["c-linked"]);
    expect(applyQueueFacets(ROWS, { query: "%" })).toEqual([]); // a literal character, never a wildcard
  });

  test("status keeps only that operational status", () => {
    expect(applyQueueFacets(ROWS, { status: "new" }).map((r) => r.id)).toEqual(["c-unlinked"]);
  });

  test("link state separates linked from unlinked", () => {
    expect(applyQueueFacets(ROWS, { link: "linked" }).map((r) => r.id)).toEqual(["c-linked"]);
    expect(applyQueueFacets(ROWS, { link: "unlinked" }).map((r) => r.id)).toEqual(["c-unlinked"]);
  });

  test("assignee matches the MEMBERSHIP id — a user id must not match", () => {
    expect(applyQueueFacets(ROWS, { assignee: "m-1" }).map((r) => r.id)).toEqual(["c-linked"]);
    expect(applyQueueFacets(ROWS, { assignee: ASSIGNED.userId })).toEqual([]);
  });

  test("assignee 'unassigned' keeps cases without an ACTIVE assignee", () => {
    const inactive = qc({ id: "c-inactive", assignment: { ...ASSIGNED, active: false } });
    expect(applyQueueFacets([...ROWS, inactive], { assignee: "unassigned" }).map((r) => r.id)).toEqual([
      "c-unlinked",
      "c-inactive",
    ]);
  });

  test("facets compose with AND", () => {
    expect(applyQueueFacets(ROWS, { query: "rai", status: "in_progress" })).toEqual([]);
  });

  test("matchesCaseSearch is the shared predicate — % and _ are characters", () => {
    expect(matchesCaseSearch({ displayName: "100% Sure", email: null }, "100%")).toBe(true);
    expect(matchesCaseSearch({ displayName: "Anil", email: "a_b@example.test" }, "a_b")).toBe(true);
  });
});

describe("summarizeWorkload — the strip's counts", () => {
  const rows = [
    qc({ id: "c-1", operationalStatus: "ready_for_review" }),
    qc({ id: "c-2", operationalStatus: "waiting_on_student" }),
    qc({ id: "c-3", assignment: null }),
    qc({ id: "c-4", assignment: { ...ASSIGNED, active: false } }),
    qc({ id: "c-5", operationalStatus: "closed" }),
    qc({ id: "c-6", archivedAt: "2026-08-01T00:00:00.000Z" }),
    qc({
      id: "c-7",
      assignment: { membershipId: "m-2", userId: "22223333-bbbb-4bbb-8bbb-000000000002", role: "owner", active: true },
    }),
  ];
  const summary = summarizeWorkload(rows);

  test("all counts every non-archived case, closed included", () => {
    expect(summary.all).toBe(6);
  });

  test("needsAction counts tiers 1–6 among non-archived cases", () => {
    // c-1 (ready), c-3 (unassigned), c-4 (inactive assignee); c-2 waits, c-5 is
    // closed, c-6 archived, c-7 quiet in-progress.
    expect(summary.needsAction).toBe(3);
  });

  test("status counts", () => {
    expect(summary.waitingOnStudent).toBe(1);
    expect(summary.readyForReview).toBe(1);
  });

  test("needsAssignment counts missing AND inactive assignees, never closed or archived cases", () => {
    expect(summary.needsAssignment).toBe(2);
  });

  test("byAssignee groups open cases under each ACTIVE assignee, owner first, and never counts closed ones", () => {
    expect(summary.byAssignee).toEqual([
      {
        membershipId: "m-2",
        userId: "22223333-bbbb-4bbb-8bbb-000000000002",
        role: "owner",
        count: 1,
      },
      { membershipId: "m-1", userId: ASSIGNED.userId, role: "counsellor", count: 2 },
    ]);
  });
});

describe("parseQueueSearchParams — the URL is the state, junk is dropped", () => {
  const DEFAULTS = {
    view: "needs-action",
    query: "",
    status: undefined,
    link: undefined,
    assignee: undefined,
    sort: "attention",
  };

  test("no parameters means the default view and sort", () => {
    expect(parseQueueSearchParams({}, { allowAssignee: true })).toEqual(DEFAULTS);
  });

  test("every valid parameter round-trips", () => {
    expect(
      parseQueueSearchParams(
        {
          view: "ready-for-review",
          q: " rai ",
          status: "ready_for_review",
          link: "unlinked",
          assignee: "m-1",
          sort: "name",
        },
        { allowAssignee: true },
      ),
    ).toEqual({
      view: "ready-for-review",
      query: "rai",
      status: "ready_for_review",
      link: "unlinked",
      assignee: "m-1",
      sort: "name",
    });
  });

  test("an unknown view, status, link or sort is dropped, not queried", () => {
    expect(
      parseQueueSearchParams(
        { view: "overdue", status: "archived", link: "both", sort: "deadline" },
        { allowAssignee: true },
      ),
    ).toEqual(DEFAULTS);
  });

  test("a repeated parameter takes the first value instead of 500ing on the array", () => {
    expect(
      parseQueueSearchParams({ q: ["rai", "gurung"], view: ["all", "needs-action"] }, { allowAssignee: true }),
    ).toEqual({ ...DEFAULTS, view: "all", query: "rai" });
  });

  test("a counsellor's URL cannot reach the needs-assignment view or an assignee facet", () => {
    // Spec §2: that view and facet exist for owner/admin. The parse coerces
    // rather than 404s — the queue is still theirs to see.
    expect(
      parseQueueSearchParams({ view: "needs-assignment", assignee: "m-1" }, { allowAssignee: false }),
    ).toEqual(DEFAULTS);
  });

  test("QUEUE_VIEWS carries the owner/admin tab order", () => {
    expect(QUEUE_VIEWS).toEqual([
      "needs-action",
      "all",
      "waiting-on-student",
      "ready-for-review",
      "needs-assignment",
    ]);
  });
});

describe("buildQueueHref — defaults are OMITTED from the canonical URL", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";

  test("the default state is the bare path", () => {
    expect(
      buildQueueHref(ORG, parseQueueSearchParams({}, { allowAssignee: true })),
    ).toBe(`/workspace/${ORG}`);
  });

  test("non-defaults appear; defaults still do not", () => {
    expect(
      buildQueueHref(ORG, {
        view: "all",
        query: "rai",
        status: "closed",
        link: "linked",
        assignee: "m-1",
        sort: "attention",
      }),
    ).toBe(`/workspace/${ORG}?view=all&q=rai&status=closed&link=linked&assignee=m-1`);
  });

  test("a searched name is URL-encoded, not concatenated raw", () => {
    expect(
      buildQueueHref(ORG, { ...parseQueueSearchParams({}, { allowAssignee: true }), query: "rai & sons" }),
    ).toBe(`/workspace/${ORG}?q=rai+%26+sons`);
  });
});

describe("dependsOnPlan — which actions a failed plan read could have got wrong (MV-181)", () => {
  test("the actions resolved BELOW the plan steps depend on it", () => {
    // Steps 7 and 9 read the plan. An action that resolved after them may have
    // been outranked by a plan item the read never returned, so the case overview
    // must say it could not work the action out rather than show this one.
    expect(dependsOnPlan("waiting-on-student")).toBe(true);
    expect(dependsOnPlan("plan-underway")).toBe(true);
    expect(dependsOnPlan("open")).toBe(true);
  });

  test("the actions resolved ABOVE the plan steps do not", () => {
    // These outrank any plan item, so they are still true with no plan at all.
    expect(dependsOnPlan("none")).toBe(false);
    expect(dependsOnPlan("assign")).toBe(false);
    expect(dependsOnPlan("review")).toBe(false);
    expect(dependsOnPlan("invite")).toBe(false);
    expect(dependsOnPlan("add-email")).toBe(false);
  });

  test("an action that CAME from the plan cannot have been produced without it", () => {
    expect(dependsOnPlan("plan-item")).toBe(false);
  });

  test("covers every action kind, so a new one cannot be forgotten", () => {
    // The set is exhaustive by construction: every kind `resolveNextAction` can
    // return is classified above. A new kind added to `NextActionKind` without a
    // line here fails this list comparison rather than silently defaulting.
    const classified = [
      "none",
      "assign",
      "review",
      "invite",
      "add-email",
      "plan-item",
      "waiting-on-student",
      "plan-underway",
      "open",
    ] as const;
    expect([...NEXT_ACTION_KINDS].sort()).toEqual([...classified].sort());
  });
});
