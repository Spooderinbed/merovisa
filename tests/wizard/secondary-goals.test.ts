import { describe, it, expect } from "vitest";
import {
  reconcileSecondaryGoals,
  toggleSecondaryGoal,
  SECONDARY_GOALS_CAP,
} from "@/lib/wizard/secondary-goals";

describe("reconcileSecondaryGoals", () => {
  it("drops the primary from the secondaries (they must stay disjoint)", () => {
    expect(
      reconcileSecondaryGoals("permanent-residency", ["lowest-cost", "permanent-residency"]),
    ).toEqual(["lowest-cost"]);
  });

  it("dedupes repeated secondaries", () => {
    expect(reconcileSecondaryGoals("permanent-residency", ["lowest-cost", "lowest-cost"])).toEqual([
      "lowest-cost",
    ]);
  });

  it("preserves order (first occurrence wins)", () => {
    expect(
      reconcileSecondaryGoals("permanent-residency", ["highest-ranked", "lowest-cost"]),
    ).toEqual(["highest-ranked", "lowest-cost"]);
  });

  it("caps the list at the limit", () => {
    expect(
      reconcileSecondaryGoals("permanent-residency", [
        "lowest-cost",
        "highest-ranked",
        "fastest-admission",
      ]),
    ).toEqual(["lowest-cost", "highest-ranked"]);
    expect(SECONDARY_GOALS_CAP).toBe(2);
  });
});

describe("toggleSecondaryGoal", () => {
  it("adds a goal when under the cap", () => {
    expect(toggleSecondaryGoal([], "lowest-cost", "permanent-residency")).toEqual(["lowest-cost"]);
  });

  it("removes a goal that is already selected", () => {
    expect(toggleSecondaryGoal(["lowest-cost"], "lowest-cost", "permanent-residency")).toEqual([]);
  });

  it("refuses to also-aim-for the primary (your main choice)", () => {
    expect(
      toggleSecondaryGoal(["lowest-cost"], "permanent-residency", "permanent-residency"),
    ).toEqual(["lowest-cost"]);
  });

  it("refuses to exceed the cap when adding", () => {
    expect(
      toggleSecondaryGoal(["lowest-cost", "highest-ranked"], "fastest-admission", "permanent-residency"),
    ).toEqual(["lowest-cost", "highest-ranked"]);
  });

  it("still removes when already at the cap", () => {
    expect(
      toggleSecondaryGoal(["lowest-cost", "highest-ranked"], "lowest-cost", "permanent-residency"),
    ).toEqual(["highest-ranked"]);
  });
});
