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
];
