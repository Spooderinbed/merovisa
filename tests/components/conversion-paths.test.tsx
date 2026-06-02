import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversionPaths } from "@/components/results/conversion-paths";

describe("ConversionPaths", () => {
  it("renders all three tiers and the 3-day urgency copy", () => {
    render(<ConversionPaths />);
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email me my results/i })).toBeInTheDocument();
  });

  it("acknowledges an email-only capture inline", async () => {
    render(<ConversionPaths />);
    const email = screen.getByLabelText(/Email me my results/i);
    await userEvent.type(email, "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Email me my results/i }));
    expect(screen.getByText(/We'll send your results to student@example.com/i)).toBeInTheDocument();
  });
});
