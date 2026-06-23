import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/wizard/wizard", () => ({
  Wizard: ({ onComplete }: { onComplete: (p: unknown) => void }) => (
    <button onClick={() => onComplete({ homeCountry: "Nepal" })}>finish</button>
  ),
}));
vi.mock("@/components/assess/profile-recap", () => ({
  ProfileRecap: ({ onDone }: { onDone: () => void }) => {
    onDone();
    return <div>recap</div>;
  },
}));
vi.mock("@/components/results/results", () => ({
  Results: ({ assessmentId, mode }: { assessmentId: string | null; mode: string }) => (
    <div>
      results:{mode}:{assessmentId}
    </div>
  ),
}));

import { AssessFlow } from "@/components/assess/assess-flow";

describe("AssessFlow id wiring", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("passes the persisted id from /api/assess into Results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "aid-9", payload: { ok: true } }), { status: 200 }),
    );
    const userEvent = (await import("@testing-library/user-event")).default;
    render(<AssessFlow />);
    await userEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-9/)).toBeInTheDocument());
  });

  it("offers a working 'Try again' that re-attempts the save and never tells the user to refresh", async () => {
    // First save fails (network/server error), the retry succeeds.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "aid-retry", payload: { ok: true } }), { status: 200 }),
      );
    const userEvent = (await import("@testing-library/user-event")).default;
    render(<AssessFlow />);

    // Finish the wizard once — answers now live only in memory.
    await userEvent.click(screen.getByText("finish"));

    // The error surface appears and offers a real action, not a dead end.
    const tryAgain = await screen.findByRole("button", { name: /try again/i });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // It must NOT instruct a destructive page refresh (which would wipe the wizard state).
    expect(document.body.textContent ?? "").not.toMatch(/refresh/i);

    // Retrying re-invokes the save in place (no re-answering the wizard) and reaches results.
    await userEvent.click(tryAgain);
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-retry/)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
