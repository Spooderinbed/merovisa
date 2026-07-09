import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanSteps } from "@/components/marketing/plan-steps";

describe("PlanSteps", () => {
  it("SSR shows all five titles and step 02 open at rest (JS single-open .open class, not native <details>)", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    for (const t of [
      "Confirm your eligibility",
      "Shortlist programs that fit",
      "Sit IELTS or PTE",
      "Prepare financial evidence",
      "Lodge your student visa",
    ]) expect(html).toContain(t);
    // Exactly one step is open at rest, and it is step 02 (the "Now" step).
    const openCount = (html.match(/aria-expanded="true"/g) ?? []).length;
    expect(openCount).toBe(1);
    expect(html).toMatch(/class="step open now"/);
    // MV-117: the native <details name="mv-plan"> accordion snapped open (a closed
    // <details> display:none's its content, so grid-rows 0fr→1fr can't interpolate).
    // Replaced by a JS .open-class accordion so the expand animates. No <details> left.
    expect(html).not.toMatch(/<details/);
    expect(html).not.toMatch(/name="mv-plan"/);
    expect(html).toContain("University data · verified Jun 2026");
    expect(html).not.toContain("Source:");
  });

  it("renders a verified citation for every sourced step; the status step keeps its label", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    expect(html).toContain("Home Affairs · verified Jun 2026");
    expect(html).toContain("Home Affairs s.500 · verified Jun 2026");
    expect(html).toContain("Status: completed");
  });
});
