import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GatedTeasers } from "@/components/results/gated-teasers";

describe("GatedTeasers", () => {
  it("locked: teases only real, built deliverables — checklist and plan", () => {
    render(<GatedTeasers onUnlock={vi.fn()} />);
    // Real deliverables, teased qualitatively (no invented counts).
    expect(screen.getByText(/personalised document checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/action plan/i)).toBeInTheDocument();
  });

  it("locked: never shows fabricated counts or an unwired email promise", () => {
    render(<GatedTeasers onUnlock={vi.fn()} />);
    // The fabricated "23-step guide" and "14 documents" must be gone.
    expect(screen.queryByText(/23-step/i)).toBeNull();
    expect(screen.queryByText(/14 documents/i)).toBeNull();
    // No email-you promise — there is no email path anywhere in the product.
    expect(screen.queryByText(/email you/i)).toBeNull();
    // scholarship matching is not built — never blur-tease it at the conversion moment
    expect(screen.queryByText(/scholarship/i)).toBeNull();
  });

  it("unlocked: shows the real deliverables and no fabrications", () => {
    render(<GatedTeasers unlocked onUnlock={vi.fn()} />);
    expect(screen.getByText(/personalised document checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/action plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/23-step/i)).toBeNull();
    expect(screen.queryByText(/14 documents/i)).toBeNull();
    expect(screen.queryByText(/email you/i)).toBeNull();
    expect(screen.queryByText(/scholarship/i)).toBeNull();
  });
});
