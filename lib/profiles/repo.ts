import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { SectionKey, ProfileSections } from "./sections";
import { computeCompleteness } from "./completeness";

type DB = SupabaseClient<Database>;
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getProfile(db: DB, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("owner", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileRow;
}

export interface UpsertProfileInput {
  owner: string;
  sections: ProfileSections;
  completeness: number;
}

export async function upsertProfile(db: DB, input: UpsertProfileInput): Promise<string | null> {
  const { data, error } = await db
    .from("profiles")
    .upsert(
      {
        owner: input.owner,
        sections: input.sections as unknown as Json,
        completeness: input.completeness,
      },
      { onConflict: "owner", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export interface PatchResult {
  completeness: number;
  sections: ProfileSections;
}

export async function patchProfileSection<K extends SectionKey>(
  db: DB,
  userId: string,
  section: K,
  patch: NonNullable<ProfileSections[K]>,
): Promise<PatchResult> {
  const current = await getProfile(db, userId);
  const sections: ProfileSections = (current?.sections as ProfileSections | undefined) ?? {};
  const next: ProfileSections = {
    ...sections,
    [section]: { ...(sections[section] ?? {}), ...patch },
  };
  const { pct } = computeCompleteness(next);

  const { data, error } = await db
    .from("profiles")
    .update({ sections: next as unknown as Json, completeness: pct })
    .eq("owner", userId)
    .select("id");

  if (error) {
    throw new Error(`patchProfileSection update failed: ${error.message}`);
  }

  // 0-row update means no profile exists yet — upsert one.
  if (!data || data.length === 0) {
    await upsertProfile(db, { owner: userId, sections: next, completeness: pct });
  }

  return { completeness: pct, sections: next };
}
