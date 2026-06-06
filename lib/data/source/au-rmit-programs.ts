import type { AuRmitProgram } from "@/lib/data/types";

/**
 * RMIT University engineering programs offered to international students, with
 * the 2026 indicative annual international fee (AUD per year — not a program
 * total) and standard full-time duration, from the RMIT international guide.
 * Each program is one record citing its duration + tuition finding pair; the
 * reconcile walker matches each finding's value against the record's leaf union.
 * Fact-only — no scorer reads it; it backs the eventual program/course view and
 * is machine-checked against the findings.
 */
const RMIT_GUIDE_SOURCE =
  "https://www.rmit.edu.au/content/dam/rmit/documents/study-with-us/career-advisers/brochures/rmit-international-guide.pdf";

export const AU_RMIT_PROGRAMS: AuRmitProgram[] = [
  {
    id: "be-civil-infrastructure-honours",
    provider: "RMIT University",
    programName: "Bachelor of Engineering (Civil and Infrastructure) (Honours)",
    level: "bachelor",
    tuitionAudPerYear: 47040,
    durationYears: 4,
    fieldOfStudy: "Civil engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.069", "E.070"] },
  },
  {
    id: "me-civil-engineering",
    provider: "RMIT University",
    programName: "Master of Engineering (Civil Engineering)",
    level: "master",
    tuitionAudPerYear: 48000,
    durationYears: 2,
    fieldOfStudy: "Civil engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.071", "E.072"] },
  },
  {
    id: "be-electrical-engineering-honours",
    provider: "RMIT University",
    programName: "Bachelor of Engineering (Electrical Engineering) (Honours)",
    level: "bachelor",
    tuitionAudPerYear: 47040,
    durationYears: 4,
    fieldOfStudy: "Electrical engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.073", "E.074"] },
  },
  {
    id: "me-electrical-engineering",
    provider: "RMIT University",
    programName: "Master of Engineering (Electrical Engineering)",
    level: "master",
    tuitionAudPerYear: 48000,
    durationYears: 2,
    fieldOfStudy: "Electrical engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.075", "E.076"] },
  },
  {
    id: "be-mechanical-engineering-honours",
    provider: "RMIT University",
    programName: "Bachelor of Engineering (Mechanical Engineering) (Honours)",
    level: "bachelor",
    tuitionAudPerYear: 47040,
    durationYears: 4,
    fieldOfStudy: "Mechanical engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.077", "E.078"] },
  },
  {
    id: "me-mechanical-engineering",
    provider: "RMIT University",
    programName: "Master of Engineering (Mechanical Engineering)",
    level: "master",
    tuitionAudPerYear: 48000,
    durationYears: 2,
    fieldOfStudy: "Mechanical engineering",
    source: RMIT_GUIDE_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["E.079", "E.080"] },
  },
];
