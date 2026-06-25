import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OutcomeFunnel } from "@/components/outcomes/outcome-funnel";
import type { OutcomeFunnelRow } from "@/lib/outcomes/funnel";

const row = (overrides: Partial<OutcomeFunnelRow> = {}): OutcomeFunnelRow => ({
  attemptId: "att-1",
  programName: "Master of IT",
  universityName: "University of Sydney",
  verdict: "strong",
  stage: "applied",
  intake: "2026-02",
  lastUpdated: "2026-01-02T00:00:00Z",
  ...overrides,
});

describe("OutcomeFunnel (honest subtitle — MV-33A)", () => {
  it("does not promise a verification the app cannot perform", () => {
    render(<OutcomeFunnel rows={[row()]} />);
    // The verification ladder is unbuilt; the subtitle must not claim it.
    expect(screen.queryByText(/until verified/i)).not.toBeInTheDocument();
  });

  it("frames the funnel as applications shown against the verdict, with outcomes added as reported", () => {
    render(<OutcomeFunnel rows={[row()]} />);
    expect(screen.getByText(/shown against the verdict we gave you/i)).toBeInTheDocument();
    expect(screen.getByText(/as you report them/i)).toBeInTheDocument();
  });
});
