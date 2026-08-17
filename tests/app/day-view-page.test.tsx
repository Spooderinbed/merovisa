import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-179 — the Day view, `/workspace/[organizationId]`. The queue REPOSITORY is
 * mocked (its own suite proves it); the pure ordering/filtering/summary logic is
 * REAL, which is what lets these tests assert on rendered ORDER rather than
 * presence (MISTAKES.md: a presence assertion survives a deleted sort).
 */

const { getUser, redirect, notFound } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const { checkOrgPermission } = vi.hoisted(() => ({ checkOrgPermission: vi.fn() }));
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

const { listCaseQueue } = vi.hoisted(() => ({ listCaseQueue: vi.fn() }));
vi.mock("@/lib/cases/queue-repo", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listCaseQueue,
}));

import DayViewPage from "@/app/(app)/workspace/[organizationId]/page";
import type { QueueCase } from "@/lib/cases/queue";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-user-id";
const COUNSELLOR_USER = "cccc1111-0000-4000-8000-000000000001";
const params = Promise.resolve({ organizationId: ORG });
const noParams = Promise.resolve({});

function grantList(scope: string | null) {
  checkOrgPermission.mockImplementation(async (_a: string, _o: string, permission: string) => ({
    decision:
      permission === "case.list" && scope !== null
        ? { allowed: true, requiredScope: scope, reason: null }
        : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
    context: {},
  }));
}

const ASSIGNED = { membershipId: "m-couns", userId: COUNSELLOR_USER, role: "counsellor", active: true };

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

const MEMBERS = [
  { id: "m-owner", userId: "aaaa1111-0000-4000-8000-000000000002", role: "owner", status: "active" },
  { id: "m-couns", userId: COUNSELLOR_USER, role: "counsellor", status: "active" },
];

function queued(rows: QueueCase[], extra: Partial<{ scopeIsEmpty: boolean; truncated: boolean }> = {}) {
  return {
    ok: true,
    rows,
    members: MEMBERS,
    scopeIsEmpty: rows.length === 0,
    truncated: false,
    ...extra,
  };
}

/** Data rows of the queue table, in rendered order, keyed by student name. */
function renderedNames(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1) // the header row
    .map((row) => {
      const cell = within(row).queryAllByRole("rowheader")[0] ?? within(row).queryAllByRole("cell")[0];
      return within(cell as HTMLElement).getByRole("link").textContent ?? "";
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
});

