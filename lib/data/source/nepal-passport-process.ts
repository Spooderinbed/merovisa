import type { NepalPassportProcess } from "@/lib/data/types";

/**
 * Nepal e-passport pre-enrolment process (logistics category A). How a student who
 * does not yet hold a passport begins: the online pre-enrolment form (A.043), choosing
 * an enrolment centre + appointment (A.044), the barcoded/QR copy produced on submission
 * (A.045), and giving photo + biometrics at the centre (A.046). Prose steps consumed by
 * the checklist (the conditional passport-row note) + the plan (the start-passport-process
 * action). The central-office ~2-working-day turnaround (A.049) is reused read-only from
 * nepal-document-processing-times.ts — NOT re-owned here. Fees (A.047/A.048) live in
 * nepal-application-fees (cost-to-apply). Fact-only — no scorer reads it; machine-checked
 * against the findings (see provenance.findingRefs).
 *
 * Summaries are article/noun-first fragments so the generators compose them into
 * sentences (the slice-I pattern); each record's provenance.note records its source claim.
 */
const PASSPORT_PROCESS = "https://nepalpassport.gov.np/process/-4";

export const NEPAL_PASSPORT_PROCESS: NepalPassportProcess[] = [
  {
    id: "pre-enrolment",
    label: "Online pre-enrolment",
    summary: "the online pre-enrolment form on the Department of Passports website",
    source: PASSPORT_PROCESS,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.043"],
      source: PASSPORT_PROCESS,
      note: "Nepal e-passport: the first step is completing the online pre-enrolment form on the Department of Passports website (A.043).",
    },
  },
  {
    id: "choose-centre",
    label: "Centre & appointment",
    summary: "your enrolment centre and appointment",
    source: PASSPORT_PROCESS,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.044"],
      source: PASSPORT_PROCESS,
      note: "Nepal e-passport: during pre-enrolment the applicant chooses an enrolment centre and appointment date (A.044).",
    },
  },
  {
    id: "barcode-copy",
    label: "Barcode/QR copy",
    summary: "a copy with a barcode and QR code to bring along",
    source: PASSPORT_PROCESS,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.045"],
      source: PASSPORT_PROCESS,
      note: "Nepal e-passport: after submitting the form the applicant receives a copy bearing a barcode and QR code to bring to the centre (A.045).",
    },
  },
  {
    id: "enrolment-biometrics",
    label: "Photo & biometrics",
    summary: "your photo and biometrics at the enrolment centre",
    source: PASSPORT_PROCESS,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.046"],
      source: PASSPORT_PROCESS,
      note: "Nepal e-passport: at the enrolment centre registration captures the applicant's photo and biometrics (A.046).",
    },
  },
];
