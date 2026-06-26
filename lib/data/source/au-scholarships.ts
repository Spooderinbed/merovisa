import type { AuScholarship } from "@/lib/data/types";

/**
 * Australian study scholarships beyond the Australia Awards (English-tests &
 * scholarships category J). Each record carries whatever the funder publishes:
 * a per-year award amount, the number granted annually, the funder's total
 * annual scholarship spend, and/or descriptive benefits. Published floors (e.g.
 * "more than 300 awarded") keep their qualifier in the note. A funder-wide pool
 * figure (a university's whole scholarship spend across all awards) is surfaced
 * with an explicit "across all its scholarships" qualifier, never as a single
 * applyable award. Fact-only — no scorer reads it; machine-checked against the
 * findings.
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
    researchDegreeOnly: true,
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
    // J2.009 is the University's TOTAL annual scholarship spend across every award
    // (coursework + research) — a funder-wide pool, NOT one applyable award. It is
    // kept as the sourced figure but surfaced with an "across all its scholarships"
    // qualifier (see formatAmount) so it is never read as a single award a student
    // would receive. The specific applyable awards (e.g. RTP/USydIS) and their
    // research-only nature are not yet ledgered as findings, so they are not
    // claimed here.
    totalAnnualValueAud: 135000000,
    source: "https://www.sydney.edu.au/scholarships/international.html",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J2.009"],
      note: "Over AUD 135 million awarded annually across domestic and international students — the University's total scholarship pool across all awards, not a single applyable scholarship.",
    },
  },
];
