import type { NepalApplicationFee } from "@/lib/data/types";

/**
 * Nepal-side out-of-pocket fees a Subclass 500 applicant pays during the
 * application journey — English test, visa logistics (VFS), the panel medical,
 * and government documents (passport, citizenship, academic equivalence).
 * Amounts in NPR, each traced to its finding.
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
const PASSPORT_DEPT_SOURCE = "https://nepalpassport.gov.np/process/-41";
const DAO_TANAHUN_SOURCE = "https://daotanahu.moha.gov.np/";
const TU_CDC_SOURCE = "https://tucdc.edu.np/faq";

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
    provenance: {
      findingRefs: ["B.121", "G.051"],
      note: "Corroborated by Edwise (G.051), an independent consultancy source listing the same NPR 36,000 computer-based fee for 2026.",
    },
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
  {
    id: "passport-34-page",
    label: "Nepal passport, 34-page (Department of Passports)",
    kind: "document",
    amountNpr: 12_000,
    source: PASSPORT_DEPT_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.047"] },
  },
  {
    id: "passport-66-page",
    label: "Nepal passport, 66-page (Department of Passports)",
    kind: "document",
    amountNpr: 20_000,
    source: PASSPORT_DEPT_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.048"] },
  },
  {
    id: "citizenship-by-descent",
    label: "Citizenship certificate by descent — ticket fee (District Administration Office)",
    kind: "document",
    amountNpr: 10,
    source: DAO_TANAHUN_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.052"] },
  },
  {
    id: "citizenship-duplicate",
    label: "Duplicate citizenship certificate — ticket fee (District Administration Office)",
    kind: "document",
    amountNpr: 20,
    source: DAO_TANAHUN_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.054"] },
  },
  {
    id: "tu-equivalence-regular",
    label: "TU academic equivalence, regular (TU CDC)",
    kind: "document",
    amountNpr: 1_000,
    source: TU_CDC_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.085"] },
  },
  {
    id: "tu-equivalence-procedural",
    label: "TU academic equivalence, procedural — new university or subject (TU CDC)",
    kind: "document",
    amountNpr: 4_000,
    source: TU_CDC_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["A.086"] },
  },
];
