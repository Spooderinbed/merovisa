import type { AustraliaAwardsScholarship } from "@/lib/data/types";

/**
 * The Australia Awards Scholarship as offered to Nepal — DFAT's fully-funded
 * award for Master's study in Australia. A single record (the Nepal-scoped
 * Award), citing the DFAT "information for intake" booklet. Benefits are an enum
 * list so each inclusion reconciles to its own finding. Fact-only — no scorer
 * reads it; it backs the eventual scholarships view and is machine-checked
 * against the findings. The stipend amount is intentionally unmodeled (DFAT sets
 * it by policy and revises it annually); only its existence is recorded.
 */
const DFAT_AUSTRALIA_AWARDS_NEPAL_SOURCE =
  "https://www.dfat.gov.au/sites/default/files/australia-awards-nepal-information-for-intake.pdf";

export const AUSTRALIA_AWARDS_SCHOLARSHIPS: AustraliaAwardsScholarship[] = [
  {
    id: "australia-awards-nepal",
    name: "Australia Awards Scholarship",
    country: "Nepal",
    studyLevel: "masters",
    benefits: ["full-tuition", "return-airfare", "oshc", "living-stipend"],
    applicationOpens: "2026-02-01",
    applicationCloses: "2026-04-30",
    source: DFAT_AUSTRALIA_AWARDS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J2.001", "J2.002", "J2.003", "J2.004", "J2.005", "J2.010"],
      effectiveDate: "2026-02-01",
      note:
        "Application window is for the 2027 intake (apply in 2026). Recipients must " +
        "return to Nepal for a minimum of 2 years. The living-stipend amount (DFAT " +
        "policy, revised annually) is intentionally not modeled — only its existence.",
    },
  },
];
