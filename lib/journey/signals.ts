import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { getProfileForCase } from "@/lib/profiles/repo";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { getOutcomesForCase } from "@/lib/outcomes/repo";
import { listShortlistForCase } from "@/lib/matches/repo";
import { deriveJourneySignals, type JourneySignals } from "@/lib/journey/journey";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Journey signals for the persistent chrome marker (MV-103, MV-45 #3b).
 *
 * Reuses the exact repos the dashboard reads and folds them through the same
 * `deriveJourneySignals` rules, so the marker and the dashboard "Your journey"
 * rail can never disagree and the trust-critical predicates (plan "engaged", visa
 * "granted") live in one place. All six reads go out in parallel because this runs
 * on every signed-in page; the caller wraps it so a failure degrades to no marker
 * rather than a broken page. (A future optimisation could swap these for count/
 * exists queries — not needed at MVP traffic, and consistency-by-reuse wins here.)
 */
export async function getJourneySignals(
  supabase: ServerSupabase,
  caseId: string,
): Promise<JourneySignals> {
  const [primaryRow, profileRow, documents, planItems, outcomes, shortlist] = await Promise.all([
    getPrimaryAssessmentForCase(supabase, caseId),
    getProfileForCase(supabase, caseId),
    listDocumentsForCase(supabase, caseId),
    listAllPlanForCase(supabase, caseId),
    getOutcomesForCase(supabase, caseId),
    listShortlistForCase(supabase, caseId),
  ]);

  return deriveJourneySignals({
    hasAssessment: Boolean(primaryRow?.result),
    profilePct: profileRow?.completeness ?? 0,
    shortlistCount: shortlist.length,
    planItems,
    documentCount: documents.length,
    attemptCount: outcomes.attempts.length,
    events: outcomes.events.map((e) => e.eventType),
  });
}
