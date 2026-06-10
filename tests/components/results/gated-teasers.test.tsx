import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GatedTeasers } from "@/components/results/gated-teasers";

describe("GatedTeasers", () => {
  it("locked: teases only things that exist — no scholarship promise", () => {
    render(<GatedTeasers onUnlock={vi.fn()} />);
    expect(screen.getByText(/23-step Australia procedure guide/i)).toBeInTheDocument();
    expect(screen.getByText(/14 documents in your checklist/i)).toBeInTheDocument();
    // scholarship matching is not built — never blur-tease it at the conversion moment
    expect(screen.queryByText(/scholarship/i)).toBeNull();
  });

  it("unlocked: still no scholarship promise", () => {
    render(<GatedTeasers unlocked onUnlock={vi.fn()} />);
    expect(screen.queryByText(/scholarship/i)).toBeNull();
  });
});
