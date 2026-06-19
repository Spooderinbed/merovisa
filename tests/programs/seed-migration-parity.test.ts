import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SEED_UNIVERSITIES, SEED_PROGRAMS } from "@/lib/programs/seed";
import type { Program } from "@/lib/programs/types";
import { parseInsertBlock, type SqlValue } from "./parse-seed-migration";

// The runtime `/matches` data lives in the Supabase programs/universities tables,
// populated by these migrations. `lib/programs/seed.ts` is a parallel hand-authored
// TS copy consumed only by the seed test. Nothing else keeps them in sync — so this
// guard fails the moment the two diverge. The live program catalogue is the seed
// migration overlaid by the MV-13 bridge migration (which adds columns, enriches 3
// rows in place, and upserts 19 verified programs), so parity is checked against the
// merged final state.
const SEED_MIGRATION = "20260604120000_seed_universities_and_programs.sql";
const BRIDGE_MIGRATION = "20260619000000_bridge_fact_layer_programs.sql";

function readMigration(file: string): string {
  const here = dirname(fileURLToPath(import.meta.url)); // tests/programs
  return readFileSync(join(here, "..", "..", "supabase", "migrations", file), "utf8");
}

const byId = (rows: ReadonlyArray<{ id: string }>): Record<string, unknown> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

const sqlUniversities = () =>
  parseInsertBlock(readMigration(SEED_MIGRATION), "public.universities").map((r) => ({
    id: r.id as string,
    country: r.country,
    name: r.name,
    city: r.city,
    rankingTier: r.ranking_tier,
    source: r.source,
    lastVerified: r.last_verified,
    dataQuality: r.data_quality,
  }));

// One parsed SQL program row → the camelCase comparison shape. The 3 MV-13 columns
// default to null/[]/false on the pre-bridge rows (which never list them).
const mapSqlProgram = (r: Record<string, SqlValue>) => ({
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
  durationYears: r.duration_years ?? null,
  findingRefs: r.finding_refs ?? [],
  generated: r.generated ?? false,
});

// SEED_PROGRAMS row → the same shape (the 3 MV-13 fields are optional on generic rows).
const seedProgramShape = (p: Program) => ({
  id: p.id,
  universityId: p.universityId,
  name: p.name,
  level: p.level,
  field: p.field,
  tuitionMin: p.tuitionMin,
  tuitionMax: p.tuitionMax,
  tuitionCurrency: p.tuitionCurrency,
  minGrade: p.minGrade,
  minEnglish: p.minEnglish,
  minEnglishBand: p.minEnglishBand,
  intakes: p.intakes,
  source: p.source,
  lastVerified: p.lastVerified,
  dataQuality: p.dataQuality,
  notes: p.notes,
  durationYears: p.durationYears ?? null,
  findingRefs: p.findingRefs ?? [],
  generated: p.generated ?? false,
});

// Final DB program state = seed migration (base) overlaid by bridge migration (upserts win on id).
const finalSqlPrograms = () => {
  const base = parseInsertBlock(readMigration(SEED_MIGRATION), "public.programs").map(mapSqlProgram);
  const bridge = parseInsertBlock(readMigration(BRIDGE_MIGRATION), "public.programs").map(mapSqlProgram);
  const merged = new Map(base.map((r) => [r.id, r]));
  for (const r of bridge) merged.set(r.id as string, r);
  return [...merged.values()];
};

describe("seed migration ↔ seed.ts parity", () => {
  it("parses a bridged program row from the bridge migration", () => {
    const row = parseInsertBlock(readMigration(BRIDGE_MIGRATION), "public.programs").find(
      (p) => p.id === "deakin-master-of-data-science",
    );
    expect(row).toEqual({
      id: "deakin-master-of-data-science",
      university_id: "deakin",
      name: "Master of Data Science",
      level: "masters",
      field: "data-science",
      tuition_min: 34400,
      tuition_max: 34400,
      tuition_currency: "AUD",
      min_grade: null,
      min_english: null,
      min_english_band: null,
      intakes: [],
      source: "https://www.deakin.edu.au/course/master-data-science",
      last_verified: "2026-06-07",
      data_quality: "primary",
      notes: null,
      duration_years: null,
      finding_refs: ["E.049"],
      generated: true,
    });
  });

  it("universities in the migration match SEED_UNIVERSITIES exactly", () => {
    expect(byId(sqlUniversities())).toEqual(byId(SEED_UNIVERSITIES));
  });

  it("final program state (seed + bridge migrations) matches SEED_PROGRAMS exactly", () => {
    expect(byId(finalSqlPrograms())).toEqual(byId(SEED_PROGRAMS.map(seedProgramShape)));
  });
});
