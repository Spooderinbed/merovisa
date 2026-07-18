import { describe, it, expect, vi } from "vitest";

// assembleAssessment now reaches lib/matches/evidence.ts (`import "server-only"`);
// neutralise that build-time guard in the node test env (house pattern).
vi.mock("server-only", () => ({}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wizard } from "@/components/wizard/wizard";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import { TEST_PROGRAMS, TEST_UNIVERSITIES } from "../fixtures/catalog";
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
    // `delay: null` skips user-event's per-interaction setTimeout(0) waits.
    // With the default `delay: 0`, every one of the 17 clicks below ends by
    // awaiting a real macrotask; under full-suite CPU contention those timer
    // callbacks fire late and the accumulated lag intermittently pushes this
    // test past the default timeout. The events still dispatch and React still
    // flushes synchronously inside each click, so behavior is unchanged — only
    // the load-sensitive real-timer waits are removed.
    const user = userEvent.setup({ delay: null });
    const onComplete = vi.fn();
    render(<Wizard onComplete={onComplete} />);

    const next = () => screen.getByRole("button", { name: /Continue|See where I stand/ });

    // Step 1 — home country: Nepal is preselected.
    await user.click(next());

    // Step 2 — destination (MV-47: corridor question is now up front).
    await user.click(screen.getByRole("radio", { name: "Australia" }));
    await user.click(next());

    // Step 3 — education: choose a level (grade defaults to 70%).
    await user.click(screen.getByRole("radio", { name: /Bachelor's degree/ }));
    await user.click(next());

    // Step 4 — field of study.
    await user.click(screen.getByRole("radio", { name: /Computer Science/ }));
    await user.click(next());

    // Step 5 — graduation year: current year ⇒ no gap ⇒ gap step is skipped.
    await user.click(screen.getByRole("radio", { name: String(CURRENT_YEAR) }));
    await user.click(next());

    // Step 6 — English status.
    await user.click(screen.getByRole("radio", { name: "Not taken" }));
    await user.click(next());

    // Step 7 — budget: currency/budget default; choose a funding source.
    await user.click(screen.getByRole("radio", { name: /Education loan/ }));
    await user.click(next());

    // Step 8 — goal.
    await user.click(screen.getByRole("radio", { name: /Permanent residency/ }));
    await user.click(next());

    // Step 9 — prior visa refusals (final step, F-1). Explicit selection required
    // before results, so the anonymous verdict reflects any refusal up front.
    await user.click(screen.getByRole("radio", { name: /No prior refusals/ }));
    await user.click(next());

    expect(onComplete).toHaveBeenCalledOnce();
    const profile = onComplete.mock.calls[0]![0] as StudentProfile;

    // The collected profile must satisfy the same schema the API validates against.
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.gradeSystem).toBe("percentage-nepal");
    expect(profile.grade).toBe(70);

    // And it must assemble into a coherent results payload.
    const payload = assembleAssessment(profile, TEST_PROGRAMS, TEST_UNIVERSITIES, new Date("2026-06-03"));
    expect(payload.result.verdict).toBeDefined();
    expect(payload.matches.length).toBeGreaterThan(0);
    expect(payload.matchedCount).toBe(payload.matches.length);

    // Guards against grade re-scaling regressions: a 70% applicant should NOT
    // clear every Australian program as a "strong" match.
    expect(payload.matches.every((m) => m.verdict === "strong")).toBe(false);
    // Generous explicit timeout (default is 5000ms): `delay: null` above already
    // removes the load-sensitive real-timer waits, but this keeps a wide safety
    // margin so a pathological CPU-contention spike on the remaining synchronous
    // render work can never reintroduce the flake — while still failing fast on a
    // genuine hang.
  }, 15000);
});
