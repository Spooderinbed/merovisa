import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-172 — access-matrix cell 13, the case route itself.
 *
 * The first time a non-student actor reaches student data **through the product**
 * rather than around it: an assigned counsellor opens a case belonging to a
 * student who has no account, and works in it.
 *
 * ## What these tests can and cannot prove
 *
 * They prove the ROUTE's decisions: who is let in, what the three failure
 * outcomes render as, and — the load-bearing one — that every panel is handed
 * **the case in the URL** and the **authenticated** client. They cannot prove
 * Postgres agrees; that is `tests/integration/stage3-case-route.itest.ts`, which
 * reads the written rows back under a real `authenticated` JWT.
 *
 * ## The three outcomes must not collapse (MV-171's rule, inherited)
 *
 * A denial is `notFound()` — confirming a case exists but is not yours is an
 * enumeration oracle. A failed CHECK or READ is an outage, because "you may not
 * see this" is a claim about the viewer we have not established. A case that
 * belongs to another organization is `notFound()` even though authorization is
 * per case, so the URL cannot lie about which tenant it is showing.
 */

const { getUser, redirect, notFound } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((_target: string) => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, tag: "authenticated" }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({ refresh: vi.fn() }) }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { readOrgCase } = vi.hoisted(() => ({ readOrgCase: vi.fn() }));
vi.mock("@/lib/cases/write-repo", () => ({ readOrgCase }));

/**
 * The frame's own reads are stubbed here on purpose. This file asks what the
 * ROUTES decide; what the case frame and the overview SAY about a case is
 * `tests/app/case-frame.test.tsx` and `tests/app/case-overview.test.tsx`, which
 * run these for real against a fake database.
 */
vi.mock("@/lib/cases/case-frame", () => ({
  isStaffOnCase: () => true,
  readCaseAssignee: async () => ({ state: "unassigned" }),
  readCaseNextStep: async () => ({
    state: "caught-up",
    item: null,
    openCount: 0,
    waitingCount: 0,
  }),
  readCaseLodgement: async () => ({ state: "nothing-requested" }),
  // MV-198. `null` — the shape a non-staff viewer gets — keeps this file on the
  // question it asks (what the ROUTES decide) rather than pulling a judgement into
  // it; what the read SAYS is `tests/cases/case-visa-risk-read.test.ts`.
  readCaseVisaRisk: async () => null,
}));

/**
 * The four panels are stubbed to render the case id and a tag for the client they
 * were handed. That is the assertion: a page that passed the wrong case id, or
 * that reached for the service-role client to read a student's data, is visible
 * here as literal text.
 */
const { panelStub } = vi.hoisted(() => ({
  panelStub: (name: string) =>
    function Panel({ caseId, db }: { caseId: string | null; db?: { tag?: string } }) {
      return (
        <div data-testid={name}>
          {name}:{caseId}:{db?.tag ?? "no-client"}
        </div>
      );
    },
}));
vi.mock("@/components/case-experience/profile-panel", () => ({ ProfilePanel: panelStub("profile") }));
vi.mock("@/components/case-experience/matches-panel", () => ({ MatchesPanel: panelStub("matches") }));
vi.mock("@/components/case-experience/plan-panel", () => ({ PlanPanel: panelStub("plan") }));
vi.mock("@/components/case-experience/checklist-landing-panel", () => ({
  ChecklistLandingPanel: panelStub("checklist"),
}));

import CaseHomePage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/page";
import CaseProfilePage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/profile/page";
import CaseMatchesPage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/matches/page";
import CasePlanPage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/plan/page";
import CaseChecklistPage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/checklist/page";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CASE = "22222222-2222-4222-a222-222222222222";
const ACTOR = "actor-user-id";

/** A student-less consultancy case — spec §6.3's row shape, and cell 13's subject. */
const STUDENT_LESS_CASE = {
  id: CASE,
  organizationId: ORG,
  displayName: "Asha Gurung",
  email: "asha@example.test",
  operationalStatus: "new",
  hasLinkedStudent: false,
  archivedAt: null,
};

const params = (overrides: Partial<{ organizationId: string; caseId: string }> = {}) =>
  Promise.resolve({ organizationId: ORG, caseId: CASE, ...overrides });

