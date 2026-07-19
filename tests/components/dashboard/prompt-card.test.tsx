import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromptCard, type PromptState } from "@/components/dashboard/prompt-card";
import type { PlanItemRow } from "@/lib/plan/types";

const mkItem = (over: Partial<PlanItemRow> = {}): PlanItemRow => ({
  id: 1,
  owner: "u1",
  kind: "upload-ielts-report",
  impact: "medium",
  title: "Upload your IELTS report",
  body: "Uploading the official report lets us check per-band scores against program requirements.",
  liftEstimate: null,
  timeEstimate: null,
  status: "todo",
  createdAt: "2026-06-10",
  completedAt: null,
  startedAt: null,
  ...over,
});

const next = (over: Partial<PlanItemRow> = {}): PromptState => ({ kind: "next", item: mkItem(over) });

describe("PromptCard", () => {
  it("renders the generic profile prompt when there is no profile or assessment yet", () => {
    render(<PromptCard prompt={{ kind: "profile-incomplete" }} />);
    expect(screen.getByText(/Your next best step/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add details/i })).toHaveAttribute("href", "/profile");
  });

  it("matches-need-inputs: names grade, English and budget and states no verdict is invented (C-4)", () => {
    // The /matches abstain gate must not reuse the vague dashboard copy ("Add details",
    // "sharpens the verdict"): it has to say WHICH inputs unlock matches and promise we
    // don't fabricate a verdict from what the student never entered (audit C-4 honest copy).
    render(<PromptCard prompt={{ kind: "matches-need-inputs" }} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/grade/i);
    expect(text).toMatch(/English/i);
    expect(text).toMatch(/budget/i);
    expect(text).toMatch(/won.t invent/i);
    expect(screen.getByRole("link", { name: /Add your details/i })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("renders the plan's top item with a CTA to its completing surface (verified kind)", () => {
    render(<PromptCard prompt={next()} />);
    expect(screen.getByText("Upload your IELTS report")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Upload in documents/i });
    expect(cta).toHaveAttribute("href", "/documents");
    // Visible-token fix: paper pill + teal text, never the panel color.
    expect(cta.className).toContain("bg-bg");
    expect(cta.className).toContain("text-primary");
  });

  it("sends self-reported kinds to the plan", () => {
    render(<PromptCard prompt={next({ kind: "apply-for-noc", title: "Apply for your NOC" })} />);
    expect(screen.getByRole("link", { name: /Open your plan/i })).toHaveAttribute("href", "/plan");
  });

  it("waiting: says everything is underway with the open count — not caught up", () => {
    render(<PromptCard prompt={{ kind: "waiting", openCount: 3 }} />);
    expect(screen.getByText("Everything is underway")).toBeInTheDocument();
    expect(
      screen.getByText(/All 3 remaining plan items are marked in progress/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All caught up/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Open your plan/i })).toHaveAttribute("href", "/plan");
  });

  it("caught-up: honest copy with no phantom controls", () => {
    render(<PromptCard prompt={{ kind: "caught-up" }} />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing on your plan needs action right now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/refresh your assessment/i)).toBeNull();
    expect(screen.getByRole("link", { name: /See your plan/i })).toHaveAttribute("href", "/plan");
  });

  it("reveals its card with a single calm entrance in every state", () => {
    const states: PromptState[] = [
      { kind: "profile-incomplete" },
      next(),
      { kind: "waiting", openCount: 2 },
      { kind: "caught-up" },
    ];
    for (const prompt of states) {
      const { container, unmount } = render(<PromptCard prompt={prompt} />);
      expect(container.firstElementChild?.className).toContain("animate-rise");
      unmount();
    }
  });
});
