import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GuidePage from "@/app/(app)/guide/page";

describe("(app) stub pages", () => {
  it("guide renders headline + body + back link", () => {
    render(<GuidePage />);
    expect(screen.getByText(/Guide landing in Phase 6/i)).toBeInTheDocument();
    expect(screen.getByText(/AI guide/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  // /checklist is no longer a stub — it's a real landing page (covered by
  // tests/checklist/checklist-landing.test.tsx). Only /guide remains a stub.
});
