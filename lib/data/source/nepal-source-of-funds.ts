import type { NepalSourceOfFunds } from "@/lib/data/types";

/**
 * Nepal source-of-funds / remittance readiness (finance category B). How a Nepali
 * bank legally releases foreign currency for study under Nepal Rastra Bank (NRB)
 * rules: the No Objection Certificate (NOC) + institution documents the bank
 * requires, the NRB-set living-expense amount banks may remit, and the MoEST-portal
 * approval check before forex release — plus a one-line definition of what an NOC
 * is. Prose rules consumed by the plan + checklist generators for sourced "how do I
 * move the money from Nepal?" guidance. Fact-only — no scorer reads it;
 * machine-checked against findings B.012–B.016 (see provenance.findingRefs).
 *
 * `bank-requirement` summaries are written article-first so they concatenate with
 * "and" into a natural sentence; `remittance-mechanism` summaries are standalone
 * sentences; the `definition` leads the checklist note.
 */
const NRB_STUDY =
  "https://www.nrb.org.np/2020/11/%E0%A4%89%E0%A4%9A%E0%A5%8D%E0%A4%9A-%E0%A4%B6%E0%A4%BF%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE-%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%AF%E0%A4%A8%E0%A4%95%E0%A4%BE-%E0%A4%B2%E0%A4%BE%E0%A4%97/";
const NRB_ANNUAL = "https://www.nrb.org.np/contents/uploads/2024/03/Annual-Report-2022-23-English.pdf";
const MOEST_NOC = "https://noc.moest.gov.np/";

export const NEPAL_SOURCE_OF_FUNDS: NepalSourceOfFunds[] = [
  {
    id: "noc-definition",
    kind: "definition",
    label: "What an NOC is",
    summary:
      "A No Objection Certificate (NOC) is the approval the Government of Nepal grants Nepalese students to study abroad.",
    source: MOEST_NOC,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.016"],
      source: MOEST_NOC,
      note: "The MoEST NOC portal defines an NOC as a No Objection Certificate granted by the Government of Nepal for Nepalese students to study abroad.",
    },
  },
  {
    id: "noc-requirement",
    kind: "bank-requirement",
    label: "No Objection Certificate",
    summary: "a No Objection Certificate from Nepal's education ministry",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.012"],
      source: NRB_STUDY,
      note: "NRB: sending money abroad for higher study requires a No Objection Certificate from the education ministry.",
    },
  },
  {
    id: "institution-documents",
    kind: "bank-requirement",
    label: "Institution documents",
    summary: "an institution letter, brochure, invoice, I-20, or equivalent document",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.013"],
      source: NRB_STUDY,
      note: "NRB: also requires an institution letter, brochure, invoice, I-20, or an equivalent institution-issued document.",
    },
  },
  {
    id: "living-expense-remittance",
    kind: "remittance-mechanism",
    label: "NRB living-expense remittance",
    summary:
      "Banks may remit the living-expense amount Nepal Rastra Bank sets when your institution's documents don't state living expenses.",
    source: NRB_STUDY,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.014"],
      source: NRB_STUDY,
      note: "NRB: banks may send the NRB-determined living-expense amount when the institution documents do not state living expenses.",
    },
  },
  {
    id: "forex-portal-confirmation",
    kind: "remittance-mechanism",
    label: "MoEST portal confirmation",
    summary:
      "Banks release foreign-exchange facilities after confirming your foreign-study approval on the MoEST portal.",
    source: NRB_ANNUAL,
    lastVerified: "2026-06-08",
    provenance: {
      findingRefs: ["B.015"],
      source: NRB_ANNUAL,
      note: "NRB's 2022/23 annual report: BFIs can provide foreign-exchange facilities after confirming foreign-study approval details on the MoEST portal.",
    },
  },
];
