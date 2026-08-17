import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { DOCUMENT_META, GROUPS, GROUP_LABELS } from "@/lib/documents/types";
import { DocumentGroup } from "@/components/documents/document-group";

export default async function DocumentsPage() {
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
  // the first read — never per repo call. A signed-in actor with no personal case
  // is the residue of the MV-155-apply-to-this-deploy window; they see the same
  // empty state a brand-new account does, and `/api/assess` heals it by calling
  // `ensurePersonalCase` on their next assessment (MV-160 §B's sweep is the bulk
  // remedy).
  const caseId = await resolvePersonalCaseId(user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/documents");
  }
  const documents = caseId === null ? [] : await listDocumentsForCase(supabase, caseId);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Documents</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Upload your documents</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Keep your visa-ready documents in one place. Upload photos so you can pull them up
          when you need them — for university applications, the visa, or your records.
        </p>
      </header>

      {GROUPS.map((group) => {
        const kinds = DOCUMENT_META.filter((m) => m.group === group);
        const groupDocs = documents.filter((d) => kinds.some((k) => k.kind === d.kind));
        return (
          <DocumentGroup
            key={group}
            label={GROUP_LABELS[group]}
            kinds={kinds}
            documents={groupDocs}
          />
        );
      })}
    </div>
  );
}
