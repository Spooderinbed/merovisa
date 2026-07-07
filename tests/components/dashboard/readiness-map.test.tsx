import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReadinessMap } from "@/components/dashboard/readiness-map";
import type { ReadinessSignals } from "@/lib/readiness/readiness";

type Influence = "positive" | "neutral" | "risk";
const f = (influence: Influence, label: string) => ({ label, influence, detail: `${label} — detail` });
const dim = (factors: Array<{ label: string; influence: Influence; detail: string }>) => ({ value: 0, factors });

function signals(over: Partial<ReadinessSignals> = {}): ReadinessSignals {
  return {
    dimensions: {
      academic: dim([f("positive", "Strong grade")]),
      financial: dim([f("neutral", "Self-funded")]),
      visa: dim([f("risk", "Prior visa refusal")]),
    },
    profilePct: 73,
    documentCount: 2,
    ...over,
  };
}

describe("ReadinessMap", () => {
  it("renders a labelled 'Your readiness' region", () => {
    render(<ReadinessMap signals={signals()} />);
    expect(screen.getByRole("region", { name: "Your readiness" })).toBeInTheDocument();
  });

  it("reveals the region on mount with a single calm entrance", () => {
    render(<ReadinessMap signals={signals()} />);
    expect(screen.getByRole("region", { name: "Your readiness" }).className).toContain(
      "animate-rise",
    );
  });

  it("renders four rows linking to where the student acts", () => {
    render(<ReadinessMap signals={signals()} />);
    expect(screen.getByRole("link", { name: /Academics & English/ })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Money & funding/ })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Visa readiness/ })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: /Documents/ })).toHaveAttribute("href", "/documents");
  });

  it("shows each band as a word, not colour alone", () => {
    render(<ReadinessMap signals={signals()} />);
    expect(screen.getByText("strong")).toBeInTheDocument();
    expect(screen.getByText("needs work")).toBeInTheDocument();
    expect(screen.getByText("at risk")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });

  it("surfaces the risk row's at-risk wording in its accessible name", () => {
    render(<ReadinessMap signals={signals()} />);
    const visa = screen.getByRole("link", { name: /Visa readiness/ });
    expect(visa).toHaveAccessibleName(/at risk/);
    expect(visa).toHaveAccessibleName(/Prior visa refusal/);
  });

  it("never shows a raw percentage inside any row", () => {
    render(<ReadinessMap signals={signals({ profilePct: 73, documentCount: 5 })} />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent ?? "").not.toContain("%");
    }
  });

  it("carries the profile completeness in the header line (not in a row)", () => {
    render(<ReadinessMap signals={signals({ profilePct: 73 })} />);
    const region = screen.getByRole("region", { name: "Your readiness" });
    // header carries the % …
    expect(within(region).getByText(/73%/)).toBeInTheDocument();
    // … but no row link does
    for (const link of within(region).getAllByRole("link")) {
      expect(link.textContent ?? "").not.toContain("73%");
    }
  });

  it("links dimension rows to the wizard when there is no assessment", () => {
    render(<ReadinessMap signals={signals({ dimensions: null })} />);
    expect(screen.getByRole("link", { name: /Academics & English/ })).toHaveAttribute("href", "/assess");
    expect(screen.getByRole("link", { name: /Visa readiness/ })).toHaveAttribute("href", "/assess");
    expect(screen.getAllByText("add detail").length).toBeGreaterThanOrEqual(3);
  });
});
