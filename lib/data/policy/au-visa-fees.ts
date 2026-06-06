import type { Sourced } from "@/lib/data/types";

/**
 * Australian DHA visa-fee source of truth.
 *
 * The Subclass 500 base application charge is a fixed DHA fee (gov,
 * immi.homeaffairs.gov.au). It is corroborated by two primary findings — A.001
 * in the visa-documents category and B.001 in the finance category — the same
 * regulatory fee extracted into both, so both cite this one value.
 *
 * This is a fact-only module: no scorer reads it, so it replaces no prior
 * constant and moves no verdict. It makes the figure traceable and gives the
 * visa-fee cluster (VFS service fees, biometric fees, test fees that are still
 * pending) a home to grow into in later slices.
 */
const DHA_STUDENT_500_SOURCE =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500";

export const AU_SUBCLASS_500_APPLICATION_CHARGE_AUD: Sourced<number> = {
  value: 2_000,
  provenance: {
    findingRefs: ["A.001", "B.001"],
    source: DHA_STUDENT_500_SOURCE,
    lastVerified: "2026-06-07",
    note: "DHA Subclass 500 base visa application charge for the primary applicant (AUD).",
  },
};
