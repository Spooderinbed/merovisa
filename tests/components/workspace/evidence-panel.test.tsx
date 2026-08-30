import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// The read model is `server-only`; the panel imports only its TYPES, but this file
// pulls the module in to build fixtures.
vi.mock("server-only", () => ({}));

import { EvidencePanel } from "@/components/workspace/evidence-panel";
import { CaseDecisionStrip } from "@/components/workspace/case-decision-strip";
import type { SubmittabilityRead, SubmittabilityRow } from "@/lib/judgement/submittability";
import type { LodgementRead } from "@/lib/cases/lodgement";
import type { VisaRiskRead } from "@/lib/judgement/visa-risk";

/**
 * MV-199 criteria 4, 7 and 8 on the surface.
 *
 * Two of the three criteria here are about what the panel must NOT do — it may not
 * collapse the two stages into one word, and it may not restate the checklist — so most
 * of what is asserted below is an absence.
 */

const BASE = "/workspace/org-1/students/case-1";
const PROGRAM = { id: "p-1", name: "Master of IT" };

const row = (over: Partial<SubmittabilityRow> = {}): SubmittabilityRow => ({
  key: "passport",
  label: "Passport bio page",
  done: false,
  ...over,
});

const english = row({
  key: "english",
  label: "IELTS scorecard (or PTE / TOEFL)",
  source: { url: "https://example.edu/it", lastVerified: "2026-01-01" },
});

const READ: SubmittabilityRead = {
  state: "read",
  program: PROGRAM,
  alsoCovers: 0,
  apply: {
    ready: 2,
    total: 6,
    complete: false,
    rows: [row({ done: true }), row({ key: "national-id", label: "Citizenship / National ID", done: true }), english],
  },
  lodge: {
    ready: 0,
    total: 7,
    complete: false,
    rows: [row({ key: "coe", label: "Confirmation of Enrolment (CoE)" })],
  },
  blocker: english,
};

const panel = (read: SubmittabilityRead) =>
  within(render(<EvidencePanel read={read} base={BASE} />).container.querySelector("section")!);

describe("EvidencePanel — the two stages are stated separately (criterion 7)", () => {
  it("gives apply-stage and lodge-stage their own counts", () => {
    const ui = panel(READ);
    expect(ui.getByTestId("evidence-apply")).toHaveTextContent("2 of 6");
    expect(ui.getByTestId("evidence-lodge")).toHaveTextContent("0 of 7");
  });

  it("carries NO single state word or band for the whole panel", () => {
    // The neighbouring panels each lead with one word. This one deliberately cannot:
    // any single word would BE the collapse criterion 7 forbids — a case that is ready
    // to apply and nowhere near ready to lodge has no one true word.
    const { container } = render(<EvidencePanel read={READ} base={BASE} />);
    expect(container.querySelector("[data-testid='evidence-band']")).toBeNull();
    expect(screen.queryByText(/^(Ready|Blocked|Clear|Submittable)$/)).toBeNull();
  });

  it("never says a case ready to apply is ready to lodge", () => {
    const applied: SubmittabilityRead = {
      ...READ,
      apply: { ...READ.apply, ready: 6, complete: true },
      blocker: row({ key: "coe", label: "Confirmation of Enrolment (CoE)" }),
    };
    const ui = panel(applied);
    expect(ui.getByTestId("evidence-apply")).toHaveTextContent("6 of 6");
    expect(ui.getByTestId("evidence-lodge")).toHaveTextContent("0 of 7");
    expect(ui.queryByText(/ready to lodge/i)).toBeNull();
  });
});

