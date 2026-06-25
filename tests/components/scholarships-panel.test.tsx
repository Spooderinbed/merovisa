import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScholarshipsPanel } from "@/components/matches/scholarships-panel";

describe("ScholarshipsPanel", () => {
  it("renders the Australia Awards row linked to its DFAT source", () => {
    render(<ScholarshipsPanel />);
    expect(screen.getByText("Australia Awards Scholarship")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /source/i });
    const dfat = links.find((l) => l.getAttribute("href")?.includes("dfat.gov.au"));
    expect(dfat).toBeDefined();
  });

  it("renders at least one au-scholarships row with its own source link", () => {
    render(<ScholarshipsPanel />);
    expect(screen.getByText("Destination Australia Scholarship")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /source/i });
    const funder = links.find((l) =>
      l.getAttribute("href")?.includes("internationaleducation.gov.au"),
    );
    expect(funder).toBeDefined();
  });

  it("gives every row a source anchor", () => {
    render(<ScholarshipsPanel />);
    const links = screen.getAllByRole("link", { name: /source/i });
    // Australia Awards + the three au-scholarships rows.
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
    }
  });

  it("renders the held Australia Awards application window as a key-dates line", () => {
    render(<ScholarshipsPanel />);
    expect(
      screen.getByText(/applications open 1 Feb 2026, close 30 Apr 2026/i),
    ).toBeInTheDocument();
  });

  it("frames the list as may-apply, not personalized eligibility, and points criteria to the provider", () => {
    render(<ScholarshipsPanel />);
    // The honesty guard: never "you qualify"/"you're eligible".
    expect(screen.queryByText(/you qualify/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're eligible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you are eligible/i)).not.toBeInTheDocument();
    // The framing that should be present.
    expect(screen.getByText(/may be able to apply for/i)).toBeInTheDocument();
    expect(screen.getByText(/eligibility and criteria live with the provider/i)).toBeInTheDocument();
  });
});
