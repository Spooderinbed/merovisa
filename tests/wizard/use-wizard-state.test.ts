import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWizardState, visibleStepsFor, WIZARD_STEPS } from "@/components/wizard/use-wizard-state";

const currentYear = new Date().getFullYear();

describe("visibleStepsFor", () => {
  it("omits the gap step when there is no meaningful gap", () => {
    expect(visibleStepsFor({ graduationYear: currentYear })).not.toContain("gap");
  });

  it("includes the gap step when the gap exceeds the threshold", () => {
    expect(visibleStepsFor({ graduationYear: currentYear - 4 })).toContain("gap");
  });
});

describe("useWizardState", () => {
  it("starts on homeCountry with 8 steps and Nepal preselected", () => {
    const { result } = renderHook(() => useWizardState());
    expect(result.current.stepKey).toBe("homeCountry");
    expect(result.current.totalSteps).toBe(8);
    expect(result.current.profile.homeCountry).toBe("Nepal");
    expect(result.current.isFirst).toBe(true);
  });

  it("advances and goes back", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => void result.current.next());
    expect(result.current.stepKey).toBe("destination");
    act(() => result.current.back());
    expect(result.current.stepKey).toBe("homeCountry");
  });

  it("asks the destination (corridor) question right after home country, before the effort steps", () => {
    // MV-47: coverage must be known before the six effort screens, so a
    // Canada-bound student learns the corridor is unsupported up front rather
    // than after answering education/grades/English (the bait-and-switch).
    expect(WIZARD_STEPS[0]).toBe("homeCountry");
    expect(WIZARD_STEPS[1]).toBe("destination");
    expect(WIZARD_STEPS.indexOf("destination")).toBeLessThan(WIZARD_STEPS.indexOf("education"));
  });

  it("reveals the gap step after a gap-inducing graduation year", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.setField({ graduationYear: currentYear - 4 }));
    expect(result.current.totalSteps).toBe(9);
    expect(visibleStepsFor(result.current.profile)).toContain("gap");
  });

  it("exposes a single live step label derived from the current position", () => {
    const { result } = renderHook(() => useWizardState());
    // No gap: 8 steps. The label is the one source of truth for the counter.
    expect(result.current.stepLabel).toBe("Step 1 of 8");
    act(() => void result.current.next());
    expect(result.current.stepLabel).toBe("Step 2 of 8");
  });

  it("keeps the step label consistent with the live total when the gap step appears", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.setField({ graduationYear: currentYear - 4 }));
    // Gap step now visible -> total is 9, and the label tracks it, never a stale count.
    expect(result.current.totalSteps).toBe(9);
    expect(result.current.stepLabel).toBe("Step 1 of 9");
  });

  it("reports done on the final step", () => {
    const { result } = renderHook(() => useWizardState());
    for (let i = 0; i < 7; i++) act(() => void result.current.next());
    expect(result.current.isLast).toBe(true);
    let done = false;
    act(() => {
      done = result.current.next().done;
    });
    expect(done).toBe(true);
  });
});
