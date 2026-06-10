import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DestinationStep } from "@/components/wizard/steps/destination-step";
import { isStepComplete } from "@/components/wizard/step-meta";

function renderStep(setField = vi.fn()) {
  render(<DestinationStep profile={{}} setField={setField} callouts={null} />);
  return setField;
}

describe("destination step honesty", () => {
  it("renders unsupported destinations disabled with a coming-soon note", () => {
    renderStep();
    for (const label of ["Canada", "UK", "Germany", "USA", "Ireland"]) {
      const option = screen.getByRole("radio", { name: new RegExp(label) });
      expect(option).toBeDisabled();
    }
    expect(screen.getAllByText("Coming soon")).toHaveLength(5);
  });

  it("keeps Australia and not-sure selectable", () => {
    const setField = renderStep();
    fireEvent.click(screen.getByRole("radio", { name: /Australia/ }));
    expect(setField).toHaveBeenCalledWith({ destination: "australia" });
    fireEvent.click(screen.getByRole("radio", { name: /Not sure yet/ }));
    expect(setField).toHaveBeenCalledWith({ destination: "not-sure" });
  });

  it("does not select an unsupported destination on click", () => {
    const setField = renderStep();
    fireEvent.click(screen.getByRole("radio", { name: /Canada/ }));
    expect(setField).not.toHaveBeenCalled();
  });

  it("step completeness rejects unsupported destinations (stale drafts)", () => {
    expect(isStepComplete("destination", { destination: "canada" })).toBe(false);
    expect(isStepComplete("destination", { destination: "australia" })).toBe(true);
    expect(isStepComplete("destination", { destination: "not-sure" })).toBe(true);
    expect(isStepComplete("destination", {})).toBe(false);
  });
});
