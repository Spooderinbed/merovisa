import { describe, it, expect } from "vitest";
import { first } from "@/lib/http/search-params";

describe("first (repeated search parameter collapse)", () => {
  it("passes a single value through untouched", () => {
    expect(first("/dashboard")).toBe("/dashboard");
    expect(first("")).toBe("");
  });

  it("returns undefined when the parameter is absent", () => {
    expect(first(undefined)).toBeUndefined();
  });

  it("takes the first value of a repeated parameter", () => {
    expect(first(["/a", "/b"])).toBe("/a");
    expect(first(["/a", "/b", "/c"])).toBe("/a");
  });

  // `?next=` with nothing after it can reach a page as `[]`. `value[0]` is
  // `undefined` there, and "absent" is the only honest reading — not `""`,
  // which would be a value the visitor never supplied.
  it("treats an empty array as absent, not as an empty string", () => {
    expect(first([])).toBeUndefined();
  });
});
