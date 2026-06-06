import type { AuStudentVisaLimit } from "@/lib/data/types";

/**
 * Key numeric limits governing the Australian student-visa journey, as published
 * by the Department of Home Affairs: maximum stay periods (Subclass 500 and the
 * 590 Student Guardian), the 48-hour-a-fortnight work cap (student holder and
 * accompanying family member), the category median processing time, and the
 * Genuine Student response word limit. One numeric value + unit per record, each
 * traced to its own finding. Fact-only — no scorer reads it; it backs the
 * eventual visa-conditions view and is machine-checked against the findings.
 */
const DHA_STUDENT_500_SOURCE =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500";
const DHA_STUDENT_500_LENGTH_OF_STAY_SOURCE =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/length-of-stay";

export const AU_STUDENT_VISA_LIMITS: AuStudentVisaLimit[] = [
  {
    id: "subclass-500-max-stay",
    subclass: 500,
    kind: "stay-period",
    appliesTo: "student",
    label: "Maximum stay (in line with enrolment)",
    value: 6,
    unit: "years",
    source: DHA_STUDENT_500_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.001"], note: "Up to 6 years and granted in line with enrolment." },
  },
  {
    id: "subclass-500-student-work-limit",
    subclass: 500,
    kind: "work-limit",
    appliesTo: "student",
    label: "Work limit while course is in session",
    value: 48,
    unit: "hours-per-fortnight",
    source: DHA_STUDENT_500_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.019"], note: "Unlimited only for a Masters by research or doctorate (C.022)." },
  },
  {
    id: "subclass-500-family-work-limit",
    subclass: 500,
    kind: "work-limit",
    appliesTo: "family-member",
    label: "Family member work limit while course is in session",
    value: 48,
    unit: "hours-per-fortnight",
    source:
      "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions?vcid=179",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["C.021"],
      note: "Contradicts the common claim that all partners of degree-level students have unlimited work rights; family cannot work before the course starts (C.020).",
    },
  },
  {
    id: "subclass-500-primary-school-period",
    subclass: 500,
    kind: "stay-period",
    appliesTo: "student",
    label: "Maximum visa period (primary school)",
    value: 3,
    unit: "years",
    source: DHA_STUDENT_500_LENGTH_OF_STAY_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.028"], note: "Primary-school-aged students; generally 3 years." },
  },
  {
    id: "subclass-500-high-school-period",
    subclass: 500,
    kind: "stay-period",
    appliesTo: "student",
    label: "Maximum visa period (high school, years 7–12)",
    value: 6,
    unit: "years",
    source: DHA_STUDENT_500_LENGTH_OF_STAY_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.029"] },
  },
  {
    id: "subclass-500-median-processing-time",
    subclass: 500,
    kind: "processing-time",
    appliesTo: "student",
    label: "Median processing time (category, April 2026)",
    value: 28,
    unit: "days",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["C.030"],
      effectiveDate: "2026-04-01",
      note: "Whole-category median for April 2026, not a Nepal-only or provider-specific band; DHA revises it monthly.",
    },
  },
  {
    id: "subclass-590-max-stay",
    subclass: 590,
    kind: "stay-period",
    appliesTo: "guardian",
    label: "Maximum stay (Student Guardian)",
    value: 5,
    unit: "years",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-590",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.034"], note: "Subclass 590 supports a child who holds a Student visa." },
  },
  {
    id: "subclass-500-gs-response-word-limit",
    subclass: 500,
    kind: "application-limit",
    appliesTo: "student",
    label: "Genuine Student response word limit (per question)",
    value: 150,
    unit: "words",
    source: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.134"] },
  },
];
