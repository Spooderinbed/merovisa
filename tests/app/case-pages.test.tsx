import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-171's two new surfaces — create a case, and manage one — plus the controls
 * the student list grows.
 *
 * The three assertions worth having here, because none is visible in the
 * repository tests or the route tests:
 *
 * 1. **A failed check and a denial do not render the same.** `notFound()` is the
 *    right answer for "you may not" — confirming a case exists but is not yours
 *    is an enumeration oracle. It is the WRONG answer for "we could not tell",
 *    which is an outage and must say so. MV-170's review found this collapsed on
 *    the student list; these pages do not copy the shape.
 * 2. **A case is checked against the organization in the URL.** Authorization is
 *    per case, so a case from another organization would not be a leak — but it
 *    would render under the wrong organization's URL, and the assignment picker
 *    would offer members who cannot hold it.
 * 3. **No raw Auth user id reaches the markup.** The assignment control names
 *    members by their membership row, exactly as MV-170's list named a student by
 *    their case rather than by `student_user_id`.
 */

const { getUser, redirect, notFound } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const { checkOrgPermission } = vi.hoisted(() => ({ checkOrgPermission: vi.fn() }));
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { readOrgCase, readPrimaryCounsellor } = vi.hoisted(() => ({
  readOrgCase: vi.fn(),
  readPrimaryCounsellor: vi.fn(),
}));
vi.mock("@/lib/cases/write-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/write-repo")>(
    "@/lib/cases/write-repo",
  );
  return { ...actual, readOrgCase, readPrimaryCounsellor };
});

const { listOrgMembers } = vi.hoisted(() => ({ listOrgMembers: vi.fn() }));
vi.mock("@/lib/org/repo", () => ({ listOrgMembers }));

const { listOrgCases } = vi.hoisted(() => ({ listOrgCases: vi.fn() }));
vi.mock("@/lib/cases/list-repo", () => ({ listOrgCases }));

import NewStudentPage from "@/app/(app)/workspace/[organizationId]/students/new/page";
import ManageCasePage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/manage/page";
import StudentsPage from "@/app/(app)/workspace/[organizationId]/students/page";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const CASE = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR = "actor-user-id";
/**
 * HEX, and that is load-bearing. It used to read `counsellor-a-user-id`, whose
 * first eight characters are `counsell` — a substring of the word "counsellor",
 * which the page prints in a label, in a role name and in a paragraph. So the
 * "the short reference IS shown" half of the no-whole-id test matched no matter
 * what the page rendered, and would have kept passing with the reference removed
 * entirely. A hex prefix cannot collide with the page's vocabulary.
 */
const COUNSELLOR_USER = "7f3c9a1e-4b2d-4c6e-8a10-000000000001";
const MEMBERSHIP_A = "mmmmmmmm-0000-4000-8000-00000000000a";
const MEMBERSHIP_B = "mmmmmmmm-0000-4000-8000-00000000000b";

/** The staff relationship `can_staff_case` admits, as `getCaseContext` reports it. */
const STAFF_CONTEXT = { grantedRoles: ["admin"] as string[] };

function grantOrg(claims: Partial<Record<string, boolean>>, reason = "role-not-permitted") {
  checkOrgPermission.mockImplementation(async (_a: string, _o: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason },
    context: {},
  }));
}

function grantCase(
  claims: Partial<Record<string, boolean>>,
  reason = "role-not-permitted",
  context: { grantedRoles: string[] } = STAFF_CONTEXT,
) {
  checkCasePermission.mockImplementation(async (_a: string, _c: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason },
    // `getCaseContext` populates the context on an ALLOW and hands back the
    // grants-nothing one on a denial, so a mock that populated it either way would
    // let the page read a relationship it was never told about.
    context: claims[permission] ? context : { grantedRoles: [] },
  }));
}

/**
 * Per-claim decisions AND per-claim reasons — the shape the two case checks can
 * genuinely answer with, because they are two separate questions about the same
 * actor. `grantCase` applies one reason to every denial, which cannot express "one
 * check succeeded and the other could not complete".
 */
