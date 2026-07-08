// tests/marketing/checklist-items.test.ts
import { describe, it, expect } from "vitest";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";

describe("checklist items", () => {
  it("ships exactly six items with exactly two done at rest", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(6);
    expect(CHECKLIST_ITEMS.filter((i) => i.done)).toHaveLength(2);
  });

  it("every item carries a source label", () => {
    for (const i of CHECKLIST_ITEMS) expect(i.source).toMatch(/·\s*\w+\s*\d{4}$/);
  });

  it("uses Genuine Student (GS), never GTE", () => {
    const blob = JSON.stringify(CHECKLIST_ITEMS);
    expect(blob).not.toMatch(/GTE/);
    expect(blob).toMatch(/Genuine Student \(GS\)/);
  });
});
