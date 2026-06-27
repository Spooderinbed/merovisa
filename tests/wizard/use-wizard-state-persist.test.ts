import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWizardState } from "@/components/wizard/use-wizard-state";

const currentYear = new Date().getFullYear();

describe("useWizardState sessionStorage persistence (MV-28 half a)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does NOT touch sessionStorage when persist is off (signed-in default)", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.setField({ graduationYear: currentYear }));
    act(() => void result.current.next());
    expect(sessionStorage.length).toBe(0);
  });

  it("restores answers and step position after a remount when persist is on", () => {
    // First mount: answer a couple of steps and advance.
    const first = renderHook(() => useWizardState(undefined, { persist: true }));
    act(() => first.result.current.setField({ graduationYear: currentYear }));
    act(() => void first.result.current.next()); // homeCountry -> destination
    act(() => void first.result.current.next()); // destination -> education
    expect(first.result.current.stepKey).toBe("education");
    first.unmount();

    // Second mount (sessionStorage intact): no re-answering, position restored.
    const second = renderHook(() => useWizardState(undefined, { persist: true }));
    expect(second.result.current.stepKey).toBe("education");
    expect(second.result.current.profile.graduationYear).toBe(currentYear);
    expect(second.result.current.stepIndex).toBe(2);
  });

  it("starts fresh after sessionStorage is cleared", () => {
    const first = renderHook(() => useWizardState(undefined, { persist: true }));
    act(() => void first.result.current.next());
    first.unmount();

    sessionStorage.clear();

    const second = renderHook(() => useWizardState(undefined, { persist: true }));
    expect(second.result.current.stepKey).toBe("homeCountry");
    expect(second.result.current.stepIndex).toBe(0);
  });
});
