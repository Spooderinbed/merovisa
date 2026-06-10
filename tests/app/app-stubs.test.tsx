import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GuidePage from "@/app/(app)/guide/page";

describe("(app) stub pages", () => {
  it("guide renders a plain coming-soon headline + body + back link", () => {
    render(<GuidePage />);
    expect(screen.getByRole("heading", { name: /Your AI guide is coming soon\./i })).toBeInTheDocument();
    // internal phase jargon never reaches user-facing copy
    expect(screen.queryByText(/phase \d/i)).toBeNull();
    expect(screen.getByText(/reads your profile and explains its reasoning/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  // /checklist is no longer a stub — it's a real landing page (covered by
  // tests/checklist/checklist-landing.test.tsx). Only /guide remains a stub.
});
