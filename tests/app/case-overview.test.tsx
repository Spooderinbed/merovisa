import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fakeCaseDb, type CaseDbFixture, type FakeCaseDbOptions } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

/**
 * MV-181 — the case overview, spec §3's three zones.
 *
 * The overview is the first thing a counsellor sees after clicking a queue row,
 * and its whole job is to answer "what do I do about this student now". So the
 * assertions here are about what it REFUSES to say as much as what it says:
 *
 * - **The decision strip renders nothing.** The visa read and the lodgement read
 *   are the product's two differentiating answers and neither exists yet. Spec
 *   §3: until each ships, `case-decision-strip` returns no visible placeholder —
 *   a "Coming soon" panel in the first region would train a reader to scroll past
 *   the region that will matter most.
 * - **Exactly one next action.** Not a backlog: the Plan route owns that.
 * - **A failed plan read does not become a confident action.** Steps 7 and 9 of
 *   the resolution read the plan, so an action resolved below them is only true
 *   if that read succeeded.
 * - **No dead invitation control.** Stage 5 owns invitations; until then the
 *   unlinked case gets words, never a button that does nothing.
 */

const { getUser, redirect, notFound, useSelectedLayoutSegment } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useSelectedLayoutSegment: vi.fn(() => null as string | null),
}));

const { supabase } = vi.hoisted(() => ({ supabase: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => supabase.current,
}));
vi.mock("next/navigation", () => ({ redirect, notFound, useSelectedLayoutSegment }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import CaseOverviewPage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/page";

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-a222-222222222222";
const ACTOR = "actor-user-id";
const COUNSELLOR = "7f3c9a1e-4b2d-4c6e-8a10-000000000001";
const STUDENT_USER = "5d0b41c2-9e77-4a55-b3c1-000000000009";
const BASE = `/workspace/${ORG}/students/${CASE}`;

type CaseOverrides = {
  email?: string | null;
  operational_status?: string;
  student_user_id?: string | null;
  archived_at?: string | null;
};

function fixture(caseOverrides: CaseOverrides = {}, rest: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE,
        organization_id: ORG,
        display_name: "Asha Gurung",
        email: "asha@example.test",
        operational_status: "in_progress",
        student_user_id: STUDENT_USER,
        archived_at: null,
        ...caseOverrides,
      },
    ],
    case_assignments: [
      {
        id: "assignment-1",
        case_id: CASE,
        user_id: COUNSELLOR,
        assignment_role: "primary_counsellor",
      },
    ],
    organization_memberships: [
      {
        id: "membership-1",
        organization_id: ORG,
        user_id: COUNSELLOR,
        role: "counsellor",
        status: "active",
      },
    ],
    plan_items: [],
    ...rest,
  };
}

function seed(
  caseOverrides: CaseOverrides = {},
  rest: CaseDbFixture = {},
  options: FakeCaseDbOptions = {},
) {
  const fake = fakeCaseDb(fixture(caseOverrides, rest), options);
  supabase.current = { auth: { getUser }, from: fake.from, tag: "authenticated" };
  return fake;
}

/** `all-org` readers are exactly the owner/admin set — the Day view's own reading. */
function viewer(requiredScope: "all-org" | "assigned" = "all-org") {
  checkCasePermission.mockResolvedValue({
    decision: { allowed: true, requiredScope, reason: null },
    context: { grantedRoles: [requiredScope === "all-org" ? "admin" : "counsellor"] },
  });
}

const overview = () =>
  CaseOverviewPage({ params: Promise.resolve({ organizationId: ORG, caseId: CASE }) });

const planItem = (over: Record<string, unknown> = {}) => ({
  id: 1,
  case_id: CASE,
  kind: "documents",
  impact: "high",
  title: "Collect the bank statements",
  status: "todo",
  started_at: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  viewer();
  seed();
});

