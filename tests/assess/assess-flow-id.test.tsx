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
});
