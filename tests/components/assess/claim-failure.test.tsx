import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ClaimFailure } from "@/components/assess/claim-failure";
import { RESULTS_STORAGE_KEY } from "@/lib/results/persisted-results";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

const seedResults = (assessmentId: string | null) =>
  sessionStorage.setItem(
    RESULTS_STORAGE_KEY,
    JSON.stringify({ profile: { destination: "australia" }, payload: { verdict: "possible" }, assessmentId }),
  );

describe("ClaimFailure recovery surface (MV-130 / audit C-9)", () => {
  beforeEach(() => {
    push.mockReset();
    fetchMock.mockReset();
    sessionStorage.clear();
  });

  it("never shows a blank/silent state — every reason states what happened", () => {
    for (const reason of ["auth", "invalid-claim", "expired", "claimed", "claim-failed"] as const) {
      const { unmount } = render(<ClaimFailure reason={reason} signedIn={false} />);
      // A real heading, not an empty node.
      expect(screen.getByRole("heading").textContent?.trim().length ?? 0).toBeGreaterThan(0);
      // Always at least one way forward.
      expect(screen.getByRole("link", { name: /start a new assessment/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("is honest that a purged/expired assessment was deleted", () => {
    render(<ClaimFailure reason="expired" signedIn={true} />);
    expect(screen.getByText(/expired and was deleted/i)).toBeInTheDocument();
  });

  it("drops the stale stored results for an expired assessment so no zombie verdict restores", () => {
    seedResults(ASSESSMENT_UUID);
    render(<ClaimFailure reason="expired" signedIn={true} />);
    expect(sessionStorage.getItem(RESULTS_STORAGE_KEY)).toBeNull();
  });

  it("sends an anonymous student back to their preserved results to re-run sign-in", () => {
    seedResults(ASSESSMENT_UUID);
    render(<ClaimFailure reason="auth" signedIn={false} />);
    expect(screen.getByRole("link", { name: /back to your results/i })).toHaveAttribute("href", "/assess");
  });

  it("offers a signed-in student the in-place re-claim when their work is still saved", async () => {
    seedResults(ASSESSMENT_UUID);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, redirectTo: `/assessment/${ASSESSMENT_UUID}` }) });
    render(<ClaimFailure reason="claim-failed" signedIn={true} />);

    const btn = await screen.findByRole("button", { name: /link my assessment/i });
    await userEvent.click(btn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assess/claim",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ assessmentId: ASSESSMENT_UUID });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/assessment/${ASSESSMENT_UUID}`));
  });

  it("does not offer a re-claim when no assessment is preserved on this device", () => {
    // Nothing seeded — signed in, but there is no id to recover.
    render(<ClaimFailure reason="claim-failed" signedIn={true} />);
    expect(screen.queryByRole("button", { name: /link my assessment|try again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start a new assessment/i })).toBeInTheDocument();
  });

  it("switches to the honest terminal state when a retry reveals the row is claimed elsewhere", async () => {
    seedResults(ASSESSMENT_UUID);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ ok: false, reason: "claimed" }) });
    render(<ClaimFailure reason="claim-failed" signedIn={true} />);

    await userEvent.click(await screen.findByRole("button", { name: /link my assessment/i }));

    expect(await screen.findByText(/linked to another account/i)).toBeInTheDocument();
    // No retry loop once it's terminal.
    expect(screen.queryByRole("button", { name: /link my assessment|try again/i })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the retry available and warns when a re-claim fails transiently", async () => {
    seedResults(ASSESSMENT_UUID);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ ok: false, reason: "error" }) });
    render(<ClaimFailure reason="claim-failed" signedIn={true} />);

    await userEvent.click(await screen.findByRole("button", { name: /link my assessment/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("gives a signed-in student a dashboard exit; an anonymous one gets none", () => {
    const { unmount } = render(<ClaimFailure reason="claimed" signedIn={true} />);
    expect(screen.getByRole("link", { name: /open my dashboard/i })).toBeInTheDocument();
    unmount();
    render(<ClaimFailure reason="auth" signedIn={false} />);
    expect(screen.queryByRole("link", { name: /open my dashboard/i })).not.toBeInTheDocument();
  });
});
