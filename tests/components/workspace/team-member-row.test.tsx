import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { TeamMemberRow } from "@/components/workspace/team-member-row";

/**
 * What cell 5's row TELLS an admin when a change does not land.
 *
 * This row had NO status branches: every failure — an expired session, a
 * membership that moved, and both of the route's 500s — rendered as "That change
 * was not allowed.", which is a statement about the admin's standing. Only one of
 * those four is.
 *
 * The controls themselves are presentation and are asserted nowhere here on
 * purpose: the route re-decides every request against the database and the
 * database re-decides again under RLS (`lib/cases/README.md` §3). What the person
 * is told afterwards is the part that only lives in this component.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";

function response(status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}) };
}

async function deactivateWith(status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status)));
  render(
    <TeamMemberRow
      organizationId={ORG}
      membershipId={MEMBERSHIP}
      userId="target-user-id"
      role="counsellor"
      status="active"
      isSelf={false}
      viewerIsOwner
      roleOptions={["counsellor", "admin", "owner"]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TeamMemberRow — what a failed change says", () => {
  it("reports an expired session as a session, not as a refusal", async () => {
    await deactivateWith(401);
    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("still reports a genuine 403 as a refusal", async () => {
    await deactivateWith(403);
    expect(await screen.findByText("That change was not allowed.")).toBeInTheDocument();
  });

  it("reports a membership that is no longer here as exactly that", async () => {
    // The route 404s a membership id that is not in this organization. From this
    // row that means the team changed underneath it, not that the admin may not
    // act.
    await deactivateWith(404);
    expect(await screen.findByText(/no longer in this organization/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("reports a failed write as our problem, not as a refusal", async () => {
    // Two 500s reach here — a membership lookup that failed, and a write that
    // failed for any reason other than 42501.
    await deactivateWith(500);
    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByText(/was not allowed/i)).not.toBeInTheDocument();
  });

  it("refreshes and says nothing when the change landed", async () => {
    await deactivateWith(200);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText(/not allowed|went wrong|session has ended/i)).not.toBeInTheDocument();
  });
});
