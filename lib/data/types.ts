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

/**
 * The base (primary-applicant) application charge for an Australian skilled or
 * employer-sponsored visa subclass, in AUD — the "from" figure DHA publishes on
 * the visa-listing page. Fact-only data: no scorer reads it; it backs the
 * eventual post-study visa-pathway cost view and is reconciled against findings
 * like every other slice.
 */
export interface AuSkilledVisaCharge extends Provenanced {
  id: string; // slug, e.g. "skilled-491"
  subclass: number; // visa subclass number, e.g. 491
  visaName: string; // official visa name
  baseFeeAud: number; // base application charge, primary applicant ("from")
  source: string; // DHA visa-listing page URL
  lastVerified?: string; // ISO date
}

/**
 * An IOM Nepal health-assessment fee a Subclass 500 applicant pays for the panel
 * medical, in USD (IOM Nepal publishes this schedule in USD, not NPR). Fact-only
 * data: no scorer reads it; it backs the "cost of applying from Nepal" breakdown
 * alongside NepalApplicationFee, and is reconciled against findings.
 */
export interface IomNepalHealthFee extends Provenanced {
  id: string; // slug, e.g. "hiv-707"
  label: string; // human-readable line item
  examCode?: string; // IOM exam code where the schedule lists one, e.g. "501"
  amountUsd: number;
  source: string; // IOM Nepal schedule PDF URL
  lastVerified?: string; // ISO date
}

/**
 * A university-published recommendation for how much cash (or accessible funds) a
 * newly-arrived student should bring to Australia, in AUD. Fact-only data: no
 * scorer reads it; it backs the eventual arrival-prep guidance and is reconciled
 * against findings like every other slice.
 */
export interface AuArrivalCashGuidance extends Provenanced {
  id: string; // slug, e.g. "usyd-cash-on-arrival"
  publisher: string; // university making the recommendation
  context: "cash-on-person" | "bank-account" | "first-weeks";
  amountAud: number;
  qualifier: "minimum" | "up-to" | "approximate";
  source: string; // guidance page URL
  lastVerified?: string; // ISO date
}

/**
 * An ATO tax figure relevant to a student worker — a threshold (AUD), a rate (%),
 * or a turnaround (days). One numeric `value` with its `unit`. Fact-only data: no
 * scorer reads it; it backs the eventual working/tax guidance and is reconciled
 * against findings like every other slice.
 */
export interface AuTaxFigure extends Provenanced {
  id: string; // slug, e.g. "tax-free-threshold"
  label: string; // human-readable figure name
  value: number; // the figure
  unit: "AUD" | "%" | "days";
  source: string; // ATO page URL
  lastVerified?: string; // ISO date
}

/**
 * A state public-transport concession fact for international/tertiary students —
 * a card fee (0 = free), a card validity, a percentage saving, or a flat fare.
 * Only the field matching `concessionType` is set. Fact-only data: no scorer
 * reads it; it backs the eventual arrival/settlement cost guidance and is
 * reconciled against findings like every other slice.
 */
export interface AuTransportConcession extends Provenanced {
  id: string; // slug, e.g. "act-myway-tertiary"
  state: "NSW" | "VIC" | "QLD" | "ACT";
  label: string; // human-readable concession
  concessionType: "card-fee" | "card-validity" | "percentage-saving" | "flat-fare";
  amountAud?: number; // card-fee (0 = free) or flat-fare
  validityMonths?: number; // card-validity
  discountPct?: number; // percentage-saving
  source: string; // transport-authority page URL
  lastVerified?: string; // ISO date
}

/** A government-funded inclusion of the Australia Awards Scholarship. */
export type AustraliaAwardsBenefit =
  | "full-tuition"
  | "return-airfare"
  | "oshc"
  | "living-stipend";

/**
 * The Australia Awards Scholarship as offered to Nepal — DFAT's fully-funded
 * award for Master's study in Australia. Captures the government-funded
 * inclusions (`benefits`), the eligible study level, and the published
 * application window. Fact-only data: no scorer reads it; it backs the eventual
 * scholarships view and is reconciled against findings like every other slice.
 * The stipend's dollar amount is intentionally not modeled (DFAT sets it by
 * policy and revises it annually) — only its existence is recorded as a benefit.
 */
