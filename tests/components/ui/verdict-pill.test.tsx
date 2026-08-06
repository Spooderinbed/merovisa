import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictPill } from "@/components/ui/verdict-pill";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";

describe("VerdictPill", () => {
  it("renders the shared VERDICT_LABELS wording for every verdict — no local label dicts", () => {
    render(<VerdictPill verdict="strong" />);
    render(<VerdictPill verdict="possible" />);
    render(<VerdictPill verdict="reach" />);
    expect(screen.getByText(VERDICT_LABELS.strong.label)).toBeInTheDocument();
    expect(screen.getByText(VERDICT_LABELS.possible.label)).toBeInTheDocument();
    expect(screen.getByText(VERDICT_LABELS.reach.label)).toBeInTheDocument();
  });

  it("renders the md pill string exactly (the census-dominant tier)", () => {
    render(<VerdictPill verdict="strong" />);
    expect(screen.getByText("Strong match").className).toBe(
      "inline-flex items-center rounded-pill px-2.5 py-0.5 text-caption bg-strong-tint text-strong",
    );
  });

  it("uses the contrast-tuned -ink token for the possible verdict (the verdict-card set, not the drifted copies)", () => {
    render(<VerdictPill verdict="possible" />);
    const pill = screen.getByText("Possible");
    expect(pill).toHaveClass("bg-possible-tint");
    expect(pill).toHaveClass("text-possible-ink");
    expect(pill).not.toHaveClass("text-possible");
  });

  it("maps sizes onto the shipped tiers", () => {
    render(<VerdictPill verdict="reach" size="sm" />);
    render(<VerdictPill verdict="strong" size="lg" />);
    const sm = screen.getByText("Reach");
    expect(sm).toHaveClass("px-2");
    expect(sm).toHaveClass("py-0.5");
    expect(sm).toHaveClass("text-caption");
    const lg = screen.getByText("Strong match");
    expect(lg).toHaveClass("px-3");
    expect(lg).toHaveClass("py-1");
    expect(lg).toHaveClass("text-small");
  });

  it("lets className retune the type size per call site (tailwind-merge: later font-size wins)", () => {
    render(<VerdictPill verdict="reach" size="lg" className="text-[13px]" />);
    const pill = screen.getByText("Reach");
    expect(pill).toHaveClass("text-[13px]");
    expect(pill).not.toHaveClass("text-small"); // lg's default size is dropped
  });
});
