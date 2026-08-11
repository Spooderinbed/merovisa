import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  CaseManageControls,
  type CaseManageMember,
} from "@/components/workspace/case-manage-controls";

/**
 * Cells 9 and 10 from the BROWSER's side — the two request bodies these forms send,
 * and what each failure tells the person.
 *
 * The component had no tests at all. Everything below was therefore dead to the
 * suite: the request shapes (a route test proves the route, not that this form ever
 * calls it correctly), and every recovery message — including the one that reports
 * a student left with no counsellor, which is the most consequential sentence in
 * the workspace and was reachable only through a branch nothing exercised.
 *
 * THE 409 IS THE INTERESTING ONE. Two different conflicts now share it: an inactive
 * member, and a lost reassignment race. A client that derived its sentence from the
 * STATUS would tell an admin who lost a race to go and reactivate somebody who is
 * perfectly active — so the branch is on `reason`, and both halves are asserted
 * here rather than one being assumed to follow from the other.
 */

const CASE = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBERSHIP_A = "bbbbbbbb-0000-4000-8000-00000000000a";
const MEMBERSHIP_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const MEMBERS: CaseManageMember[] = [
  { membershipId: MEMBERSHIP_A, shortReference: "1a2b3c4d", role: "counsellor", isCurrent: true },
  { membershipId: MEMBERSHIP_B, shortReference: "5e6f7a8b", role: "admin", isCurrent: false },
];

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderControls(props: Partial<React.ComponentProps<typeof CaseManageControls>> = {}) {
  return render(
    <CaseManageControls
      caseId={CASE}
      operationalStatus="new"
      canUpdateStatus
      canAssign
      members={MEMBERS}
      {...props}
    />,
  );
}

/** Choose the member who does NOT hold the slot, then submit. */
async function reassign(res: unknown, props = {}) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  renderControls(props);
  await userEvent.selectOptions(screen.getByLabelText(/primary counsellor/i), MEMBERSHIP_B);
  await userEvent.click(screen.getByRole("button", { name: /save counsellor/i }));
  return fetchMock;
}

