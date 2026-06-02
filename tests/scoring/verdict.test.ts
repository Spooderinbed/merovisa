import { describe, it, expect } from "vitest";
import { mapVerdict } from "@/lib/scoring/verdict";

describe("mapVerdict", () => {
  it("returns 'strong' when weighted >= 72 and all dimensions >= 50", () => {
    const v = mapVerdict({ weighted: 78, dimensions: [75, 70, 80, 72] });
    expect(v).toBe("strong");
  });

  it("returns 'possible' when weighted in [50, 72) and all dimensions >= 30", () => {
    const v = mapVerdict({ weighted: 60, dimensions: [55, 60, 65, 50] });
    expect(v).toBe("possible");
  });

  it("returns 'reach' when weighted < 50", () => {
    const v = mapVerdict({ weighted: 42, dimensions: [40, 45, 50, 40] });
    expect(v).toBe("reach");
  });

  it("returns 'possible' (not 'strong') if any single dimension is below 50", () => {
    const v = mapVerdict({ weighted: 75, dimensions: [85, 85, 85, 45] });
    expect(v).toBe("possible");
  });

  it("returns 'reach' if any single dimension is below 30", () => {
    const v = mapVerdict({ weighted: 60, dimensions: [70, 70, 70, 25] });
    expect(v).toBe("reach");
  });
});
