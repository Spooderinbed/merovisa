import type { AuPathwayProgram } from "@/lib/data/types";

/**
 * Pathway-college programs that lead into an Australian university (providers
 * category D): the diploma and foundation courses a Nepalese student can use as a
 * pre-degree step. Each record carries the published international tuition and the
 * standard (and accelerated, where offered) duration in months.
 *
 * Transition-rate marketing ("96% progress to the university") is deferred — it's
 * self-reported success framing, not a neutral program fact. Fact-only — no scorer
 * reads it; machine-checked against the findings.
 */
export const AU_PATHWAY_PROGRAMS: AuPathwayProgram[] = [
  {
    id: "uts-college-diploma-information-technology",
    college: "UTS College",
    programName: "Diploma of Information Technology",
    type: "diploma",
    leadsTo: "University of Technology Sydney",
    tuitionAud: 39000,
    durationMonths: 12,
    acceleratedDurationMonths: 8,
    source: "https://utscollege.edu.au/programs/diplomas/diploma-of-information-technology",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["D.071", "D.072", "D.073"],
      note: "International fee A$39,000; 12-month standard or 8-month accelerated.",
    },
  },
  {
    id: "deakin-college-diploma-information-technology",
    college: "Deakin College",
    programName: "Diploma of Information Technology",
    type: "diploma",
    leadsTo: "Deakin University",
    tuitionAud: 37600,
    source: "https://www.deakincollege.edu.au/courses/diploma/information-technology/",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["D.069"], note: "2026 international fee A$37,600." },
  },
  {
    id: "usyd-foundation-standard-intensive",
    college: "Taylors College",
    programName: "University of Sydney Foundation Program (Standard Intensive)",
    type: "foundation",
    leadsTo: "University of Sydney",
    durationMonths: 9,
    source: "https://www.taylorssydney.edu.au/wp-content/uploads/taylors_college_sydney_2026_prospectus_web.pdf",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["D.064"], note: "Standard Intensive variant spans 9 months." },
  },
];
