import type { FieldOfStudy, GradeSystem } from "@/lib/scoring/types";

/**
 * Machine-checkable provenance: links a data value back to the research
 * finding(s) it came from (docs/research-briefs/findings/*.jsonl). The
 * reconciliation harness (docs/research-briefs/_tools/reconcile.js) asserts
 * every findingRef exists, is `used`, and that the data matches the finding.
 */
export interface Provenance {
  /** Finding IDs this value is sourced from, e.g. ["B.045"]. At least one. */
  findingRefs: string[];
  /** Source URL/label, used when the wrapped value has no sibling `source`. */
  source?: string;
  /** ISO date (YYYY-MM-DD) the source was last verified. */
  lastVerified?: string;
  /** ISO date the value took regulatory effect, when applicable. */
  effectiveDate?: string;
  /** Freeform note (e.g. why a value is an internal heuristic). */
  note?: string;
}

/** Mixin for data records that declare their finding provenance. */
export interface Sourced {
  provenance: Provenance;
}

export interface SourceCountryData {
  id: string;
  name: string;
  flag: string;
  gradeSystems: GradeSystem[];
  defaultGradeSystem: GradeSystem;
  testCenters: {
    ielts: string[];
  };
  source: string;
  lastVerified: string;
}

export interface DestinationCountryData {
  id: string;
  name: string;
  flag: string;
  tuitionRangeUsd: { min: number; max: number };
  livingRangeUsd: { min: number; max: number };
  englishThreshold: number;
  visaProcessingWeeks: { min: number; max: number };
  intakes: Array<{ name: string; month: number; deadlineWeeksBefore: number }>;
  source: string;
  lastVerified: string;
}

export interface UniversityData {
  id: string;
  country: string;
  name: string;
  city: string;
  rankingTier: 1 | 2 | 3;
  fieldsOffered: FieldOfStudy[];
  tuitionUsdPerYear: { min: number; max: number };
  minGradePercent: number;
  minEnglishScore: number;
  source: string;
  lastVerified: string;
}

export interface FieldOfStudyData {
  id: FieldOfStudy;
  label: string;
  iconKey: string;
}

export type LoanPricing =
  | { kind: "base-spread"; minSpreadPct: number; maxSpreadPct: number }
  | { kind: "fixed"; minRatePct?: number; maxRatePct?: number; effectiveRatePct?: number; effectiveDate?: string };

export interface NepalBankLoan extends Sourced {
  productName?: string;
  minAmountNpr?: number;
  maxAmountNpr?: number;
  maxTenureYears?: number;
  financingRatioPct?: number; // e.g. 100 = up to 100% of study cost
  pricing?: LoanPricing;
  collateralRequired?: boolean;
  notes?: string;
  source: string;
  lastVerified?: string; // ISO date; omitted when the source page is undated
}

export interface NepalBank extends Sourced {
  id: string; // slug, e.g. "himalayan"
  name: string; // official name, e.g. "Himalayan Bank Ltd."
  nrbClass: "A";
  headOffice: string; // e.g. "Kamaladi, Kathmandu"
  branchCount?: number;
  educationLoan?: NepalBankLoan; // present when the bank offers a study-abroad/education loan
  source: string; // NRB Class-A listing URL
  lastVerified?: string;
}
