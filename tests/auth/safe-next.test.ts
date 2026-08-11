import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * The characters a browser removes from a URL *after* a server has approved it.
 * Written as code points rather than escapes so the test says which byte it
 * means: these are invisible in a diff, and an invisible test case is one a
 * future reader deletes by accident.
 */
const CH = {
  tab: String.fromCharCode(0x09), // %09
  lf: String.fromCharCode(0x0a), // %0a
  cr: String.fromCharCode(0x0d), // %0d
  space: String.fromCharCode(0x20), // a literal space
  nul: String.fromCharCode(0x00),
  c0: String.fromCharCode(0x01), // start of heading
  del: String.fromCharCode(0x7f),
  c1: String.fromCharCode(0x85), // next line (NEL)
};

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

  // The bypass the three prefix checks above are shaped to miss. A browser strips
  // ASCII tab/LF/CR from a URL after the server has approved it, so `/<tab>/evil.com`
  // leaves this guard looking relative — it starts with `/` and does not start with
  // `//` — rides the `Location` header verbatim, and resolves in the browser as
  // `//evil.com`: protocol-relative, off-origin. Reject, never strip — a sanitised
  // value is a value you then have to re-prove.
  it.each([
    ["tab (%09)", `/${CH.tab}/evil.com`],
    ["line feed (%0a)", `/${CH.lf}/evil.com`],
    ["carriage return (%0d)", `/${CH.cr}/evil.com`],
    ["a literal space", `/${CH.space}/evil.com`],
    ["a NUL", `/${CH.nul}/evil.com`],
    ["a C0 control", `/${CH.c0}/evil.com`],
    ["a DEL", `/${CH.del}/evil.com`],
    ["a C1 control", `/${CH.c1}/evil.com`],
  ])("rejects a path whose %s hides a protocol-relative URL", (_label, hostile) => {
    expect(safeNext(hostile)).toBeNull();
  });

  it("rejects whitespace and controls anywhere in the value, not only after the slash", () => {
    expect(safeNext(`/dash${CH.tab}board`)).toBeNull();
    expect(safeNext(`/profile?x=1${CH.lf}`)).toBeNull();
    expect(safeNext(`/profile${CH.space}`)).toBeNull();
    expect(safeNext(`${CH.space}//evil.com`)).toBeNull();
  });

  // The general form of the same disagreement: the value the browser resolves must
  // be the value this guard checked. Anything the URL parser rewrites is a string
  // where server and browser read different destinations, so it is refused rather
  // than normalised. The fallback is `/dashboard`, which is always safe.
  it("rejects values the URL parser rewrites", () => {
    expect(safeNext("/a/../b")).toBeNull();
    expect(safeNext("/café")).toBeNull();
  });

  it("accepts the already-resolved forms a real route produces", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/caf%C3%A9")).toBe("/caf%C3%A9");
    expect(safeNext("/dashboard#section")).toBe("/dashboard#section");
    expect(safeNext("/checklist/abc-123?tab=x&y=2")).toBe("/checklist/abc-123?tab=x&y=2");
  });
});
