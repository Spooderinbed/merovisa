import { describe, it, expect } from "vitest";
import {
  applyPreference,
  parseNearestIntake,
  type PreferenceAdapter,
} from "@/lib/matches/preference";

// Synthetic item + adapter so the engine is tested independently of MatchResult/UniversityMatch.
interface Item {
  id: string;
  band: "strong" | "possible" | "reach";
  tier: number;
  tuition: number | null;
  intake: { at: number; label: string } | null;
  preferenceChip?: { text: string } | null;
}

const adapter: PreferenceAdapter<Item> = {
  band: (i) => i.band,
  signals: (i) => ({ rankingTier: i.tier, tuition: i.tuition, nearestIntake: i.intake }),
  withChip: (i, chip) => ({ ...i, preferenceChip: chip }),
};

const NOW = new Date(2026, 5, 14); // local midnight 14 Jun 2026 — same calendar frame as the impl's local getters
const ids = (items: Item[]) => items.map((i) => i.id);

function item(id: string, over: Partial<Item> = {}): Item {
  return { id, band: "strong", tier: 2, tuition: 30000, intake: null, ...over };
}

describe("applyPreference — null goal", () => {
  it("returns items unchanged and no note", () => {
    const items = [item("a"), item("b")];
    const out = applyPreference(items, null, adapter, NOW);
    expect(out.items).toBe(items);
    expect(out.note).toBeNull();
  });
});

describe("applyPreference — highest-ranked", () => {
  it("sorts by ranking tier ascending within band and chips tier 1 only", () => {
    const items = [
      item("t3", { tier: 3 }),
      item("t1", { tier: 1 }),
      item("t2", { tier: 2 }),
    ];
    const out = applyPreference(items, "highest-ranked", adapter, NOW);
    expect(ids(out.items)).toEqual(["t1", "t2", "t3"]);
    expect(out.items.find((i) => i.id === "t1")!.preferenceChip).toEqual({ text: "Tier-1 ranked" });
    expect(out.items.find((i) => i.id === "t2")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: highest-ranked university." });
  });
});

describe("applyPreference — lowest-cost", () => {
  it("sorts by tuition ascending and chips below the band median", () => {
    const items = [
      item("c30", { tuition: 30000 }),
      item("c10", { tuition: 10000 }),
      item("c20", { tuition: 20000 }),
    ];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["c10", "c20", "c30"]);
    // median of [10000,20000,30000] = 20000; strictly-below = only 10000
    expect(out.items.find((i) => i.id === "c10")!.preferenceChip).toEqual({ text: "Lower tuition" });
    expect(out.items.find((i) => i.id === "c20")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: lowest total cost." });
  });

  it("sorts null tuition last and never chips it", () => {
    const items = [item("none", { tuition: null }), item("c10", { tuition: 10000 })];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["c10", "none"]);
    expect(out.items.find((i) => i.id === "none")!.preferenceChip).toBeNull();
  });
});

describe("applyPreference — fastest-admission", () => {
  const soon = { at: new Date(2026, 7, 1).getTime(), label: "Aug 2026" }; // ~2 months
  const far = { at: new Date(2027, 4, 1).getTime(), label: "May 2027" }; // ~11 months

  it("sorts by nearest intake, chips within 6 months only, ranked note when rankable", () => {
    const items = [item("far", { intake: far }), item("soon", { intake: soon })];
    const out = applyPreference(items, "fastest-admission", adapter, NOW);
    expect(ids(out.items)).toEqual(["soon", "far"]);
    expect(out.items.find((i) => i.id === "soon")!.preferenceChip).toEqual({ text: "Next intake — Aug 2026" });
    expect(out.items.find((i) => i.id === "far")!.preferenceChip).toBeNull();
    expect(out.note).toEqual({ kind: "ranked", text: "Ordered by your priority: fastest admission." });
  });

  it("defers with the university-level note when no item has intake data", () => {
    const items = [item("a", { intake: null }), item("b", { intake: null })];
    const out = applyPreference(items, "fastest-admission", adapter, NOW);
    expect(ids(out.items)).toEqual(["a", "b"]); // unchanged
    expect(out.note).toEqual({
      kind: "deferred",
      text: "Intake timing is shared across these university-level results, so these matches stay ordered by eligibility. Program-level intake sorting appears after sign-in.",
    });
  });

  it("does not chip a 7-months-out intake when now is end-of-month (no Date overflow)", () => {
    const endOfAug = new Date(2026, 7, 31); // 31 Aug 2026
    const mar = { at: new Date(2027, 2, 1).getTime(), label: "Mar 2027" }; // 7 months out
    const out = applyPreference([item("mar", { intake: mar })], "fastest-admission", adapter, endOfAug);
    expect(out.items[0]!.preferenceChip).toBeNull();
  });
});

