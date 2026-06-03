import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "@/components/marketing/how-it-works";

describe("HowItWorks", () => {
  it("renders three numbered steps with titles and bodies", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Tell us about you/i)).toBeInTheDocument();
    expect(screen.getByText(/See where you stand/i)).toBeInTheDocument();
    expect(screen.getByText(/Build your case/i)).toBeInTheDocument();
  });
});
