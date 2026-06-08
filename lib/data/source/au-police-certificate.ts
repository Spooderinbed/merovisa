import type { AuPoliceCertificate } from "@/lib/data/types";

/**
 * DHA police / character-certificate requirement (logistics category A) for an
 * Australian student-visa applicant: DHA may ask for a police certificate from each
 * country where the applicant spent 12 months or more in the last 10 years, counting
 * only time after turning 16 (A.039, a single record). `summary` is the sentence the
 * plan/checklist render. The Nepal-side OPCR/CID process (A.094–A.103) is a future
 * slice — not here. Fact-only — no scorer reads it; machine-checked against finding
 * A.039 (see provenance.findingRefs).
 */
const DHA_CHARACTER =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/character/police-certificates";

export const AU_POLICE_CERTIFICATE: AuPoliceCertificate[] = [
  {
    id: "police-certificate-requirement",
    label: "Police certificate (character requirement)",
    summary:
      "DHA may ask for a police certificate from each country where you spent 12 months or more in the last 10 years, counting only time after you turned 16.",
    source: DHA_CHARACTER,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.039"],
      source: DHA_CHARACTER,
      note: "DHA: applicants might need a police certificate from each country where they spent 12 months or more in the last 10 years after turning 16.",
    },
  },
];