describe("the decision strip slot", () => {
  it("occupies no space and makes no promise until the reads exist", async () => {
    render(await overview());

    for (const absent of [/visa read/i, /lodgement/i, /coming soon/i, /not available/i]) {
      expect(screen.queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it("shows no verdict band, because there is no judgement to band", async () => {
    render(await overview());

    for (const verdict of ["Strong", "Possible", "Reach"]) {
      expect(screen.queryByText(verdict)).not.toBeInTheDocument();
    }
  });
});

describe("the single next action", () => {
  it("names exactly one", async () => {
    render(await overview());

    expect(screen.getAllByTestId("case-next-action")).toHaveLength(1);
  });

  it("asks an owner or admin to assign a case nobody is on", async () => {
    seed({}, { case_assignments: [] });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Assign a counsellor"))
      .toBeInTheDocument();
  });

  it("does NOT ask a counsellor to assign, because a counsellor may not", async () => {
    // F-1: `counsellor["case.assign"]` is `deny`. Naming an action the viewer
    // cannot take is worse than falling through to the one they can.
    viewer("assigned");
    seed({}, { case_assignments: [] });

    render(await overview());

    expect(screen.queryByText("Assign a counsellor")).not.toBeInTheDocument();
  });

  it("asks for a review when the case is ready for one", async () => {
    seed({ operational_status: "ready_for_review" });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Review the case"))
      .toBeInTheDocument();
  });

  it("names the selected plan item when the plan has one", async () => {
    seed({}, { plan_items: [planItem()] });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Collect the bank statements"))
      .toBeInTheDocument();
  });

  it("does NOT show a plan-dependent action when the plan could not be read", async () => {
    // Without the plan there is no way to tell "nothing is outstanding" from
    // "the most important thing is outstanding", and "Open the case" would be the
    // determined-sounding one of the two.
    seed({}, {}, { errorOn: { plan_items: { message: "boom" } } });

    render(await overview());

    expect(screen.queryByText("Open the case")).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t work out the next action/i)).toBeInTheDocument();
  });

  it("still shows an action a failed plan read could not have changed", async () => {
    // The guard must not over-report: "Review the case" outranks every plan item,
    // so it is still true with no plan at all.
    seed({ operational_status: "ready_for_review" }, {}, {
      errorOn: { plan_items: { message: "boom" } },
    });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Review the case"))
      .toBeInTheDocument();
    expect(screen.queryByText(/couldn.t work out the next action/i)).not.toBeInTheDocument();
  });

  it("does NOT ask for an assignment it could not check", async () => {
    // Step 2 of the resolution reads the assignment. A failed read leaves the
    // same shape as an empty slot, so "Assign a counsellor" would be a confident
    // instruction derived from nothing — and an admin would go looking for a
    // counsellor who is already on the case.
    seed({}, {}, { errorOn: { case_assignments: { message: "boom" } } });

    render(await overview());

    expect(screen.queryByText("Assign a counsellor")).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t work out the next action/i)).toBeInTheDocument();
  });

  it("does not treat an unreadable assignment as uncertainty for a counsellor", async () => {
    // A counsellor never sees step 2 at all, so the failed read changes nothing
    // they would be told. The guard must narrow to the viewer it applies to.
    viewer("assigned");
    seed({ operational_status: "waiting_on_student" }, {}, {
      errorOn: { case_assignments: { message: "boom" } },
    });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Waiting on student"))
      .toBeInTheDocument();
  });

  it("lists no plan backlog — the Plan route owns that", async () => {
    seed({}, { plan_items: [planItem(), planItem({ id: 2, title: "Book the IELTS sitting" })] });

    render(await overview());

    expect(screen.queryByText("Book the IELTS sitting")).not.toBeInTheDocument();
  });
});

describe("an unlinked case", () => {
  const unlinked = { student_user_id: null };

  it("leads with the invitation, and it is the case's one next action", async () => {
    seed(unlinked);

    render(await overview());

    const action = screen.getByTestId("case-next-action");
    expect(within(action).getByText("Invite the student")).toBeInTheDocument();
    expect(
      within(action).getByText(/link their account before relying on a student-entered profile/i),
    ).toBeInTheDocument();
  });

  it("offers no control that does nothing", async () => {
    // Stage 5 owns invitations. Spec §2: "Invitation actions become links only
    // when Stage 5 exists; before then the linkage marker remains visible without
    // a dead control."
    seed(unlinked);

    render(await overview());

    const action = screen.getByTestId("case-next-action");
    expect(within(action).queryByRole("button")).not.toBeInTheDocument();
    expect(within(action).queryByRole("link", { name: /invite/i })).not.toBeInTheDocument();
  });

  it("asks for an email address when there is none to invite to", async () => {
    seed({ ...unlinked, email: null });

    render(await overview());

    expect(within(screen.getByTestId("case-next-action")).getByText("Add an email to invite"))
      .toBeInTheDocument();
  });

  it("still leads with the invitation when something else outranks it", async () => {
    // Assignment outranks invitation in the resolution, but the linkage prompt is
    // the standing fact about this case and must not vanish because a more urgent
    // action appeared.
    seed(unlinked, { case_assignments: [] });

    render(await overview());

    expect(screen.getByText(/link their account before relying on a student-entered profile/i))
      .toBeInTheDocument();
    expect(within(screen.getByTestId("case-next-action")).getByText("Assign a counsellor"))
      .toBeInTheDocument();
  });
});

describe("a linked case", () => {
  it("drops the invitation entirely", async () => {
    render(await overview());

    expect(screen.queryByText(/invite the student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add an email to invite/i)).not.toBeInTheDocument();
  });

  it("does not expose the raw student_user_id", async () => {
    const { container } = render(await overview());

    expect(container.innerHTML).not.toContain(STUDENT_USER);
  });
});

describe("the operational rail", () => {
  it("states the status, the assignment and the linkage", async () => {
    render(await overview());

    const rail = screen.getByRole("region", { name: /case operations/i });
    expect(within(rail).getByText("In progress")).toBeInTheDocument();
    expect(within(rail).getByText(COUNSELLOR.slice(0, 8))).toBeInTheDocument();
    expect(within(rail).getByText("Student linked")).toBeInTheDocument();
  });

  it("routes to Case details, which is where those change", async () => {
    render(await overview());

    const rail = screen.getByRole("region", { name: /case operations/i });
    expect(within(rail).getByRole("link", { name: /case details/i }).getAttribute("href")).toBe(
      `${BASE}/manage`,
    );
  });

  it("leaves the student's identity to the frame rather than repeating it", async () => {
    // The persistent header names the case. A second heading with the same name
    // invites a reader to treat a disagreement between them as meaningful.
    render(await overview());

    expect(screen.queryByRole("heading", { name: "Asha Gurung" })).not.toBeInTheDocument();
  });
});
