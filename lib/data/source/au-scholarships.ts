import type { AuScholarship } from "@/lib/data/types";

/**
 * Australian study scholarships beyond the Australia Awards (English-tests &
 * scholarships category J). Each record carries whatever the funder publishes:
 * a per-year award amount, the number granted annually, the funder's total
 * annual scholarship spend, and/or descriptive benefits. "More than 300" and
 * "over AUD 135 million" are recorded as the stated floor with the qualifier in
 * the note. Fact-only — no scorer reads it; machine-checked against the findings.
 */
export const AU_SCHOLARSHIPS: AuScholarship[] = [
  {
    id: "destination-australia-scholarship",
    provider: "Australian Government (Department of Education)",
    name: "Destination Australia Scholarship",
    annualAmountAud: 15000,
    regionalCampusOnly: true,
    source: "https://internationaleducation.gov.au/news/latest-news/Pages/Destination-Australia.aspx",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J2.006"],
      note: "AUD 15,000 per year for eligible international students at a regional campus.",
    },
  },
  {
    id: "unimelb-graduate-research-scholarship",
    provider: "University of Melbourne",
    name: "Graduate Research Scholarship",
    annualScholarshipCount: 300,
    benefits: ["living allowance", "tuition remission"],
    source: "https://study.unimelb.edu.au/how-to-apply/graduate-research/international-applications/applications",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J2.008", "J2.007"],
      note: "More than 300 awarded to international graduate-research students annually; each provides a living allowance and tuition remission (J2.007, descriptive).",
    },
  },
  {
    id: "university-of-sydney-scholarships",
    provider: "University of Sydney",
    name: "University of Sydney scholarships (all)",
    totalAnnualValueAud: 135000000,
    source: "https://www.sydney.edu.au/scholarships/international.html",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J2.009"],
      note: "Over AUD 135 million awarded annually across domestic and international students.",
    },
  },
];
