import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "@/components/dashboard/stats-row";

describe("StatsRow", () => {
  it("renders four stat tiles with values", () => {
    render(<StatsRow universities={6} documents={0} profilePct={42} />);
    expect(screen.getByText("Universities")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    // profilePct=42 → bandLabel → "Building"
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Scholarships")).toBeInTheDocument();
  });

  it("links each live tile to the page it counts", () => {
    render(<StatsRow universities={6} documents={2} profilePct={42} />);
    expect(screen.getByText("Universities").closest("a")).toHaveAttribute("href", "/matches");
    // counts uploaded documents → must land on the documents vault, not the checklist
    expect(screen.getByText("Documents").closest("a")).toHaveAttribute("href", "/documents");
    expect(screen.getByText("Profile").closest("a")).toHaveAttribute("href", "/profile");
  });

  it("renders scholarships as an honest non-link coming-soon tile", () => {
    render(<StatsRow universities={6} documents={2} profilePct={42} />);
    expect(screen.getByText("Scholarships").closest("a")).toBeNull();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
