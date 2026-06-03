import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DestinationsPage from "@/app/(marketing)/destinations/page";

describe("/destinations index", () => {
  it("renders the headline, lead, and all six country cards", async () => {
    const ui = await DestinationsPage();
    render(ui);
    expect(screen.getByText(/Six countries, done well/i)).toBeInTheDocument();
    for (const name of ["Australia", "Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
