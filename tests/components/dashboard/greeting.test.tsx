import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Greeting } from "@/components/dashboard/greeting";

describe("Greeting", () => {
  it("renders 'Good morning, {first name}' from the profile name", () => {
    render(<Greeting name="Aarav Sharma" partOfDay="morning" />);
    expect(screen.getByText(/Good morning, Aarav/i)).toBeInTheDocument();
  });

  it("falls back to 'there' when no name", () => {
    render(<Greeting name={null} partOfDay="afternoon" />);
    expect(screen.getByText(/Good afternoon, there/i)).toBeInTheDocument();
  });

  it("reveals on mount with a single calm entrance (no per-child stagger)", () => {
    const { container } = render(<Greeting name="Aarav" partOfDay="morning" />);
    const header = container.querySelector("header");
    expect(header?.className).toContain("animate-rise");
  });
});
