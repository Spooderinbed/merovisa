import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanSteps } from "@/components/marketing/plan-steps";

describe("PlanSteps", () => {
  it("SSR shows all five titles and step 02's detail open with its citation", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    for (const t of [
      "Confirm your eligibility",
      "Shortlist programs that fit",
      "Sit IELTS or PTE",
      "Prepare financial evidence",
      "Lodge your student visa",
    ]) expect(html).toContain(t);
    // exactly one <details ... open> and it is step 02
    const openCount = (html.match(/<details[^>]*\sopen/g) ?? []).length;
    expect(openCount).toBe(1);
    expect(html).toContain("University data · verified Jun 2026");
    expect(html).not.toContain("Source:");
    expect(html).toMatch(/name="mv-plan"/); // native exclusive accordion
  });

  it("renders a verified citation for every sourced step; the status step keeps its label", () => {
    const html = renderToStaticMarkup(<PlanSteps />);
    expect(html).toContain("Home Affairs · verified Jun 2026");
    expect(html).toContain("Home Affairs s.500 · verified Jun 2026");
    expect(html).toContain("Status: completed");
  });
});
