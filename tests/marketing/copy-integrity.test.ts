// tests/marketing/copy-integrity.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_PROFILES } from "@/lib/marketing/sample-profiles";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";
import { GUIDE_ANSWERS } from "@/lib/marketing/guide-answers";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

const ALL = JSON.stringify({ SAMPLE_PROFILES, PLAN_STEPS, CHECKLIST_ITEMS, GUIDE_ANSWERS, FRESHNESS_ROWS });

describe("landing copy integrity", () => {
  it("honesty split: samples carry no verification; sourced rows always do", () => {
    for (const p of SAMPLE_PROFILES) {
      expect(p.kind).toBe("sample");
      expect(JSON.stringify(p)).not.toMatch(/verified/i);
    }
    for (const r of FRESHNESS_ROWS) {
      expect(r.kind).toBe("sourced");
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.verified.length).toBeGreaterThan(0);
    }
  });

  it("terminology: no user-facing GTE / Genuine Temporary Entrant anywhere", () => {
    expect(ALL).not.toMatch(/GTE/);
    expect(ALL).not.toMatch(/Genuine Temporary Entrant/);
  });

  it("no em-dash (U+2014) in any copy module", () => {
    expect(ALL).not.toContain("—");
  });
});

describe("landing component copy integrity", () => {
  const dir = join(process.cwd(), "components/marketing");
  // Pre-MV-112 landing components (MV-108 restyle). Superseded by this rebuild:
  // Task 18 stops importing them and Task 19 deletes them. Each is already
  // covered by its own component test, so they are excluded from this rebuild's
  // copy guard. Once Task 19 removes them, this filter becomes a harmless no-op
  // and the guard covers the whole directory.
  const LEGACY_SUPERSEDED = new Set([
    "eyebrow.tsx",
    "hero-preview.tsx",
    "how-it-works.tsx",
    "tile.tsx",
    "trust-callout.tsx",
  ]);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => !LEGACY_SUPERSEDED.has(f));

  it("has marketing component files to guard", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s: no em-dash, no user-facing GTE / Genuine Temporary Entrant", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    // Em-dash (U+2014). The data uses en-dash (U+2013) and ≈, which are allowed.
    expect(src).not.toContain("—");
    // Match the human-readable term only: word-boundary uppercase "GTE" and the
    // full phrase. The internal lowercase object key `gte` must NOT trigger this.
    expect(src).not.toMatch(/\bGTE\b/);
    expect(src).not.toMatch(/Genuine Temporary Entrant/i);
  });
});
