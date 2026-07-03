import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-90 ratchet: the card shell used to be copy-pasted 55+ times as a raw class
 * string. Every surface-family site now renders through <Card> from
 * components/ui/card — a new raw occurrence is drift back to copy-paste.
 * (The tint/`border-line-2` cousins are excluded: the remaining raw users are
 * form controls and non-card chips owned by future slices.)
 */
const RAW_SHELL = /rounded-(?:md|lg|xl) border border-line bg-surface(?![\w-])/;

// The one legitimate raw occurrence left: guide-chat's <textarea> is a form
// control, not a card — the future Input primitive slice owns it.
const ALLOWED = new Set(["components/guide/guide-chat.tsx"]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("card shell ratchet (MV-90)", () => {
  it("no component hand-rolls the surface card-shell string — render <Card> instead", () => {
    const offenders: string[] = [];
    for (const root of ["components", "app"]) {
      for (const file of tsxFiles(root)) {
        const normalized = file.replace(/\\/g, "/");
        if (ALLOWED.has(normalized)) continue;
        if (RAW_SHELL.test(readFileSync(file, "utf8"))) offenders.push(normalized);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist entry still exists (remove it here once an Input primitive lands)", () => {
    for (const file of ALLOWED) {
      expect(RAW_SHELL.test(readFileSync(file, "utf8"))).toBe(true);
    }
  });
});
