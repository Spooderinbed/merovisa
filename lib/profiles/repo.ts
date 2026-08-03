import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { caseWriteColumns } from "@/lib/cases/dual-write";
import { adoptOwnerKeyedResidue } from "@/lib/cases/residue";
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
 */
export async function getProfileForCase(db: DB, caseId: string): Promise<ProfileRow | null> {
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
 * The conflict target is MV-155's `profiles_case_idx`, a FULL unique on
 * `(case_id)` — full precisely so PostgREST's bare `on_conflict=` can infer it.
 * Unlike the two UPSERT-seam tables, `case_id` DOES belong in this payload: there
 * is no definer trigger on `profiles` to derive it, and this path is service-role
 * (Stage 2 grants `authenticated` no INSERT on `profiles` at all — spec §4.1), so
 * the `ON CONFLICT DO UPDATE SET` list is evaluated under service_role's
 * table-level UPDATE.
 *
 * ## The MV-155 residue leg
 *
 * `profiles_owner_key` (unique on `owner`) is still live. A student who has a
 * personal case but whose profile row never received a `case_id` is not a
 * conflict on the `case_id` arbiter, so this takes the INSERT branch and raises
 * **23505** on the legacy owner unique — a hard failure, not the empty state the
 * rest of Stage 2 degrades to. The claim path reaches it directly: STEP 3's
 * `getProfileForCase` cannot see an owner-set / case-null profile, so it decides
 * to bootstrap one. On a 23505 the residue is adopted onto the case and the
 * upsert retried ONCE; if nothing was adopted the collision was something else
 * and the original failure stands. See `lib/cases/residue.ts` for why this is
 * lazy rather than pre-emptive.
 */
export async function upsertProfileForCase(
  db: DB,
  input: UpsertProfileInput,
): Promise<string | null> {
  const ownership = await caseWriteColumns(db, input.caseId);
  if (ownership === null) return null;

  const payload = {
    ...ownership,
    sections: input.sections as unknown as Json,
    completeness: input.completeness,
  };
  const write = async () =>
    db
      .from("profiles")
      .upsert(payload, { onConflict: "case_id", ignoreDuplicates: false })
      .select("id")
      .single();

  let { data, error } = await write();
  if (isUniqueViolation(error)) {
    const adopted = await adoptOwnerKeyedResidue(db, "profiles", input.caseId);
    if (adopted > 0) ({ data, error } = await write());
  }
  if (error || !data) return null;
  return data.id;
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
