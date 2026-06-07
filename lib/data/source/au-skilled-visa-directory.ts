import type { AuSkilledVisaSubclass } from "@/lib/data/types";

/**
 * Directory of Australian skilled / employer-sponsored / regional / permanent-
 * residence / temporary-activity work visas (visa-conditions category C), by DHA
 * subclass. These are the post-study migration pathways a graduate may look
 * toward after the Temporary Graduate (485) visa. Each record carries the
 * subclass code, the visa's current DHA name, its permanence, and the stay
 * period DHA states (a fixed term for 491; a 2-to-5-year range for 482).
 *
 * Names reflect recent DHA renames (482 → Skills in Demand; 858 → National
 * Innovation). Fact-only — no scorer reads it; machine-checked against the
 * findings.
 */
const DHA_VISA_LISTING = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing";

export const AU_SKILLED_VISA_DIRECTORY: AuSkilledVisaSubclass[] = [
  {
    id: "subclass-408-temporary-activity",
    subclass: "408",
    name: "Temporary Activity visa",
    permanence: "temporary",
    source: `${DHA_VISA_LISTING}/temporary-activity-408`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.049"],
      note: "Subclass 408 — entry for specific types of temporary activity (e.g. research).",
    },
  },
  {
    id: "subclass-482-skills-in-demand",
    subclass: "482",
    name: "Skills in Demand visa",
    permanence: "temporary",
    minStayYears: 2,
    maxStayYears: 5,
    source: `${DHA_VISA_LISTING}/skills-in-demand-visa-subclass-482`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.052", "C.053"],
      note: "Current DHA name of Subclass 482 (formerly TSS); stay of between 2 and 5 years.",
    },
  },
  {
    id: "subclass-491-skilled-work-regional",
    subclass: "491",
    name: "Skilled Work Regional (Provisional) visa",
    permanence: "temporary",
    stayYears: 5,
    source: `${DHA_VISA_LISTING}/skilled-work-regional-provisional-491`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.058", "C.059"],
      note: "Provisional regional visa; lets the holder stay 5 years.",
    },
  },
  {
    id: "subclass-191-permanent-residence-skilled-regional",
    subclass: "191",
    name: "Permanent Residence (Skilled Regional) visa",
    permanence: "permanent",
    source: `${DHA_VISA_LISTING}/skilled-regional-191`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.063"],
      note: "Permanent regional follow-on from a provisional regional visa (e.g. 491).",
    },
  },
  {
    id: "subclass-189-skilled-independent",
    subclass: "189",
    name: "Skilled Independent visa",
    permanence: "permanent",
    source: `${DHA_VISA_LISTING}/skilled-independent-189`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.066"],
      note: "Points-tested permanent visa; no sponsor or nomination required.",
    },
  },
  {
    id: "subclass-190-skilled-nominated",
    subclass: "190",
    name: "Skilled Nominated visa",
    permanence: "permanent",
    source: `${DHA_VISA_LISTING}/skilled-nominated-190`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.069"],
      note: "Points-tested permanent visa requiring state or territory nomination.",
    },
  },
  {
    id: "subclass-186-employer-nomination-scheme",
    subclass: "186",
    name: "Employer Nomination Scheme visa",
    permanence: "permanent",
    source: `${DHA_VISA_LISTING}/employer-nomination-scheme-186`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.071"],
      note: "Permanent employer-sponsored visa.",
    },
  },
  {
    id: "subclass-858-national-innovation",
    subclass: "858",
    name: "National Innovation visa",
    permanence: "permanent",
    source: `${DHA_VISA_LISTING}/national-innovation-visa-858`,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.074"],
      note: "Current DHA name of Subclass 858 (formerly Global Talent); permanent, invitation required.",
    },
  },
];
