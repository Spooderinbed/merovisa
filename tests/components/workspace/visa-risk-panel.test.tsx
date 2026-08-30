import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// The read model is `server-only`; the panel imports only its TYPES, but the test
// file pulls the module in to build fixtures.
vi.mock("server-only", () => ({}));

import { VisaRiskPanel } from "@/components/workspace/visa-risk-panel";
import { CaseDecisionStrip } from "@/components/workspace/case-decision-strip";
import type { VisaRiskFactor, VisaRiskRead } from "@/lib/judgement/visa-risk";
import type { LodgementRead } from "@/lib/cases/lodgement";

/**
 * MV-198 criteria 3–6 on the surface — spec §3's "Visa-risk read" panel.
 *
 * This panel sits in the highest-trust region of the product: the first thing a
 * counsellor sees on a case, and the answer the consultancy is buying. So, as with
 * `submittability-panel.test.tsx`, most of what is asserted is what the panel must
 * NOT say — no score, no percentage, no admissions wording, and no band at all on a
 * case it cannot judge.
 */

const BASE = "/workspace/org-1/students/case-1";

const capacityRisk: VisaRiskFactor = {
  key: "financial-capacity",
  label: "Financial capacity",
  state: "risk",
  sentence: "Far short of the ~AUD 74,210 the student visa expects — a major risk on financial capacity.",
  source: { url: "https://immi.homeaffairs.gov.au/example", lastVerified: "2026-05-01" },
};

const sourceOfFunds: VisaRiskFactor = {
  key: "source-of-funds",
  label: "Source-of-funds credibility",
  state: "not-modelled",
  sentence: "Not assessed. The profile records a declared funding type, which is not evidence.",
};

const englishClear: VisaRiskFactor = {
  key: "english-floor",
  label: "English visa floor",
  state: "positive",
  sentence: "Meets the 6.5 threshold for australia.",
};

const gapNeutral: VisaRiskFactor = {
  key: "gap-justification",
  label: "Gap justification",
  state: "neutral",
  sentence: "Documented employment mitigates gap concerns.",
};

const refusalsClear: VisaRiskFactor = {
  key: "prior-refusal",
  label: "Prior refusals",
  state: "neutral",
  sentence: "No prior visa refusal is recorded on this profile.",
};

const NOT_HELD = [
  "Provider risk level is not held. The provider's assessment level is not something this read has, so nothing here accounts for it.",
];

function judged(over: Partial<Extract<VisaRiskRead, { state: "read" }>> = {}): VisaRiskRead {
  return {
    state: "read",
    band: "reach",
    conclusion: "This case reads as a refusal risk. Financial capacity is the item to fix first.",
    blocker: capacityRisk,
    factors: [capacityRisk, sourceOfFunds, englishClear, gapNeutral, refusalsClear],
    notHeld: NOT_HELD,
    ruleVersion: "v0.5.0",
    configVersion: "config-v4",
    ...over,
  };
}

const renderPanel = (read: VisaRiskRead) => render(<VisaRiskPanel read={read} base={BASE} />);

const panel = () => screen.getByRole("region", { name: /visa read/i });

describe("VisaRiskPanel — the label and the band", () => {
  it("is labelled Visa read", () => {
    renderPanel(judged());
    expect(panel()).toBeTruthy();
  });

  it("says the band in one word", () => {
    for (const [band, word] of [
      ["strong", "Strong"],
      ["possible", "Possible"],
      ["reach", "Reach"],
    ] as const) {
      const { unmount } = renderPanel(judged({ band }));
      expect(screen.getByTestId("visa-risk-band").textContent).toBe(word);
      unmount();
    }
  });

  it("never says 'Strong match' — that is the admissions verdict, not this one", () => {
    // `VerdictPill` renders VERDICT_LABELS, whose `strong` label is "Strong match".
    // The component inventory says to reuse it here; the panel deliberately does not,
    // because a visa read wearing an admissions label claims something it did not
    // compute. See the component header for the full reasoning.
    renderPanel(judged({ band: "strong" }));
    expect(panel().textContent).not.toContain("match");
  });

  it("states the conclusion in a sentence", () => {
    renderPanel(judged());
    expect(screen.getByText(/refusal risk/i)).toBeTruthy();
  });
});

describe("VisaRiskPanel criterion 4 — banded, never numeric", () => {
  it("puts no digit in the band", () => {
    for (const band of ["strong", "possible", "reach"] as const) {
      const { unmount } = renderPanel(judged({ band }));
      expect(screen.getByTestId("visa-risk-band").textContent ?? "").not.toMatch(/\d/);
      unmount();
    }
  });

  it("puts no percentage, score or probability anywhere in the panel", () => {
    renderPanel(judged());
    const text = panel().textContent ?? "";
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/\bpercent/i);
    expect(text).not.toMatch(/\bprobabilit/i);
    expect(text).not.toMatch(/\d\s*\/\s*100\b/);
    expect(text).not.toMatch(/\bout of 100\b/);
  });

  it("puts no digit in any aria-label or title", () => {
    // Criterion 4 names these explicitly: a score smuggled into assistive text is
    // still a score reaching a user.
    const { container } = renderPanel(judged());
    for (const el of container.querySelectorAll("[aria-label],[title]")) {
      expect(el.getAttribute("aria-label") ?? "").not.toMatch(/\d/);
      expect(el.getAttribute("title") ?? "").not.toMatch(/\d/);
    }
  });
});

