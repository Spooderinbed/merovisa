import type { AuBiometrics } from "@/lib/data/types";

/**
 * DHA biometrics-readiness fact (logistics category A) for an Australian student-visa
 * applicant: after lodging, the Australian Immi App requires the biometrics letter
 * whose Visa Lodgement Number starts with "AUI" (A.031, a single record). The
 * Nepal-side biometrics facts — Nepal's inclusion in the program (C.123) and the VFS
 * Kathmandu collection fee (C.127) — are reused read-only from au-health-biometric-
 * facts, not duplicated here. Fact-only — no scorer reads it; machine-checked against
 * finding A.031 (see provenance.findingRefs).
 */
const DHA_IMMI_APP =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/biometrics/australian-immi-app";

export const AU_BIOMETRICS: AuBiometrics[] = [
  {
    id: "immi-app-biometrics-letter",
    label: "Immi App biometrics letter",
    summary:
      "After you lodge, the Australian Immi App requires your biometrics letter, whose Visa Lodgement Number starts with 'AUI'.",
    source: DHA_IMMI_APP,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.031"],
      source: DHA_IMMI_APP,
      note: "DHA: the Australian Immi App requires the biometrics letter with a Visa Lodgement Number that starts with AUI.",
    },
  },
];