async function saveStatus(res: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  renderControls();
  await userEvent.selectOptions(screen.getByLabelText("Status"), "in_progress");
  await userEvent.click(screen.getByRole("button", { name: /save status/i }));
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CaseManageControls — the status form (cell 10)", () => {
  it("PATCHes the case with only the operational status", async () => {
    const fetchMock = await saveStatus(response(200, { ok: true }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/cases/${CASE}`);
    expect(init.method).toBe("PATCH");
    // `archived_at` is the other column the write-surface trigger guards, and
    // archiving is Stage 6 — the route's `.strict()` refuses it, and this form must
    // not be the thing that starts sending it.
    expect(JSON.parse(init.body as string)).toEqual({ operationalStatus: "in_progress" });
  });

  it("refreshes the page on a save that landed, so the header agrees with the control", async () => {
    await saveStatus(response(200, { ok: true }));

    expect(refresh).toHaveBeenCalled();
  });

  it("reports a status failure as our problem, not as a refusal", async () => {
    await saveStatus(response(500));

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a genuine refusal as a refusal", async () => {
    await saveStatus(response(403));

    expect(await screen.findByText("That change was not allowed.")).toBeInTheDocument();
  });

  it("reports a network failure rather than leaving the button spinning", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderControls();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "closed");
    await userEvent.click(screen.getByRole("button", { name: /save status/i }));

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save status/i })).not.toBeDisabled();
  });
});

describe("CaseManageControls — the assignment form (cell 9)", () => {
  it("PUTs the MEMBERSHIP id, never an Auth user id", async () => {
    const fetchMock = await reassign(response(200, { ok: true, changed: true }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/cases/${CASE}/assignment`);
    expect(init.method).toBe("PUT");
    // Spec F-9's whole point: the picker identifies members by their membership
    // row, and the server resolves membership → user id scoped to the case's org.
    expect(JSON.parse(init.body as string)).toEqual({ membershipId: MEMBERSHIP_B });
  });

  it("tells the admin the student now has NOBODY, when that is what happened", async () => {
    // The unique index forces delete-then-insert, so the previous counsellor can be
    // gone while the new one was never added. "That didn't work" would leave the
    // admin believing nothing changed.
    await reassign(response(500, { error: "Could not save the assignment", leftUnassigned: true }));

    expect(await screen.findByText(/nobody assigned right now/i)).toBeInTheDocument();
  });

  it("tells them the same thing when the failure arrived as a 403", async () => {
    // `writeFailure()` maps a 42501 on the REPLACEMENT insert to `denied`, and that
    // insert runs after the delete has landed — so a 403 can carry
    // `leftUnassigned: true`. Reading the flag rather than the status is what makes
    // this message reachable at all.
    await reassign(response(403, { error: "Forbidden", reason: "denied", leftUnassigned: true }));

    expect(await screen.findByText(/nobody assigned right now/i)).toBeInTheDocument();
    expect(screen.queryByText("That change was not allowed.")).not.toBeInTheDocument();
  });

  it("still reports a plain 403 as a refusal when nothing was left unassigned", async () => {
    await reassign(response(403, { error: "Forbidden", reason: "denied", leftUnassigned: false }));

    expect(await screen.findByText("That change was not allowed.")).toBeInTheDocument();
    expect(screen.queryByText(/nobody assigned right now/i)).not.toBeInTheDocument();
  });

  it("points a 409 member-inactive at the team page", async () => {
    await reassign(
      response(409, { error: "…switched off", reason: "member-inactive", leftUnassigned: false }),
    );

    expect(await screen.findByText(/switched off/i)).toBeInTheDocument();
    expect(screen.queryByText(/somebody else changed/i)).not.toBeInTheDocument();
  });

  it("points a 409 reassignment-conflict at a refresh, NOT at the team page", async () => {
    // The defect a status-only branch would produce: telling an admin who lost a
    // race to go and reactivate a colleague whose access is fine.
    await reassign(
      response(409, {
        error: "Somebody else changed this student's counsellor",
        reason: "reassignment-conflict",
        leftUnassigned: false,
      }),
    );

    expect(await screen.findByText(/somebody else changed/i)).toBeInTheDocument();
    expect(screen.queryByText(/switched off/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reactivate/i)).not.toBeInTheDocument();
  });

  it("ANNOUNCES the nothing-changed outcome, rather than only drawing it", async () => {
    // Its sibling error path is a `role="alert"`; this one was plain text, so a
    // screen-reader user who submitted got silence and no reason to think the
    // request had finished. It is not an error — a polite live region, not an
    // assertive one.
    await reassign(response(200, { ok: true, changed: false }));

    const note = await screen.findByText(/already has this student/i);
    expect(note).toBeInTheDocument();
    expect(note.getAttribute("role")).toBe("status");
    // And it did not reload the page for a change that did not happen.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes on a real change", async () => {
    await reassign(response(200, { ok: true, changed: true }));

    expect(refresh).toHaveBeenCalled();
  });

  it("survives a failure body that is not JSON at all", async () => {
    // `response.json()` rejects on an HTML error page from a proxy. The
    // leftUnassigned probe must not turn that into an unhandled rejection.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );
    renderControls();
    await userEvent.selectOptions(screen.getByLabelText(/primary counsellor/i), MEMBERSHIP_B);
    await userEvent.click(screen.getByRole("button", { name: /save counsellor/i }));

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
  });

  it("sends nothing while no counsellor is chosen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderControls({ members: [{ ...MEMBERS[1]!, isCurrent: false }] });

    // Nobody holds the slot, so the placeholder is selected and there is nothing to
    // save — the button is the guard, and the handler re-checks behind it.
    expect(screen.getByRole("button", { name: /save counsellor/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("CaseManageControls — which controls exist", () => {
  it("renders only the status control for an actor who may not assign", async () => {
    renderControls({ canAssign: false });

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.queryByLabelText(/primary counsellor/i)).not.toBeInTheDocument();
  });

  it("renders only the assignment control for an actor who may not change the status", async () => {
    renderControls({ canUpdateStatus: false });

    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/primary counsellor/i)).toBeInTheDocument();
  });
});
