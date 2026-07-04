import type { AssessmentResult, FieldOfStudy, StudentProfile, Verdict } from "@/lib/scoring/types";
import { VERDICTS } from "@/lib/scoring/types";
import { runAssessment } from "@/lib/scoring/engine";
import { FIELD_LABELS } from "@/lib/labels";

/** One "also considering" field, re-scored server-side, reduced to its band only. */
export interface SecondaryVerdict {
  field: FieldOfStudy;
  /** FIELD_LABELS[field] — the human field name. */
  label: string;
  /** ONLY the band is kept from the re-score (never weighted/dimensions/computedAt). */
  verdict: Verdict;
  /** True when this field's band is strictly stronger than the primary's. */
  outranksPrimary: boolean;
}

export interface SecondaryVerdicts {
  /** The primary field's own band + label — the anchor every row is conditional against.
   *  Carried here (not just on the result) so the pivot callout can name the difference
   *  in words without threading the profile through the presentational component. */
  primary: { label: string; verdict: Verdict };
  /** One per also-considering field, in the student's chosen order. */
  items: SecondaryVerdict[];
  /** The strongest field that outranks the primary (drives the pivot callout); null when none. */
  pivot: SecondaryVerdict | null;
}

/** Band rank: strong 0 → possible 1 → reach 2 (lower is better). */
function rank(verdict: Verdict): number {
  return VERDICTS.indexOf(verdict);
}

/**
 * Promote each "also considering" field into a real banded verdict by re-scoring
 * the SAME student with only `fieldOfStudy` swapped (Option C / MV-102). Only the
 * `.verdict` band is kept from each re-score, so the output is deterministic and
 * never leaks a numeric score, `dimensions`, or `computedAt`.
 *
 * The extras are filtered against the primary and de-duplicated *here* — this is the
 * load-bearing guard, because not every write path validates disjointness. After
 * filtering, an empty list returns `null` (the common single-field case → zero extra
 * scoring). The primary verdict is passed in and never recomputed.
 */
export function computeSecondaryVerdicts(
  profile: StudentProfile,
  primaryResult: AssessmentResult,
): SecondaryVerdicts | null {
  const extras: FieldOfStudy[] = [];
  for (const field of profile.alsoConsidering ?? []) {
    if (field === profile.fieldOfStudy) continue;
    if (extras.includes(field)) continue;
    extras.push(field);
  }
  if (extras.length === 0) return null;

  const primaryRank = rank(primaryResult.verdict);
  const items: SecondaryVerdict[] = extras.map((field) => {
    const verdict = runAssessment({ ...profile, fieldOfStudy: field }).verdict;
    return {
      field,
      label: FIELD_LABELS[field],
      verdict,
      outranksPrimary: rank(verdict) < primaryRank,
    };
  });

  // Strongest field that outranks the primary; ties resolve to the first in student order.
  let pivot: SecondaryVerdict | null = null;
  for (const item of items) {
    if (!item.outranksPrimary) continue;
    if (pivot === null || rank(item.verdict) < rank(pivot.verdict)) pivot = item;
  }

  return {
    primary: { label: FIELD_LABELS[profile.fieldOfStudy], verdict: primaryResult.verdict },
    items,
    pivot,
  };
}
