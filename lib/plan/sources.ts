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
};

export function sourcesFor(kind: string): PlanSource[] {
  return SOURCES[kind] ?? [];
}
