import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDocumentsForUser, getSignedDocumentUrl } from "@/lib/documents/repo";
import { DOCUMENT_META, GROUPS, GROUP_LABELS } from "@/lib/documents/types";
import { DocumentGroup } from "@/components/documents/document-group";

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const documents = await listDocumentsForUser(supabase, user.id);

  const admin = createSupabaseAdminClient();
  const documentsWithUrls = await Promise.all(
    documents.map(async (d) => ({
      ...d,
      signed_url: await getSignedDocumentUrl(admin, d.file_path, 3600),
    })),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Documents</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Upload your documents</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Upload photos of your documents and we&apos;ll extract the data to improve your profile, match accuracy, and
          assessment verdict.
        </p>
      </header>

      {GROUPS.map((group) => {
        const kinds = DOCUMENT_META.filter((m) => m.group === group);
        const groupDocs = documentsWithUrls.filter((d) => kinds.some((k) => k.kind === d.kind));
        return (
          <DocumentGroup
            key={group}
            label={GROUP_LABELS[group]}
            kinds={kinds}
            documents={groupDocs as any}
          />
        );
      })}
    </div>
  );
}
