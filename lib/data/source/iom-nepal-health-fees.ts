import type { IomNepalHealthFee } from "@/lib/data/types";

/**
 * IOM Nepal's Australia health-assessment fees a Subclass 500 applicant pays for
 * the panel medical, in USD (IOM Nepal publishes this schedule in USD, not NPR).
 * Individual line items from the Australia health-assessment schedule plus the
 * combined MHAC package. Fact-only — no scorer reads it; it backs the "cost of
 * applying from Nepal" breakdown alongside NEPAL_APPLICATION_FEES.
 */
const IOM_HA_AUSTRALIA_SOURCE =
  "https://nepal.iom.int/sites/g/files/tmzbdl1116/files/healthassessments/ha-australia.pdf";
const IOM_MHAC_SOURCE =
  "https://nepal.iom.int/sites/g/files/tmzbdl1116/files/healthassessments/iom-nepal-mhac-service-fees.pdf";

export const IOM_NEPAL_HEALTH_FEES: IomNepalHealthFee[] = [
  {
    id: "medical-exam-501",
    label: "501 Medical Examination",
    examCode: "501",
    amountUsd: 49,
    source: IOM_HA_AUSTRALIA_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.117"] },
  },
  {
    id: "chest-xray-502",
    label: "502 Chest X-ray Examination",
    examCode: "502",
    amountUsd: 25,
    source: IOM_HA_AUSTRALIA_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.118"] },
  },
  {
    id: "hiv-707",
    label: "707 HIV testing",
    examCode: "707",
    amountUsd: 6,
    source: IOM_HA_AUSTRALIA_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.119"] },
  },
  {
    id: "hepb-708",
    label: "708 Hepatitis B testing",
    examCode: "708",
    amountUsd: 8,
    source: IOM_HA_AUSTRALIA_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.120"] },
  },
  {
    id: "hepc-716",
    label: "716 Hepatitis C testing",
    examCode: "716",
    amountUsd: 8,
    source: IOM_HA_AUSTRALIA_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.121"] },
  },
  {
    id: "mhac-package",
    label: "Medical Exam + X-Ray + Blood Test (MHAC package)",
    amountUsd: 93,
    source: IOM_MHAC_SOURCE,
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["C.122"] },
  },
];