export interface AustraliaAwardsScholarship extends Provenanced {
  id: string; // slug, e.g. "australia-awards-nepal"
  name: string; // official scholarship name
  country: string; // recipient-country scope, e.g. "Nepal"
  studyLevel: "masters"; // eligible study level (Nepal Awards fund Master's only)
  benefits: AustraliaAwardsBenefit[]; // government-funded inclusions
  applicationOpens: string; // ISO date the application window opens
  applicationCloses: string; // ISO date the window closes (the published deadline)
  source: string; // DFAT information-for-intake PDF URL
  lastVerified?: string; // ISO date
}

/**
 * A single numeric limit or key figure governing the Australian student-visa
 * journey — a maximum stay, a work-hour cap, a processing-time median, or a
 * Genuine Student application constraint — as published by the Department of
 * Home Affairs. One numeric `value` with its `unit`. Fact-only data: no scorer
 * reads it; it backs the eventual visa-conditions view and is reconciled against
 * findings like every other slice.
 */
export interface AuStudentVisaLimit extends Provenanced {
  id: string; // slug, e.g. "subclass-500-max-stay"
  subclass: 500 | 590; // visa subclass the limit governs
  kind: "stay-period" | "work-limit" | "processing-time" | "application-limit";
  appliesTo: "student" | "family-member" | "guardian"; // who the limit governs
  label: string; // human-readable limit name
  value: number; // the numeric limit
  unit: "years" | "hours-per-fortnight" | "days" | "words";
  source: string; // DHA page URL
  lastVerified?: string; // ISO date
}

/**
 * A wage or superannuation figure a student worker in Australia needs: the super
 * guarantee rate (a percent), or an hourly wage (AUD) — the National Minimum
 * Wage or a named-award penalty rate. Each record sets exactly one rate field:
 * `ratePct` for the super guarantee, `hourlyRateAud` for wages. Fact-only data:
 * no scorer reads it; it backs the eventual working-in-Australia guidance and is
 * reconciled against findings like every other slice.
 */
export interface AuWorkerWage extends Provenanced {
  id: string; // slug, e.g. "super-guarantee-rate"
  label: string; // human-readable figure name
  wageType: "super-guarantee" | "national-minimum-wage" | "award-penalty";
  ratePct?: number; // set only when wageType is "super-guarantee"
  hourlyRateAud?: number; // set only for a wage (national-minimum-wage or award-penalty)
  award?: string; // award name, set only for "award-penalty"
  penaltyDay?: "ordinary" | "saturday" | "sunday" | "public-holiday"; // set only for "award-penalty"
  status?: "current" | "announced"; // distinguishes an operative figure from an announced-not-yet-operative one
  source: string; // ATO / Fair Work page URL
  lastVerified?: string; // ISO date
}

/**
 * An English-language test and whether the Australian Department of Home Affairs
 * (DHA) accepts it as proof of English for the Subclass 500 student visa, with
 * DHA's minimum component scores where the instrument sets numeric thresholds.
 * One record per test. The acceptance boolean is the gate-checked fact; the score
 * thresholds ride as sourced detail from the same finding's caveat. Fact-only
 * data: no scorer reads it; it backs the eventual English-requirements view and
 * is reconciled against findings like every other slice.
 */
export interface AuEnglishTest extends Provenanced {
  id: string; // slug, e.g. "ielts-academic"
  testName: string; // official test name
  acceptedByDha: boolean; // DHA accepts this test for the Subclass 500 visa (true) or explicitly not (false)
  // DHA minimum component scores for competent English, where the instrument
  // sets numeric thresholds. `eachComponent` is used where one minimum applies
  // to every band (IELTS 6.0); per-skill minimums use listening/reading/etc.
  minScores?: {
    listening?: number;
    reading?: number;
    writing?: number;
    speaking?: number;
    overall?: number;
    eachComponent?: number;
  };
  source: string; // source URL (the citing finding's source)
  lastVerified?: string; // ISO date
}

/**
 * An Australian provider's application fee for international students, in AUD
 * (0 = no application fee). `conditionality` records whether the fee always
 * applies ("standard"), only in some cases ("conditional", e.g. UNSW's "may be
 * payable"), or genuinely does not exist ("none"). Fact-only data: no scorer
 * reads it; it backs the eventual cost-of-applying view and is reconciled against
 * findings like every other slice.
 */
export interface AuProviderApplicationFee extends Provenanced {
  id: string; // slug, e.g. "uts"
  provider: string; // official provider name
  amountAud: number; // application fee in AUD; 0 = no fee
  conditionality: "standard" | "conditional" | "none";
  refundable?: boolean; // set only where the source states (non-)refundability
  source: string; // provider fee page URL
  lastVerified?: string; // ISO date
}

