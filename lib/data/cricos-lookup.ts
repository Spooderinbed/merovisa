import { AU_CRICOS_CODES } from "@/lib/data/source/au-cricos-codes";
import { AU_CRICOS_DIRECTORY } from "@/lib/data/source/au-cricos-directory";

const CRICOS_REGISTER = "https://cricos.education.gov.au/";

/**
 * The minimal CRICOS resolution a provider card needs: the provider name, its
 * code, and a verifiable source URL. Both the curated finding-traced hand list
 * (AuCricosCode) and the harvested directory entry satisfy this shape.
 */
export interface CricosResolution {
  provider: string;
  cricosCode: string;
  source: string;
}

/**
 * Maps a catalogue university id (the DB `universities.id`, e.g. "sydney") to its
 * record id in the curated, finding-traced AU_CRICOS_CODES. The mapping is
 * EXPLICIT, not name-derived: a wrong CRICOS code on a verifiability signal is
 * worse than none, and provider names legitimately diverge from the catalogue —
 * e.g. catalogue "University of Adelaide" is the merged "Adelaide University"
 * (04249J) on the register.
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
};

/**
 * Catalogue universities whose code is absent from the finding-traced hand list
 * but present in the harvested DHA directory (au-cricos-directory.ts). Resolved by
 * EXPLICIT code, not name. These are the two the hand list flagged as "excluded
 * pending sourcing" (University of Melbourne, ANU) — now auto-filled from the
 * authority directory. The displayed source stays the public CRICOS register, on
 * which any code is verifiable.
 */
const DIRECTORY_BACKED: Record<string, string> = {
  melbourne: "00116K",
  anu: "00120C",
};

/**
 * The sourced CRICOS resolution for a catalogue university, or null when none is
 * mapped/sourced. Prefers the curated finding-traced record; falls back to the
 * harvested directory for the two universities the hand list is missing. Pure
 * lookup over the static fact layer — no scorer, no DB.
 */
export function cricosCodeForUniversity(universityId: string): CricosResolution | null {
  const cricosId = CATALOGUE_TO_CRICOS[universityId];
  if (cricosId) return AU_CRICOS_CODES.find((c) => c.id === cricosId) ?? null;

  const code = DIRECTORY_BACKED[universityId];
  if (code) {
    const entry = AU_CRICOS_DIRECTORY.find((e) => e.cricosCode === code);
    if (entry) return { provider: entry.provider, cricosCode: entry.cricosCode, source: CRICOS_REGISTER };
  }
  return null;
}
