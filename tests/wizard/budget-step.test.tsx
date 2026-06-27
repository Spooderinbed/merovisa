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
