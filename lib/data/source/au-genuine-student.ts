import type { GenuineStudentFact } from "@/lib/data/types";

/**
 * Genuine Student credibility module (slice GS). Gov-sourced explanation of the Australian
 * Genuine Student requirement, in five sections. Every row links to its primary gov page;
 * provenance.findingRefs lists every backing finding (multi-source rows display one URL and
 * carry the rest in findingRefs — the slice-G/I source-display pattern). I.008 (clause 500.212,
 * the genuine-applicant rule) rides in the PR row's findingRefs as the genuineness anchor; it
 * is already `used` by nepal-refusal-recovery. Fact-only: no scorer reads it.
 */
const IMMI_GS =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement";
const IMMI_WET = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";
const DIRECTION_106 = "https://immi.homeaffairs.gov.au/Visa-subsite/files/direction-no-106.pdf";
const IMMI_SSVF =
  "https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/simplified-student-visa-framework";
const STUDY_AUSTRALIA =
  "https://www.studyaustralia.gov.au/en/tools-and-resources/news/new-genuine-student-requirement";
const IMMI_485 = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485";
const IMMI_ENGLISH = "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language";
const VERIFIED = "2026-06-10";

export const AU_GENUINE_STUDENT: GenuineStudentFact[] = [
  // ── What it is ──────────────────────────────────────────────────────────────
  {
    id: "gs-since-2024",
    section: "what-it-is",
    label: "Genuine Student",
    summary:
      "Every student visa lodged on or after 23 March 2024 is assessed on the Genuine Student requirement — it replaced the old Genuine Temporary Entrant test.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.001", "F.002", "C.005"], source: IMMI_GS },
  },
  {
    id: "gs-format",
    section: "what-it-is",
    label: "Genuine Student",
    summary:
      "You answer in the application form itself — 150 words or less per question, in English. DHA prefers in-form answers over a separate statement.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.004", "E.006", "F.003", "E.007", "C.133", "E.005"],
      source: IMMI_GS,
      note: "Format corroborated by the Web Evidentiary Tool findings (F.003/F.004/C.133); displayed source is the GS page.",
    },
  },
  {
    id: "gs-extra-question",
    section: "what-it-is",
    label: "Evidentiary tool",
    summary:
      "There's an additional question if you've held a student visa before, or you're applying in Australia from a non-student visa.",
    source: IMMI_WET,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.005", "C.135", "C.136"], source: IMMI_WET },
  },
  // ── The questions you'll answer ───────────────────────────────────────────────
  {
    id: "gs-q-circumstances",
    section: "the-questions",
    label: "Genuine Student",
    summary:
      "Your current circumstances — your ties to family, community, employment and your economic situation.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.006"], source: IMMI_GS },
  },
  {
    id: "gs-q-why-course",
    section: "the-questions",
    label: "Genuine Student",
    summary:
      "Why this course, in Australia, with this provider — and what you understand about the course's requirements and about studying and living in Australia.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.007", "F.008"], source: IMMI_GS },
  },
  {
    id: "gs-q-benefit",
    section: "the-questions",
    label: "Genuine Student",
    summary: "How completing the course will benefit you.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.009"], source: IMMI_GS },
  },
  // ── How officers actually weigh it (Direction 106) ───────────────────────────
  {
    id: "md106-not-checklist",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Direction 106 tells decision makers not to treat the factors as a checklist — your circumstances are weighed as a whole.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.014", "F.010"], source: DIRECTION_106 },
  },
  {
    id: "md106-ties",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Your personal ties to Nepal — family, community, employment — and your economic circumstances relative to Australia.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.018", "F.019"], source: DIRECTION_106 },
  },
  {
    id: "md106-research",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "How much you actually know: the course, the provider, living arrangements — the depth of your research counts.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.020", "F.021"], source: DIRECTION_106 },
  },
  {
    id: "md106-home-course",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Whether a similar course is available at home or in the region, and your reasons for studying it in Australia instead.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.017", "E.010"],
      source: DIRECTION_106,
      note: "E.010 (GS page) corroborates the home-course consideration; displayed source is Direction 106.",
    },
  },
  {
    id: "md106-course-value",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Whether the course fits your past study or work — reasonable career changes are accepted — and the pay you could expect with the qualification at home or elsewhere.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.023", "F.024", "E.011"],
      source: DIRECTION_106,
      note: "E.011 (GS page) corroborates the remuneration factor; displayed source is Direction 106.",
    },
  },
  {
    id: "md106-history",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Your immigration history counts: previous visa applications and refusal circumstances (Australia and other countries), compliance with visa conditions, and — if you've held a student visa — logical course progression.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.025", "F.011", "F.012", "F.026"], source: DIRECTION_106 },
  },
  {
    id: "md106-scrutiny",
    section: "how-weighed",
    label: "Direction 106",
    summary:
      "Closer scrutiny is flagged for: a field unrelated to your past study or work, inconsistencies in the application, study that looks like maintaining residence, and patterns of changing, deferring or gapping courses.",
    source: DIRECTION_106,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.015", "F.016", "F.022", "F.027"], source: DIRECTION_106 },
  },
  {
    id: "ssvf-evidence-level",
    section: "how-weighed",
    label: "SSVF",
    summary:
      "Under the Simplified Student Visa Framework, documentation expectations also depend on your provider's evidence level — which is based on the student visas linked to that institution.",
    source: IMMI_SSVF,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["C.007", "C.008"],
      source: IMMI_SSVF,
      note: "C.008 (evidence-levels page) rides in findingRefs; displayed source is the SSVF page.",
    },
  },
  // ── Post-study honesty ────────────────────────────────────────────────────────
  {
    id: "gs-pr-not-disqualifying",
    section: "post-study",
    label: "Genuine Student",
    summary:
      "Wanting to apply for permanent residence later does not count against you — as long as your study plan and stay are genuine under the visa rules. Post-study pathways exist, but only for those who are eligible.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["C.006", "I.008", "F.013", "E.012"],
      source: IMMI_GS,
      note: "I.008 (clause 500.212, genuine applicant for entry and stay as a student) anchors the genuineness clause; already used by nepal-refusal-recovery.",
    },
  },
  {
    id: "gs-say-it-straight",
    section: "post-study",
    label: "Study Australia",
    summary:
      "Study Australia says the requirement removed the old confusion about whether you can express a desire to migrate.",
    source: STUDY_AUSTRALIA,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["F.034"], source: STUDY_AUSTRALIA },
  },
  {
    id: "gs-485-reality",
    section: "post-study",
    label: "Subclass 485",
    summary:
      "The Temporary Graduate visa (485) lets you live, work and study in Australia temporarily after graduating — but applicants must generally be 35 or under, and since 1 July 2024 you can't apply for a student visa from inside Australia while holding it.",
    source: IMMI_485,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["F.035", "F.036", "F.037", "F.038"],
      source: IMMI_485,
      note: "Spans several DHA 485 pages; displayed source is the 485 overview.",
    },
  },
  // ── Evidence & what not to trust ─────────────────────────────────────────────
  {
    id: "gs-evidence-weight",
    section: "evidence",
    label: "Genuine Student",
    summary:
      "DHA gives more weight to answers supported by evidence — attach your documents in ImmiAccount along with your responses.",
    source: IMMI_GS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.009", "E.008"], source: IMMI_GS },
  },
  {
    id: "gs-online-tests",
    section: "evidence",
    label: "English requirement",
    summary: "DHA does not accept English tests delivered completely online.",
    source: IMMI_ENGLISH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.013"], source: IMMI_ENGLISH },
  },
  {
    id: "gs-test-validity",
    section: "evidence",
    label: "English requirement",
    summary:
      "English test results from on or before 6 August 2025 can be used as visa evidence until 6 August 2028, depending on the visa.",
    source: IMMI_ENGLISH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["E.014"], source: IMMI_ENGLISH },
  },
];
