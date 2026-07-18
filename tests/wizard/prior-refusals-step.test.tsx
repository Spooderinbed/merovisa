import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WIZARD_STEPS } from "@/components/wizard/use-wizard-state";
import { isStepComplete } from "@/components/wizard/step-meta";
import { RefusalsStep } from "@/components/wizard/steps/refusals-step";

describe("prior-refusals step wiring (F-1)", () => {
  it("is the final wizard step — asked just before results", () => {
    expect(WIZARD_STEPS).toContain("refusals");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1]).toBe("refusals");
  });

  it("requires an explicit answer — no silent default", () => {
    expect(isStepComplete("refusals", {})).toBe(false);
    expect(isStepComplete("refusals", { priorRefusals: "none" })).toBe(true);
    expect(isStepComplete("refusals", { priorRefusals: "one" })).toBe(true);
  });
});

describe("RefusalsStep component (F-1)", () => {
  const options = [
    { label: /No prior refusals/i, value: "none" },
    { label: /Yes, once/i, value: "one" },
    { label: /Yes, more than once/i, value: "multiple" },
  ] as const;

  it("offers exactly the three refusal options as radios", () => {
    render(<RefusalsStep profile={{}} setField={() => {}} callouts={null} eyebrow="Step 10" />);
    for (const o of options) {
      expect(screen.getByRole("radio", { name: o.label })).toBeInTheDocument();
    }
  });

  it("does not preselect an answer (no silent 'none' on the student's behalf)", () => {
    const setField = vi.fn();
    render(<RefusalsStep profile={{}} setField={setField} callouts={null} eyebrow="Step 10" />);
    expect(setField).not.toHaveBeenCalled();
  });

  it.each(options)("selecting an option sets priorRefusals to $value", async ({ label, value }) => {
    const setField = vi.fn();
    render(<RefusalsStep profile={{}} setField={setField} callouts={null} eyebrow="Step 10" />);
    await userEvent.click(screen.getByRole("radio", { name: label }));
    expect(setField).toHaveBeenCalledWith({ priorRefusals: value });
  });

  it("carries no-shame framing, not fear language", () => {
    render(<RefusalsStep profile={{}} setField={() => {}} callouts={null} eyebrow="Step 10" />);
    expect(screen.getByText(/refusals are common/i)).toBeInTheDocument();
    expect(screen.queryByText(/reject|denied|hopeless|disqualif/i)).not.toBeInTheDocument();
  });
});
