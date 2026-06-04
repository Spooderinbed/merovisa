import type { Database } from "@/lib/supabase/types";

export type ProgramLevel = "bachelors" | "masters" | "doctorate";
export type DataQuality = "primary" | "derived" | "secondary";

export interface University {
  id: string;
  country: string;
  name: string;
  city: string;
  rankingTier: 1 | 2 | 3;
  source: string;
  lastVerified: string;
  dataQuality: DataQuality;
}

export interface Program {
  id: string;
  universityId: string;
  name: string;
  level: ProgramLevel;
  field: string;
  tuitionMin: number | null;
  tuitionMax: number | null;
  tuitionCurrency: "AUD";
  minGrade: number | null;
  minEnglish: number | null;
  minEnglishBand: number | null;
  intakes: string[];
  source: string;
  lastVerified: string;
  dataQuality: DataQuality;
  notes: string | null;
}

export type UniversityRow = Database["public"]["Tables"]["universities"]["Row"];
export type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
export type UserProgramStateRow = Database["public"]["Tables"]["user_program_state"]["Row"];
