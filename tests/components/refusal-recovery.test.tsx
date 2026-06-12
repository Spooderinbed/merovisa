import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RefusalRecovery } from "@/components/results/refusal-recovery";

describe("RefusalRecovery", () => {
  it("renders the four gov-sourced sections", () => {
    render(<RefusalRecovery />);
    expect(screen.getByText(/Refusal risk & recovery/i)).toBeInTheDocument();
    // Exact/anchored matchers for the headings — a loose /If you're refused/ would
    // also match the longer recovery-review summary and getByText would throw.
    expect(screen.getByText("Why applications are refused")).toBeInTheDocument();
    expect(screen.getByText(/^Honest odds/)).toBeInTheDocument();
    expect(screen.getByText("If you're refused")).toBeInTheDocument();
    expect(screen.getByText("What not to trust")).toBeInTheDocument();
  });

  it("shows HE odds emphasized and VET odds as contrast, with the guard line", () => {
    render(<RefusalRecovery />);
    const he = screen.getByText(/85\.3%/);
    expect(he.className.split(/\s+/)).toContain("text-ink");
    const vet = screen.getByText(/36\.3%/);
    expect(vet.className.split(/\s+/)).toContain("text-ink-soft");
    expect(
      screen.getByText(/We show VET as a contrast because some students are steered into cheaper courses/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/it is not your personal probability/i)).toBeInTheDocument();
  });

  it("shows a recovery row with the ART fee and a scam warning", () => {
    render(<RefusalRecovery />);
    expect(screen.getByText(/AUD 3,580/)).toBeInTheDocument();
    expect(screen.getByText(/not a normal appeal path/i)).toBeInTheDocument();
    expect(screen.getByText(/Australia issues no work permits/i)).toBeInTheDocument();
  });

  it("links every section to its government source", () => {
    render(<RefusalRecovery />);
    expect(screen.getByRole("link", { name: "Genuine Student" })).toHaveAttribute(
      "href",
      expect.stringContaining("immi.homeaffairs.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Higher Education" })).toHaveAttribute(
      "href",
      expect.stringContaining("research-and-stats"),
    );
    expect(screen.getByRole("link", { name: "Review fee" })).toHaveAttribute(
      "href",
      expect.stringContaining("art.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Visa scams" })).toHaveAttribute(
      "href",
      expect.stringContaining("immi.homeaffairs.gov.au"),
    );
  });

  it("tells the post-1-June-2026 ART truth: paper-only review, strict deadline, realistic timing", () => {
    render(<RefusalRecovery />);
    // Paper-only change (I.051) folded into the Tribunal-review row.
    expect(
      screen.getByText(
        /since 1 June 2026 it decides most student-visa refusal reviews on the papers, without holding an oral hearing/i,
      ),
    ).toBeInTheDocument();
    // Non-extendable deadline (I.050).
    expect(screen.getByText(/the Tribunal has no power to extend it/i)).toBeInTheDocument();
    // Realistic ~19-month timing (I.048) — "about half" / "19 months" are the user-approved words.
    expect(
      screen.getByText(/about half of student refusal reviews finish within 19 months of applying/i),
    ).toBeInTheDocument();
    // The reworded row now links to the ART change notice, not the generic immi review page.
    expect(screen.getByRole("link", { name: "Tribunal review" })).toHaveAttribute(
      "href",
      expect.stringContaining("changes-conduct-student-visa-reviews"),
    );
  });

  it("copy-locks the corrected scam-warning lines (trust-copy read-through F1/F4)", () => {
    render(<RefusalRecovery />);
    // F1: I.028 + the live DHA page say "restrictions", not "bans".
    expect(
      screen.getByText(
        "Bogus or false documents can lead to refusal, cancellation, and restrictions on future applications.",
      ),
    ).toBeInTheDocument();
    // F4: the scam conclusion is attributed to DHA, not asserted in our voice.
    expect(
      screen.getByText(
        "Australia issues no work permits, visa labels, or Labour Market Impact Assessments — DHA lists offers of these among visa scams.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the not-legal-advice disclaimer", () => {
    render(<RefusalRecovery />);
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });
});
