import type { AuProviderApplicationFee } from "@/lib/data/types";

/**
 * Application fees Australian providers charge international students, in AUD
 * (0 = no fee). Captures whether a fee always applies, is conditional, or does
 * not exist, plus refundability where the source states it. Fact-only — no scorer
 * reads it; it backs the eventual cost-of-applying view and is machine-checked
 * against the findings.
 */
export const AU_PROVIDER_APPLICATION_FEES: AuProviderApplicationFee[] = [
  {
    id: "uts",
    provider: "University of Technology Sydney",
    amountAud: 100,
    conditionality: "standard",
    refundable: false,
    source: "https://www.uts.edu.au/for-students/admissions-entry/fees-costs/international-fees",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["D.102", "D.103"],
      note: "Waived for current UTS students applying for a second degree and current UTS College students applying to a UTS course.",
    },
  },
  {
    id: "university-of-sydney",
    provider: "University of Sydney",
    amountAud: 150,
    conditionality: "standard",
    refundable: false,
    source: "https://www.sydney.edu.au/study/fees-and-loans/other-costs.html",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["D.104"] },
  },
  {
    id: "monash",
    provider: "Monash University",
    amountAud: 125,
    conditionality: "standard",
    source: "https://www.monash.edu/admissions/apply/online",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["D.107"] },
  },
  {
    id: "unsw",
    provider: "UNSW Sydney",
    amountAud: 150,
    conditionality: "conditional",
    refundable: false,
    source: "https://www.unsw.edu.au/study/how-to-apply/apply-online-faqs",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["D.109"],
      note: 'UNSW\'s Apply Online FAQ says the AUD 150 fee "may be payable" and then lists exclusions, so it is not charged in every case.',
    },
  },
  {
    id: "trinity-foundation",
    provider: "Trinity College Foundation Studies",
    amountAud: 0,
    conditionality: "none",
    source:
      "https://www.trinity.unimelb.edu.au/getmedia/e18d90bb-0b2a-461a-8dc1-04bd9fccebc6/TCFS-APP-FORM.aspx",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["D.062"], note: "Trinity College Foundation Studies states there is no application fee." },
  },
];
