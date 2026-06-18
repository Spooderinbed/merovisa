import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Results } from "@/components/results/results";
import { assembleAssessment } from "@/lib/results/assemble";
import { TEST_PROGRAMS, TEST_UNIVERSITIES } from "../fixtures/catalog";
import type { StudentProfile } from "@/lib/scoring/types";

const assemble = (profile: StudentProfile, now: Date) =>
  assembleAssessment(profile, TEST_PROGRAMS, TEST_UNIVERSITIES, now);

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
  it("renders the core path (verdict, factor bars, intake, matches, cost, accuracy, conversion) top-level", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" />);
    expect(screen.getByText("Academic fit")).toBeInTheDocument();
    expect(screen.getByText(/Intake timing/i)).toBeInTheDocument();
    expect(screen.getByText(/matched your profile/)).toBeInTheDocument();
    expect(screen.getByText(/What it costs to apply/i)).toBeInTheDocument();
    expect(screen.getByText(/Profile accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
  });

  it("shows the sourced cost-to-apply breakdown top-level (part of the core 'what's next' path)", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" />);
    expect(screen.getByText(/What it costs to apply/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AUD 2,000/ })).toBeInTheDocument();
  });

  it("folds the government-reference panels into a collapsed 'Know before you go' disclosure", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" />);

    // The disclosure trigger is present...
    expect(screen.getByRole("button", { name: /Know before you go/i })).toBeInTheDocument();

    // ...but the heavy reference panels are hidden until it is opened.
    expect(screen.queryByText(/Current policy/i)).toBeNull();
    expect(screen.queryByText(/Refusal risk & recovery/i)).toBeNull();
    expect(screen.queryByText("The Genuine Student test (Australia)")).toBeNull();
    expect(screen.queryByText("Working with an agent (Australia)")).toBeNull();
  });

  it("reveals the corridor policy + trust-defense panels once the disclosure is expanded", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" />);

    fireEvent.click(screen.getByRole("button", { name: /Know before you go/i }));

    // Policy context
    expect(screen.getByText(/Current policy/i)).toBeInTheDocument();
    expect(screen.getByText(/grant rate/i)).toBeInTheDocument();
    // Refusal risk & recovery trust panel
    expect(screen.getByText(/Refusal risk & recovery/i)).toBeInTheDocument();
    expect(screen.getByText(/it is not your personal probability/i)).toBeInTheDocument();
    // Genuine Student + agents triptych members
    expect(screen.getByText("The Genuine Student test (Australia)")).toBeInTheDocument();
    expect(screen.getByText("Working with an agent (Australia)")).toBeInTheDocument();
  });

  it("promotes a compact OAuth CTA near the verdict in anonymous mode", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" assessmentId="11815637-f603-4821-8dd0-d9e52560c4f6" />);
    // Both the compact prompt and the bottom card offer Google sign-in for anonymous users.
    expect(screen.getAllByRole("button", { name: /Continue with Google/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("hides the conversion CTAs for signed-in (owned) results", () => {
    const payload = assemble(aarav, new Date("2026-06-03"));
    render(<Results payload={payload} destination="australia" mode="owned" />);
    expect(screen.queryByRole("button", { name: /Continue with Google/i })).toBeNull();
    expect(screen.queryByText(/expires in 3 days/i)).toBeNull();
  });
});