/**
 * An Australian provider's minimum English requirement for international entry,
 * as an IELTS band. `overallMin` is the headline overall band (the gate-checked
 * value); `perBandMin` is the per-subtest floor where the provider states one,
 * carried as sourced detail from the same finding. Fact-only data: no scorer
 * reads it; it backs the eventual entry-requirements view and is reconciled
 * against findings like every other slice.
 */
export interface AuProviderEnglishMinimum extends Provenanced {
  id: string; // slug, e.g. "trinity-foundation"
  provider: string; // provider/program name as the finding states it
  test: "IELTS"; // only IELTS appears in these findings
  overallMin: number; // overall IELTS band
  perBandMin?: number; // per-subtest floor, where the provider states one
  appliesTo?: string; // program scope, e.g. "most programs"
  source: string; // entry-requirements page URL
  lastVerified?: string; // ISO date
}

/**
 * An RMIT University degree program offered to international students, with its
 * 2026 indicative annual international fee (AUD per year — not a program total)
 * and standard full-time duration, as the RMIT international guide states them.
 * `tuitionAudPerYear` is the gate-checked value; `durationYears` rides as a
 * sourced leaf (each program pairs one tuition finding with one duration
 * finding). Fact-only data: no scorer reads it; it backs the eventual
 * program/course view and is reconciled against findings like every other slice.
 */
export interface AuRmitProgram extends Provenanced {
  id: string; // slug, e.g. "be-civil-infrastructure-honours"
  provider: "RMIT University"; // fixed provider literal
  programName: string; // full program name as the finding states it
  level: "bachelor" | "master" | "diploma" | "graduate-diploma";
  tuitionAudPerYear: number; // 2026 annual international fee, AUD
  durationYears: number; // standard full-time duration, years
  fieldOfStudy?: string; // free-form discipline label (NOT the scoring FieldOfStudy enum)
  source: string; // RMIT international guide URL
  lastVerified?: string; // ISO date
}

export interface AuCricosCode extends Provenanced {
  id: string; // slug, e.g. "university-of-sydney"; a location/program suffix disambiguates providers holding several codes
  provider: string; // provider name as the finding states it
  providerType: "university" | "pathway-college" | "vet-rto"; // vet-rto = any non-university registered provider (TAFE / private RTO / private higher-ed college)
  cricosCode: string; // CRICOS provider code: five digits + a letter, e.g. "00026A"
  coverage?: string; // location coverage for location-specific codes (multi-code providers), e.g. "Melbourne"
  source: string; // canonical CRICOS register URL
  lastVerified?: string; // ISO date
}

/**
 * A non-RMIT Australian university program offered to international students
 * (programs category E). A deliberately generic shape — every detail field is
 * optional — so heterogeneous providers (each finding-set states a different
 * mix of program CRICOS code, tuition, inline IELTS minimum, or accreditation)
 * share one module. RMIT keeps its own dedicated AuRmitProgram module. Each
 * present field is sourced from its own finding and reconciled like any leaf.
 */
export interface AuUniversityProgram extends Provenanced {
  id: string; // slug, e.g. "uts-master-of-pharmacy"
  provider: string; // university name as the finding states it
  programName: string; // full program name, incl. delivery mode where relevant
  level: "bachelor" | "master" | "diploma" | "graduate-diploma";
  cricosCode?: string; // program/course CRICOS code (five digits + a letter), where the finding gives one
  firstYearTuitionAud?: number; // 2026 indicative first-year international fee, AUD
  totalTuitionAud?: number; // 2026 indicative whole-program international fee, AUD
  durationYears?: number; // standard full-time duration, years
  fieldOfStudy?: string; // free-form discipline label (NOT the scoring FieldOfStudy enum)
  test?: "IELTS"; // English test, where the program states an inline requirement
  overallMin?: number; // IELTS overall band
  perBandMin?: number; // IELTS per-subtest floor
  accreditingBody?: string; // professional accreditation authority, where stated
  source: string; // provider page URL
  lastVerified?: string; // ISO date
}

