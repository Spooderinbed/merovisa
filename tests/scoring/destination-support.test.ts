import { describe, it, expect } from "vitest";
import {
  DESTINATIONS,
  SUPPORTED_DESTINATIONS,
  isDestinationSupported,
} from "@/lib/scoring/types";

describe("destination support", () => {
  it("supports exactly australia today", () => {
    expect(SUPPORTED_DESTINATIONS).toEqual(["australia"]);
  });

  it("isDestinationSupported is true only for supported destinations", () => {
    expect(isDestinationSupported("australia")).toBe(true);
    for (const d of DESTINATIONS.filter((d) => d !== "australia")) {
      expect(isDestinationSupported(d)).toBe(false);
    }
  });
});
