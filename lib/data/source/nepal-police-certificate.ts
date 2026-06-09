import type { NepalPoliceCertificate } from "@/lib/data/types";

/**
 * Nepal-side police / OPCR character-certificate process (logistics category A). The
 * sequel to au-police-certificate.ts: how the Nepal Police character certificate is
 * obtained — the OPCR application route (online via the OPCR portal or the Nagarik
 * App, including from abroad — A.095/A.096/A.097, the dup_group G8 enumeration plus
 * A.097 collapsed into one route record), the uploaded document set (A.100), and the
 * 3-month study/migration validity (A.102). Prose rules consumed by the plan +
 * checklist generators. The OPCR turnarounds (A.098/A.099) are reused read-only from
 * nepal-document-processing-times.ts — NOT re-owned here. Fact-only — no scorer reads
 * it; machine-checked against the findings (see provenance.findingRefs).
 *
 * `required-document` summaries are article-first (render after "you'll upload …");
 * `application-route` / `validity-rule` summaries are standalone sentences.
 */
const POLICE_OPCR = "https://opcr.nepalpolice.gov.np/";

export const NEPAL_POLICE_CERTIFICATE: NepalPoliceCertificate[] = [
  {
    id: "opcr-application-route",
    kind: "application-route",
    label: "How to apply",
    summary:
      "You can apply online through the Nepal Police OPCR portal or the Nagarik App, including from outside Nepal.",
    source: POLICE_OPCR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.095", "A.096", "A.097"],
      source: POLICE_OPCR,
      note: "Nepal Police OPCR: apply online from home/cyber (A.095) or via the Nagarik App (A.096); applicants outside Nepal can also apply (A.097).",
    },
  },
  {
    id: "opcr-document-set",
    kind: "required-document",
    label: "Documents to upload",
    summary: "a recent photo, your citizenship certificate, and passport pages 1 to 3",
    source: POLICE_OPCR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.100"],
      source: POLICE_OPCR,
      note: "Nepal Police OPCR uploaded document set: photo, citizenship certificate, passport pages 1–3 (plus the departure page when applying from abroad).",
    },
  },
  {
    id: "opcr-validity",
    kind: "validity-rule",
    label: "Validity",
    summary: "A study or migration certificate stays valid for 3 months from its issue date.",
    source: POLICE_OPCR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.102"],
      source: POLICE_OPCR,
      note: "Nepal Police OPCR: a certificate issued for foreign affairs, migration and study purposes is valid 3 months from the issue date (A.102).",
    },
  },
];
