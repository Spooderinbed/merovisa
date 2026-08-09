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

const { listOrgCases } = vi.hoisted(() => ({ listOrgCases: vi.fn() }));
vi.mock("@/lib/cases/list-repo", () => ({ listOrgCases }));

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
    context: {},
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
});

describe("/workspace — cell 1, organization selection", () => {
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

  it("offers Students for every role — cell 7 gives all three staff roles a list", async () => {
    // The counsellor's list is narrower (assigned only), but it exists. Hiding the
    // link from them would leave the workspace with nothing a counsellor can open.
    listActorOrganizations.mockResolvedValue({
      ok: true,
      data: [
        { id: ORG, name: "Anadi Education", slug: "anadi", role: "admin" },
        { id: "org-c", name: "Chitwan Pathways", slug: "chitwan", role: "counsellor" },
      ],
    });
    render(await WorkspacePage());

    expect(screen.getAllByText("Students")).toHaveLength(2);
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

describe("/workspace/[id]/team — cells 4 and 5", () => {
  const params = Promise.resolve({ organizationId: ORG });

  it("renders the roster for an admin", async () => {
    grant({ "org.manage": true });
    listOrgMembers.mockResolvedValue({
      ok: true,
      data: [
        { id: "m-1", userId: "aaaaaaaa-1111", role: "owner", status: "active" },
        { id: "m-2", userId: "bbbbbbbb-2222", role: "counsellor", status: "inactive" },
      ],
    });
    render(await TeamPage({ params }));

    expect(screen.getByText("owner")).toBeTruthy();
    // A deactivated member is still listed — the row survives for the audit trail.
    expect(screen.getByText("deactivated")).toBeTruthy();
  });

  it("gates on org.manage, so a counsellor gets notFound rather than a forbidden page", async () => {
    grant({ "case.list": true });
    await expect(TeamPage({ params })).rejects.toThrow("NOT_FOUND");
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
describe("/workspace/[id]/students — cell 7, the student list", () => {
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

  const CASES = [
    {
      id: "case-1",
      displayName: "Anil Gurung",
      email: "anil@example.test",
      operationalStatus: "waiting_on_student",
      hasLinkedStudent: true,
      archivedAt: null,
    },
    {
      id: "case-2",
      displayName: "Sita Rai",
      email: null,
      operationalStatus: "new",
      hasLinkedStudent: false,
      archivedAt: null,
    },
  ];

  it("lists the organization's students for an admin, with a readable status", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText("Anil Gurung")).toBeTruthy();
    expect(screen.getByText("Sita Rai")).toBeTruthy();
    // The raw column value is schema, not copy.
    expect(screen.getByText("Waiting on student")).toBeTruthy();
    expect(screen.queryByText("waiting_on_student")).toBeNull();
  });

  it("passes the counsellor's ASSIGNED scope through instead of listing the organization", async () => {
    grantList("assigned");
    listOrgCases.mockResolvedValue({ ok: true, data: [CASES[0]] });
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(listOrgCases).toHaveBeenCalledWith(
      ACTOR,
      ORG,
      "assigned",
      expect.anything(),
      expect.anything(),
    );
  });

  it("tells a counsellor the list is theirs, not the organization's", async () => {
    // A filtered list presented as the whole organization is a quiet lie: the
    // counsellor concludes the consultancy has one student.
    grantList("assigned");
    listOrgCases.mockResolvedValue({ ok: true, data: [CASES[0]] });
    render(await StudentsPage({ params, searchParams: noSearch }));
    expect(screen.getByText(/assigned to you/i)).toBeTruthy();
  });

  it("denies with notFound when the actor may not list, and asks the database for nothing", async () => {
    grantList(null);
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("NOT_FOUND");
    expect(listOrgCases).not.toHaveBeenCalled();
  });

  it("denies a scope it has no query for, rather than widening to the organization", async () => {
    // `linked` is a student's own case. Falling through to all-org here would
    // hand a case-scoped grant an organization-wide list.
    grantList("linked");
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("NOT_FOUND");
    expect(listOrgCases).not.toHaveBeenCalled();
  });

  it("does NOT claim the organization has no students when the lookup failed", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(/couldn't load/i)).toBeTruthy();
    expect(screen.queryByText(/No students yet/i)).toBeNull();
  });

  it("says 'no students yet' only when nothing is filtered", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: [] });
    render(await StudentsPage({ params, searchParams: noSearch }));

    expect(screen.getByText(/No students yet/i)).toBeTruthy();
    expect(screen.queryByText(/match/i)).toBeNull();
  });

  it("says 'nothing matched' — not 'no students' — when a search returned nothing", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: [] });
    render(
      await StudentsPage({ params, searchParams: Promise.resolve({ q: "zzz" }) }),
    );

    expect(screen.getByText(/No students match/i)).toBeTruthy();
    expect(screen.queryByText(/No students yet/i)).toBeNull();
  });

  it("marks a student-editable name as self-reported, and a staff-only one as having no account", async () => {
    // Spec F-3 reading (a). There is no provenance column, so the page claims
    // only what is knowable: whether a student CAN write these fields.
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(await StudentsPage({ params, searchParams: noSearch }));

    // Scoped to the list: the sentence above it also names the marker, and an
    // unscoped query would pass on the explanation alone while every row was bare.
    const rows = within(screen.getByRole("list"));
    expect(rows.getByText("Self-reported")).toBeTruthy();
    expect(rows.getByText("No student account")).toBeTruthy();
  });

  it("drops a status the check constraint does not admit instead of forwarding it", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(
      await StudentsPage({ params, searchParams: Promise.resolve({ status: "archived" }) }),
    );

    expect(listOrgCases).toHaveBeenCalledWith(
      ACTOR,
      ORG,
      "all-org",
      { query: "", status: undefined },
      expect.anything(),
    );
  });

  it("forwards a status the constraint does admit", async () => {
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(
      await StudentsPage({ params, searchParams: Promise.resolve({ status: "closed", q: " Rai " }) }),
    );

    expect(listOrgCases).toHaveBeenCalledWith(
      ACTOR,
      ORG,
      "all-org",
      { query: "Rai", status: "closed" },
      expect.anything(),
    );
  });

  it("takes the first value of a repeated parameter instead of 500ing on the array", async () => {
    // `?q=a&q=b` is a hand-crafted URL, but Next hands a repeated search
    // parameter through as `string[]`, and `.trim()` on an array throws — which
    // would turn a malformed link into a server error page rather than a list.
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(
      await StudentsPage({
        params,
        searchParams: Promise.resolve({ q: ["Rai", "Gurung"], status: ["closed", "new"] }),
      }),
    );

    expect(listOrgCases).toHaveBeenCalledWith(
      ACTOR,
      ORG,
      "all-org",
      { query: "Rai", status: "closed" },
      expect.anything(),
    );
  });

  it("tells the admin that adding a student comes later, rather than offering a control", async () => {
    // The team page's F-5 lesson: silence here lets an admin conclude the button
    // is broken. Case creation is MV-171.
    grantList("all-org");
    listOrgCases.mockResolvedValue({ ok: true, data: CASES });
    render(await StudentsPage({ params, searchParams: noSearch }));
    expect(screen.getByText(/Adding a student comes later/i)).toBeTruthy();
  });

  it("sends an unauthenticated visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(StudentsPage({ params, searchParams: noSearch })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/auth?next=/workspace/${ORG}/students`);
  });
});
