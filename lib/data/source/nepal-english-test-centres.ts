import type { NepalEnglishTestCentre } from "@/lib/data/types";

/**
 * Nepal-side IELTS test-centre logistics (English-tests & scholarships category
 * J), from the official IELTS administrators. IELTS in Nepal is run by two
 * operators — the British Council and IDP — each in its own set of cities; IDP
 * also publishes a computer-delivered sitting fee. PTE and TOEFL logistics are
 * deferred until they can be sourced from the test owners rather than a single
 * centre's or coaching site's self-description.
 *
 * Fact-only — no scorer reads it; it backs the eventual test-planning view and
 * is machine-checked against the findings.
 */
export const NEPAL_ENGLISH_TEST_CENTRES: NepalEnglishTestCentre[] = [
  {
    id: "ielts-british-council",
    operator: "British Council",
    test: "IELTS",
    locationCount: 9,
    locations: [
      "Banepa",
      "Biratnagar",
      "Birtamode",
      "Butwal",
      "Chitwan",
      "Ghorahi",
      "Itahari",
      "Kathmandu",
      "Pokhara",
    ],
    source: "https://www.britishcouncil.org.np/exam/ielts/dates-fees-locations",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.011"],
      note: "British Council offers IELTS across nine Nepal locations.",
    },
  },
  {
    id: "ielts-idp",
    operator: "IDP Education Nepal",
    test: "IELTS",
    locationCount: 4,
    locations: ["Biratnagar", "Chitwan (Bharatpur)", "Pokhara", "Kathmandu"],
    computerDeliveredFeeNpr: 36000,
    source: "https://ielts.org/test-centres/idp-education-nepal-private-ltd-biratnagar",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.012", "J1.018"],
      note: "IDP operates four IELTS centres; the NPR 36,000 fee is for computer-delivered IELTS Academic at the IDP Biratnagar centre (2026).",
    },
  },
];
