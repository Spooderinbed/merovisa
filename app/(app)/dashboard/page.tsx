import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { getProfile } from "@/lib/profiles/repo";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { listOpenPlanForUser } from "@/lib/plan/repo";
import { selectNextStep } from "@/lib/plan/select";
import type { PlanItemRow } from "@/lib/plan/types";
import { getOutcomesForUser } from "@/lib/outcomes/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { buildOutcomeFunnel, type OutcomeFunnelRow } from "@/lib/outcomes/funnel";
import { Greeting } from "@/components/dashboard/greeting";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import { PromptCard, type PromptState } from "@/components/dashboard/prompt-card";
import { ReadinessMap } from "@/components/dashboard/readiness-map";
import { OutcomeFunnel } from "@/components/outcomes/outcome-funnel";
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
  const [primaryRow, profileRow, documents, planItems, outcomes] = await Promise.all([
    getPrimaryAssessmentForUser(supabase, user.id),
    getProfile(supabase, user.id),
    listDocumentsForUser(supabase, user.id),
    listOpenPlanForUser(supabase, user.id),
    getOutcomesForUser(supabase, user.id),
  ]);
  const primary = (primaryRow?.result as unknown as AssessmentPayload | undefined) ?? null;
  const profileSections = (profileRow?.sections as ProfileSections | undefined) ?? null;
  const name = profileSections?.personal?.name ?? null;
  const completenessPct = profileRow?.completeness ?? 0;
  const prompt = pickPrompt(profileRow, primary, planItems);

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
    const [programs, universities] = await Promise.all([
      listAllPrograms(supabase),
      listAllUniversities(supabase),
    ]);
    const uniById = new Map(universities.map((u) => [u.id, u.name]));
    const programLookup = new Map(
      programs.map((p) => [p.id, { programName: p.name, universityName: uniById.get(p.universityId) ?? null }]),
    );
    outcomeRows = buildOutcomeFunnel({ ...outcomes, programLookup });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <Greeting name={name} partOfDay={partOfDay()} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SnapshotCard primary={primary} destinationLabel={primaryRow?.destination_id ? humanize(primaryRow.destination_id) : null} />
        <PromptCard prompt={prompt} />
      </div>
      <ReadinessMap signals={readinessSignals} />
      <OutcomeFunnel rows={outcomeRows} />
    </div>
  );
}
