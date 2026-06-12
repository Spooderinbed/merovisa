import type { NepalIncomeCertificationFact } from "@/lib/data/types";

/**
 * Slice ⑥ — Nepal-side sponsor income certification (logistics category A). Lalitpur
 * Metropolitan City's published FAQ maps each income type to the documents a ward office
 * requires to certify it — the paper trail behind credible sponsor-income evidence. One
 * municipality's list (the only primary source retrieved), so product copy frames it as
 * "typically" (user sign-off 2026-06-13). Consumed by the plan + checklist generators
 * (the sponsor-income-cert step). Fact-only: no scorer reads it.
 */
const LMC_FAQ = "https://lalitpurmun.gov.np/faq";
const VERIFIED = "2026-06-05";

export const NEPAL_INCOME_CERTIFICATION: NepalIncomeCertificationFact[] = [
  {
    id: "rental-income",
    incomeType: "rental",
    summary: "Rental-income certification requires a copy of the tenancy agreement.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.104"], source: LMC_FAQ },
  },
  {
    id: "business-registration",
    incomeType: "business-agriculture",
    summary:
      "Business or agricultural-business income certification requires a copy of the business-registration certificate.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.105"], source: LMC_FAQ },
  },
  {
    id: "business-audit",
    incomeType: "business-agriculture",
    summary: "Business or agricultural-business income certification requires a copy of the audit report.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.106"], source: LMC_FAQ },
  },
  {
    id: "salary-pension",
    incomeType: "salary-pension",
    summary:
      "Salary or pension income certification requires the original letter from the relevant institution.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.107"], source: LMC_FAQ },
  },
  {
    id: "fixed-deposit-interest",
    incomeType: "fixed-deposit-interest",
    summary:
      "Fixed-deposit or savings-interest income certification requires a bank certificate copy and the original.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.108"], source: LMC_FAQ },
  },
  {
    id: "foreign-income",
    incomeType: "foreign-income",
    summary:
      "Foreign-income certification requires a recommendation letter authenticated by the Nepali embassy in that country or by that country's embassy in Nepal.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.109"], source: LMC_FAQ },
  },
  {
    id: "english-statement",
    incomeType: "english-statement",
    summary:
      "An English income statement application must include copies of the citizenship certificate and relationship certificate.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.110"], source: LMC_FAQ },
  },
  {
    id: "land-valuation",
    incomeType: "land-valuation",
    summary:
      "Land valuation at current market rate requires a copy of the land ownership certificate (Lalpurja).",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.112"], source: LMC_FAQ },
  },
  {
    id: "sponsor-relationship",
    incomeType: "sponsor-relationship",
    summary: "A sponsor-student land-valuation case must include a relationship-certificate copy.",
    source: LMC_FAQ,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["A.114"], source: LMC_FAQ },
  },
];
