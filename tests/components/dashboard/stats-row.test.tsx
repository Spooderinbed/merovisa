import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "@/components/dashboard/stats-row";

describe("StatsRow", () => {
  it("renders four stat tiles with values", () => {
    render(<StatsRow universities={6} checklistDone={0} profilePct={42} scholarships={null} />);
    expect(screen.getByText("Universities")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Checklist")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
