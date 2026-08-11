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

  // The shape `?next=` really produces, and the one place absent and empty part
  // company: the visitor supplied a value, so `first` hands it on. `safeNext`
  // rejects `""` a moment later — deciding that is its job, not this one's.
  it("keeps the empty string of `?next=` as a value, rather than reading it as absent", () => {
    expect(first("")).toBe("");
    expect(first(["", "/b"])).toBe("");
  });

  it("takes the first value of a repeated parameter", () => {
    expect(first(["/a", "/b"])).toBe("/a");
    expect(first(["/a", "/b", "/c"])).toBe("/a");
  });

  // The three shapes a query string can actually take, measured rather than
  // asserted — `[]` is not among them, so a doc comment claiming `?next=`
  // produces one cannot creep back in unnoticed.
  it("maps a query string onto exactly three shapes, none of them an empty array", () => {
    const shape = (qs: string) => new URLSearchParams(qs).getAll("next");
    expect(shape("other=1")).toEqual([]); // absent -> the key is missing entirely
    expect(shape("next=")).toEqual([""]); // `?next=` -> one empty string
    expect(shape("next=/a")).toEqual(["/a"]);
    expect(shape("next=&next=")).toEqual(["", ""]);
    expect(shape("next=/a&next=/b")).toEqual(["/a", "/b"]);
  });

  // `[]` cannot come from a URL, but it inhabits `SearchParamValue` and a
  // non-URL caller can build one. `undefined` is the only honest answer to
  // "which value" when there is none.
  it("treats an empty array as absent, not as an empty string", () => {
    expect(first([])).toBeUndefined();
  });
});
