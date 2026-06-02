import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wizard } from "@/components/wizard/wizard";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import type { StudentProfile } from "@/lib/scoring/types";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Exercises the full wizard → profile → assembleAssessment seam. This is the
 * integration boundary that unit tests miss: the wizard collects `grade` as a
 * percentage, and the matching engine must consume it as a percentage (no
 * CGPA re-scaling). A regression there would surface as all-"strong" matches.
 */
describe("wizard → results seam", () => {
  it("produces a valid profile that assembles into a coherent payload", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Wizard onComplete={onComplete} />);

    const next = () => screen.getByRole("button", { name: /Continue|See where I stand/ });

    // Step 1 — home country: Nepal is preselected.
    await user.click(next());

    // Step 2 — education: choose a level (grade defaults to 70%).
    await user.click(screen.getByRole("radio", { name: /Bachelor's degree/ }));
    await user.click(next());

    // Step 3 — field of study.
    await user.click(screen.getByRole("radio", { name: /Computer Science/ }));
    await user.click(next());

    // Step 4 — graduation year: current year ⇒ no gap ⇒ gap step is skipped.
    await user.click(screen.getByRole("radio", { name: String(CURRENT_YEAR) }));
    await user.click(next());

    // Step 5 — English status.
    await user.click(screen.getByRole("radio", { name: "Not taken" }));
    await user.click(next());

    // Step 6 — destination.
    await user.click(screen.getByRole("radio", { name: "Australia" }));
    await user.click(next());

    // Step 7 — budget: currency/budget default; choose a funding source.
    await user.click(screen.getByRole("radio", { name: /Education loan/ }));
    await user.click(next());

    // Step 8 — goal (final step).
    await user.click(screen.getByRole("radio", { name: /Permanent residency/ }));
    await user.click(next());

    expect(onComplete).toHaveBeenCalledOnce();
    const profile = onComplete.mock.calls[0]![0] as StudentProfile;

    // The collected profile must satisfy the same schema the API validates against.
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.gradeSystem).toBe("percentage-nepal");
    expect(profile.grade).toBe(70);

    // And it must assemble into a coherent results payload.
    const payload = assembleAssessment(profile, new Date("2026-06-03"));
    expect(payload.result.verdict).toBeDefined();
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matchedCount).toBe(payload.matches.length);

    // Guards against grade re-scaling regressions: a 70% applicant should NOT
    // clear every Australian university as a "strong" match.
    expect(payload.matches.every((m) => m.matchLevel === "strong")).toBe(false);
  });
});
