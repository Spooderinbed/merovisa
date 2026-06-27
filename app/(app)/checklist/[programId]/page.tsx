import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getProgram, listAllUniversities } from "@/lib/programs/repo";
import { getProfile } from "@/lib/profiles/repo";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { listObtainedKinds } from "@/lib/documents/status-repo";
import { listAllPlanForUser } from "@/lib/plan/repo";
import { generateChecklist } from "@/lib/checklist/generator";
import { planStatesForChecklist } from "@/lib/checklist/plan-links";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import type { DocumentKind } from "@/lib/documents/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import { ChecklistView } from "@/components/checklist/checklist-view";

export default async function ProgramChecklistPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  const program = await getProgram(supabase, programId);
  if (!program) notFound();

  const [universities, profile, docs, planRows, obtainedKinds] = await Promise.all([
    listAllUniversities(supabase),
    getProfile(supabase, user.id),
    listDocumentsForUser(supabase, user.id),
    listAllPlanForUser(supabase, user.id),
    listObtainedKinds(supabase, user.id),
  ]);
  const university = universities.find((u) => u.id === program.universityId) ?? null;
  const sections = (profile?.sections ?? {}) as ProfileSections;
  const uploadedKinds = new Set<DocumentKind>(docs.map((d) => d.kind));

  // obtainedKinds (self-reported on /checklist/all) fold into the rows as "obtained" — the
  // global toggle is no longer a dead end; it now flows into per-program rows + readiness (MV-69).
  const items = generateChecklist({ program, sections, uploadedKinds, obtainedKinds, nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
  // Step rows mirror their plan item's state — the plan is the single completion authority.
  return <ChecklistView program={program} university={university} items={items} planStates={planStatesForChecklist(planRows)} />;
}
