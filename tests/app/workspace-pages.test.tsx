import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * The three MV-169 surfaces — access-matrix cells 1, 2, 4 (spec §4).
 *
 * The two assertions worth having here, because neither is visible in the repo or
 * the route tests:
 *
 * 1. **A failed lookup and an empty result do not render the same.** "You are not
 *    part of any organization" is a claim about the actor; making it because a
 *    query errored is exactly the quiet dishonesty this product exists to avoid.
 * 2. **A denied page is `notFound()`, not a "forbidden" page.** Confirming an
 *    organization exists but is not yours is an enumeration oracle;
 *    `getOrgContext` already refuses to distinguish "unknown organization" from
 *    "not a member" for that reason, and the pages must not undo it.
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

const { listActorOrganizations, listOrgMembers } = vi.hoisted(() => ({
  listActorOrganizations: vi.fn(),
  listOrgMembers: vi.fn(),
}));
vi.mock("@/lib/org/repo", () => ({ listActorOrganizations, listOrgMembers }));

const { checkOrgPermission } = vi.hoisted(() => ({ checkOrgPermission: vi.fn() }));
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

// LIST_ROW_CAP is deliberately NOT the real 500 here: the page has to render the
// number it was given, and a test that fed it 500 would pass against a hard-coded
// literal. The real value is pinned in `tests/cases/list-repo.test.ts`.
const { LIST_ROW_CAP } = vi.hoisted(() => ({ LIST_ROW_CAP: 7 }));
vi.mock("@/lib/cases/list-repo", () => ({ LIST_ROW_CAP }));

const { listCaseQueue } = vi.hoisted(() => ({ listCaseQueue: vi.fn() }));
vi.mock("@/lib/cases/queue-repo", () => ({ listCaseQueue }));

import WorkspacePage from "@/app/(app)/workspace/page";
import TeamPage from "@/app/(app)/workspace/[organizationId]/team/page";
import OrgSettingsPage from "@/app/(app)/workspace/[organizationId]/settings/page";
import StudentsPage from "@/app/(app)/workspace/[organizationId]/students/page";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-user-id";

function grant(claims: Partial<Record<string, boolean>>) {
  checkOrgPermission.mockImplementation(async (_a: string, _o: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
    // An ACTIVE membership that simply does not hold this claim. `getOrgContext`
    // resolves standing and the claim separately, and the team page reads both:
    // cell 4 (roster read) is standing, cell 5 (role/deactivate) is the claim.
    context: { membershipRole: "counsellor", isActiveMember: true, hasAccess: true, denyReason: null },
  }));
}

/**
 * Every claim denied for one stated reason. `checkOrgPermission` preserves
 * `getOrgContext`'s reason precisely so `lookup-failed` — "the membership read
 * errored" — stays distinguishable from "you are not a member", and a page that
 * renders both as `notFound()` tells a legitimate owner their organization does
 * not exist because Supabase blipped.
 */
