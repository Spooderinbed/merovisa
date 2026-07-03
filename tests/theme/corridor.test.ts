import { describe, it, expect } from "vitest";
import { CORRIDORS, DEFAULT_CORRIDOR, corridorForHomeCountry } from "@/lib/theme/corridor";

describe("corridor registry (MV-96)", () => {
  it("resolves Nepal to the np-au corridor, case- and whitespace-insensitively", () => {
    expect(corridorForHomeCountry("Nepal")).toBe("np-au");
    expect(corridorForHomeCountry("nepal")).toBe("np-au");
    expect(corridorForHomeCountry(" NEPAL ")).toBe("np-au");
  });

  it("returns null (neutral global brand) for unknown or missing home countries", () => {
    expect(corridorForHomeCountry("Canada")).toBeNull();
    expect(corridorForHomeCountry("")).toBeNull();
    expect(corridorForHomeCountry(undefined)).toBeNull();
    expect(corridorForHomeCountry(null)).toBeNull();
  });

  it("registers the np-au corridor with its danphe mascot variant", () => {
    expect(CORRIDORS["np-au"]).toMatchObject({ id: "np-au", mascotVariant: "danphe" });
    expect(DEFAULT_CORRIDOR).toBe("np-au");
  });
});
