import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroPreview } from "@/components/marketing/hero-preview";

describe("HeroPreview", () => {
  it("renders the feed header, next-best-step card, visa update, and two suggested prompts", () => {
    render(<HeroPreview />);
    expect(screen.getByText(/Your feed, once you're in/i)).toBeInTheDocument();
    expect(screen.getByText(/preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Your next best step/i)).toBeInTheDocument();
    expect(screen.getByText(/Add your IELTS report/i)).toBeInTheDocument();
    expect(screen.getByText(/Visa update/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/Your guide/i)).toBeInTheDocument();
    expect(screen.getByText(/Is my gap a problem\?/i)).toBeInTheDocument();
    expect(screen.getByText(/How much must I show\?/i)).toBeInTheDocument();
  });
});
