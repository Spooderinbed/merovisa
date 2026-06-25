import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
  nextEvents: [],
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

describe("OutcomeFunnel — self-report control (MV-39)", () => {
  it("offers the legal next milestones as report buttons on a row", () => {
    render(<OutcomeFunnel rows={[row({ nextEvents: ["offer_received", "application_rejected"] })]} />);
    expect(screen.getByRole("button", { name: "I got an offer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I wasn't successful" })).toBeInTheDocument();
  });

  it("shows no report control once the row reaches a terminal stage", () => {
    render(<OutcomeFunnel rows={[row({ stage: "enrolled", nextEvents: [] })]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/report an update/i)).not.toBeInTheDocument();
  });
});
