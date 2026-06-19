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
const ART_CHANGES =
  "https://www.art.gov.au/about/news-and-updates/changes-conduct-student-visa-reviews";
const ART_IMMIGRATION = "https://www.art.gov.au/applying-review/immigration-and-citizenship";
const ART_PROCESSING =
  "https://www.art.gov.au/about-us/accountability-and-reporting/processing-times";
const ART_OUTCOMES = "https://www.art.gov.au/after-applying/possible-outcomes";
const ART_FEES = "https://www.art.gov.au/help-and-resources/fees";
const IMMI_MINISTERIAL =
  "https://immi.homeaffairs.gov.au/what-we-do/status-resolution-service/ministerial-intervention";
const IMMI_MINISTERIAL_AFTER =
  "https://immi.homeaffairs.gov.au/what-we-do/status-resolution-service/ministerial-intervention/after-you-request-ministerial-intervention";
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
      findingRefs: ["I.027", "I.010"],
      source: IMMI_ACCURATE,
      note: "DHA: providing altered, edited, or digitally manipulated documents for visa purposes is unlawful (I.027). The legal authority is PIC 4020 (the integrity criterion), which clause 500.217 requires a primary Subclass 500 applicant to satisfy (I.010); the student-facing DHA page is the displayed source, the legislation rides in findingRefs (slice G/I source-display pattern).",
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
      volatility: "volatile",
      reverifyBy: "2026-12-31",
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
      volatility: "volatile",
      reverifyBy: "2026-12-31",
      source: HOMEAFFAIRS_STATS,
      note: "Home Affairs student & temporary graduate program report: outside-Australia VET grant rate 36.3% for 1 Apr–30 Jun 2025 (I.035).",
    },
  },
  // ── If you're refused ───────────────────────────────────────────────────────
  {
    id: "recovery-can-apply",
    kind: "recovery-path",
    label: "Can you apply?",
    summary:
      "Your refusal letter from the Department says whether the decision can be reviewed and whether you can apply.",
    source: ART_IMMIGRATION,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.056"],
      source: ART_IMMIGRATION,
      note: "ART: the Department's decision letter states whether the Tribunal can review the decision and whether the applicant may apply (I.056).",
    },
  },
  {
    id: "recovery-review",
    kind: "recovery-path",
    label: "Tribunal review",
    summary:
      "If you're refused, you can ask the Administrative Review Tribunal to review the decision — but since 1 June 2026 it decides most student-visa refusal reviews on the papers, without holding an oral hearing.",
    source: ART_CHANGES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.044", "I.051"],
      source: ART_CHANGES,
      note: "ART has jurisdiction to review certain visa decisions under the Migration Act 1958 (I.044, immi.homeaffairs.gov.au review-of-decisions); from 1 June 2026 it must decide most student-visa refusal reviews without an oral hearing (I.051).",
    },
  },
  {
    id: "recovery-hearing-transitional",
    kind: "recovery-path",
    label: "Hearings already set",
    summary: "If you got a hearing notice before 1 June 2026, that hearing still goes ahead.",
    source: ART_CHANGES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.052"],
      source: ART_CHANGES,
      note: "ART: a student refusal review that received a hearing listing notice before the 1 June 2026 change keeps its hearing (I.052).",
    },
  },
  {
    id: "recovery-deadline",
    kind: "recovery-path",
    label: "Review deadline",
    summary:
      "The deadline to apply for review is strict — the Tribunal has no power to extend it.",
    source: ART_IMMIGRATION,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.050"],
      source: ART_IMMIGRATION,
      note: "ART says it has no power to extend the time limit to apply for a review (I.050).",
    },
  },
  {
    id: "recovery-timeline",
    kind: "recovery-path",
    label: "Review timing",
    summary:
      "Be ready to wait — about half of student refusal reviews finish within 19 months of applying.",
    source: ART_PROCESSING,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.048"],
      source: ART_PROCESSING,
      note: "ART processing-times: 50% of student refusal reviews finalised 1 Nov 2025–30 Apr 2026 were finalised within 1 year and 7 months (about 19 months) from lodgement (I.048).",
    },
  },
  {
    id: "recovery-timeline-longtail",
    kind: "recovery-path",
    label: "Longer cases",
    summary: "The long tail is real: 95% of these reviews finish within 2 years of applying.",
    source: ART_PROCESSING,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.049"],
      source: ART_PROCESSING,
      note: "ART processing-times: 95% of student refusal reviews finalised 1 Nov 2025–30 Apr 2026 were finalised within 2 years of lodgement (I.049).",
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
      volatility: "annual",
      reverifyBy: "2026-07-01",
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
  {
    id: "recovery-ministerial-referral",
    kind: "recovery-path",
    label: "Ministerial referrals",
    summary:
      "In some cases, the Tribunal can refer a matter for ministerial intervention — this is separate from a normal appeal.",
    source: IMMI_MINISTERIAL,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.062"],
      source: IMMI_MINISTERIAL,
      note: "DHA FOI file fa-250500998: tribunal-initiated ministerial-intervention requests include those referred by the ART and former AAT (I.062). Displayed source is the student-facing ministerial-intervention page; the FOI finding rides in findingRefs (the slice G/I source-display pattern).",
    },
  },
  {
    id: "recovery-ministerial-not-permission",
    kind: "recovery-path",
    label: "After you request",
    summary:
      "Requesting ministerial intervention is not permission to stay — you must still arrange to leave Australia.",
    source: IMMI_MINISTERIAL_AFTER,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.058"],
      source: IMMI_MINISTERIAL_AFTER,
      note: "DHA: a person must make arrangements to leave Australia even if they have requested ministerial intervention (I.058).",
    },
  },
  // ── What a review can result in (ART possible outcomes) ──────────────────────
  {
    id: "outcome-affirm",
    kind: "review-outcome",
    label: "Decision stands",
    summary:
      "The Tribunal can affirm the refusal — it agrees with the original decision, so the refusal stands.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.053"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to affirm the original decision (I.053).",
    },
  },
  {
    id: "outcome-set-aside",
    kind: "review-outcome",
    label: "New decision",
    summary: "It can set the refusal aside and make a new decision in its place.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.054"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to set aside the original decision and substitute a new decision (I.054).",
    },
  },
  {
    id: "outcome-remit",
    kind: "review-outcome",
    label: "Sent back",
    summary: "It can remit the case — that means sending it back to the Department for a new decision.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.055"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to remit the decision to the original decision-maker for reconsideration (I.055).",
    },
  },
  // ── What not to trust ───────────────────────────────────────────────────────
  {
    id: "scam-no-issuance",
    kind: "scam-warning",
    label: "Visa scams",
    summary:
      "Australia issues no work permits, visa labels, or Labour Market Impact Assessments — DHA lists offers of these among visa scams.",
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
      "Bogus or false documents can lead to refusal, cancellation, and restrictions on future applications.",
    source: IMMI_ACCURATE,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.028"],
      source: IMMI_ACCURATE,
      note: "DHA: bogus documents or false/misleading information may lead to refusal, cancellation, restrictions on future applications, and possible legal action (I.028).",
    },
  },
];
