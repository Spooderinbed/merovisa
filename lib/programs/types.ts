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
  // MV-13: present on rows bridged from the TS fact layer (null/absent on the
  // hand-authored generic rows). durationYears in years; findingRefs links the
  // row to the research findings that back it; generated marks bridged rows for
  // clean rollback.
  durationYears?: number | null;
  findingRefs?: string[];
  generated?: boolean;
}

export type UniversityRow = Database["public"]["Tables"]["universities"]["Row"];
export type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
export type UserProgramStateRow = Database["public"]["Tables"]["user_program_state"]["Row"];
