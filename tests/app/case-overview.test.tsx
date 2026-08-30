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
 * - **A REAL invitation control, as of MV-193.** This bullet used to read "no dead
 *   invitation control": Stage 5 did not exist, so the unlinked case got words and
 *   never a button that does nothing. Stage 5 slice 1 is what earned the control, so
 *   the assertion flips — the panel now offers a form, and what it must NOT do is
 *   claim the feature is unbuilt or imply that MeroVisa emails the link.
 */

const { getUser, redirect, notFound, useSelectedLayoutSegment, refresh } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useSelectedLayoutSegment: vi.fn(() => null as string | null),
  refresh: vi.fn(),
}));

const { supabase } = vi.hoisted(() => ({ supabase: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => supabase.current,
}));
// `useRouter` joined the mock at MV-193: `CaseInviteBlock` became a client component
// with two mutations, and it calls `router.refresh()` rather than navigating.
vi.mock("next/navigation", () => ({
  redirect,
  notFound,
  useSelectedLayoutSegment,
  useRouter: () => ({ refresh }),
}));

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
  /**
   * MV-198 flipped this block. It used to assert that the visa read was silently
   * ABSENT, which was right while its judgement contract was unapproved (spec §0).
   * The contract exists now, so the strip is whole — and what these tests guard is
   * the harder property: a read that renders must still refuse to band a case it
   * cannot judge.
   */
  it("gives the visa read its reserved half of the strip", async () => {
    render(await overview());

    expect(screen.getByRole("region", { name: /visa read/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /lodgement/i })).toBeInTheDocument();
  });

  it("still promises nothing it has not built", async () => {
    render(await overview());

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("shows no verdict band on a case with nothing recorded", async () => {
    // The fixture case is LINKED but has no `profiles` row, so the read abstains.
    // An empty profile scores badly on every dimension, and the one thing this must
    // never do is render that as a Reach — a counsellor would read "refusal risk"
    // off a case nobody has filled in yet.
    render(await overview());

    for (const verdict of ["Strong", "Possible", "Reach"]) {
      expect(screen.queryByText(verdict)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/not enough recorded on this profile/i)).toBeInTheDocument();
  });

  it("says why it cannot read an unlinked case, in the spec's words", async () => {
    seed({ student_user_id: null });
    render(await overview());

    expect(
      screen.getByText(/not available — no linked student profile/i),
    ).toBeInTheDocument();
    for (const verdict of ["Strong", "Possible", "Reach"]) {
      expect(screen.queryByText(verdict)).not.toBeInTheDocument();
    }
  });
});

describe("the lodgement read (MV-183)", () => {
  it("occupies the first region", async () => {
    render(await overview());

    expect(screen.getByRole("region", { name: /lodgement/i })).toBeInTheDocument();
  });

  it("names the single blocking item on a case with outstanding requests", async () => {
    seed(
      {},
      {
        case_document_requests: [
          {
            id: "req-late",
            case_id: CASE,
            title: "Bank statement",
            status: "outstanding",
            due_at: "2026-09-01T00:00:00.000Z",
            created_at: "2026-08-01T00:00:00.000Z",
          },
          {
            id: "req-soon",
            case_id: CASE,
            title: "Passport bio page",
            status: "outstanding",
            due_at: "2026-08-20T00:00:00.000Z",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    );

    render(await overview());

    const panel = within(screen.getByRole("region", { name: /lodgement/i }));
    expect(panel.getByText("Blocked")).toBeInTheDocument();
    expect(panel.getByText(/Passport bio page/)).toBeInTheDocument();
    // One item, never a list — and the others counted so it does not read as all.
    expect(panel.queryByText(/Bank statement/)).not.toBeInTheDocument();
    expect(panel.getByText(/1 other request is also outstanding/i)).toBeInTheDocument();
  });

  it("distinguishes a fully-chased case from one nothing was asked of", async () => {
    seed(
      {},
      {
        case_document_requests: [
          {
            id: "req-done",
            case_id: CASE,
            title: "Bank statement",
            status: "resolved",
            due_at: null,
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    );
    render(await overview());
    expect(screen.getByText("Nothing outstanding")).toBeInTheDocument();

    // The case page reads the WHOLE request list, so it can tell these apart — and
    // must, because an untouched case has not earned the chased case's word.
    seed({}, { case_document_requests: [] });
    render(await overview());
    expect(screen.getByText("Nothing requested yet")).toBeInTheDocument();
  });

  it("a FAILED request read is an outage, never 'nothing outstanding'", async () => {
    seed({}, {}, { errorOn: { case_document_requests: { message: "boom" } } });

    render(await overview());

    expect(
      screen.getByText(/couldn't check this case's document requests/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing outstanding")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing requested yet")).not.toBeInTheDocument();
  });

  it("a failed request read leaves the rest of the overview standing", async () => {
    seed({}, {}, { errorOn: { case_document_requests: { message: "boom" } } });

    render(await overview());

    // The lodgement column is display-only; nothing else on this page depends on it.
    expect(screen.getAllByTestId("case-next-action")).toHaveLength(1);
  });

  it("links to the Documents route", async () => {
    render(await overview());

    const panel = within(screen.getByRole("region", { name: /lodgement/i }));
    expect(panel.getByRole("link", { name: /documents/i }).getAttribute("href")).toBe(
      `${BASE}/documents`,
    );
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

  it("offers a real control, and no longer says the feature is unbuilt", async () => {
    // MV-193 inverted this test. Until Stage 5 existed, spec §2 held: "Invitation
    // actions become links only when Stage 5 exists; before then the linkage marker
    // remains visible without a dead control." Stage 5 slice 1 IS that existence, so
    // the panel now carries the control — and the sentence it used to carry must go,
    // because a shipped feature describing itself as unbuilt is worse than either.
    seed(unlinked);

    render(await overview());

    const action = screen.getByTestId("case-next-action");
    expect(
      within(action).getByRole("button", { name: /create invitation link/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
  });

  it("does not claim MeroVisa sends the invitation", async () => {
    // The honesty this slice turns on. There is no transactional email in this
    // product; the counsellor sends the link. A panel that implied otherwise would
    // leave a student waiting for mail that is never coming.
    seed(unlinked);

    render(await overview());

    const action = screen.getByTestId("case-next-action");
    // The form asks for the address the STUDENT signs in with — it does not offer to
    // mail anything, and no control is worded as sending.
    expect(within(action).getByLabelText(/student’s email/i)).toBeInTheDocument();
    expect(within(action).queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  it("still offers the control when the case carries no email of its own", async () => {
    // The case's email seeds the field; it never gates the control. A counsellor who
    // knows the student's address must not be blocked because the case record is thin
    // — the old panel refused here, which is a refusal MV-193 removes.
    seed({ ...unlinked, email: null });

    render(await overview());

    const action = screen.getByTestId("case-next-action");
    expect(within(action).getByLabelText(/student’s email/i)).toHaveValue("");
    expect(
      within(action).getByText(/there is no email on this case yet/i),
    ).toBeInTheDocument();
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
