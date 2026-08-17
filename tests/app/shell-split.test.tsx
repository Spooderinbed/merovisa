import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-180 — the signed-in area has two shells, and each must be provably free of
 * the other's chrome.
 *
 * ## Why both directions are asserted here, in one file
 *
 * "No student chrome on a workspace route" is trivially true of a layout that
 * renders nothing at all, and a test asserting only that would keep passing if the
 * mocks below stopped producing anything. So every absence assertion has a sibling
 * PRESENCE assertion using the identical query: the student shell test proves
 * `data-testid="appbar"` is reachable, which is what makes the workspace shell's
 * `queryByTestId("appbar") === null` mean something. Same for the org rail, in
 * reverse.
 *
 * The static counterpart is `tests/architecture/shell-boundary.test.ts`, which
 * catches the chrome a future nested route imports — something no render test can
 * see.
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
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));

// The four student-chrome components, each announcing itself. They are mocked
// rather than rendered because the point of the file is WHICH shell mounts them,
// not what they look like.
vi.mock("@/components/layout/app-bar", () => ({
  AppBar: () => <div data-testid="appbar">appbar</div>,
}));
vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">footer</div>,
}));
vi.mock("@/components/layout/mobile-tab-bar", () => ({
  MobileTabBar: () => <div data-testid="mobile-tab-bar">tabs</div>,
}));
vi.mock("@/components/journey/journey-marker", () => ({
  JourneyMarker: () => <div data-testid="journey-marker">marker</div>,
}));

const { getJourneySignals, resolvePersonalCaseId, checkCasePermission } = vi.hoisted(() => ({
  getJourneySignals: vi.fn(),
  resolvePersonalCaseId: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/journey/signals", () => ({ getJourneySignals }));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { listActorOrganizations } = vi.hoisted(() => ({ listActorOrganizations: vi.fn() }));
vi.mock("@/lib/org/repo", () => ({ listActorOrganizations }));

import AppLayout from "@/app/(app)/layout";
import StudentLayout from "@/app/(app)/(student)/layout";
import WorkspaceLayout from "@/app/(app)/workspace/layout";
import OrgLayout from "@/app/(app)/workspace/[organizationId]/layout";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const ACTOR = "actor-user-id";

const STUDENT_CHROME = ["appbar", "journey-marker", "mobile-tab-bar", "footer"] as const;

function orgs(...rows: { id: string; name: string; slug: string; role: string }[]) {
  listActorOrganizations.mockResolvedValue({ ok: true, data: rows });
}

const ANADI = { id: ORG, name: "Anadi Education", slug: "anadi", role: "owner" as const };

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  resolvePersonalCaseId.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
  getJourneySignals.mockResolvedValue({
    hasAssessment: true,
    profilePct: 0,
    shortlistCount: 0,
    planEngaged: false,
    documentCount: 0,
    applyAttempted: false,
    applyGranted: false,
  });
});

describe("the neutral authenticated layout", () => {
  it("renders NO chrome of either kind — each shell decides its own", async () => {
    render(await AppLayout({ children: <div data-testid="kid">kid</div> }));

    expect(screen.getByTestId("kid")).toBeInTheDocument();
    for (const testid of STUDENT_CHROME) {
      expect(screen.queryByTestId(testid)).toBeNull();
    }
    expect(screen.queryByRole("navigation", { name: /organisation|organization/i })).toBeNull();
  });

  it("carries the np-au corridor for both shells, as a token carrier with no layout box", async () => {
    // Signed-in means the corridor is known (MVP: every user is Nepal →
    // Australia). The scope belongs above the split because both shells consume
    // its accents — and it must stay `contents`, because each shell owns its own
    // full-height column and a box here would nest one inside another.
    const { container } = render(
      await AppLayout({ children: <div data-testid="kid">kid</div> }),
    );
    const scope = container.querySelector('[data-corridor="np-au"]');
    expect(scope).not.toBeNull();
    expect((scope as HTMLElement).className).toContain("contents");
    expect(scope!.querySelector('[data-testid="kid"]')).not.toBeNull();
  });

  it("sends an unauthenticated visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?next=%2Fdashboard");
  });
});

describe("the student shell", () => {
  it("renders the student chrome — this is what makes the absences elsewhere mean something", async () => {
    render(await StudentLayout({ children: <div data-testid="kid">kid</div> }));

    for (const testid of STUDENT_CHROME) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
    expect(screen.getByTestId("kid")).toBeInTheDocument();
  });

  it("has no organization rail", async () => {
    render(await StudentLayout({ children: <div>kid</div> }));
    expect(screen.queryByRole("navigation", { name: /organisation|organization/i })).toBeNull();
  });

  it("mounts the journey marker, and degrades to no marker when signals fail", async () => {
    getJourneySignals.mockRejectedValue(new Error("db down"));
    render(await StudentLayout({ children: <div data-testid="kid">kid</div> }));

    expect(screen.queryByTestId("journey-marker")).toBeNull();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(screen.getByTestId("appbar")).toBeInTheDocument();
  });

  it("does not read the case it was refused, and still renders the app", async () => {
    // MV-157: the chrome's signal reads are case-scoped, and a denial degrades to
    // no marker rather than deciding a student cannot see their own app.
    checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });
    render(await StudentLayout({ children: <div data-testid="kid">kid</div> }));

    expect(getJourneySignals).not.toHaveBeenCalled();
    expect(screen.queryByTestId("journey-marker")).toBeNull();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
  });

  it("pads the content column for the fixed tab bar", async () => {
    const { container } = render(await StudentLayout({ children: <div>kid</div> }));
    const column = container.querySelector("main")!.parentElement!;
    expect(column.className).toContain("pb-[calc(56px+env(safe-area-inset-bottom))]");
    expect(column.className).toContain("md:pb-0");
  });

  it("keeps the chrome inside the full-height column (the MV-115 CLS guard)", async () => {
    const { container } = render(await StudentLayout({ children: <div>kid</div> }));
    const column = container.querySelector("main")!.parentElement!;
    expect(column.className).toContain("min-h-dvh");
    expect(column.querySelector('[data-testid="appbar"]')).not.toBeNull();
    expect(column.querySelector('[data-testid="journey-marker"]')).not.toBeNull();
    expect(column.querySelector('[data-testid="footer"]')).not.toBeNull();
  });
});

