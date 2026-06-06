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
export interface Provenanced {
  provenance: Provenance;
}

/**
 * A single value paired with its provenance — the unit of the sourced config
 * layer (lib/data/scoring-config.ts). The facade re-exports `.value` unwrapped so
 * scoring math stays byte-identical; the provenance rides alongside for
 * explainability and reconciliation against findings.
 */
export interface Sourced<T> {
  value: T;
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

export interface NepalBankLoan extends Provenanced {
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

export interface NepalBank extends Provenanced {
  id: string; // slug, e.g. "himalayan"
  name: string; // official name, e.g. "Himalayan Bank Ltd."
  nrbClass: "A";
  headOffice: string; // e.g. "Kamaladi, Kathmandu"
  branchCount?: number;
  educationLoan?: NepalBankLoan; // present when the bank offers a study-abroad/education loan
  source: string; // NRB Class-A listing URL
  lastVerified?: string;
}

/**
 * A Nepal-side out-of-pocket fee a Subclass 500 applicant pays during the
 * application journey (English test, VFS visa logistics, panel medical).
 * Amounts in NPR. Fact-only data: no scorer reads it; it backs the eventual
 * "cost of applying" breakdown and is reconciled against findings like every
 * other slice.
 */
export interface NepalApplicationFee extends Provenanced {
  id: string; // slug, e.g. "vfs-biometric"
  label: string; // human-readable fee name
  kind: "english-test" | "visa-logistics" | "medical" | "document";
  amountNpr: number;
  source: string; // fee page URL
  lastVerified?: string; // ISO date
}

/**
 * The typical processing turnaround, in working days, for a Nepal-side document
 * a Subclass 500 applicant must obtain, as published by the issuing authority.
 * Companion to NepalApplicationFee: that is the cost dimension of the document
 * journey, this is the time dimension. Fact-only data: no scorer reads it; it
 * backs the eventual "how long applying from Nepal takes" timeline and is
 * reconciled against findings like every other slice.
 */
export interface NepalDocumentProcessingTime extends Provenanced {
  id: string; // slug, e.g. "police-character-urgent"
  label: string; // human-readable service name
  issuer: string; // issuing authority, e.g. "Nepal Police"
  typicalBusinessDays: number; // normal turnaround the issuer publishes, in working days
  source: string; // service/FAQ page URL
  lastVerified?: string; // ISO date
}

/**
 * A payment-method surcharge DHA adds to a visa application charge when it is
 * paid by that method, as a percent of the charge. Fact-only data: no scorer
 * reads it; it backs the eventual "what you'll actually pay" cost breakdown and
 * is reconciled against findings like every other slice.
 */
export interface AuPaymentSurcharge extends Provenanced {
  id: string; // slug, e.g. "visa-card"
  method: string; // payment method, e.g. "Visa card"
  surchargePct: number; // surcharge as a percent of the visa charge
  source: string; // DHA surcharges page URL
  lastVerified?: string; // ISO date
}
