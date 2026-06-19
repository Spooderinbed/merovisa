import { AU_CRICOS_CODES } from "@/lib/data/source/au-cricos-codes";
import type { AuCricosCode } from "@/lib/data/types";

/**
 * Maps a catalogue university id (the DB `universities.id`, e.g. "sydney") to its
 * record id in AU_CRICOS_CODES. The mapping is EXPLICIT, not name-derived: a wrong
 * CRICOS code on a verifiability signal is worse than none, and provider names
 * legitimately diverge from the catalogue — e.g. catalogue "University of Adelaide"
 * is the merged "Adelaide University" (04249J) on the register. Catalogue
 * universities with no sourced code (Melbourne D.055, ANU D.056 — excluded pending
 * sourcing) are intentionally absent here and resolve to null.
 */
const CATALOGUE_TO_CRICOS: Record<string, string> = {
  unsw: "unsw-sydney",
  sydney: "university-of-sydney",
  monash: "monash-university",
  uq: "university-of-queensland",
  uwa: "university-of-western-australia",
  adelaide: "adelaide-university",
  uts: "university-of-technology-sydney",
  rmit: "rmit-university",
  macquarie: "macquarie-university",
  deakin: "deakin-university",
  curtin: "curtin-university",
  latrobe: "la-trobe-university",
  wsu: "western-sydney-university",
  // melbourne, anu: no sourced CRICOS code yet → resolve to null.
};

/**
 * The sourced CRICOS record for a catalogue university, or null when none is
 * mapped/sourced. Pure lookup over the static fact layer — no scorer, no DB.
 */
export function cricosCodeForUniversity(universityId: string): AuCricosCode | null {
  const cricosId = CATALOGUE_TO_CRICOS[universityId];
  if (!cricosId) return null;
  return AU_CRICOS_CODES.find((c) => c.id === cricosId) ?? null;
}
