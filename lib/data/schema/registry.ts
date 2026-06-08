/**
 * Registry of sourced data modules. One entry per integrated slice.
 *
 * Iterated by:
 *  - tests/data/schema.test.ts            (validates each module against its Zod schema)
 *  - tests/data/reconcile-modules.test.ts (walks provenance, reconciles against findings)
 *
 * Entries hold direct references (not string paths) so the data↔schema pairing
 * and the walker hints are type-checked here at compile time. Adding a category
 * = import its module + schema and append one entry.
 */
import type { ZodType } from "zod";
import { NEPAL_BANKS } from "@/lib/data/source/nepal-banks";
import { NepalBanksSchema } from "@/lib/data/schema/nepal-banks.schema";
import { NEPAL_APPLICATION_FEES } from "@/lib/data/source/nepal-application-fees";
import { NepalApplicationFeesSchema } from "@/lib/data/schema/nepal-application-fees.schema";
import { NEPAL_DOCUMENT_PROCESSING_TIMES } from "@/lib/data/source/nepal-document-processing-times";
import { NepalDocumentProcessingTimesSchema } from "@/lib/data/schema/nepal-document-processing-times.schema";
import { AU_PAYMENT_SURCHARGES } from "@/lib/data/policy/au-payment-surcharges";
import { AuPaymentSurchargesSchema } from "@/lib/data/schema/au-payment-surcharges.schema";
import { AU_SKILLED_VISA_CHARGES } from "@/lib/data/policy/au-visa-charges-skilled";
import { AuSkilledVisaChargesSchema } from "@/lib/data/schema/au-visa-charges-skilled.schema";
import { IOM_NEPAL_HEALTH_FEES } from "@/lib/data/source/iom-nepal-health-fees";
import { IomNepalHealthFeesSchema } from "@/lib/data/schema/iom-nepal-health-fees.schema";
import { AU_ARRIVAL_CASH_GUIDANCE } from "@/lib/data/source/au-arrival-cash-guidance";
import { AuArrivalCashGuidanceListSchema } from "@/lib/data/schema/au-arrival-cash-guidance.schema";
import { AU_TAX_FIGURES } from "@/lib/data/policy/au-tax-figures";
import { AuTaxFiguresSchema } from "@/lib/data/schema/au-tax-figures.schema";
import { AU_STUDENT_TRANSPORT_CONCESSIONS } from "@/lib/data/source/au-student-transport-concessions";
import { AuStudentTransportConcessionsSchema } from "@/lib/data/schema/au-student-transport-concessions.schema";
import { AUSTRALIA_AWARDS_SCHOLARSHIPS } from "@/lib/data/source/australia-awards-scholarship";
import { AustraliaAwardsScholarshipsSchema } from "@/lib/data/schema/australia-awards-scholarship.schema";
import { AU_STUDENT_VISA_LIMITS } from "@/lib/data/policy/au-student-visa-limits";
import { AuStudentVisaLimitsSchema } from "@/lib/data/schema/au-student-visa-limits.schema";
import { AU_STUDENT_WORKER_WAGES } from "@/lib/data/source/au-student-worker-wages";
import { AuStudentWorkerWagesSchema } from "@/lib/data/schema/au-student-worker-wages.schema";
import { AU_ENGLISH_TESTS } from "@/lib/data/source/au-english-tests";
import { AuEnglishTestsSchema } from "@/lib/data/schema/au-english-tests.schema";
import { AU_PROVIDER_APPLICATION_FEES } from "@/lib/data/source/au-provider-application-fees";
import { AuProviderApplicationFeesSchema } from "@/lib/data/schema/au-provider-application-fees.schema";
import { AU_PROVIDER_ENGLISH_MINIMUMS } from "@/lib/data/source/au-provider-english-minimums";
import { AuProviderEnglishMinimumsSchema } from "@/lib/data/schema/au-provider-english-minimums.schema";
import { AU_RMIT_PROGRAMS } from "@/lib/data/source/au-rmit-programs";
import { AuRmitProgramsSchema } from "@/lib/data/schema/au-rmit-programs.schema";
import { AU_CRICOS_CODES } from "@/lib/data/source/au-cricos-codes";
import { AuCricosCodesSchema } from "@/lib/data/schema/au-cricos-codes.schema";
import { AU_UNIVERSITY_PROGRAMS } from "@/lib/data/source/au-university-programs";
import { AuUniversityProgramsSchema } from "@/lib/data/schema/au-university-programs.schema";
import { AU_TEMPORARY_GRADUATE_VISA } from "@/lib/data/source/au-temporary-graduate-visa";
import { AuTemporaryGraduateVisaSchema } from "@/lib/data/schema/au-temporary-graduate-visa.schema";
import { AU_SCHOLARSHIPS } from "@/lib/data/source/au-scholarships";
import { AuScholarshipsSchema } from "@/lib/data/schema/au-scholarships.schema";
import { NEPAL_ENGLISH_TEST_CENTRES } from "@/lib/data/source/nepal-english-test-centres";
import { NepalEnglishTestCentresSchema } from "@/lib/data/schema/nepal-english-test-centres.schema";
import { NEPAL_FOREX_CARDS } from "@/lib/data/source/nepal-forex-cards";
import { NepalForexCardsSchema } from "@/lib/data/schema/nepal-forex-cards.schema";
import { AU_SKILLED_VISA_DIRECTORY } from "@/lib/data/source/au-skilled-visa-directory";
import { AuSkilledVisaDirectorySchema } from "@/lib/data/schema/au-skilled-visa-directory.schema";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { AuHealthBiometricFactsSchema } from "@/lib/data/schema/au-health-biometric-facts.schema";
import { AU_VISA_FACTS } from "@/lib/data/source/au-visa-facts";
import { AuVisaFactsSchema } from "@/lib/data/schema/au-visa-facts.schema";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { AuStudentVisaRequirementsSchema } from "@/lib/data/schema/au-student-visa-requirements.schema";
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { AuFinancialEvidenceSchema } from "@/lib/data/schema/au-financial-evidence.schema";
import { AU_PATHWAY_PROGRAMS } from "@/lib/data/source/au-pathway-programs";
import { AuPathwayProgramsSchema } from "@/lib/data/schema/au-pathway-programs.schema";
import { AU_TUITION_PAYMENT_FACTS } from "@/lib/data/source/au-tuition-payment-facts";
import { AuTuitionPaymentFactsSchema } from "@/lib/data/schema/au-tuition-payment-facts.schema";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NepalSourceOfFundsSchema } from "@/lib/data/schema/nepal-source-of-funds.schema";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { NepalNocJourneySchema } from "@/lib/data/schema/nepal-noc-journey.schema";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AuDocumentPreparationSchema } from "@/lib/data/schema/au-document-preparation.schema";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AuHealthExamSchema } from "@/lib/data/schema/au-health-exam.schema";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
import { AuBiometricsSchema } from "@/lib/data/schema/au-biometrics.schema";
import {
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_DHA_PARTNER_CAPACITY_AUD,
  AU_DHA_CHILD_CAPACITY_AUD,
  AU_DHA_SCHOOL_COSTS_AUD,
  AU_DHA_INCOME_METHOD_THRESHOLD_AUD,
} from "@/lib/data/policy/au-cost-of-living";
import { AU_SUBCLASS_500_APPLICATION_CHARGE_AUD } from "@/lib/data/policy/au-visa-fees";
import { NEPAL_AU_STUDENT_VISA_GRANT_RATE } from "@/lib/data/policy/visa-outcomes";
import { DhaLivingSchema, GrantRateCohortsSchema } from "@/lib/data/schema/scoring-config.schema";

