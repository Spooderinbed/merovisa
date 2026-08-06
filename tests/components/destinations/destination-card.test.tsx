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

  // MV-162 item 8. jsdom has no layout engine, so equal height is asserted as the
  // class contract that produces it, not as a measured pixel height.
  it("stretches to the row height and pins the figure/date footer to the bottom edge", () => {
    const au = getMarketingDestination("au")!;
    render(<DestinationCard destination={au} />);
    const root = screen.getByRole("link", { name: /Australia/i });
    expect(root.className).toMatch(/\bh-full\b/);
    expect(root.className).toMatch(/\bflex-col\b/);

    const footer = screen.getByText(au.tuition).parentElement!;
    expect(footer).toContainElement(screen.getByText(au.lastVerified));
    expect(footer.className).toMatch(/\bmt-auto\b/);
  });

  it("keeps the header stable — the availability chip stays on one line beside a wrapping country name", () => {
    const uk = getMarketingDestination("uk")!;
    render(<DestinationCard destination={uk} />);
    const chip = screen.getByText(/Not yet available/i);
    // shrink-0 + whitespace-nowrap are what actually stop the chip inflating the header.
    expect(chip.className).toMatch(/\bshrink-0\b/);
    expect(chip.className).toMatch(/\bwhitespace-nowrap\b/);
  });

  it("aligns the ISO pill and the availability chip with each other on a two-line title", () => {
    const uk = getMarketingDestination("uk")!;
    render(<DestinationCard destination={uk} />);
    const header = screen.getByText(/Not yet available/i).parentElement!;
    const nameGroup = screen.getByText("United Kingdom").parentElement!;
    expect(header).toContainElement(nameGroup);
    // The chip is aligned by the header row, the ISO pill by the name group inside it. If
    // those two cross-axis alignments disagree the pill and the chip visibly stop lining up
    // once the name wraps — which is what items-start on the header row alone caused.
    const align = (el: Element) => el.className.split(/\s+/).find((c) => c.startsWith("items-"));
    expect(align(header)).toBe("items-center");
    expect(align(nameGroup)).toBe("items-center");
  });

  it("keeps the verdict pill on one line too", () => {
    const au = getMarketingDestination("au")!;
    render(<DestinationCard destination={au} />);
    const pill = screen.getByText(/Strong match/i);
    expect(pill.className).toMatch(/\bshrink-0\b/);
    expect(pill.className).toMatch(/\bwhitespace-nowrap\b/);
  });
});
