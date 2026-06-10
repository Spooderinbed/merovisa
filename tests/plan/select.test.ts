import { describe, it, expect } from "vitest";
import { selectNextStep, orderOpenItems } from "@/lib/plan/select";
import { completionFor } from "@/lib/plan/completion";
import type { PlanItemRow } from "@/lib/plan/types";

const mk = (over: Partial<PlanItemRow>): PlanItemRow => ({
  id: 1,
  owner: "u1",
  kind: "k",
  impact: "medium",
  title: "T",
  body: null,
  liftEstimate: null,
  timeEstimate: null,
  status: "todo",
  createdAt: "2026-06-10",
  completedAt: null,
  startedAt: null,
  ...over,
});

describe("orderOpenItems", () => {
  it("mirrors the plan page: impact groups first, then visa prep in sequence", () => {
    const items = [
      mk({ id: 1, kind: "prepare-police-certificate", impact: "medium" }),
      mk({ id: 2, kind: "prepare-gs-answers", impact: "high" }),
      mk({ id: 3, kind: "add-grade", impact: "high" }),
      mk({ id: 4, kind: "set-name", impact: "low" }),
      mk({ id: 5, kind: "upload-ielts-report", impact: "medium" }),
      mk({ id: 6, kind: "done-one", status: "done" }),
    ];
    // add-grade (high), upload-ielts (medium), set-name (low), then visa prep:
    // gs-answers before police-certificate per VISA_PREP_KINDS order. Done excluded.
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([3, 5, 4, 2, 1]);
  });
});

describe("selectNextStep", () => {
  it("returns the top open actionable item", () => {
    const sel = selectNextStep([mk({ id: 1, impact: "low" }), mk({ id: 2, impact: "high" })]);
    expect(sel.state).toBe("next");
    expect(sel.item?.id).toBe(2);
  });

  it("skips in-progress items to the next actionable one", () => {
    const sel = selectNextStep([
      mk({ id: 1, impact: "high", startedAt: "2026-06-10T00:00:00Z" }),
      mk({ id: 2, impact: "medium" }),
    ]);
    expect(sel.state).toBe("next");
    expect(sel.item?.id).toBe(2);
    expect(sel.waitingCount).toBe(1);
  });

  it("is 'waiting' when every open item is in progress — never 'caught-up'", () => {
    const sel = selectNextStep([mk({ id: 1, startedAt: "2026-06-10T00:00:00Z" })]);
    expect(sel.state).toBe("waiting");
    expect(sel.openCount).toBe(1);
    expect(sel.item).toBeNull();
  });

  it("is 'caught-up' only at zero open items", () => {
    expect(selectNextStep([]).state).toBe("caught-up");
    expect(
      selectNextStep([mk({ status: "done" }), mk({ id: 2, status: "dismissed" })]).state,
    ).toBe("caught-up");
  });
});

describe("completionFor", () => {
  it("classifies profile/document-observable kinds as verified with a completing surface", () => {
    expect(completionFor("upload-ielts-report")).toEqual({
      completion: "verified",
      href: "/documents",
      cta: "Upload in documents →",
    });
    expect(completionFor("add-grade").completion).toBe("verified");
    expect(completionFor("add-grade").href).toBe("/profile");
    expect(completionFor("start-passport-process").href).toBe("/documents");
  });

  it("classifies external actions as self-reported with the plan as CTA", () => {
    for (const k of ["prepare-gs-answers", "apply-for-noc", "season-funds-six-months", "add-safer-options"]) {
      expect(completionFor(k)).toEqual({
        completion: "self-reported",
        href: "/plan",
        cta: "Open your plan →",
      });
    }
  });

  it("defaults unknown kinds to self-reported (forward compatibility)", () => {
    expect(completionFor("future-kind").completion).toBe("self-reported");
  });
});
