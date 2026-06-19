import { describe, it, expect } from "vitest";
import { AU_RMIT_PROGRAMS } from "@/lib/data/source/au-rmit-programs";
import { AU_UNIVERSITY_PROGRAMS } from "@/lib/data/source/au-university-programs";
import { SEED_PROGRAMS } from "@/lib/programs/seed";
import type { Program } from "@/lib/programs/types";

/**
 * MV-13 anti-drift guard. `lib/programs/seed.ts` is hand-authored, but the bridged
 * rows must faithfully reflect the reviewed TS fact layer (au-rmit-programs.ts /
 * au-university-programs.ts). This test re-derives the expected catalogue shape
 * from the fact layer independently, so a bridged row that stops matching its
 * source fact fails here. It encodes the bridge decision (MV-13 dossier):
 *   - MERGE the 3 true-twin RMIT rows in place (adopt fact tuition/duration/grade/
 *     findingRefs/source; keep their existing English minimums — the fact layer has
 *     none); generated stays false.
 *   - INSERT the genuinely-distinct RMIT bachelor/master rows + the 3 non-Torrens
 *     university programs; generated = true.
 *   - DEFER the 2 RMIT diplomas (never surface — engine targets bachelors/masters
 *     only) and the 5 Torrens rows (no tuition/grade/English → would misrank).
 */

const PROVIDER_TO_UNI: Record<string, string> = {
  "RMIT University": "rmit",
  "University of Technology Sydney": "uts",
  "University of Melbourne": "melbourne",
  "Deakin University": "deakin",
};

const LEVEL_MAP: Record<string, Program["level"]> = {
  bachelor: "bachelors",
  master: "masters",
};

// Free-form fieldOfStudy → catalogue field. The first six match the existing seed
// vocabulary (so engineering/CS/business/etc. field-rank correctly); the rest are
// accurate kebab labels that simply rank neutral (soft-rank only).
const FIELD_MAP: Record<string, string> = {
  "Civil engineering": "engineering",
  "Electrical engineering": "engineering",
  "Mechanical engineering": "engineering",
  "Computer science": "computer-science",
  "Information technology": "computer-science",
  "Cyber security": "computer-science",
  "Data science": "data-science",
  Business: "business",
  Accounting: "accounting",
  Nursing: "nursing",
  Pharmacy: "pharmacy",
  "Social work": "social-work",
  Education: "education",
  "Project management": "project-management",
  "Public health": "public-health",
  "Early childhood education": "early-childhood-education",
};

// fact id → existing seed id, for the 3 rows enriched in place.
const TWINS: Record<string, string> = {
  "bachelor-information-technology": "rmit-bit",
  "master-information-technology": "rmit-mit",
  "master-data-science": "rmit-mds",
};

// fact ids deferred this slice (documented, not dropped).
const DEFERRED = new Set<string>([
  "diploma-nursing",
  "graduate-diploma-early-childhood-education",
  "torrens-bachelor-of-business",
  "torrens-master-of-information-technology-advanced",
  "torrens-master-of-business-administration-advanced",
  "torrens-bachelor-of-information-technology",
  "torrens-master-of-public-health-advanced",
]);

const byId = new Map(SEED_PROGRAMS.map((p) => [p.id, p]));

function seedIdFor(uni: string, factId: string): string {
  if (TWINS[factId]) return TWINS[factId]!;
  return uni === "rmit" ? `rmit-${factId}` : factId;
}

type FactRow = {
  factId: string;
  uni: string;
  seedId: string;
  isTwin: boolean;
  name: string;
  level: Program["level"];
  field: string;
  tuition: number;
  durationYears: number | null;
  minGrade: number | null;
  minEnglish: number | null;
  findingRefs: string[];
};

