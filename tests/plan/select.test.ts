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
  it("reads as a journey: Phase A profile work first, then Phase D visa prep in sequence", () => {
    const items = [
      mk({ id: 1, kind: "prepare-police-certificate", impact: "medium" }),
      mk({ id: 2, kind: "prepare-gs-answers", impact: "high" }),
      mk({ id: 3, kind: "add-grade", impact: "high" }),
      mk({ id: 4, kind: "set-name", impact: "low" }),
      mk({ id: 5, kind: "upload-ielts-report", impact: "medium" }),
      mk({ id: 6, kind: "done-one", status: "done" }),
    ];
    // Phase A (profile), sorted within phase by impact then id: add-grade (high),
    // upload-ielts (medium), set-name (low). Then Phase D (visa prep) in the curated
    // sequence: gs-answers before police-certificate. Done excluded.
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([3, 5, 4, 2, 1]);
  });

  it("orders by phase before impact: a Phase A item precedes a higher-up Phase D item", () => {
    const items = [
      mk({ id: 1, kind: "upload-proof-of-funds", impact: "high" }), // Phase D
      mk({ id: 2, kind: "set-name", impact: "low" }), // Phase A
    ];
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([2, 1]);
  });
});

describe("orderOpenItems — MV-57 journey-spine within-phase order", () => {
  it("Phase C reads accept-offer → apply-for-noc → prepare-fund-remittance → get-coe", () => {
    // Shuffled input; journeyRank fixes the Nepal-real funds-release sequence regardless
    // of impact (apply-for-noc/prepare-fund-remittance are medium, the connective steps too).
    const items = [
      mk({ id: 1, kind: "get-coe", impact: "medium" }),
      mk({ id: 2, kind: "prepare-fund-remittance", impact: "medium" }),
      mk({ id: 3, kind: "apply-for-noc", impact: "medium" }),
      mk({ id: 4, kind: "accept-offer", impact: "medium" }),
    ];
    expect(orderOpenItems(items).map((i) => i.kind)).toEqual([
      "accept-offer",
      "apply-for-noc",
      "prepare-fund-remittance",
      "get-coe",
    ]);
  });

  it("lodge-subclass-500 sorts last in Phase D, after every prep step", () => {
    const items = [
      mk({ id: 1, kind: "lodge-subclass-500", impact: "high" }), // high impact, but must still sort last
      mk({ id: 2, kind: "arrange-oshc", impact: "medium" }),
      mk({ id: 3, kind: "upload-proof-of-funds", impact: "high" }),
      mk({ id: 4, kind: "season-funds-six-months", impact: "high" }),
      mk({ id: 5, kind: "prepare-gs-answers", impact: "high" }),
    ];
    const ordered = orderOpenItems(items).map((i) => i.kind);
    expect(ordered[ordered.length - 1]).toBe("lodge-subclass-500");
  });

  it("track-visa-decision is the sole Phase E step, sorting after all of D", () => {
    const items = [
      mk({ id: 1, kind: "track-visa-decision", impact: "low" }),
      mk({ id: 2, kind: "lodge-subclass-500", impact: "high" }),
      mk({ id: 3, kind: "submit-university-applications", impact: "medium" }),
    ];
    const ordered = orderOpenItems(items).map((i) => i.kind);
    // B before D before E: submit (B) → lodge (D) → track (E).
    expect(ordered).toEqual(["submit-university-applications", "lodge-subclass-500", "track-visa-decision"]);
  });

  it("regression: existing within-phase A/B/D order is unchanged by the journeyRank key", () => {
    // Same fixture as the headline orderOpenItems test above — unranked kinds tie on
    // journeyRank and fall through to the existing visaPrepOrder → impact → id keys.
    const items = [
      mk({ id: 1, kind: "prepare-police-certificate", impact: "medium" }),
      mk({ id: 2, kind: "prepare-gs-answers", impact: "high" }),
      mk({ id: 3, kind: "add-grade", impact: "high" }),
      mk({ id: 4, kind: "set-name", impact: "low" }),
      mk({ id: 5, kind: "upload-ielts-report", impact: "medium" }),
    ];
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([3, 5, 4, 2, 1]);
  });
});

describe("orderOpenItems determinism", () => {
  it("orders strictly by phase then impact then id — never by creation time", () => {
    // id 6 is Phase A (gap evidence), id 4 is Phase D (proof of funds): A precedes D
    // regardless of equal created_at or input order.
    const tied = [
      mk({ id: 6, kind: "document-gap-evidence", impact: "high", createdAt: "2026-06-04T15:44:14.996Z" }),
      mk({ id: 4, kind: "upload-proof-of-funds", impact: "high", createdAt: "2026-06-04T15:44:14.996Z" }),
    ];
    expect(orderOpenItems(tied).map((i) => i.id)).toEqual([6, 4]);
    expect(orderOpenItems([...tied].reverse()).map((i) => i.id)).toEqual([6, 4]);
  });

  it("ignores creation time within a phase — ties break by id, oldest-numbered first", () => {
    const items = [
      mk({ id: 1, impact: "high", createdAt: "2026-06-04T00:00:00Z" }),
      mk({ id: 2, impact: "high", createdAt: "2026-06-10T00:00:00Z" }),
    ];
    // Same phase (A), same impact, same created order irrelevant → deterministic by id.
    expect(orderOpenItems(items).map((i) => i.id)).toEqual([1, 2]);
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