describe("the consultancy shell", () => {
  it("renders none of the student chrome", async () => {
    render(await WorkspaceLayout({ children: <div data-testid="kid">kid</div> }));

    for (const testid of STUDENT_CHROME) {
      expect(screen.queryByTestId(testid)).toBeNull();
    }
    expect(screen.getByTestId("kid")).toBeInTheDocument();
  });

  it("reserves no room for a mobile tab bar it deliberately does not have", async () => {
    // Spec §1: the rail becomes a horizontal row below `md`; there is no second
    // fixed bottom bar, so padding for one would be dead space on every phone.
    const { container } = render(await WorkspaceLayout({ children: <div>kid</div> }));
    const column = container.querySelector("main")!.parentElement!;
    expect(column.className).toContain("min-h-dvh");
    expect(column.className).not.toContain("56px");
  });
});

describe("the organization shell", () => {
  const params = Promise.resolve({ organizationId: ORG });

  it("names the current organization, so the tenant is never ambiguous", async () => {
    orgs(ANADI);
    render(await OrgLayout({ children: <div>kid</div>, params }));
    expect(screen.getByText("Anadi Education")).toBeInTheDocument();
  });

  it("rails Day view, All cases and Team — every staff role has all three", async () => {
    orgs({ ...ANADI, role: "counsellor" });
    render(await OrgLayout({ children: <div>kid</div>, params }));

    const rail = screen.getByRole("navigation", { name: /organization/i });
    const hrefs = Array.from(rail.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      `/workspace/${ORG}`,
      `/workspace/${ORG}/students`,
      `/workspace/${ORG}/team`,
    ]);
  });

  it("rails Settings for the owner only", async () => {
    orgs(ANADI);
    render(await OrgLayout({ children: <div>kid</div>, params }));
    const rail = screen.getByRole("navigation", { name: /organization/i });
    expect(rail.querySelector(`a[href="/workspace/${ORG}/settings"]`)).not.toBeNull();
  });

  it("does not rail Settings for an admin — divergence #1 keeps the tenant's identity with the owner", async () => {
    orgs({ ...ANADI, role: "admin" });
    render(await OrgLayout({ children: <div>kid</div>, params }));
    const rail = screen.getByRole("navigation", { name: /organization/i });
    expect(rail.querySelector(`a[href="/workspace/${ORG}/settings"]`)).toBeNull();
  });

  it("offers Switch organization only when there is another organization to switch to", async () => {
    orgs(ANADI);
    render(await OrgLayout({ children: <div>kid</div>, params }));
    // A sole-org actor would be bounced straight back by `/workspace`'s
    // auto-enter, so the link would be a control that does nothing.
    expect(screen.queryByRole("link", { name: /switch organization/i })).toBeNull();
  });

  it("offers Switch organization to a multi-organization actor", async () => {
    orgs(ANADI, { id: OTHER_ORG, name: "Bagmati Overseas", slug: "bagmati", role: "counsellor" });
    render(await OrgLayout({ children: <div>kid</div>, params }));

    const link = screen.getByRole("link", { name: /switch organization/i });
    expect(link.getAttribute("href")).toBe("/workspace");
    // Tenant clarity: the org they are IN stays named while they switch away.
    expect(screen.getByText("Anadi Education")).toBeInTheDocument();
  });

  it("renders no student chrome around a case", async () => {
    orgs(ANADI);
    render(await OrgLayout({ children: <div data-testid="kid">kid</div>, params }));

    for (const testid of STUDENT_CHROME) {
      expect(screen.queryByTestId(testid)).toBeNull();
    }
    expect(screen.getByTestId("kid")).toBeInTheDocument();
  });

  it("notFounds an organization the actor is not an active member of", async () => {
    // `listActorOrganizations` filters to ACTIVE memberships, so an unknown
    // organization, a non-membership and a revoked membership are one answer here
    // — which is the non-enumeration rule, not an accident.
    orgs({ id: OTHER_ORG, name: "Bagmati Overseas", slug: "bagmati", role: "owner" });
    await expect(OrgLayout({ children: null, params })).rejects.toThrow("NOT_FOUND");
  });

  it("renders an outage — NOT notFound — when the organization lookup failed", async () => {
    listActorOrganizations.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await OrgLayout({ children: null, params }));

    expect(screen.getByText(/couldn't load this organization/i)).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not render the page's content when the shell could not be resolved", async () => {
    // The chrome carries the tenant's name. A page rendered inside a shell that
    // does not know which organization it is would be a case surface with no
    // statement of whose organization it belongs to.
    listActorOrganizations.mockResolvedValue({ ok: false, reason: "lookup-failed" });
    render(await OrgLayout({ children: <div data-testid="kid">kid</div>, params }));
    expect(screen.queryByTestId("kid")).toBeNull();
  });

  it("sends an unauthenticated visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(OrgLayout({ children: null, params })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/auth?next=/workspace/${ORG}`);
  });
});
