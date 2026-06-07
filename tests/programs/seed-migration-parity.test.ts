import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEED_UNIVERSITIES, SEED_PROGRAMS } from "@/lib/programs/seed";
import { parseInsertBlock } from "./parse-seed-migration";

// The runtime `/matches` data lives in the Supabase programs/universities tables,
// populated by this migration. `lib/programs/seed.ts` is a parallel hand-authored
// TS copy consumed only by the seed test. Nothing else keeps them in sync — so
// this guard fails the moment the two diverge in count or value.
const MIGRATION = "20260604120000_seed_universities_and_programs.sql";

function readMigration(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/programs
  return readFileSync(join(here, "..", "..", "supabase", "migrations", MIGRATION), "utf8");
}

const byId = (rows: ReadonlyArray<{ id: string }>): Record<string, unknown> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

const sqlUniversities = () =>
  parseInsertBlock(readMigration(), "public.universities").map((r) => ({
    id: r.id as string,
    country: r.country,
    name: r.name,
    city: r.city,
    rankingTier: r.ranking_tier,
    source: r.source,
    lastVerified: r.last_verified,
    dataQuality: r.data_quality,
  }));

const sqlPrograms = () =>
  parseInsertBlock(readMigration(), "public.programs").map((r) => ({
    id: r.id as string,
    universityId: r.university_id,
    name: r.name,
    level: r.level,
    field: r.field,
    tuitionMin: r.tuition_min,
    tuitionMax: r.tuition_max,
    tuitionCurrency: r.tuition_currency,
    minGrade: r.min_grade,
    minEnglish: r.min_english,
    minEnglishBand: r.min_english_band,
    intakes: r.intakes,
    source: r.source,
    lastVerified: r.last_verified,
    dataQuality: r.data_quality,
    notes: r.notes,
  }));

describe("seed migration ↔ seed.ts parity", () => {
  it("parses a known program row from the migration SQL", () => {
    const rmitBit = parseInsertBlock(readMigration(), "public.programs").find((p) => p.id === "rmit-bit");
    expect(rmitBit).toEqual({
      id: "rmit-bit",
      university_id: "rmit",
      name: "Bachelor of IT",
      level: "bachelors",
      field: "computer-science",
      tuition_min: 38400,
      tuition_max: 38400,
      tuition_currency: "AUD",
      min_grade: 65,
      min_english: 6.5,
      min_english_band: 6,
      intakes: ["feb", "jul"],
      source: "https://www.rmit.edu.au",
      last_verified: "2026-06-04",
      data_quality: "primary",
      notes: null,
    });
  });

  it("universities in the migration match SEED_UNIVERSITIES exactly", () => {
    expect(byId(sqlUniversities())).toEqual(byId(SEED_UNIVERSITIES));
  });

  it("programs in the migration match SEED_PROGRAMS exactly", () => {
    expect(byId(sqlPrograms())).toEqual(byId(SEED_PROGRAMS));
  });
});
