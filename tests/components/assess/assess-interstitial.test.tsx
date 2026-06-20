import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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

  it("refreshes via an in-place re-score button (not a fresh-wizard link)", () => {
    render(<AssessInterstitial primary={primary} />);
    // MV-17: the primary re-assess control re-scores the existing assessment in
    // place via /api/assess/refresh — it must NOT be a link to the wizard.
    const refresh = screen.getByRole("button", { name: /Refresh assessment/i });
    expect(refresh).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Refresh assessment/i })).toBeNull();
  });

  it("keeps a fresh-scenario link to the wizard and a dashboard link", () => {
    render(<AssessInterstitial primary={primary} />);
    expect(screen.getByRole("link", { name: /Start a new assessment/i })).toHaveAttribute("href", "/assess?new=1");
    expect(screen.getByRole("link", { name: /Open my dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
