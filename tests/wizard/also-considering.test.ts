import { describe, it, expect } from "vitest";
import {
  reconcileAlsoConsidering,
  toggleAlsoConsidering,
  ALSO_CONSIDERING_CAP,
} from "@/lib/wizard/also-considering";

describe("reconcileAlsoConsidering", () => {
  it("drops the primary from the extras (they must stay disjoint)", () => {
    expect(reconcileAlsoConsidering("computer-science", ["business", "computer-science"])).toEqual([
      "business",
    ]);
  });

  it("dedupes repeated extras", () => {
    expect(reconcileAlsoConsidering("computer-science", ["business", "business"])).toEqual(["business"]);
  });

  it("caps the list at the limit", () => {
    expect(
      reconcileAlsoConsidering("computer-science", ["business", "nursing", "law"]),
    ).toEqual(["business", "nursing"]);
    expect(ALSO_CONSIDERING_CAP).toBe(2);
  });

  it("handles an undefined primary (nothing to drop)", () => {
    expect(reconcileAlsoConsidering(undefined, ["business", "nursing"])).toEqual(["business", "nursing"]);
  });
});

describe("toggleAlsoConsidering", () => {
  it("adds a field when under the cap", () => {
    expect(toggleAlsoConsidering([], "business", "computer-science")).toEqual(["business"]);
  });

  it("removes a field that is already selected", () => {
    expect(toggleAlsoConsidering(["business"], "business", "computer-science")).toEqual([]);
  });

  it("refuses to also-consider the primary (your main choice)", () => {
    expect(toggleAlsoConsidering(["business"], "computer-science", "computer-science")).toEqual([
      "business",
    ]);
  });

  it("refuses to exceed the cap when adding", () => {
    expect(toggleAlsoConsidering(["business", "nursing"], "law", "computer-science")).toEqual([
      "business",
      "nursing",
    ]);
  });

  it("still removes when already at the cap", () => {
    expect(toggleAlsoConsidering(["business", "nursing"], "business", "computer-science")).toEqual([
      "nursing",
    ]);
  });
});
