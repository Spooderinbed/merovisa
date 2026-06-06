import type { NepalApplicationFee } from "@/lib/data/types";

/**
 * Nepal-side out-of-pocket fees a Subclass 500 applicant pays during the
 * application journey — English test, visa logistics (VFS), and the panel
 * medical. Amounts in NPR, each traced to its finding.
 *
 * Fact-only data: no scorer reads it, so it moves no verdict. It backs the
 * eventual "cost of applying from Nepal" breakdown and is machine-checked
 * against the findings like every other slice.
 *
 * The English-test fees are IDP Kathmandu's computer-delivered prices. TOEFL
 * and PTE Nepal fees were not published in static text (findings B.123/B.124),
 * so they stay pending rather than guessed.
 */
const VFS_KATHMANDU_SOURCE = "https://visa.vfsglobal.com/npl/en/aus/attend-centre/kathmandu";
const IDP_KATHMANDU_SOURCE = "https://ielts.org/test-centres/idp-education-nepal-private-ltd-kathmandu-test-room";

export const NEPAL_APPLICATION_FEES: NepalApplicationFee[] = [
  {
    id: "vfs-biometric",
    label: "VFS Kathmandu biometric collection fee (Australia)",
    kind: "visa-logistics",
    amountNpr: 2_365,
    source: VFS_KATHMANDU_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.097"] },
  },
  {
    id: "vfs-lodgement-assist",
    label: "VFS Kathmandu online visa-form lodgement assistance fee",
    kind: "visa-logistics",
    amountNpr: 472,
    source: VFS_KATHMANDU_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.098"] },
  },
  {
    id: "ielts-academic-computer",
    label: "IELTS Academic (computer-delivered), IDP Kathmandu",
    kind: "english-test",
    amountNpr: 36_000,
    source: IDP_KATHMANDU_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.121"] },
  },
  {
    id: "ielts-ukvi-academic-computer",
    label: "IELTS UKVI Academic (computer-delivered), IDP Kathmandu",
    kind: "english-test",
    amountNpr: 36_400,
    source: IDP_KATHMANDU_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.122"] },
  },
  {
    id: "panel-medical-exam",
    label: "Immigration medical examination + serum creatinine (Norvic)",
    kind: "medical",
    amountNpr: 6_400,
    source: "https://patient.norvichospital.com/doctor/slot/PPHY/0",
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["B.125"] },
  },
];
