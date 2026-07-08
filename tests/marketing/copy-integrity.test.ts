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

describe("landing component + page copy integrity", () => {
  const dir = join(process.cwd(), "components/marketing");
  // Task 19 deleted the superseded pre-MV-112 components, so the guard now covers
  // the whole marketing component directory (glob via readdirSync) plus the
  // rebuilt page shell. This catches an em-dash / user-facing GTE that lives in
  // JSX copy or a code comment, not just the lib/marketing data modules above.
  const targets = [
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => join(dir, f)),
    join(process.cwd(), "app/(marketing)/page.tsx"),
    // Scoped landing stylesheet: its comments are "landing copy modules" under
    // invariant 7 (no em-dash, including code comments), so guard them too.
    join(process.cwd(), "app/(marketing)/landing.css"),
  ];

  it("has marketing files to guard (components + page)", () => {
    expect(targets.length).toBeGreaterThan(1);
  });

  it.each(targets)("%s: no em-dash, no user-facing GTE / Genuine Temporary Entrant", (file) => {
    const src = readFileSync(file, "utf8");
    // Em-dash (U+2014). The data uses en-dash (U+2013) and ≈, which are allowed.
    expect(src).not.toContain("—");
    // Match the human-readable term only: word-boundary uppercase "GTE" and the
    // full phrase. The internal lowercase object key `gte` must NOT trigger this.
    expect(src).not.toMatch(/\bGTE\b/);
    expect(src).not.toMatch(/Genuine Temporary Entrant/i);
  });
});
