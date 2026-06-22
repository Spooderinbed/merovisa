import {
  AU_NEPAL_EVIDENCE_LEVELS,
  type NepalEvidenceLevel,
} from "@/lib/data/source/au-nepal-evidence-levels";

/**
 * The DHA Document Checklist Tool evidence level for a Nepalese passport holder
 * applying as a mainstream student (study-type "01") at a given CRICOS provider,
 * or null when the code is not in the harvested map. Pure lookup over the static
 * fact layer — no scorer, no DB.
 */
export function nepalEvidenceLevel(cricosCode: string): NepalEvidenceLevel | null {
  return AU_NEPAL_EVIDENCE_LEVELS[cricosCode] ?? null;
}
