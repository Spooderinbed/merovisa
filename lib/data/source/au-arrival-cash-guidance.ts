import type { AuArrivalCashGuidance } from "@/lib/data/types";

/**
 * University-published recommendations for how much cash (or accessible funds) a
 * newly-arrived student should bring to Australia, in AUD. The figures vary by
 * what they cover (cash on person vs. funds in a bank account vs. the first few
 * weeks) and whether they are a floor, a ceiling, or a rough guide — captured in
 * `context` and `qualifier`. Fact-only — no scorer reads it; it backs the
 * eventual arrival-prep guidance and is machine-checked against the findings.
 */
export const AU_ARRIVAL_CASH_GUIDANCE: AuArrivalCashGuidance[] = [
  {
    id: "unsw-first-weeks",
    publisher: "UNSW",
    context: "first-weeks",
    amountAud: 500,
    qualifier: "up-to",
    source: "https://www.student.unsw.edu.au/aas-departure-arrival-information",
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["H.018"],
      note: "From UNSW's Australia Awards arrival guidance, but an official UNSW recommendation.",
    },
  },
  {
    id: "uq-arrival-cash",
    publisher: "University of Queensland",
    context: "cash-on-person",
    amountAud: 250,
    qualifier: "minimum",
    source:
      "https://study.uq.edu.au/university-life/getting-prepared-to-come-to-australia/arriving-australia",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.019"] },
  },
  {
    id: "usyd-bank-account",
    publisher: "University of Sydney",
    context: "bank-account",
    amountAud: 1500,
    qualifier: "minimum",
    source: "https://www.sydney.edu.au/study/preparing-for-uni/moving-to-sydney.html",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.020"] },
  },
  {
    id: "usyd-cash-on-arrival",
    publisher: "University of Sydney",
    context: "cash-on-person",
    amountAud: 300,
    qualifier: "approximate",
    source: "https://www.sydney.edu.au/study/preparing-for-uni/moving-to-sydney.html",
    lastVerified: "2026-06-05",
    provenance: { findingRefs: ["H.021"] },
  },
];
