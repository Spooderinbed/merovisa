import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

export interface DocumentRow {
  id: string;
  owner: string;
  kind: DocumentKind;
  file_path: string;
  file_size: number;
  original_name: string;
  extracted_data: Record<string, unknown> | null;
  profile_section: string | null;
  status: "processing" | "extracted" | "failed" | "stored";
  created_at: string;
}

export async function listDocumentsForUser(db: DB, userId: string): Promise<DocumentRow[]> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as DocumentRow[];
}

export async function getDocumentByKind(
  db: DB,
  userId: string,
  kind: DocumentKind,
): Promise<DocumentRow | null> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .eq("kind", kind)
    .maybeSingle();
  return (data as unknown as DocumentRow) ?? null;
}

export async function insertDocument(
  db: DB,
  doc: {
    owner: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
    extractedData: Record<string, unknown> | null;
    profileSection: string | null;
    status: DocumentRow["status"];
  },
): Promise<string | null> {
  const { data } = await db
    .from("documents")
    .insert({
      owner: doc.owner,
      kind: doc.kind,
      file_path: doc.filePath,
      file_size: doc.fileSize,
      original_name: doc.originalName,
      extracted_data: (doc.extractedData as Json) ?? null,
      profile_section: doc.profileSection,
      status: doc.status,
    })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function deleteDocument(db: DB, docId: string, userId: string): Promise<void> {
  await db.from("documents").delete().eq("id", docId).eq("owner", userId);
}
