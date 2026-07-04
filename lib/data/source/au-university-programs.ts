import type { AuUniversityProgram } from "@/lib/data/types";

/**
 * Non-RMIT Australian university programs offered to international students
 * (programs category E), each carrying whatever sourced facts the provider
 * states: a program CRICOS code, 2026 indicative international tuition (first
 * year and/or whole program), and inline IELTS minimums / professional
 * accreditation where given. A generic shape (detail fields optional) lets
 * heterogeneous providers share one module; RMIT keeps its dedicated module.
 *
 * Institution- or general-level English requirements that don't accompany a
 * shipped program (e.g. Melbourne's on-campus Master of Education, Torrens's
 * general entry band) live in au-provider-english-minimums.ts instead.
 *
 * Fact-only — no scorer reads it; it backs the eventual program/course view and
 * is machine-checked against the findings.
 */
const TORRENS_NEPAL_SOURCE =
  "https://www.torrens.edu.au/studying-with-us/international-students/studying-in-australia/nepal";

export const AU_UNIVERSITY_PROGRAMS: AuUniversityProgram[] = [
  {
    id: "uts-master-of-pharmacy",
    provider: "University of Technology Sydney",
    programName: "Master of Pharmacy",
    level: "master",
    firstYearTuitionAud: 38100,
    totalTuitionAud: 98718,
    fieldOfStudy: "Pharmacy",
    test: "IELTS",
    overallMin: 7.0,
    perBandMin: 7.0,
    accreditingBody: "Australian Pharmacy Council",
    source: "https://www.uts.edu.au/courses/master-of-pharmacy",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["E.101", "E.102", "E.103", "E.104", "E.105", "E.106", "E.107", "E.108"],
      note: "IELTS 7.0 overall and 7.0 in every subtest (2026). Provider CRICOS 00099F is shipped separately (D.022).",
    },
  },
  {
    id: "unimelb-master-of-education-online",
    provider: "University of Melbourne",
    programName: "Master of Education (Online)",
    level: "master",
    firstYearTuitionAud: 27000,
    fieldOfStudy: "Education",
    source:
      "https://study.unimelb.edu.au/find/courses/graduate/master-of-education-online/entry-requirements/",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["E.100"],
      note: "2026 indicative first-year fee; online variant — the on-campus fee may differ.",
    },
  },
  {
    id: "deakin-master-of-data-science",
    provider: "Deakin University",
    programName: "Master of Data Science",
    level: "master",
    firstYearTuitionAud: 34400,
    fieldOfStudy: "Data science",
    test: "IELTS",
    overallMin: 6.5,
    perBandMin: 6.0,
    source: "https://www.deakin.edu.au/course/master-data-science",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["E.049", "E.050"],
      note: "Estimated AUD 34,400 for one year full-time (2026). IELTS 6.5/6.0 (E.050) is sourced from Deakin's international-variant course page (master-data-science-global-international), a different URL than the tuition finding's course page — same program, two Deakin listings.",
    },
  },

  // Torrens University programs offered to Nepalese students, by program CRICOS code.
  {
    id: "torrens-bachelor-of-business",
    provider: "Torrens University Australia",
    programName: "Bachelor of Business",
    level: "bachelor",
    cricosCode: "090275E",
    fieldOfStudy: "Business",
    source: TORRENS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.031"] },
  },
  {
    id: "torrens-master-of-information-technology-advanced",
    provider: "Torrens University Australia",
    programName: "Master of Information Technology (Advanced)",
    level: "master",
    cricosCode: "107045J",
    fieldOfStudy: "Information technology",
    source: TORRENS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.032"] },
  },
  {
    id: "torrens-master-of-business-administration-advanced",
    provider: "Torrens University Australia",
    programName: "Master of Business Administration (Advanced)",
    level: "master",
    cricosCode: "088149G",
    fieldOfStudy: "Business",
    source: TORRENS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.033"] },
  },
  {
    id: "torrens-bachelor-of-information-technology",
    provider: "Torrens University Australia",
    programName: "Bachelor of Information Technology",
    level: "bachelor",
    cricosCode: "108468M",
    fieldOfStudy: "Information technology",
    source: TORRENS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.034"] },
  },
  {
    id: "torrens-master-of-public-health-advanced",
    provider: "Torrens University Australia",
    programName: "Master of Public Health (Advanced)",
    level: "master",
    cricosCode: "095594E",
    fieldOfStudy: "Public health",
    source: TORRENS_NEPAL_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.035"] },
  },
];
