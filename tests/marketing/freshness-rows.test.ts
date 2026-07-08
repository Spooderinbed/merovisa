// tests/marketing/freshness-rows.test.ts
import { describe, it, expect } from "vitest";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

describe("freshness rows", () => {
  it("ships exactly five sourced rows, each verified Jun 2026 / next check Jul 2026", () => {
    expect(FRESHNESS_ROWS).toHaveLength(5);
    for (const r of FRESHNESS_ROWS) {
      expect(r.kind).toBe("sourced");
      expect(r.source).toBeTruthy();
      expect(r.verified).toBe("Jun 2026");
      expect(r.nextCheck).toBe("Jul 2026");
    }
  });

  it("pins the exact sourced figures (fabrication guard)", () => {
    const byKey = Object.fromEntries(FRESHNESS_ROWS.map((r) => [r.key, r]));
    expect(byKey["Living-cost requirement"]!.value).toBe("A$29,710");
    expect(byKey["Living-cost requirement"]!.source).toBe("Home Affairs");
    expect(byKey["Genuine Student (GS)"]!.value).toBe("s.500 criteria");
    expect(byKey["Avg. first-year tuition"]!.value).toBe("≈ A$33,000");
    expect(byKey["Post-study work (485)"]!.value).toBe("2–4 years");
    expect(byKey["Health cover (OSHC)"]!.value).toBe("required");
  });

  it("never ships user-facing GTE", () => {
    expect(JSON.stringify(FRESHNESS_ROWS)).not.toMatch(/GTE|Genuine Temporary Entrant/);
  });
});
