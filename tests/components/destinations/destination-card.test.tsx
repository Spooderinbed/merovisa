import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationCard } from "@/components/destinations/destination-card";
import { getMarketingDestination } from "@/lib/marketing/destinations";

describe("DestinationCard", () => {
  it("renders flag, name, tagline, match verdict, tuition + lastVerified, and links to /destinations/[id]", () => {
    const au = getMarketingDestination("au")!;
    render(<DestinationCard destination={au} />);
    expect(screen.getByText("Australia")).toBeInTheDocument();
    expect(screen.getByText(au.tagline)).toBeInTheDocument();
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/A\$33k–48k \/ yr/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-28/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Australia/i })).toHaveAttribute("href", "/destinations/au");
  });

  it("shows 'Not yet available' instead of a verdict for an unsupported corridor", () => {
    const ca = getMarketingDestination("ca")!;
    render(<DestinationCard destination={ca} />);
    expect(screen.getByText(/Not yet available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Possible/i)).not.toBeInTheDocument();
  });
});
