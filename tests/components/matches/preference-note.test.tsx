import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreferenceNote } from "@/components/matches/preference-note";
import type { PreferenceNote as PreferenceNoteData } from "@/lib/matches/types";

describe("PreferenceNote", () => {
  it("renders nothing when the note is absent", () => {
    const { container } = render(<PreferenceNote note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a ranked note as plain text", () => {
    const note: PreferenceNoteData = { kind: "ranked", text: "Ordered by your priority: lowest total cost." };
    render(<PreferenceNote note={note} />);
    expect(screen.getByText("Ordered by your priority: lowest total cost.")).toBeInTheDocument();
  });

  it("renders a deferred note as plain text", () => {
    const note: PreferenceNoteData = {
      kind: "deferred",
      text: "We don't yet have program-level employment data, so these matches stay ordered by eligibility.",
    };
    render(<PreferenceNote note={note} />);
    expect(screen.getByText(/program-level employment data/)).toBeInTheDocument();
  });

  it("renders the PR note with a 485 source link", () => {
    const note: PreferenceNoteData = {
      kind: "pr-context",
      before: "You chose permanent residency. Australia has post-study pathways such as the ",
      linkText: "Subclass 485 Temporary Graduate visa",
      after: " after eligible study. We don't rank individual programs by PR outcome, so these matches stay ordered by eligibility.",
      source: { href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485", lastVerified: "2026-06-07" },
    };
    render(<PreferenceNote note={note} />);
    const link = screen.getByRole("link", { name: "Subclass 485 Temporary Graduate visa" });
    expect(link).toHaveAttribute("href", note.source.href);
    expect(screen.getByText(/post-study pathways/)).toBeInTheDocument();
    expect(screen.getByText(/stay ordered by eligibility/)).toBeInTheDocument();
  });
});
