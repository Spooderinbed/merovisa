import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Results } from "@/components/results/results";
import { assembleAssessment } from "@/lib/results/assemble";
import type { StudentProfile } from "@/lib/scoring/types";

const aarav: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

describe("Results", () => {
  it("renders the verdict, factor bars, intake, matches, accuracy, and conversion", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} />);
    expect(screen.getByText("Academic fit")).toBeInTheDocument();
    expect(screen.getByText(/Intake timing/i)).toBeInTheDocument();
    expect(screen.getByText(/matched your profile/)).toBeInTheDocument();
    expect(screen.getByText(/Profile accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
  });

  it("surfaces the sourced corridor policy context (grant rate, DHA floor)", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} />);
    expect(screen.getByText(/Current policy/i)).toBeInTheDocument();
    expect(screen.getByText(/grant rate/i)).toBeInTheDocument();
  });

  it("shows the sourced cost-to-apply breakdown", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} />);
    expect(screen.getByText(/What it costs to apply/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AUD 2,000/ })).toBeInTheDocument();
  });

  it("surfaces the refusal risk & recovery trust panel", () => {
    const payload = assembleAssessment(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} />);
    expect(screen.getByText(/Refusal risk & recovery/i)).toBeInTheDocument();
    expect(screen.getByText(/it is not your personal probability/i)).toBeInTheDocument();
  });
});
