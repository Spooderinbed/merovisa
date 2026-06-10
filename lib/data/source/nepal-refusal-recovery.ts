import type { NepalRefusalRecovery } from "@/lib/data/types";

/**
 * Nepal → Australia student-visa refusal risk & recovery (trust-defense slice K, category I).
 * The first trust-defense panel's data: four sections — why applications are refused, honest
 * sector grant rates, what recovery looks like, and what not to trust — all gov-sourced.
 * Three records (the two grant rates + the ART fee) are structured (carry a numeric `value`
 * that reconcile checks against findings I.034/I.035/I.045); the rest are prose-only.
 * Consumed by components/results/refusal-recovery.tsx. Fact-only — no scorer reads it;
 * machine-checked against the findings (see provenance.findingRefs).
 *
 * `source` per record is the most representative gov page (shown as the row's link);
 * provenance.findingRefs lists every backing finding (the GS record's clause I.008 on
 * legislation.gov.au rides in findingRefs while the student-facing immi GS page is the
 * displayed source — the slice G/I source-display pattern). `lastVerified` is the
 * category-I verification date (2026-06-05), per the slice C/J module convention.
 */
const IMMI_GS =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement";
const IMMI_SSVF =
  "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework";
const IMMI_ACCURATE =
  "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/providing-accurate-information";
const HOMEAFFAIRS_STATS =
  "https://www.homeaffairs.gov.au/research-and-stats/files/student-temporary-grad-program-report-june-2025.pdf";
const IMMI_REVIEW =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/fees-and-charges-for-other-services/review-of-decisions";
const ART_IMMIGRATION = "https://www.art.gov.au/applying-review/immigration-and-citizenship";
const ART_FEES = "https://www.art.gov.au/help-and-resources/fees";
const IMMI_MINISTERIAL =
  "https://immi.homeaffairs.gov.au/what-we-do/status-resolution-service/ministerial-intervention";
const IMMI_SCAMS = "https://immi.homeaffairs.gov.au/help-support/visa-scams/what-you-need-to-know";
const VERIFIED = "2026-06-05";

export const NEPAL_REFUSAL_RECOVERY: NepalRefusalRecovery[] = [
  // ── Why applications are refused ────────────────────────────────────────────
  {
    id: "ground-genuine-student",
    kind: "refusal-ground",
    label: "Genuine Student",
    summary:
      "Not being assessed as a genuine student — DHA weighs your Genuine Student answers and the evidence behind them.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.008", "I.006"],
      source: IMMI_GS,
      note: "Clause 500.212 requires a primary Subclass 500 applicant to be a genuine applicant (I.008); DHA gives more weight to Genuine Student statements supported by evidence (I.006).",
    },
  },
  {
    id: "ground-capacity",
    kind: "refusal-ground",
    label: "Financial & English capacity",
    summary: "Not showing enough financial and English-language capacity.",
    source: IMMI_SSVF,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.029"],
      source: IMMI_SSVF,
      note: "DHA's SSVF page: a student must provide evidence of financial and English-language capacity with the Student visa application (I.029).",
    },
  },
  {
    id: "ground-document-integrity",
    kind: "refusal-ground",
    label: "Document integrity",
    summary: "Document problems — altered, edited, or manipulated documents are unlawful.",
    source: IMMI_ACCURATE,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.027"],
      source: IMMI_ACCURATE,
      note: "DHA: providing altered, edited, or digitally manipulated documents for visa purposes is unlawful (I.027).",
    },
  },
  // ── Honest odds — by sector (structured) ────────────────────────────────────
  {
    id: "grant-rate-higher-ed",
    kind: "grant-rate",
    sector: "higher-education",
    label: "Higher Education",
    summary:
      "University (Higher Education) applications from Nepal were granted 85.3% of the time when applying from outside Australia (Apr–Jun 2025).",
    value: 85.3,
    unit: "%",
    period: "Apr–Jun 2025",
    source: HOMEAFFAIRS_STATS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.034"],
      source: HOMEAFFAIRS_STATS,
      note: "Home Affairs student & temporary graduate program report: outside-Australia Higher Education grant rate 85.3% for 1 Apr–30 Jun 2025 (I.034).",
    },
  },
  {
    id: "grant-rate-vet",
    kind: "grant-rate",
    sector: "vet",
    label: "VET",
    summary: "Vocational (VET) applications were granted 36.3% over the same period.",
    value: 36.3,
    unit: "%",
    period: "Apr–Jun 2025",
    source: HOMEAFFAIRS_STATS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.035"],
      source: HOMEAFFAIRS_STATS,
      note: "Home Affairs student & temporary graduate program report: outside-Australia VET grant rate 36.3% for 1 Apr–30 Jun 2025 (I.035).",
    },
  },
  // ── If you're refused ───────────────────────────────────────────────────────
  {
    id: "recovery-review",
    kind: "recovery-path",
    label: "Tribunal review",
    summary:
      "If you're refused, you can ask the Administrative Review Tribunal to review the decision.",
    source: IMMI_REVIEW,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.044"],
      source: IMMI_REVIEW,
      note: "The Administrative Review Tribunal has jurisdiction to review certain visa decisions made under the Migration Act 1958 (I.044).",
    },
  },
  {
    id: "recovery-cost",
    kind: "recovery-path",
    label: "Review fee",
    summary: "The review has a fee — AUD 3,580 for most migration decisions.",
    value: 3580,
    unit: "AUD",
    source: ART_IMMIGRATION,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.045"],
      source: ART_IMMIGRATION,
      note: "ART application fee for a review of most migration decisions is AUD 3,580 (I.045).",
    },
  },
  {
    id: "recovery-hardship",
    kind: "recovery-path",
    label: "Hardship reduction",
    summary: "A 50% reduction may apply on financial-hardship grounds.",
    source: ART_FEES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.046"],
      source: ART_FEES,
      note: "ART may grant a fee reduction to 50% of the full migration review fee on financial-hardship grounds (I.046).",
    },
  },
  {
    id: "recovery-ministerial",
    kind: "recovery-path",
    label: "Ministerial intervention",
    summary:
      "Ministerial intervention exists, but it is not a normal appeal path — it is a limited, conditional last resort.",
    source: IMMI_MINISTERIAL,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.057", "I.059", "I.060"],
      source: IMMI_MINISTERIAL,
      note: "The Minister's intervention powers are not available without a merits-review tribunal decision (I.057); Home Affairs FOI data recorded 197 requests and 34 interventions in April 2025 (I.059/I.060) — a limited, conditional last resort.",
    },
  },
  // ── What not to trust ───────────────────────────────────────────────────────
  {
    id: "scam-no-issuance",
    kind: "scam-warning",
    label: "Visa scams",
    summary:
      "Australia issues no work permits, visa labels, or Labour Market Impact Assessments — anyone offering these is running a scam.",
    source: IMMI_SCAMS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.078", "I.079", "I.080"],
      source: IMMI_SCAMS,
      note: "DHA's visa-scams page: Australia does not issue work permits (I.078), visa labels (I.079), or Labour Market Impact Assessments (I.080).",
    },
  },
  {
    id: "scam-bogus-documents",
    kind: "scam-warning",
    label: "Bogus documents",
    summary:
      "Bogus or false documents can lead to refusal, cancellation, and bans on future applications.",
    source: IMMI_ACCURATE,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.028"],
      source: IMMI_ACCURATE,
      note: "DHA: bogus documents or false/misleading information may lead to refusal, cancellation, restrictions on future applications, and possible legal action (I.028).",
    },
  },
];
