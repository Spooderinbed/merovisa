import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntakeTimingCard } from "@/components/results/intake-timing";
import type { IntakeTiming } from "@/lib/timing/intake";

const intake: IntakeTiming = {
  nearest: {
    name: "February",
    year: 2027,
    month: 2,
    status: "open",
    note: "On track — apply by Oct 14, 2026.",
  },
  alternatives: [
    {
      name: "July",
      year: 2027,
      month: 7,
      status: "closed",
      note: "Application window has closed for this cycle.",
    },
  ],
};

describe("IntakeTimingCard tick-timeline (MV-72 / audit #16)", () => {
  it("keeps the textual nearest intake and its deadline note", () => {
    render(<IntakeTimingCard intake={intake} />);
    expect(screen.getByText(/Nearest realistic intake/i)).toBeInTheDocument();
    expect(screen.getByText("February 2027")).toBeInTheDocument();
    expect(screen.getByText(/On track — apply by Oct 14, 2026/)).toBeInTheDocument();
  });

  it("renders a 'now' anchor and a tick label per intake", () => {
    render(<IntakeTimingCard intake={intake} />);
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Feb 2027")).toBeInTheDocument();
    expect(screen.getByText("Jul 2027")).toBeInTheDocument();
  });

  it("colours each tick by status", () => {
    render(<IntakeTimingCard intake={intake} />);
    const timeline = screen.getByTestId("intake-timeline");
    expect(timeline.querySelector(".bg-strong")).not.toBeNull(); // open nearest
    expect(timeline.querySelector(".bg-reach")).not.toBeNull(); // closed alternative
  });

  it("hides the visual timeline from assistive tech (the text list is the accessible source)", () => {
    render(<IntakeTimingCard intake={intake} />);
    expect(screen.getByTestId("intake-timeline")).toHaveAttribute("aria-hidden", "true");
  });
});