describe("EvidencePanel — the rollup and the blocker, not the checklist (criterion 8)", () => {
  it("names ONE blocking item, and says which stage it blocks", () => {
    // "Chase the IELTS scorecard" and "chase the CoE" are different instructions, and
    // the second is impossible before an offer exists — so the stage travels with the
    // item rather than being left for the reader to infer.
    expect(panel(READ).getByTestId("evidence-blocker")).toHaveTextContent(
      "Blocking the application: IELTS scorecard (or PTE / TOEFL).",
    );

    const applied: SubmittabilityRead = {
      ...READ,
      apply: { ...READ.apply, ready: 6, complete: true },
      blocker: row({ key: "coe", label: "Confirmation of Enrolment (CoE)" }),
    };
    expect(panel(applied).getByTestId("evidence-blocker")).toHaveTextContent(
      "Blocking lodgement: Confirmation of Enrolment (CoE).",
    );
  });

  it("does NOT list the rows behind the counts", () => {
    // A list of everything outstanding is what the existing checklist already shows.
    // The differentiated output is the rollup plus the single blocker, so the other
    // rows travel in the read for explainability and are not rendered here.
    const { container } = render(<EvidencePanel read={READ} base={BASE} />);
    expect(screen.queryByText("Citizenship / National ID")).toBeNull();
    expect(screen.queryByText("Confirmation of Enrolment (CoE)")).toBeNull();
    expect(container.querySelectorAll("li").length).toBe(0);
    // The `apply` fixture carries three rows and the panel renders one of them — the
    // blocker — so this is a real exclusion, not an empty read rendering emptily.
    expect(READ.apply.rows.length).toBe(3);
  });

  it("says nothing is outstanding, with no blocker, when both stages are complete", () => {
    const done: SubmittabilityRead = {
      ...READ,
      apply: { ...READ.apply, ready: 6, complete: true },
      lodge: { ...READ.lodge, ready: 7, complete: true },
      blocker: null,
    };
    const ui = panel(done);
    expect(ui.queryByTestId("evidence-blocker")).toBeNull();
    expect(ui.getByTestId("evidence-lodge")).toHaveTextContent("7 of 7");
  });

  it("links to the checklist for the program the read is stated for", () => {
    const ui = panel(READ);
    expect(ui.getByRole("link", { name: /checklist/i })).toHaveAttribute(
      "href",
      `${BASE}/checklist/p-1`,
    );
  });
});

describe("EvidencePanel — provenance where it exists, and only there (criterion 4)", () => {
  it("cites the blocking item's source when the requirement carries one", () => {
    const link = panel(READ).getByRole("link", { name: /source/i });
    expect(link).toHaveAttribute("href", "https://example.edu/it");
    expect(link).toHaveTextContent("2026-01-01");
  });

  it("makes no sourced claim when the requirement has none", () => {
    // Coverage is partial by measurement. An unsourced blocker gets no citation rather
    // than borrowing the panel's or a neighbouring row's.
    const ui = panel({ ...READ, blocker: row() });
    expect(ui.queryByRole("link", { name: /source/i })).toBeNull();
    expect(ui.getByTestId("evidence-blocker")).toHaveTextContent("Passport bio page");
  });
});

describe("EvidencePanel — the denominator names what it is a total FOR", () => {
  it("says which program the counts are measured against", () => {
    expect(panel(READ).getByTestId("evidence-basis")).toHaveTextContent("Master of IT");
  });

  it("says when the same requirements cover more of the shortlist", () => {
    const ui = panel({ ...READ, alsoCovers: 2 });
    expect(ui.getByTestId("evidence-basis")).toHaveTextContent(/2 other/);
  });
});

describe("EvidencePanel — the three states that carry no counts", () => {
  it("no shortlisted program: no requirement set, and no numbers", () => {
    const ui = panel({ state: "no-program" });
    expect(ui.queryByTestId("evidence-apply")).toBeNull();
    expect(ui.getByText(/no program/i)).toBeInTheDocument();
  });

  it("programs that need different evidence: it says so rather than picking one", () => {
    const ui = panel({ state: "programs-differ", programCount: 3 });
    expect(ui.queryByTestId("evidence-apply")).toBeNull();
    expect(ui.getByText(/3 programs/i)).toBeInTheDocument();
  });

  it("a failed read SAYS it failed — silence would read as nothing outstanding", () => {
    const ui = panel({ state: "unavailable" });
    expect(ui.queryByTestId("evidence-apply")).toBeNull();
    expect(ui.getByText(/couldn't/i)).toBeInTheDocument();
    expect(ui.getByText(/not a statement about this case/i)).toBeInTheDocument();
  });
});

describe("EvidencePanel — no percentage, no bar, no score", () => {
  it("renders a count of a NAMED total and nothing that looks like a score", () => {
    const { container } = render(<EvidencePanel read={READ} base={BASE} />);
    expect(container.textContent).not.toMatch(/%/);
    expect(container.querySelector("progress")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("CaseDecisionStrip — the third answer takes its place", () => {
  const lodgement: LodgementRead = { state: "nothing-requested" };
  const visaRisk: VisaRiskRead = { state: "no-linked-student" };

  it("renders the evidence region between the visa read and lodgement", () => {
    const { container } = render(
      <CaseDecisionStrip base={BASE} lodgement={lodgement} visaRisk={visaRisk} submittability={READ} />,
    );
    const labels = [...container.querySelectorAll("section")].map((s) =>
      s.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Visa read", "Evidence", "Lodgement"]);
  });

  it("each read is independently absent", () => {
    const { container } = render(<CaseDecisionStrip base={BASE} submittability={READ} />);
    expect([...container.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"))).toEqual([
      "Evidence",
    ]);
  });

  it("no reads at all still renders nothing", () => {
    const { container } = render(<CaseDecisionStrip base={BASE} />);
    expect(container.firstChild).toBeNull();
  });
});
