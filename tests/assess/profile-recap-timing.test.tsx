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
// the highest-traffic funnel moment. Honest waiting: hold a *deliberate* ~2s beat
// so the word cascade plays over the student's real answers as a genuine
// confirmation (founder feedback: the earlier sub-second reveal felt too fast),
// but stay under the retired 3000ms theatre and let the real API response gate the
// *actual* transition in AssessFlow — never dress the reveal up as "analysis".
describe("ProfileRecap — deliberate but honest reveal window (no fake 3s theatre)", () => {
  it("holds a deliberate beat, then hands off — still under the old 3s floor", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ProfileRecap profile={aarav} onDone={onDone} />);

    // A deliberate confirmation beat — it must NOT snap away in a few hundred ms.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).not.toHaveBeenCalled();

    // …but it still hands off well under the retired 3000ms "Analyzing" floor.
    act(() => {
      vi.advanceTimersByTime(1500);
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