function denyAll(reason: string) {
  checkOrgPermission.mockImplementation(async () => ({
    decision: { allowed: false, requiredScope: null, reason },
    // `checkOrgPermission` short-circuits on a context that established no
    // standing, so the context carries the same reason the decision does.
    context: { membershipRole: null, isActiveMember: false, hasAccess: false, denyReason: reason },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
});

describe("/workspace — cell 1, organization selection", () => {
  it("auto-enters a sole active organization rather than asking a question with one answer", async () => {
    // MV-180: a counsellor at one consultancy has no choice to make here, and the
    // Day view is the landing (MV-179). The chooser survives for the actor who
    // genuinely has more than one.
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [{ id: ORG, name: "Anadi Education", slug: "anadi", role: "counsellor" }],
    });
    await expect(WorkspacePage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/workspace/${ORG}`);
  });

  it("stays a chooser when the actor has more than one organization", async () => {
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [
        { id: ORG, name: "Anadi Education", slug: "anadi", role: "owner" },
        { id: "org-b", name: "Bagmati Overseas", slug: "bagmati", role: "counsellor" },
      ],
    });
    render(await WorkspacePage());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not auto-enter anything when the lookup failed", async () => {
    // An outage must never be resolved by guessing at an organization, and a
    // failed read is not "you have exactly none" either.
    listActorOrganizations.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await WorkspacePage());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not auto-enter when the actor belongs to no organization", async () => {
    listActorOrganizations.mockResolvedValue({ ok: true, data: [] });
    render(await WorkspacePage());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lists every organization the actor is an active member of", async () => {
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [
        { id: ORG, name: "Anadi Education", slug: "anadi", role: "owner" },
        { id: "org-b", name: "Bagmati Overseas", slug: "bagmati", role: "counsellor" },
      ],
    });
    render(await WorkspacePage());

    expect(screen.getByText("Anadi Education")).toBeTruthy();
    expect(screen.getByText("Bagmati Overseas")).toBeTruthy();
  });

  it("offers Team to an admin and settings only to the owner", async () => {
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [
        { id: ORG, name: "Anadi Education", slug: "anadi", role: "admin" },
        { id: "org-c", name: "Chitwan Pathways", slug: "chitwan", role: "counsellor" },
      ],
    });
    render(await WorkspacePage());

    // Divergence #1: the admin manages the team but never the tenant's identity.
    expect(screen.getAllByText("Team")).toHaveLength(1);
    expect(screen.queryByText("Organization settings")).toBeNull();
  });

  it("offers the Day view and All cases to every role — cell 7 gives all three staff roles a queue", async () => {
    // The counsellor's queue is narrower (assigned only), but it exists. Hiding
    // the links from them would leave the workspace with nothing a counsellor can
    // open. Since MV-179 the Day view is the landing; the directory rides beside it.
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [
        { id: ORG, name: "Anadi Education", slug: "anadi", role: "admin" },
        { id: "org-c", name: "Chitwan Pathways", slug: "chitwan", role: "counsellor" },
      ],
    });
    render(await WorkspacePage());

    expect(screen.getAllByText("Day view")).toHaveLength(2);
    expect(screen.getAllByText("All cases")).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: "Day view" }).map((l) => l.getAttribute("href")),
    ).toEqual([`/workspace/${ORG}`, "/workspace/org-c"]);
  });

  it("says 'no organizations' only when there genuinely are none", async () => {
    listActorOrganizations.mockResolvedValue({ ok: true, data: [] });
    render(await WorkspacePage());
    expect(screen.getByText(/not part of any organization/i)).toBeTruthy();
  });

  it("does NOT claim the actor has no organizations when the lookup failed", async () => {
    listActorOrganizations.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await WorkspacePage());

    expect(screen.queryByText(/not part of any organization/i)).toBeNull();
    expect(screen.getByText(/couldn't load your organizations/i)).toBeTruthy();
  });

  it("sends an unauthenticated visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(WorkspacePage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?next=/workspace");
  });
});

/**
 * MV-180 corrects this page's gate. Cell 4 (team list) is `read · read · read ·
 * read` — every ACTIVE member of the organization, a counsellor included; cell 5
 * (role change / deactivate) is owner/admin. The page gated BOTH on `org.manage`,
 * so a counsellor was told the organization does not exist rather than shown the
 * roster the matrix grants them (Stage 3 spec §0, amendment 3).
 *
 * The two halves are therefore asserted separately, and the read half is asserted
 * for the role that used to be refused. Standing comes from the resolved context;
 * the claim comes from the decision.
 */
describe("/workspace/[id]/team — cells 4 and 5", () => {
  const params = Promise.resolve({ organizationId: ORG });

  const roster = {
    ok: true,
    data: [
      { id: "m-1", userId: "aaaaaaaa-1111", role: "owner", status: "active" },
      { id: "m-2", userId: "bbbbbbbb-2222", role: "counsellor", status: "inactive" },
    ],
  };

  it("renders the roster for an admin", async () => {
    grant({ "org.manage": true });
    listOrgMembers.mockResolvedValue(roster);
    render(await TeamPage({ params }));

    expect(screen.getByText("Owner")).toBeTruthy();
    // A deactivated member is still listed — the row survives for the audit trail.
    expect(screen.getByText(/Access switched off/i)).toBeTruthy();
  });

  it("renders the roster for a COUNSELLOR — cell 4 is a read every active member holds", async () => {
    // The bug: this asserted `notFound()`. A counsellor holds no `org.manage`,
    // and `organization_memberships_select_member` lets them read their
    // co-members anyway, so the app layer was refusing what the database grants.
    grant({ "case.list": true });
    listOrgMembers.mockResolvedValue(roster);
    render(await TeamPage({ params }));

    expect(screen.getByText("Owner")).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("offers a counsellor no role control and no deactivate control — cell 5 stays owner/admin", async () => {
    grant({ "case.list": true });
    listOrgMembers.mockResolvedValue(roster);
    render(await TeamPage({ params }));

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /deactivate|reactivate/i })).toBeNull();
  });

  it("gives an admin the cell-5 controls the counsellor does not get", async () => {
    // The other half of the pair: without this, "no controls for a counsellor"
    // would pass against a page that renders controls for nobody.
    grant({ "org.manage": true });
    listOrgMembers.mockResolvedValue(roster);
    render(await TeamPage({ params }));

    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeTruthy();
  });

  it("says the roster is read-only to a counsellor, and says nothing about invitations", async () => {
    // Spec F-5's "adding people comes later" is a manager's sentence. Telling a
    // counsellor that this page manages memberships would describe a surface they
    // do not have.
    grant({ "case.list": true });
    listOrgMembers.mockResolvedValue(roster);
    render(await TeamPage({ params }));

    expect(screen.getByText(/who is in this organization/i)).toBeTruthy();
    expect(screen.queryByText(/Adding people comes later/i)).toBeNull();
  });

  it("denies a NON-member with notFound rather than a forbidden page", async () => {
    denyAll("no-relationship");
    await expect(TeamPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(listOrgMembers).not.toHaveBeenCalled();
  });

  it("denies an INACTIVE member with notFound — a revoked membership reads no roster", async () => {
    // Canonical rule 1: inactive membership grants nothing. Standing, not the
    // claim, is what the read gate now reads — so this is the case that would
    // regress if the gate were loosened to "has a membership row".
    denyAll("membership-inactive");
    await expect(TeamPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(listOrgMembers).not.toHaveBeenCalled();
  });

  it("renders an outage — NOT notFound — when the permission lookup itself failed", async () => {
    denyAll("lookup-failed");
    render(await TeamPage({ params }));

    expect(screen.getByText(/couldn't load the team/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(listOrgMembers).not.toHaveBeenCalled();
  });

  it("tells the admin that invitations are not built yet, rather than offering one", async () => {
    // Spec F-5: the plan's bullet 1 reads as a fuller surface than the model
    // supports. Silence here would let an admin conclude the button is missing.
    grant({ "org.manage": true });
    listOrgMembers.mockResolvedValue({ ok: true, data: [] });
    render(await TeamPage({ params }));
    expect(screen.getByText(/Adding people comes later/i)).toBeTruthy();
  });
});

describe("/workspace/[id]/settings — cell 2, owner-only", () => {
  const params = Promise.resolve({ organizationId: ORG });

  it("renders the rename form for the owner", async () => {
    grant({ "org.manage": true, "org.settings": true });
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [{ id: ORG, name: "Anadi Education", slug: "anadi", role: "owner" }],
    });
    render(await OrgSettingsPage({ params }));

    expect(screen.getByLabelText("Organization name")).toBeTruthy();
    expect(screen.getByLabelText("Web address")).toBeTruthy();
  });

  it("refuses an ADMIN — divergence #1, and the refusal is notFound", async () => {
    grant({ "org.manage": true });
    await expect(OrgSettingsPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(listActorOrganizations).not.toHaveBeenCalled();
  });

  it("renders an outage — NOT notFound — when the permission lookup itself failed", async () => {
    denyAll("lookup-failed");
    render(await OrgSettingsPage({ params }));

    expect(screen.getByText(/couldn't load this organization/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(listActorOrganizations).not.toHaveBeenCalled();
  });
});

/**
 * MV-170 — access-matrix cell 7, the org-scoped student list.
 *
 * The assertions worth having here are the ones neither the repository tests nor
 * the RLS suite can make:
 *
 * 1. **The scope from `checkOrgPermission` is passed through, not assumed.** The
 *    matrix gives a counsellor `case.list` with scope `assigned`; a page that
 *    ignored the scope would allow and then list the whole organization.
 * 2. **Three empty states stay distinguishable** — the lookup failed, there are
 *    no students, the filters matched none of the students there are.
 * 3. **Spec F-3's marker is rendered**, so a counsellor can tell a name their team
 *    controls from one the student can rewrite.
 */
describe("/workspace/[id]/students — cell 7, the case directory (All cases)", () => {
  const params = Promise.resolve({ organizationId: ORG });
  const noSearch = Promise.resolve({});

  function grantList(scope: string | null) {
    checkOrgPermission.mockImplementation(async (_a: string, _o: string, permission: string) => ({
      decision:
        permission === "case.list" && scope !== null
          ? { allowed: true, requiredScope: scope, reason: null }
          : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
      context: {},
    }));
  }

  /** Placeholder rows only — `display_name`/`email` describe real people from Stage 7 on. */
  const LINKED_CASE = {
    id: "case-1",
    displayName: "Anil Gurung",
    email: "anil@example.test" as string | null,
    operationalStatus: "waiting_on_student",
    hasLinkedStudent: true,
    archivedAt: null as string | null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    assignment: {
      membershipId: "m-1",
      userId: "7f3c9a1e-4b2d-4c6e-8a10-000000000001",
      role: "counsellor",
      active: true,
    } as { membershipId: string; userId: string; role: string; active: boolean } | null,
    nextStep: { state: "caught-up" as const, item: null, openCount: 0, waitingCount: 0 },
    // MV-183. The All-cases directory reads through `listCaseQueue` too, so it
    // carries the same lodgement read as the Day view and renders the same column.
    lodgement: { state: "none-outstanding" as const },
  };
  const UNLINKED_CASE = {
    ...LINKED_CASE,
    id: "case-2",
    displayName: "Sita Rai",
    email: null,
    operationalStatus: "new",
    hasLinkedStudent: false,
    assignment: null,
  };
  const CASES = [LINKED_CASE, UNLINKED_CASE];

  /**
   * A whole `listCaseQueue` answer. Spelling every field out at each call site
   * invites a mock that omits one, and an omitted `scopeIsEmpty` reads as `false`
   * — which is the empty-state defect this suite exists to catch.
   */
  function queued(
    rows: Array<typeof LINKED_CASE | typeof UNLINKED_CASE>,
    extra: { scopeIsEmpty?: boolean; truncated?: boolean } = {},
  ) {
    return {
      ok: true,
      rows,
      members: [],
      scopeIsEmpty: rows.length === 0,
      truncated: false,
      ...extra,
    };
  }

  /** Data rows of the directory table, in rendered order, keyed by the name link. */
  const renderedNames = () =>
    within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("link")[0]?.textContent ?? "");
  const rowFor = (name: string) =>
    within(screen.getByRole("table"))
      .getAllByRole("row")
      .find((row) => within(row).queryByText(name)) as HTMLElement;

  it("lists the organization's students for an admin, name-sorted, with a readable status", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(renderedNames()).toEqual(["Anil Gurung", "Sita Rai"]);
    // Scoped to the ROW. Unscoped, these are satisfied by the status dropdown —
    // whose <option> reads "Waiting on student" and whose value is
    // `waiting_on_student`. The words may appear twice in the row (the pill and
    // the derived next action); the raw column value may appear NOWHERE.
    const row = within(rowFor("Anil Gurung"));
    expect(row.getAllByText(/Waiting on student/).length).toBeGreaterThan(0);
    expect(row.queryByText(/waiting_on_student/)).toBeNull();
  });

  it("links each name to the case overview — the queue's default target", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByRole("link", { name: "Anil Gurung" }).getAttribute("href")).toBe(
      `/workspace/${ORG}/students/case-1`,
    );
  });

  it("passes the counsellor's ASSIGNED scope through instead of listing the organization", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([LINKED_CASE]));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(listCaseQueue).toHaveBeenCalledWith(ACTOR, ORG, "assigned", expect.anything());
  });

  it("tells a counsellor the list is theirs, not the organization's", async () => {
    // A filtered list presented as the whole organization is a quiet lie: the
    // counsellor concludes the consultancy has one student.
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([LINKED_CASE]));
    render(await StudentsPage({ params, searchParams: noSearch }));
    expect(screen.getByText(/assigned to you/i)).toBeTruthy();
  });

  it("hides the assignee column from a counsellor", async () => {
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([LINKED_CASE]));
    render(await StudentsPage({ params, searchParams: noSearch }));
    expect(screen.queryByRole("columnheader", { name: "Assignee" })).toBeNull();
  });

  it("denies with notFound when the actor may not list, and asks the database for nothing", async () => {
    grantList(null);
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("NOT_FOUND");
    expect(listCaseQueue).not.toHaveBeenCalled();
  });

  it("denies a scope it has no query for, rather than widening to the organization", async () => {
    // `linked` is a student's own case. Falling through to all-org here would
    // hand a case-scoped grant an organization-wide list.
    grantList("linked");
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("NOT_FOUND");
    expect(listCaseQueue).not.toHaveBeenCalled();
  });

  it("renders an outage — NOT notFound — when the permission lookup itself failed", async () => {
    // "We could not work out your access" is not "you do not have any". Collapsing
    // them tells an owner their organization does not exist because Supabase
    // blipped, which is the one class of claim this surface must never make.
    denyAll("lookup-failed");
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(/couldn't load your students/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(listCaseQueue).not.toHaveBeenCalled();
  });

  it("does NOT claim the organization has no students when the lookup failed", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(/couldn't load/i)).toBeTruthy();
    expect(screen.queryByText(/No students yet/i)).toBeNull();
  });

  it("says 'no students yet' when the scope really is empty", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued([]));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(/No students yet/i)).toBeTruthy();
    expect(screen.queryByText(/match/i)).toBeNull();
  });

  it("says 'nothing matched' — not 'no students' — when a search returned nothing", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: Promise.resolve({ q: "zzz" }) }));

    expect(screen.getByText(/No students match/i)).toBeTruthy();
    expect(screen.queryByText(/No students yet/i)).toBeNull();
  });

  it("does NOT blame the filters for a list that was empty before they ran", async () => {
    // An unassigned counsellor who searches. The scope held nothing before the
    // term ran, and "clear the filters to see the full list" points at a list
    // that does not exist. The page branches on the repository's answer, never
    // on the query string.
    grantList("assigned");
    listCaseQueue.mockResolvedValue(queued([]));
    render(await StudentsPage({ params, searchParams: Promise.resolve({ q: "ram" }) }));

    expect(screen.getByText(/not assigned to any students/i)).toBeTruthy();
    expect(screen.queryByText(/No students match/i)).toBeNull();
    expect(screen.queryByText(/Clear the filters/i)).toBeNull();
  });

  it("says the list is capped, rather than letting a search silently miss a student", async () => {
    // Past the cap the read is a PREFIX, so "no students match those filters" would
    // be a false claim about the organization. The number rendered is the number
    // the repository applied, not a literal — hence the deliberately odd cap above.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES, { truncated: true }));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(`Showing the first ${LIST_ROW_CAP} students`)).toBeTruthy();
  });

  it("says nothing about a cap when the read was complete", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.queryByText(/Showing the first/i)).toBeNull();
  });

  it("marks a case with an account as linked, and a staff-only one as having no account", async () => {
    // The marker states the schema fact — `student_user_id IS NOT NULL` — and the
    // legend beside the table carries F-3's caveat about what a linked student can
    // edit. MV-181 aligned the word with the filter that has always been labelled
    // "Student linked": a counsellor filtered by one word and read back another.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: noSearch }));

    // Tied to the ROW that produced each marker. Asserting only that both strings
    // appear somewhere in the list leaves SWAPPING them invisible — and an inverted
    // marker is exactly the deception F-3 exists to prevent.
    expect(within(rowFor("Anil Gurung")).getByText("Student linked")).toBeTruthy();
    expect(within(rowFor("Sita Rai")).getByText("No student account")).toBeTruthy();
  });

  it("marks an archived case, and only an archived one", async () => {
    // Both fixtures above set `archivedAt: null`, so deleting or inverting this
    // marker left the whole suite green. The negative half is what catches the
    // inversion.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(
      queued([{ ...LINKED_CASE, archivedAt: "2026-08-01T00:00:00.000Z" }, UNLINKED_CASE]),
    );
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(within(rowFor("Anil Gurung")).getByText("Archived")).toBeTruthy();
    expect(within(rowFor("Sita Rai")).queryByText("Archived")).toBeNull();
  });

  it("drops a status the check constraint does not admit instead of applying it", async () => {
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: Promise.resolve({ status: "archived" }) }));

    // The junk predicate filtered NOTHING: both rows render.
    expect(renderedNames()).toEqual(["Anil Gurung", "Sita Rai"]);
  });

  it("applies a status the constraint does admit — alone, so the search cannot mask a dropped predicate", async () => {
    // Since MV-179 the predicates run in memory over the queue read, so the
    // honest assertion is the RESULT the reader sees, not a forwarded argument.
    // NO search term here, deliberately: with `q` set, a page that silently
    // dropped the status facet rendered the identical rows and this test stayed
    // green — the vacuity MISTAKES.md warns about.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(
      await StudentsPage({
        params,
        searchParams: Promise.resolve({ status: "waiting_on_student" }),
      }),
    );

    expect(renderedNames()).toEqual(["Anil Gurung"]);
  });

  it("takes the first value of a repeated parameter instead of 500ing on the array", async () => {
    // `?q=a&q=b` is a hand-crafted URL, but Next hands a repeated search
    // parameter through as `string[]`, and `.trim()` on an array throws — which
    // would turn a malformed link into a server error page rather than a list.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(
      await StudentsPage({
        params,
        searchParams: Promise.resolve({ q: ["Rai", "Gurung"], status: ["new", "closed"] }),
      }),
    );

    expect(renderedNames()).toEqual(["Sita Rai"]);
  });

  it("offers no create control to a viewer who may not create — and no longer says it comes later", async () => {
    // `grantList` allows `case.list` and denies everything else, so this viewer
    // sees the list and no control. The positive case — an owner or admin IS
    // offered it — lives in `tests/app/case-pages.test.tsx`.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));
    render(await StudentsPage({ params, searchParams: noSearch }));
    expect(screen.queryByText(/comes later/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /add a student/i })).toBeNull();
  });

  it("clears the CONTROLS as well as the URL, so the next Apply does not re-submit a dropped filter", async () => {
    // Apply is a native submit and reloads the document, so the controls come back
    // correct. "Clear" is a soft navigation: React reconciles the mounted
    // <select>/<input>, and writing `defaultValue` to a mounted element changes
    // nothing it displays — the dropdown would still read "Closed", and the next
    // Apply would re-apply a filter the user believes they removed.
    grantList("all-org");
    listCaseQueue.mockResolvedValue(queued(CASES));

    const { rerender } = render(
      await StudentsPage({
        params,
        searchParams: Promise.resolve({ q: "Rai", status: "closed" }),
      }),
    );
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("closed");
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("Rai");

    rerender(await StudentsPage({ params, searchParams: noSearch }));
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("");
  });

  it("sends an unauthenticated visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/auth?next=/workspace/${ORG}/students`);
  });
});
