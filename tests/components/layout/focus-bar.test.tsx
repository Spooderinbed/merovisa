import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusBar } from "@/components/layout/focus-bar";

describe("FocusBar", () => {
  it("renders the logo and the no-sign-up reassurance note", () => {
    render(<FocusBar />);
    expect(screen.getByRole("link", { name: /MyVisa/i })).toHaveAttribute("href", "/");
    expect(screen.getByText(/no sign-up to start/i)).toBeInTheDocument();
  });
});
