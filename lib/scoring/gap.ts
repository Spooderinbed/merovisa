export const GAP_REQUIRES_REASON_THRESHOLD = 1;

export function computeGapYears(graduationYear: number, now: Date = new Date()): number {
  return Math.max(0, now.getFullYear() - graduationYear);
}
