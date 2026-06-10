import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistItem } from "@/components/checklist/checklist-item";
import type { ChecklistItem as Item } from "@/lib/checklist/types";

const base: Item = { key: "passport", kind: "passport", label: "Passport bio page", group: "identity", stage: "now", requirement: "required", status: "missing" };

describe("ChecklistItem", () => {
  it("shows an upload link for a missing item with a kind", () => {
    render(<ul><ChecklistItem item={base} /></ul>);
    expect(screen.getByText("Passport bio page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload in documents/i })).toHaveAttribute("href", "/documents");
  });
  it("marks a have item and shows no upload link", () => {
    render(<ul><ChecklistItem item={{ ...base, status: "have" }} /></ul>);
    expect(screen.getByText(/Have/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upload/i })).not.toBeInTheDocument();
  });
  it("shows a Recommended tag for recommended items", () => {
    render(<ul><ChecklistItem item={{ ...base, requirement: "recommended" }} /></ul>);
    expect(screen.getByText(/Recommended/i)).toBeInTheDocument();
  });
  it("renders a SourceLine when the item has a source", () => {
    render(<ul><ChecklistItem item={{ ...base, source: { url: "https://immi.homeaffairs.gov.au/x", lastVerified: "2026-06-07" } }} /></ul>);
    expect(screen.getByRole("link", { name: /immi\.homeaffairs\.gov\.au/i })).toBeInTheDocument();
  });
  it("renders an info item (kind null) with no upload link", () => {
    render(<ul><ChecklistItem item={{ ...base, key: "ahpra", kind: null, label: "AHPRA registration", status: "info" }} /></ul>);
    expect(screen.getByText("AHPRA registration")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upload/i })).not.toBeInTheDocument();
  });
});

describe("ChecklistItem plan-linked state (mirrors the plan — no second completion control)", () => {
  const step: Item = {
    key: "noc-application", kind: null, label: "No Objection Certificate (NOC)",
    group: "visa", stage: "after-offer", requirement: "required", status: "info", infoKind: "step",
  };
  it("renders exactly as today when no plan state is passed", () => {
    render(<ul><ChecklistItem item={step} /></ul>);
    expect(screen.getByText("Step")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Track in your plan/i })).not.toBeInTheDocument();
  });
  it("shows an In your plan chip and a track link while the plan item is open", () => {
    render(<ul><ChecklistItem item={step} planState="open" /></ul>);
    expect(screen.getByText("In your plan")).toBeInTheDocument();
    expect(screen.queryByText("Step")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track in your plan/i })).toHaveAttribute("href", "/plan");
  });
  it("shows an In progress chip while the plan item is started", () => {
    render(<ul><ChecklistItem item={step} planState="in-progress" /></ul>);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track in your plan/i })).toHaveAttribute("href", "/plan");
  });
  it("shows the checked have treatment when the plan item is done", () => {
    const { container } = render(<ul><ChecklistItem item={step} planState="done" /></ul>);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("✓ No Objection Certificate (NOC)")).toBeInTheDocument();
    expect(container.querySelector("li")?.className).toContain("border-primary");
    expect(screen.queryByRole("link", { name: /Track in your plan/i })).not.toBeInTheDocument();
  });
  it("never renders a button — the checklist cannot mutate plan state", () => {
    for (const state of ["open", "in-progress", "done"] as const) {
      const { unmount } = render(<ul><ChecklistItem item={step} planState={state} /></ul>);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("ChecklistItem info chips (Step/Note)", () => {
  const info: Item = {
    key: "x", kind: null, label: "X", group: "visa", stage: "after-offer",
    requirement: "required", status: "info",
  };
  it("renders a Step chip and no requirement pill for a step info item (police-certificate shape)", () => {
    render(<ul><ChecklistItem item={{ ...info, infoKind: "step", requirement: "recommended" }} /></ul>);
    expect(screen.getByText("Step")).toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("Bring this")).not.toBeInTheDocument();
  });
  it("renders a Note chip for a note info item", () => {
    render(<ul><ChecklistItem item={{ ...info, infoKind: "note" }} /></ul>);
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByText("Bring this")).not.toBeInTheDocument();
  });
  it("still shows the Recommended pill on a recommended document item", () => {
    render(<ul><ChecklistItem item={{ ...info, kind: "birth-certificate", status: "missing", requirement: "recommended" }} /></ul>);
    expect(screen.getByText("Needed")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });
});
