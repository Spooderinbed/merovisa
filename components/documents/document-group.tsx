import type { DocumentKindMeta } from "@/lib/documents/types";
import { DocumentCard } from "./document-card";

interface DocumentData {
  id: string;
  kind: string;
  original_name: string;
  file_size: number;
  signed_url: string | null;
}

export function DocumentGroup({
  label,
  kinds,
  documents,
}: {
  label: string;
  kinds: DocumentKindMeta[];
  documents: DocumentData[];
}) {
  const docByKind = new Map(documents.map((d) => [d.kind, d]));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">{label}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kinds.map((meta) => {
          const existing = docByKind.get(meta.kind);
          return (
            <DocumentCard
              key={meta.kind}
              meta={meta}
              initial={
                existing
                  ? {
                      id: existing.id,
                      originalName: existing.original_name,
                      fileSize: existing.file_size,
                      signedUrl: existing.signed_url,
                    }
                  : null
              }
            />
          );
        })}
      </div>
    </section>
  );
}
