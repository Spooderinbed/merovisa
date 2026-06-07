import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getProgram, listAllUniversities } from "@/lib/programs/repo";
import { getProfile } from "@/lib/profiles/repo";
import { listDocumentsForUser } from "@/lib/documents/repo";
import { generateChecklist } from "@/lib/checklist/generator";
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

  const [universities, profile, docs] = await Promise.all([
    listAllUniversities(supabase),
    getProfile(supabase, user.id),
    listDocumentsForUser(supabase, user.id),
  ]);
  const university = universities.find((u) => u.id === program.universityId) ?? null;
  const sections = (profile?.sections ?? {}) as ProfileSections;
  const uploadedKinds = new Set<DocumentKind>(docs.map((d) => d.kind));

  const items = generateChecklist({ program, sections, uploadedKinds, nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });
  return <ChecklistView program={program} university={university} items={items} />;
}
