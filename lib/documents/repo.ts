import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

export interface DocumentRow {
  id: string;
  owner: string;
  kind: DocumentKind;
  file_path: string;
  file_size: number;
  original_name: string;
  created_at: string;
}

export async function listDocumentsForUser(db: DB, userId: string): Promise<DocumentRow[]> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DocumentRow[];
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
  return (data as DocumentRow) ?? null;
}

export async function listDocumentsByKinds(
  db: DB,
  userId: string,
  kinds: DocumentKind[],
): Promise<DocumentRow[]> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("owner", userId)
    .in("kind", kinds);
  return (data ?? []) as DocumentRow[];
}

export async function insertDocument(
  db: DB,
  doc: {
    owner: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
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
    })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function upsertDocument(
  db: DB,
  doc: {
    owner: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
  },
): Promise<string | null> {
  // Atomic replace on the unique (owner, kind) index — no delete-then-insert
  // window, so a failed replacement can never leave the owner with no row
  // (audit C-8). created_at is refreshed so a re-uploaded document reads as
  // freshly stored, matching the vault ordering the old delete+insert produced.
  const { data } = await db
    .from("documents")
    .upsert(
      {
        owner: doc.owner,
        kind: doc.kind,
        file_path: doc.filePath,
        file_size: doc.fileSize,
        original_name: doc.originalName,
        created_at: new Date().toISOString(),
      },
      { onConflict: "owner,kind" },
    )
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function deleteDocument(db: DB, docId: string, userId: string): Promise<void> {
  await db.from("documents").delete().eq("id", docId).eq("owner", userId);
}

export async function getSignedDocumentUrl(
  db: DB,
  filePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await db.storage.from("documents").createSignedUrl(filePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
