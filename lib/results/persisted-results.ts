/**
 * Where an anonymous assessment's computed results are kept between page loads in
 * the SAME tab, so a refresh / OAuth round-trip on the results screen rehydrates
 * instead of dropping to the wizard (MV-28 a). sessionStorage survives a same-tab
 * redirect to an OAuth provider and back, which is exactly what the /assess
 * claim-failure recovery relies on to still find the student's work (MV-130).
 *
 * The key and the id-reader live here (not inside the client-heavy assess-flow)
 * so the lightweight recovery surface can read the preserved id without importing
 * the wizard/results bundle. Client-safe: no `server-only`.
 */
export const RESULTS_STORAGE_KEY = "myvisa.results.v1";

/**
 * The persisted anonymous assessment's id, or null when nothing recoverable is
 * stored. Tolerant by design: any parse/shape/quota problem reads as "nothing to
 * recover" rather than throwing into a surface that is already handling a failure.
 */
export function readPersistedAssessmentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { assessmentId?: unknown };
    return typeof parsed?.assessmentId === "string" ? parsed.assessmentId : null;
  } catch {
    return null;
  }
}

/** Drop the persisted results — used when the assessment they describe is gone. */
export function clearPersistedResults(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RESULTS_STORAGE_KEY);
  } catch {
    // Private mode / quota — nothing to clear.
  }
}
