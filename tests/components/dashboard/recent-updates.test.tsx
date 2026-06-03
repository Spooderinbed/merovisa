import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentUpdates } from "@/components/dashboard/recent-updates";

describe("RecentUpdates", () => {
  it("renders an empty state when no updates", () => {
    render(<RecentUpdates updates={[]} />);
    expect(screen.getByText(/No updates yet/i)).toBeInTheDocument();
  });

  it("renders update rows when given updates", () => {
    render(
      <RecentUpdates updates={[
        { id: "1", title: "Visa rule update", body: "Australia GS rules tightened.", iso: "2026-06-01" },
      ]} />
    );
    expect(screen.getByText(/Visa rule update/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-01/i)).toBeInTheDocument();
  });
});
