import type { FieldOfStudy } from "@/lib/scoring/types";
import { FIELD_COMPETITIVENESS } from "@/lib/data/policy/field-competitiveness";
import { FIELD_LABELS } from "@/lib/labels";

export interface FieldCompetitivenessNote {
  field: FieldOfStudy;
  direction: "easier" | "harder";
  text: string;
}

/**
 * Competitiveness-weight difference (× 100) below which we stay silent. The
 * admission baseline moves 4 percentage points per 0.10 of weight, so 10 points
 * (≈ one clear tier) is the smallest gap worth mentioning; smaller gaps are noise.
 */
const MATERIAL_POINTS = 10;

/**
 * When a student adds "also considering" fields whose admission bar differs
 * materially from their primary, returns ONE honest note about the single most
 * different field — the consultant insight "you may have a stronger/tougher shot
 * there". Returns null when nothing differs enough to be worth saying.
 *
 * Honesty-first: the verdict is always scored on the primary field. This note
 * only contextualises the extras; it never changes a score.
 */
export function competitivenessNote(
  primary: FieldOfStudy,
  alsoConsidering: readonly FieldOfStudy[] | undefined,
): FieldCompetitivenessNote | null {
  if (!alsoConsidering || alsoConsidering.length === 0) return null;
  const weights = FIELD_COMPETITIVENESS.value;
  const primaryWeight = weights[primary];

  let best: { field: FieldOfStudy; points: number } | null = null;
  for (const field of alsoConsidering) {
    // Positive ⇒ the extra is a less competitive (easier) admit than the primary.
    const points = Math.round((primaryWeight - weights[field]) * 100);
    if (Math.abs(points) < MATERIAL_POINTS) continue;
    if (!best || Math.abs(points) > Math.abs(best.points)) best = { field, points };
  }
  if (!best) return null;

  const primaryLabel = FIELD_LABELS[primary];
  const extraLabel = FIELD_LABELS[best.field];
  if (best.points > 0) {
    return {
      field: best.field,
      direction: "easier",
      text: `${extraLabel} is a less competitive admit than ${primaryLabel}, so your chances there may be stronger.`,
    };
  }
  return {
    field: best.field,
    direction: "harder",
    text: `${extraLabel} is a more competitive admit than ${primaryLabel} — expect a higher bar there.`,
  };
}
