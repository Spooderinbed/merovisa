import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let completedProfile: Record<string, unknown> = { homeCountry: "Nepal", destination: "australia" };

vi.mock("@/components/wizard/wizard", () => ({
  Wizard: ({ onComplete }: { onComplete: (p: unknown) => void }) => (
    <button onClick={() => onComplete(completedProfile)}>finish</button>
  ),
}));
vi.mock("@/components/assess/profile-recap", () => ({
  ProfileRecap: ({ onDone }: { onDone: () => void }) => {
    onDone();
    return <div>recap</div>;
  },
}));
vi.mock("@/components/results/results", () => ({
  Results: () => <div data-testid="results">results</div>,
}));

import { AssessFlow } from "@/components/assess/assess-flow";

async function finishWizard(container: HTMLElement) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "aid-1", payload: { ok: true } }), { status: 200 }),
  );
  const userEvent = (await import("@testing-library/user-event")).default;
  await userEvent.click(screen.getByText("finish"));
  await waitFor(() => expect(screen.getByTestId("results")).toBeInTheDocument());
  return container;
}

describe("AssessFlow corridor activation (MV-96)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    completedProfile = { homeCountry: "Nepal", destination: "australia" };
  });

  it("keeps the wizard phase corridor-free (home country not yet known)", () => {
    const { container } = render(<AssessFlow />);
    expect(container.querySelector("[data-corridor]")).toBeNull();
  });

  it("wraps results in the np-au corridor once the wizard reveals the home country", async () => {
    const { container } = render(<AssessFlow />);
    await finishWizard(container);
    const scope = container.querySelector('[data-corridor="np-au"]');
    expect(scope).not.toBeNull();
    expect(scope!.querySelector('[data-testid="results"]')).not.toBeNull();
  });

  it("renders corridor-free results for a home country with no corridor", async () => {
    completedProfile = { homeCountry: "Elsewhere", destination: "australia" };
    const { container } = render(<AssessFlow />);
    await finishWizard(container);
    expect(screen.getByTestId("results")).toBeInTheDocument();
    expect(container.querySelector("[data-corridor]")).toBeNull();
  });
});
