import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EducationStep } from "@/components/wizard/steps/education-step";
import type { StudentProfile } from "@/lib/scoring/types";

const base: Partial<StudentProfile> = {
  homeCountry: "Nepal",
  educationLevel: "higher-secondary",
  gradeSystem: "percentage-nepal",
  grade: 70,
};

const renderStep = (profile: Partial<StudentProfile>) => {
  const setField = vi.fn();
  render(<EducationStep profile={profile} setField={setField} callouts={null} eyebrow="Step 3" />);
  return { setField };
};

describe("EducationStep — grade system (CGPA)", () => {
  it("offers Nepal's grade systems as a toggle: percentage and GPA / 4.0", () => {
    renderStep(base);
    const group = screen.getByRole("radiogroup", { name: /Grade system/i });
    expect(within(group).getByRole("radio", { name: /Percentage/i })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /GPA/i })).toBeInTheDocument();
  });

  it("converts the current percentage into the 4.0 scale when switching to GPA", async () => {
    const { setField } = renderStep(base);
    await userEvent.click(screen.getByRole("radio", { name: /GPA/i }));
    // 70% → (70/100)*4 = 2.8 — the same linear map the scoring engine uses.
    expect(setField).toHaveBeenCalledWith({ gradeSystem: "cgpa-4", grade: 2.8 });
  });

  it("converts a GPA back to a percentage when switching to percentage", async () => {
    const { setField } = renderStep({ ...base, gradeSystem: "cgpa-4", grade: 3.4 });
    await userEvent.click(screen.getByRole("radio", { name: /Percentage/i }));
    // 3.4/4 → 85%.
    expect(setField).toHaveBeenCalledWith({ gradeSystem: "percentage-nepal", grade: 85 });
  });

  it("renders the GPA readout on its own scale with the honest percentage equivalent", () => {
    renderStep({ ...base, gradeSystem: "cgpa-4", grade: 3.4 });
    expect(screen.getByText("3.4 / 4.0")).toBeInTheDocument();
    // Transparency: the caption shows exactly what the scoring engine will compare.
    expect(screen.getByText(/≈ 85% equivalent/i)).toBeInTheDocument();
  });

  it("keeps the plain percentage readout when the system is percentage", () => {
    renderStep(base);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.queryByText(/equivalent/i)).toBeNull();
  });

  it("bounds the slider by the active grade system's scale", () => {
    renderStep({ ...base, gradeSystem: "cgpa-4", grade: 3.4 });
    const slider = screen.getByRole("slider", { name: /Grade/i });
    expect(slider).toHaveAttribute("min", "2");
    expect(slider).toHaveAttribute("max", "4");
  });
});
