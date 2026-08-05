import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HowItWorksPage from "@/app/(marketing)/how/page";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// MV-162 item 6: the reviewer asked for the stunted rules to go, and explicitly made the
// paragraph shortening optional ("you don't have to reduce it"). The card declined it — this
// copy is load-bearing trust prose (sourcing, thresholds, verification dates), so it is pinned
// here verbatim so a later trim cannot land quietly.
const PARAGRAPHS = [
  "Every verdict on this platform is traceable to a published threshold. Nothing is estimated without telling you it is an estimate. Here is how the four scoring dimensions are built and what changes when you upload documents.",
  "Visa rules come directly from the Department of Home Affairs at immi.homeaffairs.gov.au — the Genuine Student requirement and the financial-capacity rules (AUD 29,710 per year for living costs, plus travel and first-year tuition evidence). We do not interpret or paraphrase policy; we pull the published thresholds and link to the exact page. University data comes from the CRICOS register and each provider's own program pages. Every data point displays the date it was last verified. When a threshold changes, the displayed date changes too — there is no silent staleness.",
  "Academic fit compares your Nepal TU percentage directly against each program's published entry minimum. Financial readiness compares your declared budget and funding source against the DHA expected costs for the duration of your course — living costs plus tuition, not just the first year. Visa case strength scores the Genuine Student narrative inputs — how you explain a study gap, how clearly you state your study purpose, and what ties you have to Nepal after graduation — and weighs any prior visa refusals you declare. Profile strength reflects assessment completeness — English score, work history, and whether you have uploaded documents that replace assumed values.",
  "Each program has a published grade minimum and an English requirement. We compare your inputs to those thresholds directly. Strong means you meet every published requirement. Possible means a small gap — typically one academic band or slightly below the English floor. Reach means a significant gap on one or more dimensions. We never invent a verdict. Each band links out to the provider — the program page where we have it, the provider's site otherwise — so you can check the published requirement yourself.",
  "Your verdict and match scores are computed from the values you declare. Uploading an IELTS scorecard, academic transcript, or bank statement keeps your documents organized for your application checklist and plan — we store them so you can track what you've gathered. We don't yet read figures out of uploaded files, so uploading doesn't change your verdict or match scores on its own.",
];

describe("/how methodology page", () => {
  it("renders the four section headings", () => {
    render(<HowItWorksPage />);
    for (const heading of [
      "Data sources",
      "The four scoring dimensions",
      "How match verdicts work",
      "How document uploads work today",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("draws no horizontal rule between the sections", () => {
    const { container } = render(<HowItWorksPage />);
    expect(container.querySelectorAll("hr")).toHaveLength(0);
  });

  it("draws no border-drawn divider standing in for the removed rules", () => {
    const { container } = render(<HowItWorksPage />);
    const ruled = Array.from(container.querySelectorAll("*")).filter((el) =>
      /(^|\s|:)border-[tby](-|\s|$)/.test(el.className.toString()),
    );
    expect(ruled.map((el) => el.className.toString())).toEqual([]);
  });

  it("keeps every methodology paragraph unshortened", () => {
    const { container } = render(<HowItWorksPage />);
    const paragraphs = Array.from(container.querySelectorAll("p")).map((p) => norm(p.textContent));
    expect(paragraphs).toEqual(PARAGRAPHS);
  });

  it("renders the methodology kicker in the sans, not the mono", () => {
    render(<HowItWorksPage />);
    const kicker = screen.getByText("Methodology");
    expect(kicker.className).not.toMatch(/font-mono/);
    expect(kicker.className).toMatch(/uppercase/);
    expect(kicker.className).toMatch(/tracking-wide/);
  });
});
