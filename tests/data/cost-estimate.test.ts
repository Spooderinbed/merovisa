import { describe, it, expect } from "vitest";
import { selectCostEstimate } from "@/lib/data/cost-estimate";

describe("selectCostEstimate", () => {
  const est = selectCostEstimate();

  it("composes the four first-year AUD cost lines (tuition, living, OSHC, visa)", () => {
    expect(est.currency).toBe("AUD");
    const labels = est.lines.map((l) => l.label.toLowerCase());
    expect(labels.some((l) => /tuition/.test(l))).toBe(true);
    expect(labels.some((l) => /living/.test(l))).toBe(true);
    expect(labels.some((l) => /oshc|health cover/.test(l))).toBe(true);
    expect(labels.some((l) => /visa charge/.test(l))).toBe(true);
    est.lines.forEach((l) => expect(l.currency).toBe("AUD"));
  });

  it("anchors living + visa on their DHA gov sources", () => {
    const living = est.lines.find((l) => /living/i.test(l.label))!;
    expect(living.amount).toBe(29_710);
    expect(living.source).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
    const visa = est.lines.find((l) => /visa charge/i.test(l.label))!;
    expect(visa.amount).toBe(2_500);
    expect(visa.source).toMatch(/^https:\/\/immi\.homeaffairs\.gov\.au/);
  });

  it("presents OSHC as a range across the published provider rate cards, linked to a rate card", () => {
    const oshc = est.lines.find((l) => /oshc|health cover/i.test(l.label))!;
    expect(oshc.amount).toBe(680); // nib — cleanest/min published rate
    expect(oshc.amountMax).toBe(949); // Medibank — max published rate
    expect(oshc.amountMax!).toBeGreaterThan(oshc.amount);
    expect(oshc.source).toMatch(/^https?:\/\//);
  });

  it("totals the fixed lines plus the OSHC range into a min–max band", () => {
    expect(est.totalMin).toBe(77_390); // 44500 + 29710 + 2500 + 680
    expect(est.totalMax).toBe(77_659); // 44500 + 29710 + 2500 + 949
    expect(est.totalMax).toBeGreaterThan(est.totalMin);
  });

  it("labels the representative tuition honestly — no fabricated government source", () => {
    const tuition = est.lines.find((l) => /tuition/i.test(l.label))!;
    expect(tuition.amount).toBe(44_500);
    expect(tuition.source).not.toMatch(/^https?:\/\//); // heuristic median, not a single published figure
    expect(tuition.note).toMatch(/representative/i);
  });
});