describe("Day view — access", () => {
  it("sends an unauthenticated visitor to sign in, naming this page as the return path", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(DayViewPage({ params, searchParams: noParams })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/auth?next=/workspace/${ORG}`);
  });

  it("denies with notFound when the actor may not list, and asks the database for nothing", async () => {
    grantList(null);
    await expect(DayViewPage({ params, searchParams: noParams })).rejects.toThrow("NOT_FOUND");
    expect(listCaseQueue).not.toHaveBeenCalled();
  });

  it("denies a scope it has no query for, rather than widening to the organization", async () => {
    grantList("linked");
    await expect(DayViewPage({ params, searchParams: noParams })).rejects.toThrow("NOT_FOUND");
    expect(listCaseQueue).not.toHaveBeenCalled();
  });

  it("renders an outage — NOT notFound — when the permission lookup itself failed", async () => {
    checkOrgPermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "lookup-failed" },
      context: {},
    });
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.getByText(/couldn't load this queue/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders the same outage when the queue read failed — never an empty-queue claim", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.getByText(/couldn't load this queue/i)).toBeTruthy();
    expect(screen.queryByText(/No cases yet/i)).toBeNull();
    expect(screen.queryByText(/Nothing needs action/i)).toBeNull();
  });

  it("passes the counsellor's ASSIGNED scope through", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([qc()]));
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(listCaseQueue).toHaveBeenCalledWith(ACTOR, ORG, "assigned", expect.anything());
  });
});

describe("Day view — the queue, in attention order", () => {
  it("renders needs-action rows by default, in tier order, oldest neglect first", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([
        // Seeded backwards on purpose: the assertion is the rendered ORDER.
        qc({ id: "c-quiet", displayName: "Quiet Case" }), // tier 7 — not in needs-action
        qc({ id: "c-new", displayName: "New Case", operationalStatus: "new" }), // tier 5
        qc({ id: "c-unlinked", displayName: "Unlinked Case", hasLinkedStudent: false, email: null }), // tier 3
        qc({ id: "c-review", displayName: "Review Case", operationalStatus: "ready_for_review" }), // tier 2
        qc({ id: "c-unassigned", displayName: "Unassigned Case", assignment: null }), // tier 1
      ]),
    );
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(renderedNames()).toEqual(["Unassigned Case", "Review Case", "Unlinked Case", "New Case"]);
  });

  it("renders each row's ONE derived next action", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([
        qc({ id: "c-unassigned", displayName: "Unassigned Case", assignment: null }),
        qc({ id: "c-review", displayName: "Review Case", operationalStatus: "ready_for_review" }),
        qc({
          id: "c-plan",
          displayName: "Plan Case",
          nextStep: {
            state: "next",
            item: {
              id: 1,
              owner: null,
              kind: "k",
              impact: "high",
              title: "Book an IELTS test",
              body: null,
              liftEstimate: null,
              timeEstimate: null,
              status: "todo",
              createdAt: "",
              completedAt: null,
              startedAt: null,
            },
            openCount: 1,
            waitingCount: 0,
          },
        }),
      ]),
    );
    render(await DayViewPage({ params, searchParams: noParams }));

    const row = (name: string) =>
      within(screen.getByRole("table")).getAllByRole("row").find((r) => r.textContent?.includes(name)) as HTMLElement;
    expect(within(row("Unassigned Case")).getByText("Assign a counsellor")).toBeTruthy();
    expect(within(row("Review Case")).getByText("Review the case")).toBeTruthy();
    expect(within(row("Plan Case")).getByText("Book an IELTS test")).toBeTruthy();
  });

  it("renders 40 rows when 40 cases need action — the working set, not a sample", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued(
        Array.from({ length: 40 }, (_, i) =>
          qc({
            id: `case-${String(i).padStart(2, "0")}`,
            displayName: `Student ${String(i).padStart(2, "0")}`,
            operationalStatus: "new",
          }),
        ),
      ),
    );
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(renderedNames()).toHaveLength(40);
  });

  it("case names are real links to the case overview, and rows carry no click handler", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ id: "case-9", displayName: "Anil Gurung", operationalStatus: "new" })]));
    const { container } = render(await DayViewPage({ params, searchParams: noParams }));

    const link = screen.getByRole("link", { name: "Anil Gurung" });
    expect(link.getAttribute("href")).toBe(`/workspace/${ORG}/students/case-9`);
    expect(container.querySelector("tr[onclick], tr[role='button']")).toBeNull();
  });

  it("shows the operational status as words, never the raw column value", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([qc({ operationalStatus: "waiting_on_student" })]),
    );
    render(await DayViewPage({ params, searchParams: Promise.resolve({ view: "all" }) }));

    // The words appear at least once in the table (pill, and possibly the next
    // action); the raw column value appears nowhere.
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Waiting on student").length).toBeGreaterThan(0);
    expect(within(table).queryByText("waiting_on_student")).toBeNull();
  });

  it("shows the assignee as role + truncated id, never the whole user id", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new" })]));
    const { container } = render(await DayViewPage({ params, searchParams: noParams }));

    expect(container.innerHTML).toContain(COUNSELLOR_USER.slice(0, 8));
    expect(container.innerHTML).not.toContain(COUNSELLOR_USER);
  });

  it("marks 'Updated' as a plain time, with the full timestamp accessible — never a deadline", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new" })]));
    const { container } = render(await DayViewPage({ params, searchParams: noParams }));

    const time = container.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-08-01T00:00:00.000Z");
    expect(screen.queryByText(/overdue|due|deadline/i)).toBeNull();
  });

  it("hides the assignee column and facet from a counsellor", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new" })]));
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(screen.queryByRole("columnheader", { name: "Assignee" })).toBeNull();
    expect(screen.queryByLabelText("Assignee")).toBeNull();
  });
});

describe("Day view — views and filters are the URL", () => {
  const ROWS = [
    qc({ id: "c-closed", displayName: "Closed Case", operationalStatus: "closed" }),
    qc({ id: "c-archived", displayName: "Archived Case", archivedAt: "2026-08-01T00:00:00.000Z" }),
    qc({ id: "c-waiting", displayName: "Waiting Case", operationalStatus: "waiting_on_student" }),
    qc({ id: "c-new", displayName: "New Case", operationalStatus: "new", assignment: null }),
    qc({
      id: "c-unlinked",
      displayName: "Unlinked Case",
      hasLinkedStudent: false,
      email: null,
      operationalStatus: "new",
    }),
  ];

  it("view=all admits closed and archived cases the default view omits", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(ROWS));
    render(await DayViewPage({ params, searchParams: Promise.resolve({ view: "all" }) }));
    expect(renderedNames()).toContain("Closed Case");
    expect(renderedNames()).toContain("Archived Case");
  });

  it("the default view omits them", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(ROWS));
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(renderedNames()).not.toContain("Closed Case");
    expect(renderedNames()).not.toContain("Archived Case");
  });

  it("status, link and assignee facets narrow the queue", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(ROWS));
    render(
      await DayViewPage({
        params,
        searchParams: Promise.resolve({ view: "all", link: "unlinked" }),
      }),
    );
    expect(renderedNames()).toEqual(["Unlinked Case"]);
  });

  it("sort=name orders by name, not by attention", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([
        qc({ id: "c-z", displayName: "Zara Case", assignment: null, operationalStatus: "new" }),
        qc({ id: "c-a", displayName: "Anil Case", operationalStatus: "new" }),
      ]),
    );
    render(await DayViewPage({ params, searchParams: Promise.resolve({ sort: "name" }) }));
    expect(renderedNames()).toEqual(["Anil Case", "Zara Case"]);
  });

  it("tabs are links whose hrefs OMIT defaults — the default tab is the bare path", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(ROWS));
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(screen.getByRole("link", { name: "Needs action" }).getAttribute("href")).toBe(
      `/workspace/${ORG}`,
    );
    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe(
      `/workspace/${ORG}?view=all`,
    );
  });

  it("offers the Needs-assignment tab to owner/admin", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(ROWS));
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.getByRole("link", { name: /Needs assignment/ })).toBeTruthy();
  });

  it("offers no Needs-assignment tab to a counsellor", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new" })]));
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.queryByRole("link", { name: /Needs assignment/ })).toBeNull();
  });

  it("a hand-edited junk view or status is dropped rather than queried", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new", displayName: "New Case" })]));
    render(
      await DayViewPage({
        params,
        searchParams: Promise.resolve({ view: "overdue", status: "archived", q: ["a", "b"] as never }),
      }),
    );
    // The junk did not 500 and did not filter: the default view renders.
    expect(screen.getByText("New Case")).toBeTruthy();
  });
});

describe("Day view — workload summary", () => {
  it("counts the scope for owner/admin, including per-assignee workload", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([
        qc({ id: "c-1", operationalStatus: "ready_for_review" }),
        qc({ id: "c-2", operationalStatus: "waiting_on_student" }),
        qc({ id: "c-3", assignment: null }),
        qc({ id: "c-4" }),
      ]),
    );
    render(await DayViewPage({ params, searchParams: noParams }));

    const strip = screen.getByRole("region", { name: "Workload" });
    expect(strip.textContent).toContain("All 4");
    expect(strip.textContent).toContain("Needs action 2");
    expect(strip.textContent).toContain("Waiting on student 1");
    expect(strip.textContent).toContain("Ready for review 1");
    expect(strip.textContent).toContain("Needs assignment 1");
    // Workload by assignee: the counsellor holds 3 open cases.
    const perAssignee = within(strip).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(perAssignee.some((t) => t.includes("Counsellor") && t.includes("3"))).toBe(true);
  });

  it("shows a counsellor their assigned counts and NO per-assignee breakdown", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(
      queued([qc({ id: "c-1", operationalStatus: "ready_for_review" }), qc({ id: "c-2" })]),
    );
    render(await DayViewPage({ params, searchParams: noParams }));

    const strip = screen.getByRole("region", { name: "Workload" });
    expect(strip.textContent).toContain("Assigned 2");
    expect(strip.textContent).not.toContain("Needs assignment");
    expect(within(strip).queryByRole("list")).toBeNull();
    expect(screen.queryByRole("link", { name: "Needs assignment" })).toBeNull();
  });
});

describe("Day view — empty states and the cap", () => {
  it("owner/admin with zero cases: 'No cases yet' with the Add action", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([]));
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(screen.getByText("No cases yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: /add a student/i }).getAttribute("href")).toBe(
      `/workspace/${ORG}/students/new`,
    );
  });

  it("counsellor with zero assigned cases: 'No cases assigned', and no Add action", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([]));
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(screen.getByText("No cases assigned")).toBeTruthy();
    expect(screen.getByText(/owner or admin needs to assign/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /add a student/i })).toBeNull();
  });

  it("nothing needs action: waiting cases exist but the default view is empty", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([qc({ id: "c-w", operationalStatus: "waiting_on_student" })]),
    );
    render(await DayViewPage({ params, searchParams: noParams }));

    expect(screen.getByText("Nothing needs action right now")).toBeTruthy();
    expect(screen.getByText(/remain available in All cases/i)).toBeTruthy();
  });

  it("filtered empty: filters matched nothing, and Clear returns to the current queue", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new", displayName: "New Case" })]));
    render(await DayViewPage({ params, searchParams: Promise.resolve({ q: "zzz" }) }));

    expect(screen.getByText("No cases match those filters")).toBeTruthy();
    expect(screen.getByRole("link", { name: /clear the filters/i }).getAttribute("href")).toBe(
      `/workspace/${ORG}`,
    );
  });

  it("a capped queue says so, and does not claim the order covers the organization", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([qc({ operationalStatus: "new" })], { truncated: true }),
    );
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.getByText(/Showing the first 500 cases/i)).toBeTruthy();
    expect(screen.getByText(/do not cover the whole organization/i)).toBeTruthy();
  });

  it("says nothing about a cap when the read was complete", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([qc({ operationalStatus: "new" })]));
    render(await DayViewPage({ params, searchParams: noParams }));
    expect(screen.queryByText(/Showing the first/i)).toBeNull();
  });
});
