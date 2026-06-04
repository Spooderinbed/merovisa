import { describe, test, expect } from "vitest";
import { mapToProfilePatch } from "@/lib/documents/profile-mapping";

describe("mapToProfilePatch", () => {
  test("maps IELTS extraction to english section", () => {
    const result = mapToProfilePatch("ielts", {
      overall: 7.0, listening: 7.5, reading: 6.5, writing: 6.5, speaking: 7.0,
    });
    expect(result).not.toBeNull();
    expect(result!.section).toBe("english");
    expect(result!.patch.test).toBe("ielts");
    expect(result!.patch.overall).toBe(7.0);
    expect(result!.patch.listening).toBe(7.5);
    expect(result!.patch.reportUploaded).toBe(true);
  });

  test("maps PTE extraction to english section with test=pte", () => {
    const result = mapToProfilePatch("pte", {
      overall: 65, listening: 60, reading: 70, writing: 58, speaking: 62,
    });
    expect(result!.section).toBe("english");
    expect(result!.patch.test).toBe("pte");
  });

  test("maps passport extraction to personal section", () => {
    const result = mapToProfilePatch("passport", { name: "Sushant Bhattarai", dob: "1998-05-15" });
    expect(result!.section).toBe("personal");
    expect(result!.patch.name).toBe("Sushant Bhattarai");
    expect(result!.patch.age).toBeGreaterThan(20);
  });

  test("maps transcript extraction to academic section", () => {
    const result = mapToProfilePatch("bachelors-transcript", {
      institution: "Tribhuvan University", degree: "bachelors", gradePercent: 72,
    });
    expect(result!.section).toBe("academic");
    expect(result!.patch.institution).toBe("Tribhuvan University");
    expect(result!.patch.gradePercent).toBe(72);
  });

  test("maps bank-statement to finance section with proofUploaded", () => {
    const result = mapToProfilePatch("bank-statement", { balance: 3500000, currency: "NPR" });
    expect(result!.section).toBe("finance");
    expect(result!.patch.total).toBe(3500000);
    expect(result!.patch.proofUploaded).toBe(true);
  });

  test("maps employment-letter to work section with docs=true", () => {
    const result = mapToProfilePatch("employment-letter", { title: "Software Engineer", years: 3 });
    expect(result!.section).toBe("work");
    expect(result!.patch.docs).toBe(true);
  });

  test("returns null for store-only kinds", () => {
    expect(mapToProfilePatch("coe", {})).toBeNull();
    expect(mapToProfilePatch("other", {})).toBeNull();
    expect(mapToProfilePatch("national-id", {})).toBeNull();
  });
});
