import type { NepalNocJourney } from "@/lib/data/types";

/**
 * Nepal MoEST No Objection Certificate (NOC) application journey (finance category
 * B). The sequel to nepal-source-of-funds.ts: once the student knows the bank needs
 * an NOC, this is how to get one — the six documents the MoEST portal requires (a
 * citizenship certificate, an academic certificate, guardian citizenship, any
 * previous NOC, an academic transcript, and the admission/offer/I-20 letter) and the
 * two process steps (online submission, then an in-person visit with all originals
 * once the application is verified). Prose rules consumed by the plan + checklist
 * generators. Fact-only — no scorer reads it; machine-checked against findings
 * B.017–B.024 (see provenance.findingRefs).
 *
 * `required-document` summaries are article-first so they concatenate into an
 * Oxford-"and" list; `process-step` summaries are standalone sentences.
 */
const MOEST_NOC = "https://noc.moest.gov.np/";
const MOEST_NOC_LOGIN = "https://noc.moest.gov.np/login";
const MOEST_FAQ = "https://moest.gov.np/pages/faq/";

export const NEPAL_NOC_JOURNEY: NepalNocJourney[] = [
  {
    id: "noc-doc-citizenship",
    kind: "required-document",
    label: "Citizenship certificate",
    summary: "a citizenship certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.017"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists a citizenship certificate as a required document.",
    },
  },
  {
    id: "noc-doc-academic",
    kind: "required-document",
    label: "Academic certificate",
    summary: "an academic certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.018"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists an academic certificate as a required document.",
    },
  },
  {
    id: "noc-doc-guardian",
    kind: "required-document",
    label: "Guardian citizenship",
    summary: "your guardian's citizenship certificate",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.019"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists guardian citizenship as a required document.",
    },
  },
  {
    id: "noc-doc-previous",
    kind: "required-document",
    label: "Previous NOC",
    summary: "any previous NOC you already hold",
    source: MOEST_NOC,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.020"],
      source: MOEST_NOC,
      note: "MoEST NOC portal lists an old NOC as a required document when the applicant already has one.",
    },
  },
  {
    id: "noc-doc-transcript",
    kind: "required-document",
    label: "Academic transcript",
    summary: "an academic transcript of your +2, PCL, or equivalent",
    source: MOEST_NOC_LOGIN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.021"],
      source: MOEST_NOC_LOGIN,
      note: "MoEST NOC login page lists an academic transcript of +2, PCL, or equivalence as a required document.",
    },
  },
  {
    id: "noc-doc-offer",
    kind: "required-document",
    label: "Offer / I-20 letter",
    summary: "your admission, offer, acceptance, or I-20 letter",
    source: MOEST_NOC_LOGIN,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.022"],
      source: MOEST_NOC_LOGIN,
      note: "MoEST NOC login page lists an admission, offer, acceptance, or I-20 letter as a required document.",
    },
  },
  {
    id: "noc-step-online",
    kind: "process-step",
    label: "Online submission",
    summary: "You can submit the foreign-study permit application online through the MoEST portal.",
    source: MOEST_FAQ,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.023"],
      source: MOEST_FAQ,
      note: "MoEST says foreign-study permit applications can be submitted online.",
    },
  },
  {
    id: "noc-step-visit",
    kind: "process-step",
    label: "In-person originals check",
    summary:
      "Once your application is verified, MoEST messages you a visit date and time; attend in person with all your original documents.",
    source: MOEST_FAQ,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["B.024"],
      source: MOEST_FAQ,
      note: "MoEST says applicants who receive a visit date/time message must attend with all original documents.",
    },
  },
];
