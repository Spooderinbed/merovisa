import type { AuHealthBiometricFact } from "@/lib/data/types";

/**
 * DHA health-requirement and biometrics facts an Australian visa applicant meets
 * along the way (visa-conditions category C, plus the Services Australia
 * reciprocal-agreement count from arrival category H). One labeled value per
 * record, each traced to its own finding — the same shape as AuStudentVisaLimit.
 *
 * Sources are primary: DHA health pages, Services Australia, and (for the Nepal
 * biometric fee) VFS Global, DHA's contracted biometrics provider. Fact-only —
 * no scorer reads it; it backs the eventual health/biometrics steps view and is
 * machine-checked against the findings.
 */
export const AU_HEALTH_BIOMETRIC_FACTS: AuHealthBiometricFact[] = [
  {
    id: "health-examination-validity",
    topic: "health",
    kind: "validity",
    label: "Health examination result validity",
    value: 12,
    unit: "months",
    source:
      "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/when-to-have-health-examinations",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.092"], note: "Results are generally valid for 12 months." },
  },
  {
    id: "significant-cost-threshold",
    topic: "health",
    kind: "cost-threshold",
    label: "Significant Cost Threshold (health requirement)",
    value: 86000,
    unit: "AUD",
    source:
      "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/protecting-health-care-and-community-services",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.101"],
      note: "Likely health-care/community-service costs above this can fail the health requirement.",
    },
  },
  {
    id: "reciprocal-health-care-agreement-countries",
    topic: "health",
    kind: "agreement-count",
    label: "Countries with a reciprocal health care agreement with Australia",
    value: 11,
    unit: "countries",
    source: "https://www.servicesaustralia.gov.au/reciprocal-health-care-agreements",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["H.048"],
      note: "Nepal is not among the 11 — Nepalese students rely on OSHC, not Medicare reciprocity.",
    },
  },
  {
    id: "nepal-biometrics-program-inclusion",
    topic: "biometrics",
    kind: "program-inclusion",
    label: "Nepal included in Australia's biometrics program",
    value: true,
    source: "https://india.highcommission.gov.au/ndli/vm_biometrics.html",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.123"], note: "Applicants in Nepal provide biometrics as part of the visa process." },
  },
  {
    id: "vfs-kathmandu-biometric-collection-fee",
    topic: "biometrics",
    kind: "service-fee",
    label: "VFS Global Kathmandu biometric collection service fee",
    value: 2365,
    unit: "NPR",
    source: "https://visa.vfsglobal.com/npl/en/aus/attend-centre/kathmandu",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["C.127"], note: "Service fee charged at the Kathmandu biometrics centre (NPR 2,365.00)." },
  },
];
