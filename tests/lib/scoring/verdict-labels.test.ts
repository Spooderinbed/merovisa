import { describe, it, expect } from "vitest";
import { VERDICTS, type Verdict } from "@/lib/scoring/types";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";

describe("VERDICT_LABELS (MV-42 — single source of verdict wording)", () => {
  it("covers every verdict with a non-empty singular label and plural group label", () => {
    for (const v of VERDICTS as readonly Verdict[]) {
      expect(VERDICT_LABELS[v]).toMatchObject({
        label: expect.any(String),
        groupLabel: expect.any(String),
      });
      expect(VERDICT_LABELS[v].label.length).toBeGreaterThan(0);
      expect(VERDICT_LABELS[v].groupLabel.length).toBeGreaterThan(0);
    }
  });

  it("words the singular card pill and the plural matches group header as the two surfaces use them", () => {
    // Singular describes one program's verdict; plural heads the bucket of them.
    // The two stay distinct on purpose — centralising them stops the wording
    // drifting apart, not collapsing the grammar.
    expect(VERDICT_LABELS.strong).toEqual({ label: "Strong match", groupLabel: "Strong matches" });
    expect(VERDICT_LABELS.possible).toEqual({ label: "Possible", groupLabel: "Possible" });
    expect(VERDICT_LABELS.reach).toEqual({ label: "Reach", groupLabel: "Reach" });
  });
});