function rmitRows(): FactRow[] {
  return AU_RMIT_PROGRAMS.filter((p) => !DEFERRED.has(p.id)).map((p) => ({
    factId: p.id,
    uni: "rmit",
    seedId: seedIdFor("rmit", p.id),
    isTwin: Boolean(TWINS[p.id]),
    name: p.programName,
    level: LEVEL_MAP[p.level]!,
    field: FIELD_MAP[p.fieldOfStudy ?? ""] ?? "",
    tuition: p.tuitionAudPerYear,
    durationYears: p.durationYears,
    minGrade: p.entryMinAveragePct ?? null,
    minEnglish: null, // RMIT fact layer carries no English data
    findingRefs: p.provenance.findingRefs,
  }));
}

function uniRows(): FactRow[] {
  return AU_UNIVERSITY_PROGRAMS.filter((p) => !DEFERRED.has(p.id)).map((p) => {
    const uni = PROVIDER_TO_UNI[p.provider]!;
    return {
      factId: p.id,
      uni,
      seedId: seedIdFor(uni, p.id),
      isTwin: Boolean(TWINS[p.id]),
      name: p.programName,
      level: LEVEL_MAP[p.level]!,
      field: FIELD_MAP[p.fieldOfStudy ?? ""] ?? "",
      tuition: p.firstYearTuitionAud ?? 0,
      durationYears: p.durationYears ?? null,
      minGrade: null,
      minEnglish: p.overallMin ?? null,
      findingRefs: p.provenance.findingRefs,
    };
  });
}

const ALL = [...rmitRows(), ...uniRows()];

describe("MV-13 bridge ↔ fact-layer parity", () => {
  it("bridges 22 programs (19 RMIT bachelor/master + 3 non-Torrens university)", () => {
    expect(rmitRows()).toHaveLength(19);
    expect(uniRows()).toHaveLength(3);
  });

  it("every bridged fact program has a seed row", () => {
    for (const f of ALL) {
      expect(byId.has(f.seedId), `missing seed row ${f.seedId} (${f.factId})`).toBe(true);
    }
  });

  it("newly-inserted rows carry the fact data + provenance and are generated", () => {
    for (const f of ALL.filter((r) => !r.isTwin)) {
      const row = byId.get(f.seedId)!;
      expect(row.universityId).toBe(f.uni);
      expect(row.name).toBe(f.name);
      expect(row.level).toBe(f.level);
      expect(row.field).toBe(f.field);
      expect(row.tuitionMin).toBe(f.tuition);
      expect(row.tuitionMax).toBe(f.tuition);
      expect(row.durationYears).toBe(f.durationYears);
      expect(row.minGrade).toBe(f.minGrade);
      expect(row.minEnglish).toBe(f.minEnglish);
      expect(row.findingRefs).toEqual(f.findingRefs);
      expect(row.dataQuality).toBe("primary");
      expect(row.generated).toBe(true);
    }
  });

  it("enriched twin rows adopt fact tuition/duration/findingRefs but keep their English", () => {
    for (const f of ALL.filter((r) => r.isTwin)) {
      const row = byId.get(f.seedId)!;
      expect(row.tuitionMin).toBe(f.tuition);
      expect(row.tuitionMax).toBe(f.tuition);
      expect(row.durationYears).toBe(f.durationYears);
      expect(row.findingRefs).toEqual(f.findingRefs);
      expect(row.minEnglish).not.toBeNull(); // preserved from the generic row
      expect(row.generated).toBe(false);
    }
  });

  it("deferred diplomas and Torrens programs are NOT in the catalogue", () => {
    for (const id of DEFERRED) {
      const rmit = AU_RMIT_PROGRAMS.find((p) => p.id === id);
      const uni = AU_UNIVERSITY_PROGRAMS.find((p) => p.id === id);
      const seedId = rmit ? `rmit-${id}` : id;
      expect(byId.has(seedId), `deferred program leaked into seed: ${seedId}`).toBe(false);
      expect(rmit || uni, `deferred id not found in fact layer: ${id}`).toBeTruthy();
    }
  });
});
