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
});
