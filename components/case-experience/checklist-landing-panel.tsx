import type * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listShortlistForCase } from "@/lib/matches/repo";
import { ChecklistLanding } from "@/components/checklist/checklist-landing";
import { DOCUMENT_META, GROUPS, GROUP_LABELS, type DocumentKind } from "@/lib/documents/types";
import { listObtainedKinds } from "@/lib/documents/status-repo";
import { DocumentStatusToggle } from "@/components/documents/document-status-toggle";
import { getProgram, listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { getProfileForCase } from "@/lib/profiles/repo";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { generateChecklist } from "@/lib/checklist/generator";
import { planStatesForChecklist } from "@/lib/checklist/plan-links";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { ChecklistView } from "@/components/checklist/checklist-view";
import type { ProfileSections } from "@/lib/profiles/sections";

/**
 * The three checklist surfaces, for ONE case — access-matrix cell 22.
 *
 * All three read through the **authenticated** client (`ds_select_case` and the
 * sibling `*_select_case` policies decide what comes back), and the one that
 * WRITES — the global list's per-kind toggle — posts to `/api/documents/status`,
 * which names the case from `CaseScopeProvider`.
 *
 * `base` is the navigation half: every internal link is prefixed so a counsellor
 * moving between "all documents" and a program's checklist stays inside the
 * student's case instead of landing on their own.
 */

export async function ChecklistLandingPanel({
  db,
  caseId,
  base = "",
  documentsHref = "/documents",
}: {
  db: SupabaseClient<Database>;
  caseId: string | null;
  base?: string;
  /** Null inside a case route — the vault is Stage 4's and is not case-scoped yet. */
  documentsHref?: string | null;
}) {
  const [shortlist, programs] = await Promise.all([
    caseId === null ? [] : listShortlistForCase(db, caseId),
    listAllPrograms(db),
  ]);
  const ids = new Set(shortlist.map((s) => s.programId));
  const shortlisted = programs.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name }));

  return <ChecklistLanding shortlisted={shortlisted} base={base} documentsHref={documentsHref} />;
}

/** The global, program-agnostic document checklist (MV-53) — the write surface. */
export async function ChecklistAllPanel({
  db,
  caseId,
  footer,
}: {
  db: SupabaseClient<Database>;
  caseId: string | null;
  /** `/checklist/all` links on to the student's own vault; the case route does not — Stage 4. */
  footer?: React.ReactNode;
}) {
  const obtained =
    caseId === null ? new Set<DocumentKind>() : await listObtainedKinds(db, caseId);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Document checklist</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Documents, all in one list</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Tick off each document as it is obtained — one running list, separate from any single
          program. Marking one here doesn&apos;t require uploading a file.
        </p>
      </header>

      {GROUPS.map((group) => {
        const kinds = DOCUMENT_META.filter((m) => m.group === group);
        return (
          <section key={group} className="flex flex-col gap-3">
            <h2 className="text-caption uppercase tracking-wide text-ink-faint">
              {GROUP_LABELS[group]}
            </h2>
            <div className="flex flex-col gap-2">
              {kinds.map((meta) => (
                <DocumentStatusToggle
                  key={meta.kind}
                  kind={meta.kind}
                  label={meta.label}
                  initialObtained={obtained.has(meta.kind)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {footer}
    </div>
  );
}

/**
 * One program's checklist. Returns `null` when the program id matches nothing, so
 * the caller can `notFound()` — a panel must not decide a route's status code.
 */
export async function ChecklistProgramPanel({
  db,
  caseId,
  programId,
}: {
  db: SupabaseClient<Database>;
  caseId: string | null;
  programId: string;
}) {
  const program = await getProgram(db, programId);
  if (!program) return null;

  const [universities, profile, docs, planRows, obtainedKinds] = await Promise.all([
    listAllUniversities(db),
    caseId === null ? null : getProfileForCase(db, caseId),
    caseId === null ? [] : listDocumentsForCase(db, caseId),
    caseId === null ? [] : listAllPlanForCase(db, caseId),
    caseId === null ? new Set<DocumentKind>() : listObtainedKinds(db, caseId),
  ]);
  const university = universities.find((u) => u.id === program.universityId) ?? null;
  const sections = (profile?.sections ?? {}) as ProfileSections;
  const uploadedKinds = new Set<DocumentKind>(docs.map((d) => d.kind));

  // obtainedKinds (self-reported on the global list) fold into the rows as "obtained" — the
  // global toggle is no longer a dead end; it now flows into per-program rows + readiness (MV-69).
  const items = generateChecklist({
    program,
    sections,
    uploadedKinds,
    obtainedKinds,
    nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL,
  });
  // Step rows mirror their plan item's state — the plan is the single completion authority.
  return (
    <ChecklistView
      program={program}
      university={university}
      items={items}
      planStates={planStatesForChecklist(planRows)}
    />
  );
}
