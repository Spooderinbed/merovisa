import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

// Row shape returned to callers. `owner` is nullable from MV-156 on: a consultancy case has no Auth
// user, so a `documents` row can legitimately carry `case_id` and no `owner`.
//
// This interface is NOT derived from `Database["public"]["Tables"]["documents"]["Row"]` — every read
// below launders its result through an `as DocumentRow` cast, so `owner: string` was a claim
// TypeScript had no way to check and the MV-156 types regen could not surface. That is exactly the
// shape of hidden non-null assertion this card's criterion bans, and `lib/documents/repo.ts:10` is
// named in it; widening the field is that criterion discharged. No caller reads `row.owner` today
// (the reads all filter `.eq("owner", userId)` server-side), so nothing downstream moves — which is
// the point: a cast was holding a nullable column behind a non-null type with no consumer pressure
// to notice. Re-keying these reads onto `case_id` is MV-157.
//
// The WRITE-side `owner: string` parameters below (`insertDocument`, `upsertDocument`) stay non-null
// deliberately: both are called only from the authenticated upload path, where an owner always
// exists, and widening them would invite a NULL-owner insert that no Stage 2 policy authorizes.
// A consultancy upload path is Stage 4 (spec §8), not this card.
export interface DocumentRow {
  id: string;
  owner: string | null;
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
