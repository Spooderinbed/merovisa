import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistView } from "@/components/checklist/checklist-view";
import { generateChecklist } from "@/lib/checklist/generator";
import type { Program } from "@/lib/programs/types";
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
});
