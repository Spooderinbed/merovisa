import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationDetail } from "@/components/destinations/destination-detail";
import { getMarketingDestination } from "@/lib/marketing/destinations";

describe("DestinationDetail", () => {
  const au = getMarketingDestination("au")!;

  it("renders name, tagline, source line, visa risk card, all six facts and the docs list", () => {
    render(<DestinationDetail destination={au} />);
    expect(screen.getByText("Australia")).toBeInTheDocument();
    expect(screen.getByText(au.tagline)).toBeInTheDocument();
    expect(screen.getByText(/Genuine Student \(GS\) requirement replaced GTE/i)).toBeInTheDocument();
    for (const label of ["Tuition", "Living cost", "Financial proof", "Work rights", "Post-study", "Last checked"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const doc of au.docs) {
      expect(screen.getByText(doc)).toBeInTheDocument();
    }
  });

  it("links the CTA to /assess", () => {
    render(<DestinationDetail destination={au} />);
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