const PAGES: ReadonlyArray<{
  name: string;
  panel: string | null;
  render: (p?: Parameters<typeof params>[0]) => Promise<React.ReactElement>;
}> = [
  { name: "case home", panel: null, render: (p) => CaseHomePage({ params: params(p) }) },
  { name: "profile", panel: "profile", render: (p) => CaseProfilePage({ params: params(p) }) },
  { name: "matches", panel: "matches", render: (p) => CaseMatchesPage({ params: params(p) }) },
  { name: "plan", panel: "plan", render: (p) => CasePlanPage({ params: params(p) }) },
  { name: "checklist", panel: "checklist", render: (p) => CaseChecklistPage({ params: params(p) }) },
];

function allow() {
  checkCasePermission.mockResolvedValue({
    decision: { allowed: true, requiredScope: "assigned", reason: null },
    context: { grantedRoles: ["counsellor"] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: "counsellor@example.test" } } });
  allow();
  readOrgCase.mockResolvedValue({ ok: true, data: STUDENT_LESS_CASE });
});

describe.each(PAGES)("$name — cell 13", ({ panel, render: renderPage }) => {
  it("renders for an assigned counsellor, on a case with no student account", async () => {
    render(await renderPage());

    // Whose case it is now comes from the persistent frame above these pages
    // (MV-181), so what each page owes is its own content: a panel, or — for the
    // overview — the case's one next action.
    expect(screen.getByTestId(panel ?? "case-next-action")).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  if (panel !== null) {
    it("hands the panel THE CASE IN THE URL, on the AUTHENTICATED client", async () => {
      render(await renderPage());

      // The whole slice in one assertion. A page that resolved the counsellor's
      // own case, or read the student's data through service-role, differs from a
      // correct one only here — every other observable stays identical.
      expect(screen.getByTestId(panel).textContent).toBe(`${panel}:${CASE}:authenticated`);
    });
  }

  it("asks for case.read on the case in the URL, before it reads the case row", async () => {
    render(await renderPage());

    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE, "case.read", expect.anything());
    const checkOrder = checkCasePermission.mock.invocationCallOrder[0]!;
    const readOrder = readOrgCase.mock.invocationCallOrder[0]!;
    expect(checkOrder, "the case row was read before the actor was authorized").toBeLessThan(readOrder);
  });

  it("404s an unassigned counsellor rather than confirming the case exists", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "not-assigned" },
      context: {},
    });

    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
    expect(readOrgCase).not.toHaveBeenCalled();
  });

  it("404s an inactive member, whose membership grants nothing", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "membership-inactive" },
      context: {},
    });

    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });

  it("shows an OUTAGE when the access check could not complete — never a 404", async () => {
    // "You may not see this" is a claim about the viewer. Making it because a
    // query errored sends a legitimate counsellor to ask a colleague for access
    // they already have.
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "lookup-failed" },
      context: {},
    });

    render(await renderPage());

    expect(screen.getByText(/couldn't check your access/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows an OUTAGE when the case row could not be read", async () => {
    readOrgCase.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    render(await renderPage());

    expect(screen.getByText(/couldn't load this student/i)).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s a case that belongs to a different organization than the URL claims", async () => {
    // Authorization is per case, so this is not a leak — but rendering org A's
    // case under org B's URL makes the URL lie about which tenant is on screen.
    readOrgCase.mockResolvedValue({
      ok: true,
      data: { ...STUDENT_LESS_CASE, organizationId: OTHER_ORG },
    });

    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });

  it("404s a case that does not exist", async () => {
    readOrgCase.mockResolvedValue({ ok: true, data: null });

    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });

  it("404s a malformed case id instead of blaming the server", async () => {
    // A malformed uuid raises 22P02 inside the permission lookup, which
    // `getCaseContext` reports as `lookup-failed` — so without this guard the more
    // broken URL got the outage page and a real-looking one got the 404, exactly
    // the wrong way round (`lib/cases/path-ids.ts`).
    await expect(renderPage({ caseId: "not-a-uuid" })).rejects.toThrow("NOT_FOUND");
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in, and back to where they were going", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(renderPage()).rejects.toThrow("REDIRECT");
    const target = String(redirect.mock.calls[0]![0]);
    expect(target.startsWith("/auth?next=")).toBe(true);
    expect(decodeURIComponent(target)).toContain(`/workspace/${ORG}/students/${CASE}`);
  });
});

/**
 * MV-172's two navigation tests moved WITH the thing they test. The case's
 * surface links and its "No student account" marker now live in the persistent
 * frame, and `tests/app/case-frame.test.tsx` asserts both there — including the
 * case-scoping of every href, which is the half that matters (a link to
 * `/profile` would open the COUNSELLOR's own profile).
 */