export interface DataModuleEntry {
  /** Research category this module integrates (A–J). Also locates findings/<category>.jsonl. */
  category: string;
  /** Named export, used in test labels/messages, e.g. "NEPAL_BANKS". */
  exportName: string;
  /** The exported data array/object. */
  data: unknown;
  /** The Zod schema the data must satisfy. */
  schema: ZodType;
  /** Walker: label for top-level records, e.g. "banks". */
  recordLabel: string;
  /** Walker: provenance-bearing sub-record keys, e.g. ["educationLoan"]. */
  subRecordKeys: string[];
  /** Walker: interface name of the top-level record (messages + exemption matching). */
  recordInterface: string;
  /** Walker: interface name of the sub-record, when present. */
  subRecordInterface?: string;
  /** Interface names whose records are exempt from provenance (UI-only data). */
  provenanceExemptInterfaces?: string[];
}

export const DATA_MODULES: DataModuleEntry[] = [
  {
    category: "B",
    exportName: "NEPAL_BANKS",
    data: NEPAL_BANKS,
    schema: NepalBanksSchema,
    recordLabel: "banks",
    subRecordKeys: ["educationLoan"],
    recordInterface: "NepalBank",
    subRecordInterface: "NepalBankLoan",
  },
  {
    // A single sourced config value reconciles like any other slice: its lone
    // findingRef (A.015) must be `used` and its value (29,710) must be in code.
    category: "A",
    exportName: "AU_DHA_LIVING_CAPACITY_AUD",
    data: AU_DHA_LIVING_CAPACITY_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-cost-of-living",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    // Slice A — DHA student-visa documentary requirements (CoE, OSHC, financial
    // coverage, Genuine Student). Prose rules backing findings A.002–A.022.
    category: "A",
    exportName: "AU_STUDENT_VISA_REQUIREMENTS",
    data: AU_STUDENT_VISA_REQUIREMENTS,
    schema: AuStudentVisaRequirementsSchema,
    recordLabel: "au-student-visa-requirements",
    subRecordKeys: [],
    recordInterface: "AuStudentVisaRequirement",
  },
  {
    // Slice B — DHA-accepted financial-capacity evidence paths (money deposit,
    // loan, scholarship/sponsorship, parent/partner income) + the living-cost-
    // indicative rule. Prose rules backing findings B.007–B.011, consumed by the
    // plan + checklist generators and the profile finance editor. Fact-only.
    category: "B",
    exportName: "AU_FINANCIAL_EVIDENCE",
    data: AU_FINANCIAL_EVIDENCE,
    schema: AuFinancialEvidenceSchema,
    recordLabel: "au-financial-evidence",
    subRecordKeys: [],
    recordInterface: "AuFinancialEvidence",
  },
  {
    // DHA dependant/school financial-capacity figures (finance category B),
    // backing the constants in lib/programs/policy.ts. Each is a single sourced value.
    category: "B",
    exportName: "AU_DHA_PARTNER_CAPACITY_AUD",
    data: AU_DHA_PARTNER_CAPACITY_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-dha-partner-cost",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    category: "B",
    exportName: "AU_DHA_CHILD_CAPACITY_AUD",
    data: AU_DHA_CHILD_CAPACITY_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-dha-child-cost",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    category: "B",
    exportName: "AU_DHA_SCHOOL_COSTS_AUD",
    data: AU_DHA_SCHOOL_COSTS_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-dha-school-cost",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    // DHA Subclass 500 base visa application charge. Corroborated across two
    // primary findings — A.001 (visa-documents) and B.001 (finance) — the same
    // fee in both categories, so both cite this one value (global reconcile).
    category: "A",
    exportName: "AU_SUBCLASS_500_APPLICATION_CHARGE_AUD",
    data: AU_SUBCLASS_500_APPLICATION_CHARGE_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-visa-application-charge",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    // DHA annual personal-income threshold (income method, finding B.006).
    category: "B",
    exportName: "AU_DHA_INCOME_METHOD_THRESHOLD_AUD",
    data: AU_DHA_INCOME_METHOD_THRESHOLD_AUD,
    schema: DhaLivingSchema,
    recordLabel: "au-dha-income-threshold",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    // Nepal-side application/test/medical fees (finance category B). A record
    // array (like the bank directory): one fee per record, each traced to its
    // finding via the same record-array walker.
    category: "B",
    exportName: "NEPAL_APPLICATION_FEES",
    data: NEPAL_APPLICATION_FEES,
    schema: NepalApplicationFeesSchema,
    recordLabel: "nepal-application-fees",
    subRecordKeys: [],
    recordInterface: "NepalApplicationFee",
  },
  {
    // Nepal-side document processing turnarounds (visa-documents category A), in
    // working days. Companion to NEPAL_APPLICATION_FEES — the time dimension of
    // the same document journey. Fact-only: no scorer reads it. Record array,
    // one service per record, reconciled via the record-array walker.
    category: "A",
    exportName: "NEPAL_DOCUMENT_PROCESSING_TIMES",
    data: NEPAL_DOCUMENT_PROCESSING_TIMES,
    schema: NepalDocumentProcessingTimesSchema,
    recordLabel: "nepal-document-processing-times",
    subRecordKeys: [],
    recordInterface: "NepalDocumentProcessingTime",
  },
  {
    // DHA payment-method surcharges on the visa application charge (visa-docs
    // category C), as a percent. Fact-only: no scorer reads it. Record array,
    // one payment method per record.
    category: "C",
    exportName: "AU_PAYMENT_SURCHARGES",
    data: AU_PAYMENT_SURCHARGES,
    schema: AuPaymentSurchargesSchema,
    recordLabel: "au-payment-surcharges",
    subRecordKeys: [],
    recordInterface: "AuPaymentSurcharge",
  },
  {
    // DHA base application charges for skilled/employer-sponsored visa subclasses
    // (visa-docs category C), in AUD. Fact-only: no scorer reads it. Record array,
    // one subclass per record.
    category: "C",
    exportName: "AU_SKILLED_VISA_CHARGES",
    data: AU_SKILLED_VISA_CHARGES,
    schema: AuSkilledVisaChargesSchema,
    recordLabel: "au-skilled-visa-charges",
    subRecordKeys: [],
    recordInterface: "AuSkilledVisaCharge",
  },
  {
    // IOM Nepal Australia health-assessment fees in USD (visa-docs category C),
    // the panel-medical line items + MHAC package. Fact-only: no scorer reads it.
    // Record array, one line item per record.
    category: "C",
    exportName: "IOM_NEPAL_HEALTH_FEES",
    data: IOM_NEPAL_HEALTH_FEES,
    schema: IomNepalHealthFeesSchema,
    recordLabel: "iom-nepal-health-fees",
    subRecordKeys: [],
    recordInterface: "IomNepalHealthFee",
  },
  {
    // University-published arrival cash recommendations (arrival category H), AUD.
    // Fact-only: no scorer reads it. Record array, one recommendation per record.
    category: "H",
    exportName: "AU_ARRIVAL_CASH_GUIDANCE",
    data: AU_ARRIVAL_CASH_GUIDANCE,
    schema: AuArrivalCashGuidanceListSchema,
    recordLabel: "au-arrival-cash-guidance",
    subRecordKeys: [],
    recordInterface: "AuArrivalCashGuidance",
  },
  {
    // ATO tax figures for student workers (arrival category H): tax-free threshold,
    // DASP rates, TFN turnaround. Fact-only: no scorer reads it. Record array.
    category: "H",
    exportName: "AU_TAX_FIGURES",
    data: AU_TAX_FIGURES,
    schema: AuTaxFiguresSchema,
    recordLabel: "au-tax-figures",
    subRecordKeys: [],
    recordInterface: "AuTaxFigure",
  },
  {
    // State public-transport student concessions (arrival category H): card fees,
    // validity, savings, flat fares. Fact-only: no scorer reads it. Record array.
    category: "H",
    exportName: "AU_STUDENT_TRANSPORT_CONCESSIONS",
    data: AU_STUDENT_TRANSPORT_CONCESSIONS,
    schema: AuStudentTransportConcessionsSchema,
    recordLabel: "au-student-transport-concessions",
    subRecordKeys: [],
    recordInterface: "AuTransportConcession",
  },
  {
    // Nepal student-visa grant-rate band shown in the matches policy banner.
    // Offshore lower bound (I.032) / onshore upper (I.033). Fact-only — no
    // scorer reads it. recordLabel must equal the used_by prefix the flip tool
    // writes: nepal-visa-grant-rate[0].
    category: "I",
    exportName: "NEPAL_AU_STUDENT_VISA_GRANT_RATE",
    data: NEPAL_AU_STUDENT_VISA_GRANT_RATE,
    schema: GrantRateCohortsSchema,
    recordLabel: "nepal-visa-grant-rate",
    subRecordKeys: [],
    recordInterface: "Sourced",
  },
  {
    // The Australia Awards Scholarship offered to Nepal (English-tests &
    // scholarships category J) — DFAT-funded Master's study. A single record
    // citing the DFAT information-for-intake booklet; benefits are an enum list
    // so each inclusion (tuition/airfare/OSHC/stipend) reconciles to its own
    // finding. Fact-only: no scorer reads it.
    category: "J",
    exportName: "AUSTRALIA_AWARDS_SCHOLARSHIPS",
    data: AUSTRALIA_AWARDS_SCHOLARSHIPS,
    schema: AustraliaAwardsScholarshipsSchema,
    recordLabel: "australia-awards-scholarship",
    subRecordKeys: [],
    recordInterface: "AustraliaAwardsScholarship",
  },
  {
    // DHA Subclass 500/590 numeric limits (visa-conditions category C): maximum
    // stay periods, the 48-hour-a-fortnight work caps (student + family), the
    // category median processing time, and the Genuine Student word limit. One
    // value+unit per record, each tracing to its own finding. Fact-only.
    category: "C",
    exportName: "AU_STUDENT_VISA_LIMITS",
    data: AU_STUDENT_VISA_LIMITS,
    schema: AuStudentVisaLimitsSchema,
    recordLabel: "au-student-visa-limits",
    subRecordKeys: [],
    recordInterface: "AuStudentVisaLimit",
  },
  {
    // AU student-worker wages & super (arrival category H): the ATO super
    // guarantee rate, the Fair Work National Minimum Wage (current + announced),
    // and the Hospitality Award casual introductory penalty ladder. One rate per
    // record (ratePct or hourlyRateAud). Fact-only: no scorer reads it.
    category: "H",
    exportName: "AU_STUDENT_WORKER_WAGES",
    data: AU_STUDENT_WORKER_WAGES,
    schema: AuStudentWorkerWagesSchema,
    recordLabel: "au-student-worker-wages",
    subRecordKeys: [],
    recordInterface: "AuWorkerWage",
  },
  {
    // DHA-accepted English tests for the Subclass 500 student visa (English-tests
    // category J). One record per test: acceptedByDha boolean + DHA minimum
    // component scores where the instrument sets them. minScores is nested data,
    // not a provenance-bearing sub-record (subRecordKeys stays empty). Fact-only.
    category: "J",
    exportName: "AU_ENGLISH_TESTS",
    data: AU_ENGLISH_TESTS,
    schema: AuEnglishTestsSchema,
    recordLabel: "au-english-tests",
    subRecordKeys: [],
    recordInterface: "AuEnglishTest",
  },
  {
    // Australian provider application fees for international students (providers
    // category D), in AUD (0 = no fee). conditionality flags standard vs
    // conditional ("may be payable") vs none. Fact-only: no scorer reads it.
    category: "D",
    exportName: "AU_PROVIDER_APPLICATION_FEES",
    data: AU_PROVIDER_APPLICATION_FEES,
    schema: AuProviderApplicationFeesSchema,
    recordLabel: "au-provider-application-fees",
    subRecordKeys: [],
    recordInterface: "AuProviderApplicationFee",
  },
  {
    // Australian provider minimum English requirements as IELTS bands (providers
    // category D). overallMin is the gate-checked value; perBandMin rides as
    // sourced detail. Fact-only: no scorer reads it.
    category: "D",
    exportName: "AU_PROVIDER_ENGLISH_MINIMUMS",
    data: AU_PROVIDER_ENGLISH_MINIMUMS,
    schema: AuProviderEnglishMinimumsSchema,
    recordLabel: "au-provider-english-minimums",
    subRecordKeys: [],
    recordInterface: "AuProviderEnglishMinimum",
  },
  {
    // RMIT international engineering programs (programs category E): 2026 annual
    // international fee + standard duration, from the RMIT international guide.
    // Each program is one record citing its duration + tuition finding pair; the
    // walker matches each finding's value against the record's leaf union.
    category: "E",
    exportName: "AU_RMIT_PROGRAMS",
    data: AU_RMIT_PROGRAMS,
    schema: AuRmitProgramsSchema,
    recordLabel: "au-rmit-programs",
    subRecordKeys: [],
    recordInterface: "AuRmitProgram",
  },
  {
    // CRICOS provider codes for Australian education providers (providers
    // category D) — the unified provider→code map. One record per provider code;
    // cricosCode is the gate-checked value (reconcile's enum match proves it
    // equals the finding's value). providerType buckets university /
    // pathway-college / vet-rto. cricosCode is not unique (one code can be shared,
    // e.g. UNSW Sydney 00098G). Fact-only: no scorer reads it. Record array.
    category: "D",
    exportName: "AU_CRICOS_CODES",
    data: AU_CRICOS_CODES,
    schema: AuCricosCodesSchema,
    recordLabel: "au-cricos-codes",
    subRecordKeys: [],
    recordInterface: "AuCricosCode",
  },
  {
    // Non-RMIT Australian university programs (programs category E): UTS Master
    // of Pharmacy (tuition + inline IELTS + accreditation), Melbourne's online
    // Master of Education (tuition), and Torrens programs by course CRICOS code.
    // Generic record (detail fields optional); each present value reconciles to
    // its own finding. Fact-only: no scorer reads it. Record array.
    category: "E",
    exportName: "AU_UNIVERSITY_PROGRAMS",
    data: AU_UNIVERSITY_PROGRAMS,
    schema: AuUniversityProgramsSchema,
    recordLabel: "au-university-programs",
    subRecordKeys: [],
    recordInterface: "AuUniversityProgram",
  },
  {
    // Australian Temporary Graduate visa (Subclass 485) post-study work facts
    // (visa-conditions category C, plus the E-category stay-period findings). A
    // visa-level overview (base charge, age cap) + one record per DHA stream
    // (Post-Higher Education Work stay range + family rights, Post-Vocational
    // Education Work 18-month cap, Second Post-Higher Education Work family
    // rights). Optional fields; each present value reconciles to its own DHA
    // finding (the stay range uses the {min,max} matcher). Fact-only: no scorer
    // reads it. Record array.
    category: "C",
    exportName: "AU_TEMPORARY_GRADUATE_VISA",
    data: AU_TEMPORARY_GRADUATE_VISA,
    schema: AuTemporaryGraduateVisaSchema,
    recordLabel: "au-temporary-graduate-visa",
    subRecordKeys: [],
    recordInterface: "AuTemporaryGraduateVisaFact",
  },
  {
    // Australian study scholarships beyond the Australia Awards (English-tests &
    // scholarships category J): Destination Australia (AUD 15k/yr, regional),
    // Melbourne Graduate Research (300+ annually, living allowance + tuition
    // remission), and Sydney (over AUD 135M/yr total). Generic record; each
    // present scalar reconciles to its own finding, with Melbourne's benefits
    // riding as a prose-only citation (J2.007). Fact-only: no scorer reads it.
    category: "J",
    exportName: "AU_SCHOLARSHIPS",
    data: AU_SCHOLARSHIPS,
    schema: AuScholarshipsSchema,
    recordLabel: "au-scholarships",
    subRecordKeys: [],
    recordInterface: "AuScholarship",
  },
  {
    // Nepal-side IELTS test-centre logistics (English-tests & scholarships
    // category J), from the official IELTS administrators: the British Council
    // (nine locations) and IDP (four centres + the NPR 36,000 computer-delivered
    // fee). locationCount is the gate-checked scalar; the named locations ride as
    // sourced detail. PTE/TOEFL deferred pending test-owner sources. Fact-only.
    category: "J",
    exportName: "NEPAL_ENGLISH_TEST_CENTRES",
    data: NEPAL_ENGLISH_TEST_CENTRES,
    schema: NepalEnglishTestCentresSchema,
    recordLabel: "nepal-english-test-centres",
    subRecordKeys: [],
    recordInterface: "NepalEnglishTestCentre",
  },
  {
    // Forex / travel card fees for students going abroad (arrival category H):
    // NIC ASIA international card (cash-load + foreign-ATM fee), Nabil USD card
    // (cross-border fee), and the Wise card (fee-free ATM limit, above-limit fee,
    // 40+ currencies). Nepali figures come from the banks' standard tariff sheets;
    // Wise's are its own published terms. Each present fee reconciles to its own
    // finding. Fact-only: no scorer reads it. Record array.
    category: "H",
    exportName: "NEPAL_FOREX_CARDS",
    data: NEPAL_FOREX_CARDS,
    schema: NepalForexCardsSchema,
    recordLabel: "nepal-forex-cards",
    subRecordKeys: [],
    recordInterface: "NepalForexCard",
  },
  {
    // Directory of Australian skilled/employer-sponsored/regional/PR/temporary-
    // activity work visas (visa-conditions category C) — the post-485 migration
    // pathways, by DHA subclass: 408, 482 (Skills in Demand), 491 (+5yr stay),
    // 191, 189, 190, 186, 858 (National Innovation). The subclass code (or the
    // current name, for renamed visas) is the gate-checked value; 482's stay range
    // uses the {min,max} matcher. Fact-only: no scorer reads it. Record array.
    category: "C",
    exportName: "AU_SKILLED_VISA_DIRECTORY",
    data: AU_SKILLED_VISA_DIRECTORY,
    schema: AuSkilledVisaDirectorySchema,
    recordLabel: "au-skilled-visa-directory",
    subRecordKeys: [],
    recordInterface: "AuSkilledVisaSubclass",
  },
  {
    // DHA health-requirement + biometrics facts (visa-conditions category C, plus
    // the Services Australia reciprocal-agreement count from category H): health-
    // exam validity (12 months), the Significant Cost Threshold (AUD 86,000),
    // reciprocal-health countries (11), Nepal's inclusion in the biometrics program
    // (boolean), and the VFS Kathmandu collection fee (NPR 2,365). One labeled
    // value per record; the inclusion flag is the single boolean value matched by
    // reconcile. Fact-only: no scorer reads it. Record array.
    category: "C",
    exportName: "AU_HEALTH_BIOMETRIC_FACTS",
    data: AU_HEALTH_BIOMETRIC_FACTS,
    schema: AuHealthBiometricFactsSchema,
    recordLabel: "au-health-biometric-facts",
    subRecordKeys: [],
    recordInterface: "AuHealthBiometricFact",
  },
  {
    // Miscellaneous DHA visa facts outside the dedicated modules (visa-conditions
    // category C): the Student Guardian (590) application charge, the skilled-
    // temporary processing median, and the Visitor (600) tourist max stay,
    // Sponsored Family work right (boolean) and security bond (a money range via
    // the {min,max} matcher). One labeled fact per record. Fact-only: no scorer
    // reads it. Record array.
    category: "C",
    exportName: "AU_VISA_FACTS",
    data: AU_VISA_FACTS,
    schema: AuVisaFactsSchema,
    recordLabel: "au-visa-facts",
    subRecordKeys: [],
    recordInterface: "AuVisaFact",
  },
  {
    // Pathway-college programs leading into an Australian university (providers
    // category D): UTS College and Deakin College Diplomas of IT (tuition +
    // standard/accelerated durations) and the University of Sydney Foundation
    // Program via Taylors (duration). The pre-degree pathway step, distinct from
    // the degree-program modules. Each present value reconciles to its own
    // finding. Fact-only: no scorer reads it. Record array.
    category: "D",
    exportName: "AU_PATHWAY_PROGRAMS",
    data: AU_PATHWAY_PROGRAMS,
    schema: AuPathwayProgramsSchema,
    recordLabel: "au-pathway-programs",
    subRecordKeys: [],
    recordInterface: "AuPathwayProgram",
  },
  {
    // How students pay tuition to an Australian university (finance category B):
    // payment-channel clearing times (USyd transfer, Monash TT + card), the UNSW
    // Convera FX-rate hold, the Melbourne initial deposit, and the Flywire refund
    // fee. One labeled value per record. Fact-only: no scorer reads it.
    category: "B",
    exportName: "AU_TUITION_PAYMENT_FACTS",
    data: AU_TUITION_PAYMENT_FACTS,
    schema: AuTuitionPaymentFactsSchema,
    recordLabel: "au-tuition-payment-facts",
    subRecordKeys: [],
    recordInterface: "AuTuitionPaymentFact",
  },
  {
    // Slice C — Nepal source-of-funds / remittance readiness (finance category B).
    // How a Nepali bank legally releases foreign currency for study: the NOC +
    // institution documents it requires, the NRB living-expense remittance, and the
    // MoEST-portal approval check — plus a one-line NOC definition. Prose rules
    // backing findings B.012–B.016, consumed by the plan + checklist generators.
    // Fact-only: no scorer reads it.
    category: "B",
    exportName: "NEPAL_SOURCE_OF_FUNDS",
    data: NEPAL_SOURCE_OF_FUNDS,
    schema: NepalSourceOfFundsSchema,
    recordLabel: "nepal-source-of-funds",
    subRecordKeys: [],
    recordInterface: "NepalSourceOfFunds",
  },
  {
    // Slice D — MoEST No Objection Certificate (NOC) application journey (finance
    // category B). The sequel to nepal-source-of-funds: the six documents the MoEST
    // portal requires + the two process steps (online submission, in-person originals
    // check). Prose rules backing findings B.017–B.024, consumed by the plan +
    // checklist generators. Fact-only: no scorer reads it.
    category: "B",
    exportName: "NEPAL_NOC_JOURNEY",
    data: NEPAL_NOC_JOURNEY,
    schema: NepalNocJourneySchema,
    recordLabel: "nepal-noc-journey",
    subRecordKeys: [],
    recordInterface: "NepalNocJourney",
  },
  {
    // Slice E — DHA document-preparation rules (logistics category A). How Nepali-
    // language documents are made acceptable to DHA: three translation rules
    // (A.026–A.028) and two certified-copy rules (A.041–A.042), consumed by the plan
    // + checklist generators. Fact-only: no scorer reads it.
    category: "A",
    exportName: "AU_DOCUMENT_PREPARATION",
    data: AU_DOCUMENT_PREPARATION,
    schema: AuDocumentPreparationSchema,
    recordLabel: "au-document-preparation",
    subRecordKeys: [],
    recordInterface: "AuDocumentPreparation",
  },
  {
    // Slice F — DHA health-examination readiness (logistics category A): where the
    // exam is done (panel physician/clinic overseas), who pays, My Health Declarations
    // before lodging, and the 6-month health-undertaking validity. Backs A.033/A.035/
    // A.036/A.038, consumed by the plan + checklist generators (12-month base validity
    // reused from C.092). Fact-only: no scorer reads it.
    category: "A",
    exportName: "AU_HEALTH_EXAM",
    data: AU_HEALTH_EXAM,
    schema: AuHealthExamSchema,
    recordLabel: "au-health-exam",
    subRecordKeys: [],
    recordInterface: "AuHealthExam",
  },
  {
    // Slice G — DHA biometrics readiness (logistics category A): after lodging, the
    // Immi App needs the biometrics letter whose Visa Lodgement Number starts with
    // "AUI" (A.031, a single record). Surfaced in the checklist + plan alongside Nepal's
    // inclusion in the biometrics program (C.123) and the VFS Kathmandu collection fee
    // (C.127), both reused read-only from au-health-biometric-facts. Fact-only: no
    // scorer reads it.
    category: "A",
    exportName: "AU_BIOMETRICS",
    data: AU_BIOMETRICS,
    schema: AuBiometricsSchema,
    recordLabel: "au-biometrics",
    subRecordKeys: [],
    recordInterface: "AuBiometrics",
  },
];
