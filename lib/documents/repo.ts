import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { adoptOwnerKeyedResidue } from "@/lib/cases/residue";
import { CaseReadError, isUniqueViolation } from "@/lib/cases/errors";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

// Row shape returned to callers. `owner` is nullable from MV-156 on: a consultancy case has no Auth
// user, so a `documents` row can legitimately carry `case_id` and no `owner`.
//
// This interface is NOT derived from `Database["public"]["Tables"]["documents"]["Row"]` — every read
// below launders its result through an `as DocumentRow` cast, so `owner: string` was a claim
// TypeScript had no way to check and the MV-156 types regen could not surface.
//
// MV-157 re-keyed every read and write below onto `case_id`. `owner` survives on the WRITE side as a
// derived column only (see `lib/cases/dual-write.ts`) — it is never a parameter.
export interface DocumentRow {
  id: string;
  owner: string | null;
  kind: DocumentKind;
  file_path: string;
  file_size: number;
  original_name: string;
  created_at: string;
}

/**
 * MV-157: row-level `case_id` only. The document header/versions replacement and
 * case-aware Storage object paths are Stage 4 — object paths stay owner-keyed
 * through Stages 2 and 3 (spec §8), so `documents.file_path` and
 * `storage.objects.name` deliberately disagree about the authorization model for
 * the whole window.
 */
// MV-133 on the case axis: these three did not destructure `error` AT ALL, so a
// read that never answered was indistinguishable from a case with no documents —
// and the vault renders the second as "no documents uploaded", next to a
// checklist that then says the student still has to upload their passport. A
// PostgREST error now throws; `[]` / `null` stays reserved for the query that
// answered with nothing.
export async function listDocumentsForCase(db: DB, caseId: string): Promise<DocumentRow[]> {
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw new CaseReadError("documents", error);
  return (data ?? []) as DocumentRow[];
}

export async function getDocumentByKindForCase(
  db: DB,
  caseId: string,
  kind: DocumentKind,
): Promise<DocumentRow | null> {
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("case_id", caseId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new CaseReadError("documents", error);
  return (data as DocumentRow) ?? null;
}

export async function listDocumentsByKindsForCase(
  db: DB,
  caseId: string,
  kinds: DocumentKind[],
): Promise<DocumentRow[]> {
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("case_id", caseId)
    .in("kind", kinds);
  if (error) throw new CaseReadError("documents", error);
  return (data ?? []) as DocumentRow[];
}

export async function insertDocument(
  db: DB,
  doc: {
    caseId: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
  },
): Promise<string | null> {
  const ownership = await caseWriteColumns(db, doc.caseId);
  if (ownership === null) return null;

  const { data } = await db
    .from("documents")
    .insert({
      ...ownership,
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
    caseId: string;
    kind: DocumentKind;
    filePath: string;
    fileSize: number;
    originalName: string;
  },
): Promise<string | null> {
  // Atomic replace on the unique (case_id, kind) index — no delete-then-insert
  // window, so a failed replacement can never leave the case with no row (audit
  // C-8). created_at is refreshed so a re-uploaded document reads as freshly
  // stored, matching the vault ordering the old delete+insert produced.
  //
  // MV-155 shipped `documents_case_kind_idx` FULL rather than partial because
  // PostgREST emits a bare `on_conflict=` column list and Postgres infers a
  // partial unique index as an arbiter only when the statement supplies the
  // predicate — a partial one raises 42P10 (spec §4 rule 1).
  //
  // Unlike user_program_state / document_status, `case_id` DOES belong in this
  // payload: `documents` carries no definer trigger to derive it, and this path
  // is service-role (Stage 2 grants `authenticated` no INSERT on `documents` —
  // spec §4.5), so the ON CONFLICT DO UPDATE SET list runs under service_role's
  // table-level UPDATE.
  //
  // MV-155 RESIDUE: `documents_owner_kind_key` is still live. A student who has a
  // personal case but whose passport row never received a `case_id` is not a
  // conflict on the `(case_id, kind)` arbiter, so this takes the INSERT branch and
  // 23505s on the legacy owner unique — the re-upload fails outright rather than
  // degrading. On a 23505 the residue for THIS KIND is adopted onto the case and
  // the upsert retried once (`lib/cases/residue.ts` explains why lazily).
  const ownership = await caseWriteColumns(db, doc.caseId);
  if (ownership === null) return null;

  const payload = {
    ...ownership,
    kind: doc.kind,
    file_path: doc.filePath,
    file_size: doc.fileSize,
    original_name: doc.originalName,
    created_at: new Date().toISOString(),
  };
  const write = async () =>
    db.from("documents").upsert(payload, { onConflict: "case_id,kind" }).select("id").single();

  let { data, error } = await write();
  if (isUniqueViolation(error)) {
    const adopted = await adoptOwnerKeyedResidue(db, "documents", doc.caseId, [["kind", doc.kind]]);
    if (adopted > 0) ({ data, error } = await write());
  }
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

export async function deleteDocument(db: DB, docId: string, caseId: string): Promise<void> {
  await db.from("documents").delete().eq("id", docId).eq("case_id", caseId);
}

export async function getSignedDocumentUrl(
  db: DB,
  filePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data } = await db.storage.from("documents").createSignedUrl(filePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
