import type { AuProviderEnglishMinimum } from "@/lib/data/types";

/**
 * Minimum English requirements (as IELTS bands) Australian providers set for
 * international entry. `overallMin` is the headline overall band; `perBandMin`
 * is the per-subtest floor where the provider states one. Fact-only — no scorer
 * reads it; it backs the eventual entry-requirements view and is machine-checked
 * against the findings.
 */
export const AU_PROVIDER_ENGLISH_MINIMUMS: AuProviderEnglishMinimum[] = [
  {
    id: "trinity-foundation",
    provider: "Trinity College Foundation Studies",
    test: "IELTS",
    overallMin: 6.0,
    perBandMin: 5.5,
    appliesTo: "Standard or Comprehensive Foundation Studies",
    source: "https://www.trinity.unimelb.edu.au/pathways-school/who-can-apply/entry-requirements",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["D.061"], note: "IELTS 6.0 overall with no band below 5.5 (2026)." },
  },
  {
    id: "holmesglen-cert3-carpentry",
    provider: "Holmesglen Certificate III in Carpentry (international)",
    test: "IELTS",
    overallMin: 6.0,
    source:
      "https://www.holmesglen.edu.au/explore-courses/building-and-construction/carpentry-and-joinery/vocational-education/certificate-iii-in-carpentry-int",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["D.085"],
      note: "Program-level requirement (IELTS 6.0 or equivalent), not an institution-wide minimum.",
    },
  },
  {
    id: "aibt-cert4-accounting",
    provider: "AIBT Certificate IV in Accounting and Bookkeeping",
    test: "IELTS",
    overallMin: 6.0,
    source: "https://aibtglobal.edu.au/wp-content/files/docs/2026/q1/AIBT%20Course%20Fees%202026%20V1.3_LR.pdf",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["D.088"],
      note: "Program-level requirement listed in the 2026 fee guide; time-sensitive.",
    },
  },
  {
    id: "western-sydney-general",
    provider: "Western Sydney University",
    test: "IELTS",
    overallMin: 6.5,
    perBandMin: 6.0,
    appliesTo: "most programs",
    source: "https://www.westernsydney.edu.au/international/studying/entry-requirements",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["D.113"], note: "IELTS 6.5 overall, minimum 6.0 in each subtest; course exceptions apply." },
  },
  {
    id: "unimelb-master-of-education",
    provider: "University of Melbourne Master of Education",
    test: "IELTS",
    overallMin: 6.5,
    perBandMin: 6.0,
    appliesTo: "Master of Education (graduate coursework, on-campus)",
    source: "https://study.unimelb.edu.au/find/courses/graduate/master-of-education/entry-requirements/",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["E.095", "E.096", "E.097", "E.098", "E.099"],
      note: "IELTS 6.5 overall with no subtest band below 6.0.",
    },
  },
  {
    id: "torrens-general",
    provider: "Torrens University Australia",
    test: "IELTS",
    overallMin: 6.5,
    perBandMin: 6.0,
    appliesTo: "general entry for Nepalese applicants",
    source: "https://www.torrens.edu.au/studying-with-us/international-students/studying-in-australia/nepal",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["E.030"],
      note: "IELTS 6.5 overall, no band below 6.0; individual courses may require higher.",
    },
  },
];
