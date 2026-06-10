import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Results } from "@/components/results/results";
import { assembleAssessment } from "@/lib/results/assemble";
import type { StudentProfile } from "@/lib/scoring/types";

const baseProfile: StudentProfile = {
  homeCountry: "nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 6.5,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "parents-family",
  goal: "permanent-residency",
};

const payload = assembleAssessment(baseProfile, new Date("2026-06-10"));

describe("Results destination gate", () => {
  it("unsupported destination: shows the honest notice, no Australia assessment", () => {
    render(<Results payload={payload} destination="canada" />);
    expect(screen.getByText("We don't cover Nepal → Canada yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /See where you stand for Australia/ }),
    ).toHaveAttribute("href", "/assess?new=1");
    // No silent fallback: none of the Australia readout renders.
    expect(screen.queryByText(/CURRENT POLICY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/University matches/i)).not.toBeInTheDocument();
  });

  it("not-sure: renders the assessment plus an explicit Australia framing notice", () => {
    render(<Results payload={payload} destination="not-sure" />);
    expect(
      screen.getByText(/Australia is the only corridor we fully cover today/),
    ).toBeInTheDocument();
    expect(screen.getByText(/CURRENT POLICY/i)).toBeInTheDocument();
  });

  it("australia: renders the assessment with no destination notice", () => {
    render(<Results payload={payload} destination="australia" />);
    expect(screen.queryByText(/We don't cover/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Australia is the only corridor/)).not.toBeInTheDocument();
    expect(screen.getByText(/CURRENT POLICY/i)).toBeInTheDocument();
  });
});
