import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "@/components/dashboard/stats-row";

describe("StatsRow", () => {
  it("renders four stat tiles with values", () => {
    render(<StatsRow universities={6} documents={0} profilePct={42} scholarships={null} />);
    expect(screen.getByText("Universities")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    // profilePct=42 → bandLabel → "Building"
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
