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
import {
  AU_DHA_LIVING_CAPACITY_AUD,
  AU_DHA_PARTNER_CAPACITY_AUD,
  AU_DHA_CHILD_CAPACITY_AUD,
  AU_DHA_SCHOOL_COSTS_AUD,
  AU_DHA_INCOME_METHOD_THRESHOLD_AUD,
} from "@/lib/data/policy/au-cost-of-living";
import { AU_SUBCLASS_500_APPLICATION_CHARGE_AUD } from "@/lib/data/policy/au-visa-fees";
import { DhaLivingSchema } from "@/lib/data/schema/scoring-config.schema";

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
];
