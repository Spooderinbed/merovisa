import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { CaseReadError, isUniqueViolation } from "@/lib/cases/errors";
import type { SectionKey, ProfileSections } from "./sections";
import { computeCompleteness } from "./completeness";

type DB = SupabaseClient<Database>;
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * MV-157: profile reads and writes are keyed on `case_id`. The functions are
 * RENAMED rather than re-parameterised — `getProfile(db, userId)` and
 * `getProfileForCase(db, caseId)` have identical types, so a stale call site
 * would have compiled and read the wrong rows in silence.
 *
 * These take an already-resolved, already-AUTHORIZED case id. They resolve no
 * case and authorize nothing.
 *
 * MV-198 narrows THIS function's client to `Pick<DB, "from">` — the same shape
 * `lib/cases/context.ts` calls `CaseAuthorizationClient`, and for the same reason:
 * a read that cannot reach `.auth` cannot learn a role and then decide something
 * with it. Every existing caller passes a full client, which still satisfies the
 * narrower type, so this asks for less and breaks nothing. The rename argument above
 * is untouched: it is about the SECOND argument, where `userId` and `caseId` are both
 * `string`, and that hazard is unchanged.
 */
export async function getProfileForCase(
  db: Pick<DB, "from">,
  caseId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  // MV-133, on the case axis: `null` means the case has no profile yet (the
  // normal state of a new account). A PostgREST error means the read never
  // answered, and collapsing the two renders an outage as "you have no profile".
  if (error) throw new CaseReadError("profiles", error);
  if (!data) return null;
  return data as ProfileRow;
}

export interface UpsertProfileInput {
  caseId: string;
  sections: ProfileSections;
  completeness: number;
}

/**
 * `owner` is NOT a parameter here and must never become one — it is derived from
 * `cases.student_user_id` inside `caseWriteColumns`, so a caller structurally
 * cannot supply an owner that disagrees with the case it also supplied. That
 * single property is the whole of Stage 2's dual-write guard (MV-157 §E).
 *
 * ## MV-168 — why this is an INSERT with a resolve, and no longer an `.upsert()`
 *
 * Stage 3 grants `authenticated` `INSERT (owner, case_id, sections, completeness)`
 * so a counsellor can create the first profile row on a case with no student.
 * **That grant cannot be reached through an `.upsert()`.** PostgREST compiles one
 * to `INSERT … ON CONFLICT DO UPDATE SET` and puts every payload column in the SET
 * list, INCLUDING the conflict target `case_id`, with the privilege check at plan
 * time — so the INSERT branch raises **42501** on the very first call, with no row
 * present and neither branch reachable (measured by MV-155, written into
 * `…20260802120000….sql:630-640`). The obvious patch, `UPDATE (case_id)`, is
 * forbidden by design at `:602-604`: a client that can update `case_id` re-points
 * a row into another case.
 *
 * So: INSERT, and on a collision UPDATE the mutable columns by `case_id`. The
 * update payload carries neither `owner` nor `case_id` — both are absent from the
 * UPDATE grant, and that asymmetry is the barrier, not an oversight.
 *
 * ## Why a 23505 here now means exactly one thing
 *
 * It used to mean two. `profiles_owner_key` (unique on `owner`) made a
 * never-backfilled MV-155 residue row collide on the INSERT branch, and the remedy
 * was to adopt the residue and retry rather than to resolve. **MV-160 dropped that
 * index and made `profiles.case_id` NOT NULL**, so an owner-set / case-null profile
 * row is no longer representable and `adoptOwnerKeyedResidue(db, "profiles", …)`
 * can only return 0 — a fact `tests/integration/case-data-access.itest.ts` already
 * pins. The only unique left on this table besides the primary key is
 * `profiles_case_idx`, so a 23505 is a concurrent first write and "re-read and
 * update" is the whole remedy. The adopt call is gone from this path for that
 * reason; `lib/cases/residue.ts` still serves its three other callers.
 */
export async function upsertProfileForCase(
  db: DB,
  input: UpsertProfileInput,
): Promise<string | null> {
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return null;

  // Split deliberately: the INSERT may name the ownership axis, the UPDATE may not.
  const mutable = {
    sections: input.sections as unknown as Json,
    completeness: input.completeness,
  };

  const created = await db
    .from("profiles")
    .insert({ ...ownership, ...mutable } as never)
    .select("id")
    .single();
  if (!created.error && created.data) return (created.data as { id: string }).id;
  if (!isUniqueViolation(created.error)) return null;

  const resolved = await db
    .from("profiles")
    .update(mutable as never)
    .eq("case_id", input.caseId)
    .select("id")
    .maybeSingle();
  if (resolved.error || !resolved.data) return null;
  return (resolved.data as { id: string }).id;
}

export interface PatchResult {
  completeness: number;
  sections: ProfileSections;
}

export async function patchProfileSectionForCase<K extends SectionKey>(
  db: DB,
  caseId: string,
  section: K,
  patch: NonNullable<ProfileSections[K]>,
): Promise<PatchResult> {
  const current = await getProfileForCase(db, caseId);
  const sections: ProfileSections = (current?.sections as ProfileSections | undefined) ?? {};
  const next: ProfileSections = {
    ...sections,
    [section]: { ...(sections[section] ?? {}), ...patch },
  };
  const { pct } = computeCompleteness(next);

  const { data, error } = await db
    .from("profiles")
    .update({ sections: next as unknown as Json, completeness: pct })
    .eq("case_id", caseId)
    .select("id");

  if (error) {
    throw new Error(`patchProfileSectionForCase update failed: ${error.message}`);
  }

  // 0-row update means no profile exists yet — upsert one. A failed upsert
  // returns null; surface it (mirrors the update-error throw above) so the route
  // reports failure instead of a false success on a first-ever save.
  if (!data || data.length === 0) {
    const id = await upsertProfileForCase(db, { caseId, sections: next, completeness: pct });
    if (id === null) {
      throw new Error("patchProfileSectionForCase upsert fallback failed");
    }
  }

  return { completeness: pct, sections: next };
}
