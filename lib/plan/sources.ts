/**
 * Source provenance for plan items whose body quotes an externally-published
 * figure or institutional fact, keyed by plan-item kind (mirrors completionFor's
 * kind-keyed lookup in lib/plan/completion.ts).
 *
 * The URLs and dates are deliberately LITERAL — not imported from the
 * sourced-config layer — so this module is safe to import into the client
 * PlanItemCard without bundling any scoring rules (the F16 client-bundle
 * constraint). The drift-guard test (tests/plan/sources.test.ts) pins every entry
 * to its canonical data module, so a literal that drifts from the source of truth
 * fails CI rather than misleading a user.
 *
 * Recommendation-voice items carry NO source by design: season-funds-six-months
 * is our 6-month seasoning recommendation, not a published figure, so attaching a
 * source there would imply an authority the number doesn't have.
 */
export interface PlanSource {
  url: string;
  lastVerified?: string;
}

const SOURCES: Record<string, PlanSource[]> = {
  // "AUD 29,710 living costs" → DHA Subclass 500 financial-capacity figure.
  "upload-proof-of-funds": [
    { url: "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1196", lastVerified: "2026-06-07" },
  ],
  // "the MoEST portal asks for …" → MoEST NOC portal.
  "apply-for-noc": [{ url: "https://noc.moest.gov.np/", lastVerified: "2026-06-05" }],
  // "collection fee about NPR 2,365 in Kathmandu" → VFS Global Kathmandu centre.
  "prepare-biometrics": [
    { url: "https://visa.vfsglobal.com/npl/en/aus/attend-centre/kathmandu", lastVerified: "2026-06-07" },
  ],
  // "use a registered migration agent listed with OMARA … search by their MARN" → OMARA register.
  "verify-agent-marn": [
    { url: "https://portal.mara.gov.au/search-the-register-of-migration-agents/", lastVerified: "2026-06-05" },
  ],
  // "results are generally valid for 12 months" → DHA health-examination validity.
  "prepare-health-exam": [
    {
      url: "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/when-to-have-health-examinations",
      lastVerified: "2026-06-07",
    },
  ],
  // "about 2 working days (1 working day urgent) … valid 3 months" → Nepal Police OPCR
  // (one portal covers both the A.098/A.099 turnaround and the A.102 validity).
  "prepare-police-certificate": [{ url: "https://opcr.nepalpolice.gov.np/", lastVerified: "2026-06-05" }],
  // "usually ready in about 2 working days" → Department of Passports.
  "start-passport-process": [{ url: "https://nepalpassport.gov.np/process/-10", lastVerified: "2026-06-05" }],
  // "lodged since 23 March 2024 … 150 words or less" → DHA Genuine Student requirement.
  "prepare-gs-answers": [
    { url: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool", lastVerified: "2026-06-05" },
  ],
  // "runs through Nepal Rastra Bank …" → NRB study-remittance rules (bank requirements +
  // living-expense) and the NRB annual report (MoEST-portal forex confirmation) — two pages.
  "prepare-fund-remittance": [
    {
      url: "https://www.nrb.org.np/2020/11/%E0%A4%89%E0%A4%9A%E0%A5%8D%E0%A4%9A-%E0%A4%B6%E0%A4%BF%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE-%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%AF%E0%A4%A8%E0%A4%95%E0%A4%BE-%E0%A4%B2%E0%A4%BE%E0%A4%97/",
      lastVerified: "2026-06-08",
    },
    { url: "https://www.nrb.org.np/contents/uploads/2024/03/Annual-Report-2022-23-English.pdf", lastVerified: "2026-06-08" },
  ],
  // "Lalitpur Metropolitan City's published list" → Lalitpur FAQ. NB: this plan body is
  // hand-written prose (not interpolated from the module), so the drift guard pins the
  // URL/date; prose fidelity to the rows is a separate, still-open concern.
  "certify-sponsor-income": [{ url: "https://lalitpurmun.gov.np/faq", lastVerified: "2026-06-05" }],

  // MV-57 journey-spine connective steps. Each literal is pinned by the drift guard to its
  // canonical module: submit/accept → Study Australia how-to-apply (au-enrolment-lodgement);
  // get-coe / arrange-oshc → the in-repo coe/oshc requirement rows (au-student-visa-requirements);
  // lodge → DHA Subclass 500 listing (au-visa-fees); track → DHA after-you-apply (au-enrolment-lodgement).
  "submit-university-applications": [
    { url: "https://www.studyaustralia.gov.au/en/plan-your-studies/how-to-apply-to-study", lastVerified: "2026-06-28" },
  ],
  "accept-offer": [
    { url: "https://www.studyaustralia.gov.au/en/plan-your-studies/how-to-apply-to-study", lastVerified: "2026-06-28" },
  ],
  "get-coe": [{ url: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool", lastVerified: "2026-06-05" }],
  "arrange-oshc": [{ url: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool", lastVerified: "2026-06-05" }],
  "lodge-subclass-500": [
    { url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500", lastVerified: "2026-06-07" },
  ],
  "track-visa-decision": [
    {
      url: "https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online/after-you-apply",
      lastVerified: "2026-06-28",
    },
  ],
};

export function sourcesFor(kind: string): PlanSource[] {
  return SOURCES[kind] ?? [];
}
