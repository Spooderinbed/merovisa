import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/wizard/wizard", () => ({
  Wizard: ({ onComplete }: { onComplete: (p: unknown) => void }) => (
    <button onClick={() => onComplete({ homeCountry: "Nepal", destination: "australia" })}>
      finish
    </button>
  ),
}));
vi.mock("@/components/assess/profile-recap", () => ({
  ProfileRecap: ({ onDone }: { onDone: () => void }) => {
    onDone();
    return <div>recap</div>;
  },
}));
vi.mock("@/components/results/results", () => ({
  Results: ({
    assessmentId,
    mode,
    onRetrySave,
    payload,
  }: {
    assessmentId: string | null;
    mode: string;
    onRetrySave?: () => void;
    payload?: { accuracy?: { completeness: number; level: string } };
  }) => (
    <div>
      results:{mode}:{String(assessmentId)}
      {payload?.accuracy ? `:meter:${payload.accuracy.level}:${payload.accuracy.completeness}` : null}
      {onRetrySave ? <button onClick={onRetrySave}>retry-save</button> : null}
    </div>
  ),
}));

import { AssessFlow } from "@/components/assess/assess-flow";

describe("AssessFlow sessionStorage recovery (MV-28 half a)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("restores the results view after a remount instead of dropping back to the wizard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "aid-7", payload: { ok: true } }), { status: 200 }),
    );
    const userEvent = (await import("@testing-library/user-event")).default;

    // First mount: complete the flow and reach results.
    const first = render(<AssessFlow />);
    await userEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-7/)).toBeInTheDocument());
    first.unmount();

    // Second mount (sessionStorage intact): results restored, no wizard, no re-answering.
    render(<AssessFlow />);
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-7/)).toBeInTheDocument());
    expect(screen.queryByText("finish")).not.toBeInTheDocument();
  });

  it("recomputes a legacy accuracy meter when restoring anonymous results", async () => {
    sessionStorage.setItem(
      "myvisa.results.v1",
      JSON.stringify({
        profile: {
          educationLevel: "bachelors",
          grade: 72,
          fieldOfStudy: "computer-science",
          englishStatus: "taken",
          englishScore: 7,
          budget: 4_500_000,
          priorRefusals: "none",
          destination: "australia",
        },
        payload: {
          accuracy: {
            completeness: 28,
            level: "Basic",
            suggestions: [
              { id: "transcript", label: "Upload your transcript", gain: "keep it on file" },
            ],
          },
        },
        assessmentId: "aid-legacy",
      }),
    );

    render(<AssessFlow />);

    await waitFor(() =>
      expect(screen.getByText(/meter:Full picture:100/)).toBeInTheDocument(),
    );
  });

  it("clears stale saved results when started fresh (new=1) and shows the wizard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "aid-stale", payload: { ok: true } }), { status: 200 }),
    );
    const userEvent = (await import("@testing-library/user-event")).default;

    // Reach results once so something is persisted.
    const first = render(<AssessFlow />);
    await userEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-stale/)).toBeInTheDocument());
    first.unmount();

    // Fresh start must not resurrect the stale assessment.
    render(<AssessFlow fresh />);
    expect(screen.getByText("finish")).toBeInTheDocument();
    expect(screen.queryByText(/results:anonymous:aid-stale/)).not.toBeInTheDocument();
  });

  it("recovers a persist miss (id:null) in place — re-saves without re-running the wizard", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: null, payload: { ok: true } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "aid-saved", payload: { ok: true } }), { status: 200 }),
      );
    const userEvent = (await import("@testing-library/user-event")).default;

    render(<AssessFlow />);
    await userEvent.click(screen.getByText("finish"));
    // Persist missed: results still show (id:null), never dropping to the wizard.
    await waitFor(() => expect(screen.getByText(/results:anonymous:null/)).toBeInTheDocument());

    // Retry re-POSTs the same already-computed answers in place and recovers an id.
    await userEvent.click(screen.getByText("retry-save"));
    await waitFor(() => expect(screen.getByText(/results:anonymous:aid-saved/)).toBeInTheDocument());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("finish")).not.toBeInTheDocument();
  });

  it("does NOT persist results for signed-in users", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "aid-owned", payload: { ok: true } }), { status: 200 }),
    );
    const userEvent = (await import("@testing-library/user-event")).default;

    const first = render(<AssessFlow signedIn />);
    await userEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(screen.getByText(/results:owned:aid-owned/)).toBeInTheDocument());
    first.unmount();

    // Signed-in users persist server-side; nothing client-side should be left behind.
    render(<AssessFlow signedIn />);
    expect(screen.getByText("finish")).toBeInTheDocument();
  });
});
