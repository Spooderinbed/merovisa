import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistView } from "@/components/checklist/checklist-view";
import { generateChecklist } from "@/lib/checklist/generator";
import type { Program } from "@/lib/programs/types";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { DocumentKind } from "@/lib/documents/types";

const program: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};

describe("ChecklistView", () => {
  it("renders both stage headings, the program name, topical now-groups, and the after-offer document/step split", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    render(<ChecklistView program={program} university={null} items={items} />);
    expect(screen.getByRole("heading", { name: "Master of IT" })).toBeInTheDocument();
    expect(screen.getByText("What you need now")).toBeInTheDocument();
    expect(screen.getByText("After your offer")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Visa lodgement steps")).toBeInTheDocument();
  });

  it("passes plan state through to linked rows", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    render(
      <ChecklistView
        program={program}
        university={null}
        items={items}
        planStates={{ "noc-application": "open", "doc-preparation": "done" }}
      />,
    );
    expect(screen.getByText("In your plan")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track in your plan/i })).toHaveAttribute("href", "/plan");
  });

  it("frames the checklist as the per-program requirement reference and points to the plan as the action queue", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    render(<ChecklistView program={program} university={null} items={items} />);
    expect(screen.getByText(/reference for everything this program requires/i)).toBeInTheDocument();
    expect(screen.getByText(/your single action queue/i)).toBeInTheDocument();
  });

  it("shows an honest 'X of Y ready' count on each stage section", () => {
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>(["passport"]) });
    render(<ChecklistView program={program} university={null} items={items} />);
    expect(screen.getByText(/^1 of \d+ ready$/)).toBeInTheDocument(); // now: passport ready
    expect(screen.getByText(/^0 of \d+ ready$/)).toBeInTheDocument(); // after-offer: nothing yet
  });

  it("shows the ready-to-apply line only when every now-stage required item is ready, and never over-claims visa-readiness", () => {
    const onlyNowRequired: ChecklistItem[] = [
      { key: "passport", kind: "passport", label: "Passport", group: "identity", stage: "now", requirement: "required", status: "have" },
    ];
    render(<ChecklistView program={program} university={null} items={onlyNowRequired} />);
    expect(screen.getByText(/ready to start applying/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 of 1 ready$/)).toBeInTheDocument();
  });

  it("omits the ready-to-apply line while a now-stage required item is still missing", () => {
    const notReady: ChecklistItem[] = [
      { key: "passport", kind: "passport", label: "Passport", group: "identity", stage: "now", requirement: "required", status: "missing" },
    ];
    render(<ChecklistView program={program} university={null} items={notReady} />);
    expect(screen.queryByText(/ready to start applying/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^0 of 1 ready$/)).toBeInTheDocument();
  });
});
