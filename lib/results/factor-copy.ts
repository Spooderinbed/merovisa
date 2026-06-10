import { DESTINATION_LABELS } from "@/lib/labels";
import { DESTINATIONS, type Destination } from "@/lib/scoring/types";

/**
 * In-sentence destination names for factor copy: DESTINATION_LABELS, with the
 * forms that need an article (or a real phrase) adjusted to the scoring
 * engine's own in-sentence convention (DESTINATION_LABEL in
 * lib/scoring/financial.ts) — "for the UK", "for your destination".
 */
const IN_SENTENCE: Record<Destination, string> = {
  ...DESTINATION_LABELS,
  uk: "the UK",
  usa: "the USA",
  "not-sure": "your destination",
};

const RAW_DESTINATION_ID = new RegExp(`\\b(${DESTINATIONS.join("|")})\\b`, "g");

/**
 * Display-layer fix for the audit #8 casing leak: scoring factor details
 * interpolate the raw destination id ("Meets the 6.5 threshold for australia"
 * — lib/scoring/visa.ts), and the engine's output is versioned and pinned by
 * golden fixtures, so the id is humanized at the render seam instead.
 * Case-sensitive on purpose: already-proper names ("Australia") pass through.
 */
export function humanizeFactorDetail(detail: string): string {
  return detail.replace(RAW_DESTINATION_ID, (id) => IN_SENTENCE[id as Destination]);
}
