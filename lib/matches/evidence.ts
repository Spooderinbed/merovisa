import type { MatchResult } from "./types";
import { cricosCodeForUniversity } from "@/lib/data/cricos-lookup";
import { nepalEvidenceLevel } from "@/lib/data/nepal-evidence-lookup";
import { AU_NEPAL_EVIDENCE_SOURCE } from "@/lib/data/source/au-nepal-evidence-levels";

/**
 * Attaches each match's DHA Nepal-passport evidence level (study-type 01) when the
 * university resolves to a CRICOS provider in the harvested directory. The level
 * travels to the client as a precomputed string on the match (lib/matches/types.ts),
 * so this function — which pulls in the ~3,300-row directory + evidence datasets —
 * must run server-side only (it does: the two assembleAssessment callers are the
 * /api/assess route and the owned [id] page). Importing it into a "use client"
 * module would bundle those datasets to every anonymous visitor.
 *
 * Present-when-known: a provider absent from the resolver/map returns the match
 * unchanged (no `evidence` field). Nepal → Australia is the MVP corridor, so the
 * level applies to every match without a homeCountry gate (matching the dashboard
 * ProgramCard's behaviour).
 */
export function attachNepalEvidence(matches: MatchResult[]): MatchResult[] {
  return matches.map((m) => {
    const cricos = cricosCodeForUniversity(m.university.id);
    const level = cricos ? nepalEvidenceLevel(cricos.cricosCode) : null;
    return level ? { ...m, evidence: { level, source: AU_NEPAL_EVIDENCE_SOURCE } } : m;
  });
}
