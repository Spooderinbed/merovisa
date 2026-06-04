import { describe, it, expect } from "vitest";
import { parsePassport } from "@/lib/documents/parsers/passport";

describe("parsePassport", () => {
  it("extracts name and DOB from a standard passport bio page", () => {
    const text = `
      NEPAL
      Surname: THAPA
      Given Name: ROHAN
      Date of Birth: 15/08/1998
      Place of Birth: Kathmandu
    `;
    const result = parsePassport(text);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ROHAN THAPA");
    expect(result!.dob).toBe("1998-08-15");
  });

  it("handles hyphen-separated date format", () => {
    const text = `
      Family Name: SHARMA
      First Name: PRIYA
      Date of Birth: 22-03-2000
    `;
    const result = parsePassport(text);
    expect(result).not.toBeNull();
    expect(result!.dob).toBe("2000-03-22");
  });

  it("handles dot-separated date format", () => {
    const text = `
      Surname: KARKI
      Given Name: BIBEK
      DOB: 05.11.1995
    `;
    const result = parsePassport(text);
    expect(result).not.toBeNull();
    expect(result!.dob).toBe("1995-11-05");
  });

  it("returns null for garbage text", () => {
    expect(parsePassport("IELTS Score: 7.5 Listening: 8.0")).toBeNull();
    expect(parsePassport("")).toBeNull();
    expect(parsePassport("random text with no useful info")).toBeNull();
  });

  it("returns null when name fields are missing", () => {
    const text = `Date of Birth: 10/05/1990 Place of Birth: Pokhara`;
    expect(parsePassport(text)).toBeNull();
  });

  it("returns null when DOB is missing", () => {
    const text = `Surname: GURUNG Given Name: SITA Place of Birth: Lalitpur`;
    expect(parsePassport(text)).toBeNull();
  });

  it("returns null when DOB year is out of plausible range", () => {
    const text = `Surname: TEST Given Name: USER Date of Birth: 01/01/1800`;
    expect(parsePassport(text)).toBeNull();
  });

  it("handles 2-digit year with 2-year expansion", () => {
    // 98 > 50 → 1998
    const text = `
      Surname: BHANDARI
      Given Name: AMIT
      Date of Birth: 10/06/98
    `;
    const result = parsePassport(text);
    expect(result).not.toBeNull();
    expect(result!.dob).toBe("1998-06-10");
  });
});
