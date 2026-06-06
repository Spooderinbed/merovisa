import type { NepalDocumentProcessingTime } from "@/lib/data/types";

/**
 * Typical processing turnaround (in working days) for the Nepal-side documents
 * a Subclass 500 applicant must obtain, as published by each issuing authority.
 * Companion to NEPAL_APPLICATION_FEES (the cost dimension) — this is the time
 * dimension of the same document journey.
 *
 * Fact-only data: no scorer reads it, so it moves no verdict. It backs the
 * eventual "how long applying from Nepal takes" timeline and is machine-checked
 * against the findings like every other slice.
 *
 * Scope: only services the issuer states as a fixed number of *working days*.
 * Variable, same-day, or approximate turnarounds — passports via a district
 * office (15–45 calendar days, A.050), same-day citizenship certificates
 * (A.051/A.053), ~1-month procedural equivalence (A.088) — stay pending for a
 * follow-up slice that models ranges and same-day issuance.
 */
const PASSPORT_DEPT_SOURCE = "https://nepalpassport.gov.np/process/-10";
const TU_CDC_SOURCE = "https://tucdc.edu.np/faq";
const POLICE_OPCR_SOURCE = "https://opcr.nepalpolice.gov.np/";

export const NEPAL_DOCUMENT_PROCESSING_TIMES: NepalDocumentProcessingTime[] = [
  {
    id: "passport-central",
    label: "Ordinary e-passport (Department of Passports, central office)",
    issuer: "Department of Passports",
    typicalBusinessDays: 2,
    source: PASSPORT_DEPT_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["A.049"] },
  },
  {
    id: "tu-equivalence-regular",
    label: "TU academic equivalence, regular service (TU CDC)",
    issuer: "Tribhuvan University Curriculum Development Centre",
    typicalBusinessDays: 3,
    source: TU_CDC_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["A.087"] },
  },
  {
    id: "police-character-standard",
    label: "Police character certificate, standard service (Nepal Police OPCR)",
    issuer: "Nepal Police",
    typicalBusinessDays: 2,
    source: POLICE_OPCR_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["A.098"] },
  },
  {
    id: "police-character-urgent",
    label: "Police character certificate, urgent service (Nepal Police OPCR)",
    issuer: "Nepal Police",
    typicalBusinessDays: 1,
    source: POLICE_OPCR_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["A.099"] },
  },
];