/**
 * Australian Temporary Graduate (Subclass 485) post-study work visa — the facts
 * a Nepalese graduate planning post-study work needs: the streams, how long each
 * lets you stay, whether family can be included, the base charge and the age cap.
 * A visa-level overview record carries the shared facts; one record per DHA stream
 * carries that stream's stay period and family rights. Detail fields are optional
 * (each stream states different facts). Fact-only reference — no scorer reads it;
 * machine-checked against the DHA findings.
 */
export interface AuTemporaryGraduateVisaFact extends Provenanced {
  id: string; // slug, e.g. "subclass-485-post-higher-education-work"
  subclass: "485"; // the Temporary Graduate visa subclass (C.038)
  stream?: string; // DHA stream name, exactly as published; absent on the overview record
  minStayYears?: number; // lower bound of the stay range, years
  maxStayYears?: number; // upper bound of the stay range, years
  maxStayMonths?: number; // stay cap expressed in months (streams DHA states in months)
  bringsFamily?: boolean; // whether the holder may include family members
  baseApplicationChargeAud?: number; // base visa application charge ("from" figure), AUD
  maxAgeYears?: number; // age cap at time of application, years
  source: string; // DHA page URL
  lastVerified?: string; // ISO date
}

/**
 * Australian study scholarships open to international (incl. Nepalese) students,
 * beyond the Australia Awards (which keeps its own dedicated module). A generic
 * shape: each scholarship carries whatever the funder states — a per-year award
 * amount, the number granted annually, the funder's total annual scholarship
 * spend, and/or descriptive benefits. Fact-only reference — no scorer reads it;
 * machine-checked against the findings.
 */
export interface AuScholarship extends Provenanced {
  id: string; // slug, e.g. "destination-australia-scholarship"
  provider: string; // funding body or university
  name: string; // scholarship name as published
  annualAmountAud?: number; // per-student award per year, AUD
  annualScholarshipCount?: number; // number granted per year (a "more than N" floor)
  totalAnnualValueAud?: number; // funder's total annual scholarship spend, AUD (an "over N" floor)
  benefits?: string[]; // descriptive (non-scalar) benefits, e.g. tuition remission
  regionalCampusOnly?: boolean; // award limited to regional campuses
  source: string; // funder page URL
  lastVerified?: string; // ISO date
}

/**
 * Nepal-side English-test logistics: where an applicant can sit a given test in
 * Nepal and what it costs locally. One record per operator+test (e.g. IELTS via
 * the British Council vs IDP), carrying the number of Nepal locations, the named
 * locations, and any locally-quoted sitting fee. Distinct from au-english-tests,
 * which records the Australia-side DHA acceptance of each test. Fact-only — no
 * scorer reads it; machine-checked against the findings.
 */
export interface NepalEnglishTestCentre extends Provenanced {
  id: string; // slug, e.g. "ielts-british-council"
  operator: string; // who administers the centres (British Council, IDP Education Nepal)
  test: string; // the English test offered (e.g. "IELTS")
  locationCount?: number; // number of test locations/centres in Nepal
  locations?: string[]; // the named Nepal locations (sourced detail)
  computerDeliveredFeeNpr?: number; // computer-delivered sitting fee in Nepal, NPR
  source: string; // official test-provider page URL
  lastVerified?: string; // ISO date
}

/**
 * Forex / travel cards a Nepalese student can use to carry and spend money
 * abroad, with the fees the issuer publishes. Covers Nepali bank cards (from the
 * banks' standard tariff sheets) and global fintech cards (e.g. Wise) popular
 * with students. Fields are optional because each card exposes a different fee
 * structure. Fact-only reference — no scorer reads it; machine-checked against
 * the findings.
 */
export interface NepalForexCard extends Provenanced {
  id: string; // slug, e.g. "wise-card"
  provider: string; // issuing bank or fintech
  card: string; // product name
  cashLoadFeeNpr?: number; // fee to load cash onto the card, NPR (per transaction)
  foreignAtmFeePct?: number; // foreign-ATM withdrawal fee, percent of the amount
  foreignAtmFeeMinUsd?: number; // floor applied to the foreign-ATM fee, USD ("greater of" rule)
  crossBorderFeePct?: number; // cross-border transaction fee, percent
  feeFreeAtmMonthlyLimitAud?: number; // monthly fee-free ATM withdrawal limit, AUD
  atmFeeAboveLimitPct?: number; // fee on ATM withdrawals above the free limit, percent
  supportedCurrencyCount?: number; // number of currencies the card supports (a "N+" floor)
  source: string; // issuer page / tariff sheet URL
  lastVerified?: string; // ISO date
}
