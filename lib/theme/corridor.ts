/**
 * Corridor theming registry (MV-96 = overhaul spec MV-91).
 *
 * The base brand is globally neutral; a corridor (the home-country → destination
 * journey, e.g. Nepal → Australia) activates a small personalization layer once
 * the user's home country is known: accent-token overrides in globals.css keyed
 * off a `data-corridor` attribute, plus the mascot plumage variant consumed by
 * the mascot component when it lands. Base palette, type, and motion stay
 * global — accents only.
 *
 * Activation points (the attribute rides an inner wrapper, never <html>, so
 * marketing routes can never carry it — guarded by
 * tests/styles/corridor-tokens.test.ts):
 * - Anonymous: the results phase of AssessFlow (home country known post-wizard).
 * - Signed-in: the (app) shell layout (always-on).
 */

export type CorridorId = "np-au";

export interface CorridorTheme {
  id: CorridorId;
  label: string;
  /** Mascot plumage variant id — same silhouette, corridor skin (spec MV-96). */
  mascotVariant: "danphe";
}

export const CORRIDORS: Record<CorridorId, CorridorTheme> = {
  "np-au": { id: "np-au", label: "Nepal → Australia", mascotVariant: "danphe" },
};

/**
 * MVP: every signed-in user is on the Nepal → Australia corridor — profile
 * sections don't carry a home country yet, and lib/scoring/from-sections.ts
 * pins the same assumption for scoring. When home country becomes a real
 * profile field, resolve per-user via corridorForHomeCountry instead.
 */
export const DEFAULT_CORRIDOR: CorridorId = "np-au";

/** Resolve a wizard/profile home country to its corridor; null = neutral brand. */
export function corridorForHomeCountry(homeCountry: string | null | undefined): CorridorId | null {
  if (!homeCountry) return null;
  return homeCountry.trim().toLowerCase() === "nepal" ? "np-au" : null;
}
