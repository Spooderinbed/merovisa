export const ASSESSMENT_TTL_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function assessmentExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + ASSESSMENT_TTL_DAYS * MS_PER_DAY).toISOString();
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
