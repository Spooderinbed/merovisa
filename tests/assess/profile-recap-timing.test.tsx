import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { ProfileRecap } from "@/components/assess/profile-recap";
import type { StudentProfile } from "@/lib/scoring/types";

const aarav: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 2,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The recap used to hold every user on a fixed 3000ms "Analyzing your profile"
// timer regardless of when the real result was ready — fake latency theatre in
// the highest-traffic funnel moment. Honest waiting: advance on a short reveal
// window (the real API response gates the *actual* transition in AssessFlow), and
// never dress a sub-second summary reveal up as multi-second "analysis".
describe("ProfileRecap — honest waiting (no fake 3s theatre)", () => {
  it("hands off within a short honest reveal window, not a 3s floor", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ProfileRecap profile={aarav} onDone={onDone} />);

    // Ceiling raised from 800ms to 2500ms: founder feedback that the cascade felt
    // "too quick and not smooth" moved the honest reveal window to ~2000ms so the
    // full word stagger can play out — still well short of the old 3000ms floor.
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not label the brief reveal as multi-second analysis", () => {
    const { container } = render(<ProfileRecap profile={aarav} onDone={() => {}} />);
    // Still shows the answer summary (the confirmation beat) …
    expect(container.textContent).toContain("Nepal");
    // … but never claims to be "analyzing".
    expect(container.textContent).not.toMatch(/analyz/i);
  });
});