describe("applyPreference — never crosses bands", () => {
  it("keeps a cheap reach below an expensive strong", () => {
    const items = [
      item("reach-cheap", { band: "reach", tuition: 1000 }),
      item("strong-pricey", { band: "strong", tuition: 99000 }),
    ];
    const out = applyPreference(items, "lowest-cost", adapter, NOW);
    expect(ids(out.items)).toEqual(["strong-pricey", "reach-cheap"]);
  });
});

describe("applyPreference — deferred goals", () => {
  it("PR yields the 485 context note and no reorder/chips", () => {
    const items = [item("a", { tier: 3 }), item("b", { tier: 1 })];
    const out = applyPreference(items, "permanent-residency", adapter, NOW);
    expect(ids(out.items)).toEqual(["a", "b"]); // unchanged
    expect(out.items.every((i) => !i.preferenceChip)).toBe(true);
    expect(out.note?.kind).toBe("pr-context");
    if (out.note?.kind === "pr-context") {
      expect(out.note.linkText).toBe("Subclass 485 Temporary Graduate visa");
      expect(out.note.after).toContain("stay ordered by eligibility");
      expect(out.note.source.href).toContain("temporary-graduate-485");
    }
  });

  it("employment and research yield the program-level deferred note", () => {
    expect(applyPreference([item("a")], "best-employment", adapter, NOW).note).toEqual({
      kind: "deferred",
      text: "We don't yet have program-level employment data, so these matches stay ordered by eligibility.",
    });
    expect(applyPreference([item("a")], "research", adapter, NOW).note).toEqual({
      kind: "deferred",
      text: "We don't yet have program-level research data, so these matches stay ordered by eligibility.",
    });
  });
});

describe("parseNearestIntake", () => {
  it("picks the soonest upcoming month, rolling past months to next year", () => {
    // now = 14 Jun 2026; "feb" already passed this year -> Feb 2027
    expect(parseNearestIntake(["feb"], NOW)).toEqual({
      at: new Date(2027, 1, 1).getTime(),
      label: "Feb 2027",
    });
    // "jul" is upcoming this year -> Jul 2026
    expect(parseNearestIntake(["jul"], NOW)).toEqual({
      at: new Date(2026, 6, 1).getTime(),
      label: "Jul 2026",
    });
  });

  it("chooses the nearest among several tokens", () => {
    const r = parseNearestIntake(["feb", "jul", "oct"], NOW);
    expect(r?.label).toBe("Jul 2026");
  });

  it("returns null for empty or unparseable tokens", () => {
    expect(parseNearestIntake([], NOW)).toBeNull();
    expect(parseNearestIntake(["someday"], NOW)).toBeNull();
  });

  it("excludes the current month regardless of time of day", () => {
    const midJulAfternoon = new Date(2026, 6, 15, 14, 30); // 15 Jul 2026, 14:30
    expect(parseNearestIntake(["jul"], midJulAfternoon)).toEqual({
      at: new Date(2027, 6, 1).getTime(),
      label: "Jul 2027",
    });
    expect(parseNearestIntake(["aug"], midJulAfternoon)).toEqual({
      at: new Date(2026, 7, 1).getTime(),
      label: "Aug 2026",
    });
  });
});
