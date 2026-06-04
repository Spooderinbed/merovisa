import { describe, test, expect } from "vitest";
import { bandFor, bandLabel } from "@/lib/scoring/band";

describe("bandFor", () => {
  test("boundaries", () => {
    expect(bandFor(0)).toBe("weak");
    expect(bandFor(24)).toBe("weak");
    expect(bandFor(25)).toBe("building");
    expect(bandFor(49)).toBe("building");
    expect(bandFor(50)).toBe("solid");
    expect(bandFor(74)).toBe("solid");
    expect(bandFor(75)).toBe("strong");
    expect(bandFor(100)).toBe("strong");
  });
});

describe("bandLabel", () => {
  test("labels match bands", () => {
    expect(bandLabel(80)).toBe("Strong");
    expect(bandLabel(60)).toBe("Solid");
    expect(bandLabel(30)).toBe("Building");
    expect(bandLabel(10)).toBe("Needs work");
  });
});
