import type { Verdict } from "./types";

/**
 * The one place each verdict's user-facing wording lives. `label` is the
 * singular pill on a single program's verdict card ("Strong match"); `groupLabel`
 * is the plural header over the bucket of them on the matches list ("Strong
 * matches"). Both verdict surfaces read from here so the wording can't drift
 * apart — change it once and both update.
 */
export const VERDICT_LABELS: Record<Verdict, { label: string; groupLabel: string }> = {
  strong: { label: "Strong match", groupLabel: "Strong matches" },
  possible: { label: "Possible", groupLabel: "Possible" },
  reach: { label: "Reach", groupLabel: "Reach" },
};
