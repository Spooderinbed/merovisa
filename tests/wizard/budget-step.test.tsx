import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetStep } from "@/components/wizard/steps/budget-step";
import type { StudentProfile } from "@/lib/scoring/types";

const auProfile: Partial<StudentProfile> = {
  destination: "australia",
  budgetCurrency: "NPR",
  budget: 4_500_000,
  fundingSource: "self-funded",
};

const renderStep = (profile: Partial<StudentProfile>) => {
  const setField = vi.fn();
  render(<BudgetStep profile={profile} setField={setField} callouts={null} eyebrow="Step 1" />);
  return { setField };
};

describe("BudgetStep — AUD corridor currency (MV-97)", () => {
  it("offers NPR and AUD — never USD, which is nobody's currency on this corridor", () => {
    renderStep(auProfile);
    const group = screen.getByRole("radiogroup", { name: /Budget currency/i });
    expect(within(group).getByRole("radio", { name: "NPR" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "AUD" })).toBeInTheDocument();
    expect(within(group).queryByRole("radio", { name: "USD" })).toBeNull();
  });

  it("converts an NPR budget to its AUD equivalent from the single FX source", () => {
    renderStep(auProfile);
    // 4,500,000 NPR at NPR 90 ≈ A$1 (FX_RATES: 135 NPR/USD ÷ 1.5 AUD/USD) → A$50k.
    expect(screen.getByText(/≈ A\$50k/)).toBeInTheDocument();
  });

  it("shows the honest indicative rate caption", () => {
    renderStep(auProfile);
    expect(screen.getByText(/NPR 90 ≈ A\$1/)).toBeInTheDocument();
  });

  it("switches to the AUD scale with its own default when AUD is chosen", async () => {
    const { setField } = renderStep(auProfile);
    await userEvent.click(screen.getByRole("radio", { name: "AUD" }));
    expect(setField).toHaveBeenCalledWith({ budgetCurrency: "AUD", budget: 50_000 });
  });

  it("migrates a persisted USD budget from an older session back to NPR", () => {
    const { setField } = renderStep({ ...auProfile, budgetCurrency: "USD", budget: 33_000 });
    expect(setField).toHaveBeenCalledWith({ budgetCurrency: "NPR", budget: 4_500_000 });
  });
});

describe("BudgetStep — dependents control (B2)", () => {
  it("shows the family control for Australia, defaulting to 'Just me'", () => {
    renderStep(auProfile);
    const group = screen.getByRole("radiogroup", { name: /Bringing family/i });
    expect(within(group).getByRole("radio", { name: /Just me/i })).toHaveAttribute("aria-checked", "true");
  });

  it("does not show the family control for non-Australia destinations", () => {
    renderStep({ ...auProfile, destination: "canada" });
    expect(screen.queryByRole("radiogroup", { name: /Bringing family/i })).toBeNull();
  });

  it("shows the family control for 'not sure', which is assessed as Australia", () => {
    // assembleAssessment resolves destination "not-sure" -> "australia" before scoring
    // (lib/results/assemble.ts), so the DHA financial-capacity gate that prices
    // dependents applies. Hiding the control here would collect no family for a
    // verdict that assumes Australia — an under-counted floor the student never sees.
    renderStep({ ...auProfile, destination: "not-sure" });
    expect(screen.getByRole("radiogroup", { name: /Bringing family/i })).toBeInTheDocument();
  });

  it("sets a partner (no children) when 'Partner' is chosen", async () => {
    const { setField } = renderStep(auProfile);
    const group = screen.getByRole("radiogroup", { name: /Bringing family/i });
    await userEvent.click(within(group).getByRole("radio", { name: /^Partner$/i }));
    expect(setField).toHaveBeenCalledWith({ dependents: { partner: true, children: 0 } });
  });

  it("clears dependents when 'Just me' is re-selected", async () => {
    const { setField } = renderStep({ ...auProfile, dependents: { partner: true, children: 2 } });
    const group = screen.getByRole("radiogroup", { name: /Bringing family/i });
    await userEvent.click(within(group).getByRole("radio", { name: /Just me/i }));
    expect(setField).toHaveBeenCalledWith({ dependents: undefined });
  });

  it("reveals a child stepper in 'Partner + children' mode and scales the count", async () => {
    const { setField } = renderStep({ ...auProfile, dependents: { partner: true, children: 1 } });
    await userEvent.click(screen.getByRole("button", { name: /Add a child/i }));
    expect(setField).toHaveBeenCalledWith({ dependents: { partner: true, children: 2 } });
  });
});