function grantCaseEach(
  map: Record<string, { allowed: boolean; reason?: string }>,
  context: { grantedRoles: string[] } = STAFF_CONTEXT,
) {
  checkCasePermission.mockImplementation(async (_a: string, _c: string, permission: string) => {
    const entry = map[permission] ?? { allowed: false };
    return {
      decision: entry.allowed
        ? { allowed: true, requiredScope: "all-org", reason: null }
        : { allowed: false, requiredScope: null, reason: entry.reason ?? "role-not-permitted" },
      context: entry.allowed ? context : { grantedRoles: [] },
    };
  });
}

const newPage = () => NewStudentPage({ params: Promise.resolve({ organizationId: ORG }) });
const managePage = () =>
  ManageCasePage({ params: Promise.resolve({ organizationId: ORG, caseId: CASE }) });
const listPage = () =>
  StudentsPage({
    params: Promise.resolve({ organizationId: ORG }),
    searchParams: Promise.resolve({}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  grantOrg({ "case.create": true, "case.list": true });
  grantCase({ "case.update": true, "case.assign": true });
  readOrgCase.mockResolvedValue({
    ok: true,
    data: {
      id: CASE,
      organizationId: ORG,
      displayName: "Case one",
      email: null,
      operationalStatus: "new",
      hasLinkedStudent: false,
      archivedAt: null,
    },
  });
  readPrimaryCounsellor.mockResolvedValue({ ok: true, data: null });
  listOrgMembers.mockResolvedValue({
    ok: true,
    data: [
      { id: MEMBERSHIP_A, userId: COUNSELLOR_USER, role: "counsellor", status: "active" },
      { id: MEMBERSHIP_B, userId: "inactive-user-id", role: "counsellor", status: "inactive" },
    ],
  });
  listOrgCases.mockResolvedValue({ ok: true, data: [] });
});

describe("/workspace/[organizationId]/students/new — cell 8", () => {
  it("renders the create form for an actor holding case.create", async () => {
    render(await newPage());

    expect(screen.getByLabelText(/full name/i)).toBeTruthy();
    expect(checkOrgPermission).toHaveBeenCalledWith(ACTOR, ORG, "case.create", expect.anything());
  });

  it("says the student will not have an account yet, because they will not", async () => {
    render(await newPage());

    // Stage 5 owns invitations. A form that implied the student would be emailed
    // would be promising something no code does.
    expect(screen.getByText(/no account/i)).toBeTruthy();
  });

  it("renders notFound() when case.create is denied", async () => {
    grantOrg({ "case.create": false });

    await expect(newPage()).rejects.toThrow("NOT_FOUND");
  });

  it("renders an OUTAGE, not notFound(), when the check could not complete", async () => {
    grantOrg({ "case.create": false }, "lookup-failed");

    render(await newPage());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText(/something went wrong on our side/i)).toBeTruthy();
  });

  it("redirects a visitor with no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(newPage()).rejects.toThrow("REDIRECT");
    expect(checkOrgPermission).not.toHaveBeenCalled();
  });
});

