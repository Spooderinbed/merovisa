import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DocumentKind } from "./types";

type DB = SupabaseClient<Database>;

/**
 * The set of document kinds the user has explicitly marked "obtained" in the
 * global checklist (MV-53) — independent of whether a file was uploaded. Only
 * rows with obtained=true exist; absence means not obtained.
 */
export async function listObtainedKinds(db: DB, userId: string): Promise<Set<DocumentKind>> {
  const { data } = await db
    .from("document_status")
    .select("kind")
    .eq("owner", userId)
    .eq("obtained", true);
  return new Set(((data ?? []) as { kind: DocumentKind }[]).map((r) => r.kind));
}

/**
 * Toggle a kind's obtained state for the user. ON upserts the (owner, kind) row;
 * OFF deletes it — we treat absence-of-row as not-obtained, so there is never a
 * stale obtained=false row to reconcile.
 */
export async function setObtained(
  db: DB,
  userId: string,
  kind: DocumentKind,
  obtained: boolean,
): Promise<void> {
  if (obtained) {
    await db
      .from("document_status")
      .upsert({ owner: userId, kind, obtained: true }, { onConflict: "owner,kind" });
    return;
  }
  await db.from("document_status").delete().eq("owner", userId).eq("kind", kind);
}