describe("VisaRiskPanel criterion 3 — the five rows", () => {
  it("renders all five factor rows, in the spec's order", () => {
    renderPanel(judged());
    const rows = within(panel()).getAllByTestId("visa-risk-row");
    expect(rows.map((r) => r.getAttribute("data-factor"))).toEqual([
      "financial-capacity",
      "source-of-funds",
      "english-floor",
      "gap-justification",
      "prior-refusal",
    ]);
  });

  it("gives each row a state word, so colour is never the only carrier", () => {
    renderPanel(judged());
    const rows = within(panel()).getAllByTestId("visa-risk-row");
    expect(rows.map((r) => within(r as HTMLElement).getByTestId("visa-risk-row-state").textContent))
      .toEqual(["Risk", "Not assessed", "Strength", "Neutral", "Neutral"]);
  });

  it("shows source-of-funds as not assessed, never as a pass", () => {
    renderPanel(judged());
    const row = within(panel())
      .getAllByTestId("visa-risk-row")
      .find((r) => r.getAttribute("data-factor") === "source-of-funds")!;
    expect(within(row).getByTestId("visa-risk-row-state").textContent).toBe("Not assessed");
  });

  it("contains no imagery — the product body is imageless", () => {
    const { container } = renderPanel(judged());
    expect(container.querySelectorAll("img, svg, picture").length).toBe(0);
  });
});

describe("VisaRiskPanel criterion 5 — provenance where it exists, and only there", () => {
  it("cites the source on the factor that has one", () => {
    renderPanel(judged());
    const link = within(panel()).getByRole("link", { name: /source/i });
    expect(link.getAttribute("href")).toBe(capacityRisk.source!.url);
  });

  it("cites nothing on the factors that have none", () => {
    // Four of the five rows carry no `source`. Exactly one link may exist.
    renderPanel(judged());
    expect(within(panel()).getAllByRole("link", { name: /source/i })).toHaveLength(1);
  });

  it("names the rules behind the read", () => {
    renderPanel(judged());
    expect(panel().textContent).toContain("v0.5.0");
    expect(panel().textContent).toContain("config-v4");
  });
});

describe("VisaRiskPanel criterion 6 — the omitted factor is named", () => {
  it("says provider risk level is not held", () => {
    renderPanel(judged());
    expect(within(panel()).getByText(/provider risk level is not held/i)).toBeTruthy();
  });
});

describe("VisaRiskPanel — the single blocking item", () => {
  it("names the blocker when one exists", () => {
    renderPanel(judged());
    expect(within(panel()).getByTestId("visa-risk-blocker").textContent)
      .toContain("Financial capacity");
  });

  it("shows no blocking item when nothing is a risk", () => {
    renderPanel(
      judged({
        band: "strong",
        blocker: null,
        conclusion: "Nothing this read models points to a refusal on this case.",
        factors: [
          { ...capacityRisk, state: "positive", sentence: "Budget covers what the visa expects." },
          sourceOfFunds,
          englishClear,
          gapNeutral,
          refusalsClear,
        ],
      }),
    );
    expect(within(panel()).queryByTestId("visa-risk-blocker")).toBeNull();
  });
});

describe("VisaRiskPanel — the three states that carry no band", () => {
  it("an unlinked case says so, in the spec's words, with no band", () => {
    renderPanel({ state: "no-linked-student" });
    expect(within(panel()).getByText(/not available — no linked student profile/i)).toBeTruthy();
    expect(screen.queryByTestId("visa-risk-band")).toBeNull();
  });

  it("a case with nothing recorded says so, and does not read as a Reach", () => {
    renderPanel({ state: "insufficient-data" });
    expect(screen.queryByTestId("visa-risk-band")).toBeNull();
    const text = panel().textContent ?? "";
    expect(text).not.toContain("Reach");
    expect(text).toMatch(/not enough/i);
  });

  it("a failed read says it failed, and never wears a good state", () => {
    // Spec §5: a failed enrichment must not silently show a good state. Showing
    // nothing at all would be the same mistake in a quieter coat — the reader would
    // conclude the case has no visa concerns rather than that we could not find out.
    renderPanel({ state: "unavailable" });
    expect(screen.queryByTestId("visa-risk-band")).toBeNull();
    const text = panel().textContent ?? "";
    expect(text).toMatch(/couldn't|could not/i);
    expect(text).not.toContain("Strong");
  });
});

describe("CaseDecisionStrip — the visa read takes its reserved half", () => {
  const lodgement: LodgementRead = { state: "clear" };

  it("renders both reads when both are present", () => {
    render(<CaseDecisionStrip base={BASE} lodgement={lodgement} visaRisk={judged()} />);
    expect(screen.getByRole("region", { name: /visa read/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /lodgement/i })).toBeTruthy();
  });

  it("renders the lodgement read alone when the visa read is absent", () => {
    // The pre-MV-198 behaviour, kept: an absent feature renders no placeholder.
    render(<CaseDecisionStrip base={BASE} lodgement={lodgement} />);
    expect(screen.queryByRole("region", { name: /visa read/i })).toBeNull();
    expect(screen.getByRole("region", { name: /lodgement/i })).toBeTruthy();
  });

  it("renders nothing at all when neither read is present", () => {
    const { container } = render(<CaseDecisionStrip base={BASE} />);
    expect(container.innerHTML).toBe("");
  });
});