describe("/workspace/[organizationId]/students/[caseId]/manage — cells 9 and 10", () => {
  it("renders the student and their current status", async () => {
    render(await managePage());

    expect(screen.getByRole("heading", { name: "Case one" })).toBeTruthy();
    expect(screen.getByLabelText(/status/i)).toBeTruthy();
  });

  it("renders the assignment control for an actor holding case.assign", async () => {
    render(await managePage());

    expect(screen.getByLabelText(/primary counsellor/i)).toBeTruthy();
  });

  it("gives a counsellor the status control and NO assignment control", async () => {
    // F-1, decided 2026-08-10: `counsellor["case.assign"]` stays `deny`, while
    // cell 10 gives an assigned counsellor `operational_status`.
    grantCase({ "case.update": true, "case.assign": false });

    render(await managePage());

    expect(screen.getByLabelText(/status/i)).toBeTruthy();
    expect(screen.queryByLabelText(/primary counsellor/i)).toBeNull();
    // And it does not read a member list it has no control to render.
    expect(listOrgMembers).not.toHaveBeenCalled();
  });

  it("renders notFound() when neither claim is allowed", async () => {
    grantCase({ "case.update": false, "case.assign": false });

    await expect(managePage()).rejects.toThrow("NOT_FOUND");
  });

  it("renders an OUTAGE, not notFound(), when a check could not complete", async () => {
    grantCase({ "case.update": false, "case.assign": false }, "lookup-failed");

    render(await managePage());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText(/something went wrong on our side/i)).toBeTruthy();
  });

  it("renders an OUTAGE when ONE check could not complete and the other allowed", async () => {
    // THE defect. Two checks, and only the both-denied path looked at
    // `lookup-failed`: when `case.assign` could not be answered while `case.update`
    // allowed, the page rendered normally with the assignment control silently
    // absent — indistinguishable from "you are a counsellor, who may not assign".
    // A failed check is an outage, not an absence (MV-170's rule), and a page that
    // renders three quarters of itself with no indication anything failed is the
    // worst version of it: the admin sees a surface that looks complete.
    grantCaseEach({
      "case.update": { allowed: true },
      "case.assign": { allowed: false, reason: "lookup-failed" },
    });

    render(await managePage());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText(/something went wrong on our side/i)).toBeInTheDocument();
    // And nothing partial: no status control either, because the page cannot say
    // which controls this person has.
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });

  it("renders an OUTAGE when the OTHER check could not complete", async () => {
    // Symmetric on purpose: a guard written for one ordering is half a guard.
    grantCaseEach({
      "case.update": { allowed: false, reason: "lookup-failed" },
      "case.assign": { allowed: true },
    });

    render(await managePage());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText(/something went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/primary counsellor/i)).not.toBeInTheDocument();
  });

  it("still renders both controls when both checks answered", async () => {
    // The guard must not turn every denial into an outage: a counsellor legitimately
    // gets one control and no outage, which the test above this one covers.
    grantCaseEach({ "case.update": { allowed: true }, "case.assign": { allowed: true } });

    render(await managePage());

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText(/primary counsellor/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong on our side/i)).not.toBeInTheDocument();
  });

  it("renders notFound() when the case belongs to a different organization", async () => {
    readOrgCase.mockResolvedValue({
      ok: true,
      data: {
        id: CASE,
        organizationId: OTHER_ORG,
        displayName: "Case one",
        email: null,
        operationalStatus: "new",
        hasLinkedStudent: false,
        archivedAt: null,
      },
    });

    // Not a leak — authorization is per case — but rendering another
    // organization's case under this URL would offer an assignment picker full of
    // members who cannot hold it.
    await expect(managePage()).rejects.toThrow("NOT_FOUND");
  });

  it("renders notFound() when the case does not exist", async () => {
    readOrgCase.mockResolvedValue({ ok: true, data: null });

    await expect(managePage()).rejects.toThrow("NOT_FOUND");
  });

  it("renders an OUTAGE when the case read failed", async () => {
    readOrgCase.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    render(await managePage());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText(/something went wrong on our side/i)).toBeTruthy();
  });

  it("marks the counsellor who currently holds the slot", async () => {
    readPrimaryCounsellor.mockResolvedValue({
      ok: true,
      data: { assignmentId: "assignment-1", userId: COUNSELLOR_USER },
    });

    render(await managePage());

    expect(screen.getByText(/currently assigned/i)).toBeTruthy();
  });

  it("says nobody is assigned when nobody is", async () => {
    render(await managePage());

    expect(screen.getByText(/no counsellor is assigned/i)).toBeTruthy();
  });

  it("does NOT claim the case is unassigned when the assignment could not be read", async () => {
    // A failed read wearing the "nobody is assigned" answer would tell an admin
    // to assign somebody who is already assigned.
    readPrimaryCounsellor.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    render(await managePage());

    expect(screen.queryByText(/no counsellor is assigned/i)).toBeNull();
    expect(screen.getByText(/couldn.t check who is assigned/i)).toBeTruthy();
  });

  it("does NOT read the roster for a viewer who is not staff on the case", async () => {
    // Reachable today: `CASE_PERMISSION_MATRIX.student["case.update"]` is `linked`, so
    // the LINKED STUDENT passes this page's gate. But
    // `case_assignments_select_accessor` admits only
    // `actor_assigned_case_ids() or can_staff_case(case_id)` — not the student — and
    // an RLS refusal is ZERO ROWS, NOT AN ERROR. So `readPrimaryCounsellor` returned
    // `{ok: true, data: null}` and the page told the student "No counsellor is
    // assigned to this student yet": a denial wearing the empty-result answer, and a
    // false claim about a case that may well have a counsellor.
    //
    // The two are indistinguishable AFTER the read, so the fix is not to read. Which
    // is also what the migration says the rule is: "Who staffs a case is
    // consultancy-internal operating data" and "the student link must not confer
    // org-scoped rights" (20260730180000, divergence 6).
    grantCaseEach({ "case.update": { allowed: true }, "case.assign": { allowed: false } }, {
      grantedRoles: ["student"],
    });

    render(await managePage());

    expect(readPrimaryCounsellor).not.toHaveBeenCalled();
    expect(screen.queryByText(/no counsellor is assigned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assigned to 7f3c9a1e/i)).not.toBeInTheDocument();
  });

  it("says who staffs the case is not shown, rather than saying nobody does", async () => {
    grantCaseEach({ "case.update": { allowed: true }, "case.assign": { allowed: false } }, {
      grantedRoles: ["student"],
    });

    render(await managePage());

    expect(screen.getByText(/who is working on this student is not shown here/i)).toBeInTheDocument();
  });

  it("still reads and reports the roster for staff", async () => {
    // The guard must narrow to non-staff only. A counsellor holds `case.update` and
    // not `case.assign`, and `case_assignments_select_accessor` admits them.
    grantCaseEach({ "case.update": { allowed: true }, "case.assign": { allowed: false } }, {
      grantedRoles: ["counsellor"],
    });

    render(await managePage());

    expect(readPrimaryCounsellor).toHaveBeenCalled();
    expect(screen.getByText(/no counsellor is assigned/i)).toBeInTheDocument();
  });

  it("shows the Archived state the list already shows", async () => {
    readOrgCase.mockResolvedValue({
      ok: true,
      data: {
        id: CASE,
        organizationId: ORG,
        displayName: "Case one",
        email: null,
        operationalStatus: "in_progress",
        hasLinkedStudent: false,
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
    });

    render(await managePage());

    // The list renders an "Archived" marker; dropping it here meant the one surface
    // that offers to CHANGE the case was the one that did not mention it was closed
    // off.
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("offers no live status control on an archived case, and says why", async () => {
    readOrgCase.mockResolvedValue({
      ok: true,
      data: {
        id: CASE,
        organizationId: ORG,
        displayName: "Case one",
        email: null,
        operationalStatus: "in_progress",
        hasLinkedStudent: false,
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
    });

    render(await managePage());

    // Moving an archived case through the operational statuses is an edit to a
    // record that has been put away, and un-archiving is Stage 6 — so the control
    // would offer a change with no way back.
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.getByText(/archived, so its status cannot be changed/i)).toBeInTheDocument();
  });

  it("keeps the status control on a case that is not archived", async () => {
    render(await managePage());

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.queryByText(/status cannot be changed/i)).not.toBeInTheDocument();
  });

  it("offers only ACTIVE members for the slot", async () => {
    render(await managePage());

    const options = screen.getAllByRole("option");
    // One placeholder plus the single active member; the inactive one is not an
    // option because `is_case_org_member` would refuse it after the existing
    // assignment had already been deleted.
    expect(options.filter((option) => (option as HTMLOptionElement).value === MEMBERSHIP_B)).toEqual(
      [],
    );
    expect(
      options.filter((option) => (option as HTMLOptionElement).value === MEMBERSHIP_A),
    ).toHaveLength(1);
  });

  it("says out loud that staff names are not available yet", async () => {
    // Spec F-9. Labelling a membership id as if it were a person would be worse
    // than admitting the limitation.
    render(await managePage());

    expect(screen.getByText(/names are not available/i)).toBeTruthy();
  });

  it("puts no whole Auth user id in the markup, and never sends one", async () => {
    readPrimaryCounsellor.mockResolvedValue({
      ok: true,
      data: { assignmentId: "assignment-1", userId: COUNSELLOR_USER },
    });

    const { container } = render(await managePage());

    // The short reference MV-169's team page shows is repeated here DELIBERATELY,
    // so an admin can match a picker entry to the person on the team page — two
    // surfaces naming the same member differently would be worse than a truncated
    // id. What must not appear is a whole one, and what travels to the route is
    // the membership id (asserted by the option-value test above).
    const shortReference = COUNSELLOR_USER.slice(0, 8);
    expect(container.innerHTML).not.toContain(COUNSELLOR_USER);
    expect(container.innerHTML).toContain(shortReference);

    // The positive half above was VACUOUS until the fixture id became hex: with
    // `counsellor-a-user-id` the slice was `counsell`, a substring of the word
    // "counsellor" that this page prints in a label, a role name and a paragraph —
    // so it matched whether or not the reference was rendered at all. This asserts
    // the prefix cannot come from the page's own vocabulary, so the test above can
    // only pass by the reference genuinely being there.
    expect(/^[0-9a-f]{8}$/.test(shortReference)).toBe(true);
    // …and it is in the OPTION the admin reads, not merely somewhere in the markup.
    expect(
      screen
        .getAllByRole("option")
        .some((option) => (option.textContent ?? "").includes(shortReference)),
    ).toBe(true);
  });

  it("redirects a visitor with no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(managePage()).rejects.toThrow("REDIRECT");
    expect(checkCasePermission).not.toHaveBeenCalled();
  });
});

