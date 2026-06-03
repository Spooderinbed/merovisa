import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssessInterstitial } from "@/components/assess/assess-interstitial";

const primary = {
  id: "as1",
  destination_id: "australia",
  created_at: "2026-05-15T00:00:00Z",
};

describe("AssessInterstitial", () => {
  it("renders an explanatory headline + the destination + created date", () => {
    render(<AssessInterstitial primary={primary} />);
    expect(screen.getByText(/active assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/Australia/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-15/i)).toBeInTheDocument();
  });

  it("renders a Refresh button and a New destination link", () => {
    render(<AssessInterstitial primary={primary} />);
    expect(screen.getByRole("link", { name: /Refresh assessment/i })).toHaveAttribute("href", "/assess?new=1");
    expect(screen.getByRole("link", { name: /Open my dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
