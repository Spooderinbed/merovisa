import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext", () => {
  it("returns the path when it's a clean relative path", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/profile?x=1")).toBe("/profile?x=1");
  });

  it("returns null for null/undefined/empty", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext("")).toBeNull();
  });

  it("rejects fully-qualified URLs", () => {
    expect(safeNext("https://attacker.com/path")).toBeNull();
    expect(safeNext("http://attacker.com/path")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//attacker.com/path")).toBeNull();
  });

  it("rejects backslash-prefixed paths (Windows protocol-relative)", () => {
    expect(safeNext("/\\attacker.com")).toBeNull();
  });
});
