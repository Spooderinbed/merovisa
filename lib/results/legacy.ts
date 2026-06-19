import type { AssessmentPayload } from "./types";

/**
 * True when a stored payload predates the program-level match shape (MV-01): its
 * `matches` are the old university-level shape (`UniversityMatch`, which has no
 * `.program`) and so cannot be rendered by the current results UI. Detected
 * structurally rather than by a version flag, since legacy payloads carry none.
 * Empty match lists are not "legacy" — there is simply nothing to render.
 */
export function hasLegacyMatchShape(payload: Pick<AssessmentPayload, "matches">): boolean {
  const matches = payload.matches as unknown[] | undefined;
  if (!matches || matches.length === 0) return false;
  const first = matches[0] as { program?: unknown };
  return first.program === undefined;
}
