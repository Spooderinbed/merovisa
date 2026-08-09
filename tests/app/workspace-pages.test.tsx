import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

import WorkspacePage from "@/app/(app)/workspace/page";
import TeamPage from "@/app/(app)/workspace/[organizationId]/team/page";
import OrgSettingsPage from "@/app/(app)/workspace/[organizationId]/settings/page";

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
