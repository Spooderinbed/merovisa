import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock the heavy children so the shell is observable by exact text.
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
  Results: ({ assessmentId, mode }: { assessmentId: string | null; mode: string }) => (
    <div>
      results:{mode}:{String(assessmentId)}
    </div>
  ),
}));

import { AssessFlow } from "@/components/assess/assess-flow";

const SEED = JSON.stringify({
  profile: { homeCountry: "Nepal", destination: "australia" },
  payload: { ok: true },
  assessmentId: "aid-x",
});

describe("AssessFlow SSR-stable shell (MV-118 #3 — no sessionStorage read in render)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("renders the wizard shell in a single render pass even when results are persisted (no hydration mismatch)", () => {
    sessionStorage.setItem("myvisa.results.v1", SEED);
    // renderToStaticMarkup runs the render body with NO effects — it models the
    // Node SSR / first client render. The output must NOT depend on sessionStorage.
    const html = renderToStaticMarkup(<AssessFlow />);
    expect(html).toContain("finish"); // stable wizard shell, identical server + first client render
    expect(html).not.toContain("results:"); // must NOT restore during render
  });

  it("still restores the persisted results after mount (MV-28 half a preserved)", async () => {
    sessionStorage.setItem("myvisa.results.v1", SEED);
    render(<AssessFlow />);
    await waitFor(() =>
      expect(screen.getByText(/results:anonymous:aid-x/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("finish")).not.toBeInTheDocument();
  });
});
