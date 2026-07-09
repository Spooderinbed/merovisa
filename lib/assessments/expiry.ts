export const ASSESSMENT_TTL_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function assessmentExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + ASSESSMENT_TTL_DAYS * MS_PER_DAY).toISOString();
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/**
 * Format a stored expiry instant for display, pinned to Asia/Kathmandu (the
 * Nepal->Australia corridor audience). Pinning the zone makes the rendered day
 * identical on the server and the client (no hydration mismatch), and because it
 * is derived from the stored expires_at it reflects the assessment's real age
 * rather than the view-time clock (MV-118 #4).
 */
export function formatExpiryLabel(expiresAtIso: string): string {
  return new Date(expiresAtIso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kathmandu",
  });
}
