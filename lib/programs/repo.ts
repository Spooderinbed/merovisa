import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Program, University } from "./types";

type DB = SupabaseClient<Database>;

export async function listAllPrograms(db: DB): Promise<Program[]> {
  const { data, error } = await db.from("programs").select("*").order("name");
  if (error || !data) return [];
  return data.map(mapProgram);
}

export async function listProgramsForField(db: DB, field: string): Promise<Program[]> {
  const { data, error } = await db.from("programs").select("*").eq("field", field).order("name");
  if (error || !data) return [];
  return data.map(mapProgram);
}

export async function listProgramsForUniversity(db: DB, universityId: string): Promise<Program[]> {
  const { data, error } = await db.from("programs").select("*").eq("university_id", universityId).order("name");
  if (error || !data) return [];
  return data.map(mapProgram);
}

export async function getProgram(db: DB, id: string): Promise<Program | null> {
  const { data, error } = await db.from("programs").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapProgram(data);
}

export async function listAllUniversities(db: DB): Promise<University[]> {
  const { data, error } = await db
    .from("universities")
    .select("*")
    .order("ranking_tier")
    .order("name");
  if (error || !data) return [];
  return data.map(mapUniversity);
}

function mapProgram(r: Database["public"]["Tables"]["programs"]["Row"]): Program {
  return {
    id: r.id,
    universityId: r.university_id,
    name: r.name,
    level: r.level as Program["level"],
    field: r.field,
    tuitionMin: r.tuition_min == null ? null : Number(r.tuition_min),
    tuitionMax: r.tuition_max == null ? null : Number(r.tuition_max),
    tuitionCurrency: r.tuition_currency as "AUD",
    minGrade: r.min_grade,
    minEnglish: r.min_english == null ? null : Number(r.min_english),
    minEnglishBand: r.min_english_band == null ? null : Number(r.min_english_band),
    intakes: r.intakes,
    source: r.source ?? "",
    lastVerified: r.last_verified ?? "",
    dataQuality: r.data_quality as Program["dataQuality"],
    notes: r.notes,
  };
}

function mapUniversity(r: Database["public"]["Tables"]["universities"]["Row"]): University {
  return {
    id: r.id,
    country: r.country,
    name: r.name,
    city: r.city,
    rankingTier: r.ranking_tier as 1 | 2 | 3,
    source: r.source ?? "",
    lastVerified: r.last_verified ?? "",
    dataQuality: r.data_quality as University["dataQuality"],
  };
}
