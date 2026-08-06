import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { listObtainedKinds } from "@/lib/documents/status-repo";
import { DOCUMENT_META, GROUPS, GROUP_LABELS, type DocumentKind } from "@/lib/documents/types";
import { DocumentStatusToggle } from "@/components/documents/document-status-toggle";

// MV-53 — the global, program-agnostic document checklist. Lets a signed-in user
// mark each document kind as obtained, independent of whether they've uploaded a
// file. The per-program checklists (/checklist/[programId]) are unchanged.
export default async function GlobalChecklistPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  // MV-157: resolve the personal case ONCE per render and authorize ONCE, before
  // the first read. A signed-in actor with no personal case sees the same empty
  // state a brand-new account does (see the dashboard for the full note).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/checklist/all");
  }
  const obtained = caseId === null
    ? new Set<DocumentKind>()
    : await listObtainedKinds(supabase, caseId);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Document checklist</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Your documents, all in one list</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Tick off each document as you obtain it — this is your own running checklist, separate
          from any single program. Marking one here doesn&apos;t require uploading a file.
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

      <a href="/documents" className="text-small text-primary hover:underline">
        Go to your documents vault →
      </a>
    </div>
  );
}
