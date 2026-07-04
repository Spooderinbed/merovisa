import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompetitivenessNote } from "@/components/results/competitiveness-note";
import type { FieldCompetitivenessNote } from "@/lib/scoring/field-note";

const note: FieldCompetitivenessNote = {
  field: "arts",
  direction: "easier",
  text: "Arts is a less competitive admit than Computer Science, so your chances there may be stronger.",
};

describe("CompetitivenessNote", () => {
  it("renders the honest note text when one is present", () => {
    render(<CompetitivenessNote note={note} />);
    expect(screen.getByText(/less competitive admit than Computer Science/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no material note", () => {
    const { container } = render(<CompetitivenessNote note={null} />);
    expect(container.firstChild).toBeNull();
  });
});
