import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GraduationYearStep } from "@/components/wizard/steps/graduation-year-step";
import type { StudentProfile } from "@/lib/scoring/types";

const CURRENT_YEAR = new Date().getFullYear();

const renderStep = (profile: Partial<StudentProfile>) => {
  const setField = vi.fn();
  render(<GraduationYearStep profile={profile} setField={setField} callouts={null} eyebrow="Step 5" />);
  return { setField };
};

describe("GraduationYearStep — gap preview note", () => {
  it("shows no gap note for a current-year graduation", () => {
    renderStep({ graduationYear: CURRENT_YEAR });
    expect(screen.queryByText(/gap/i)).toBeNull();
  });

  it("previews the gap the wizard will ask about, when the year implies one", () => {
    renderStep({ graduationYear: CURRENT_YEAR - 4 });
    // Mirrors the same threshold that reveals the gap step — no surprise screens.
    expect(screen.getByText(/4-year gap/i)).toBeInTheDocument();
  });

  it("shows no note before any year is chosen", () => {
    renderStep({});
    expect(screen.queryByText(/gap/i)).toBeNull();
  });
});