describe("the student list grows MV-171's entry points", () => {
  it("offers 'Add a student' to an actor holding case.create", async () => {
    render(await listPage());

    expect(screen.getByRole("link", { name: /add a student/i })).toBeTruthy();
  });

  it("offers no create control to an actor who may not create", async () => {
    grantOrg({ "case.list": true, "case.create": false });

    render(await listPage());

    expect(screen.queryByRole("link", { name: /add a student/i })).toBeNull();
    // "You may not" is a determined answer and says nothing — the absence IS the
    // answer. It must not borrow the outage sentence below.
    expect(screen.queryByText(/couldn.t check whether you can add/i)).toBeNull();
  });

  it("SAYS SO when it could not check whether you may add a student", async () => {
    // Identical rendering for "you may not create" and "we couldn't check" is the
    // same defect H6 fixes on the manage page: an owner whose permission lookup
    // blipped silently loses the control and concludes their role changed.
    //
    // Unlike the manage page this does NOT become a whole-page outage: the list read
    // succeeded and the list is what the page is for, so blanking a working list
    // over a failed check on one control would destroy more than it reports. The
    // note goes where the control would have been.
    grantOrg({ "case.list": true, "case.create": false }, "lookup-failed");

    render(await listPage());

    expect(screen.queryByRole("link", { name: /add a student/i })).toBeNull();
    expect(screen.getByText(/couldn.t check whether you can add/i)).toBeInTheDocument();
    // The list page itself is still rendered — it was read successfully, and
    // replacing a working list with an outage card would destroy more than it reports.
    expect(screen.getByRole("heading", { level: 1, name: "Students" })).toBeInTheDocument();
  });

  it("links each row to its manage page", async () => {
    listOrgCases.mockResolvedValue({
      ok: true,
      data: [
        {
          id: CASE,
          displayName: "Case one",
          email: null,
          operationalStatus: "new",
          hasLinkedStudent: false,
          archivedAt: null,
        },
      ],
    });

    render(await listPage());

    const link = screen.getByRole("link", { name: /manage/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`/workspace/${ORG}/students/${CASE}/manage`);
  });

  it("no longer tells the reader that adding a student comes later", async () => {
    render(await listPage());

    expect(screen.queryByText(/comes later/i)).toBeNull();
  });
});
