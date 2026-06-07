import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistLanding } from "@/components/checklist/checklist-landing";

describe("ChecklistLanding", () => {
  it("lists shortlisted programs with checklist links", () => {
    render(<ChecklistLanding shortlisted={[{ id: "p1", name: "Master of IT" }]} />);
    expect(screen.getByRole("link", { name: /Master of IT/i })).toHaveAttribute("href", "/checklist/p1");
  });
  it("shows a matches CTA when nothing is shortlisted", () => {
    render(<ChecklistLanding shortlisted={[]} />);
    expect(screen.getByRole("link", { name: /Browse matches/i })).toHaveAttribute("href", "/matches");
  });
  it("always links to the documents vault", () => {
    render(<ChecklistLanding shortlisted={[]} />);
    expect(screen.getByRole("link", { name: /documents vault/i })).toHaveAttribute("href", "/documents");
  });
});
