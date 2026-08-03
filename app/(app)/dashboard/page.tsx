import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { getProfileForCase } from "@/lib/profiles/repo";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { selectNextStep } from "@/lib/plan/select";
import type { PlanItemRow } from "@/lib/plan/types";
import { getOutcomesForCase } from "@/lib/outcomes/repo";
import { listShortlistForCase } from "@/lib/matches/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { buildOutcomeFunnel, type OutcomeFunnelRow } from "@/lib/outcomes/funnel";
import { Greeting } from "@/components/dashboard/greeting";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import { PromptCard, type PromptState } from "@/components/dashboard/prompt-card";
import { ReadinessMap } from "@/components/dashboard/readiness-map";
import { JourneyRail } from "@/components/dashboard/journey-rail";
import { OutcomeFunnel } from "@/components/outcomes/outcome-funnel";
import { deriveJourneySignals } from "@/lib/journey/journey";
import type { AssessmentPayload } from "@/lib/results/types";
import type { ReadinessSignals } from "@/lib/readiness/readiness";
import type { ProfileSections } from "@/lib/profiles/sections";
import { humanize } from "@/lib/text/humanize";

function partOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/** The plan is the only next-step brain; the dashboard just reads its top item. */
function pickPrompt(profileRow: unknown, primary: unknown, planItems: PlanItemRow[]): PromptState {
  if (!profileRow || !primary) return { kind: "profile-incomplete" };
  const sel = selectNextStep(planItems);
  if (sel.state === "next") return { kind: "next", item: sel.item! };
  if (sel.state === "waiting") return { kind: "waiting", openCount: sel.openCount };
  return { kind: "caught-up" };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  const user = userData.user;
  // MV-157: resolve the personal case ONCE per render and authorize ONCE, before
  // the first read — never per repo call. A signed-in actor with no personal case
  // is the residue of the MV-155-apply-to-this-deploy window; they see the same
  // empty state a brand-new account does, and `/api/assess` heals it by calling
  // `ensurePersonalCase` on their next assessment (MV-160 §B's sweep is the bulk
  // remedy).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/dashboard");
  }
  const [primaryRow, profileRow, documents, allPlanItems, outcomes, shortlist] =
    caseId === null
      ? [null, null, [], [], { predictions: [], attempts: [], events: [] }, []]
      : await Promise.all([
          getPrimaryAssessmentForCase(supabase, caseId),
          getProfileForCase(supabase, caseId),
          listDocumentsForCase(supabase, caseId),
          listAllPlanForCase(supabase, caseId),
          getOutcomesForCase(supabase, caseId),
          listShortlistForCase(supabase, caseId),
        ]);
  const primary = (primaryRow?.result as unknown as AssessmentPayload | undefined) ?? null;
  const profileSections = (profileRow?.sections as ProfileSections | undefined) ?? null;
  const name = profileSections?.personal?.name ?? null;
  const completenessPct = profileRow?.completeness ?? 0;
  // The prompt brain looks only at open items; the journey rail needs the whole plan
  // (a finished plan is engagement too, so it can't be read from open items alone).
  const openPlanItems = allPlanItems.filter((p) => p.status === "todo");
  const prompt = pickPrompt(profileRow, primary, openPlanItems);

  // "Your journey" — the cross-stage "where am I" rail, derived from the data already
  // loaded above (one extra query: the shortlist). Every stage is a real signal.
  const journeySignals = deriveJourneySignals({
    hasAssessment: primary !== null,
    profilePct: completenessPct,
    shortlistCount: shortlist.length,
    planItems: allPlanItems,
    documentCount: documents.length,
    attemptCount: outcomes.attempts.length,
    events: outcomes.events.map((e) => e.eventType),
  });

  // The readiness map decomposes the single verdict into the four scored signals the
  // student acts on — built from data already loaded above (zero extra queries). A
  // legacy payload missing the dimension breakdown degrades honestly to "add detail".
  const dims = primary?.result.dimensions;
  const readinessSignals: ReadinessSignals = {
    dimensions: dims ? { academic: dims.academic, financial: dims.financial, visa: dims.visa } : null,
    profilePct: completenessPct,
    documentCount: documents.length,
  };

  // The outcome funnel only matters once the user has opened an application attempt;
  // resolve program names only then so the common (no-attempt) path stays cheap.
  let outcomeRows: OutcomeFunnelRow[] = [];
  if (outcomes.attempts.length > 0) {
    // The audited exception to MV-133: this catalogue read only puts program NAMES on
    // rows the student's own attempts already prove exist. Nothing here is rendered as
    // "we found nothing for you", so an outage degrades the labels instead of taking the
    // whole hub — plan, snapshot, readiness — down with it. Every other catalogue read on
    // a signed-in surface propagates to the (app) error boundary rather than lying.
    let programLookup = new Map<string, { programName: string; universityName: string | null }>();
    try {
      const [programs, universities] = await Promise.all([
        listAllPrograms(supabase),
        listAllUniversities(supabase),
      ]);
      const uniById = new Map(universities.map((u) => [u.id, u.name]));
      programLookup = new Map(
        programs.map((p) => [p.id, { programName: p.name, universityName: uniById.get(p.universityId) ?? null }]),
      );
    } catch (err) {
      console.error("[dashboard] outcome funnel catalogue lookup failed", { userId: user.id, err });
    }
    outcomeRows = buildOutcomeFunnel({ ...outcomes, programLookup });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <Greeting name={name} partOfDay={partOfDay()} />
      <JourneyRail signals={journeySignals} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SnapshotCard primary={primary} destinationLabel={primaryRow?.destination_id ? humanize(primaryRow.destination_id) : null} />
        <PromptCard prompt={prompt} />
      </div>
      <ReadinessMap signals={readinessSignals} />
      <OutcomeFunnel rows={outcomeRows} />
    </div>
  );
}
