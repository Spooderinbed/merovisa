import type { FieldOfStudy } from "@/lib/scoring/types";

/** Max number of "also considering" fields a student may add beyond their primary. */
export const ALSO_CONSIDERING_CAP = 2;

/**
 * Normalises an also-considering list against the primary field, enforcing the
 * invariant the rest of the app relies on: the primary is never in its own
 * also-considering set, duplicates are removed, and the list is capped. Order is
 * preserved (first occurrence wins). Used to keep the two selections disjoint
 * whenever either the primary or the extras change.
 */
export function reconcileAlsoConsidering(
  primary: FieldOfStudy | undefined,
  also: readonly FieldOfStudy[],
): FieldOfStudy[] {
  const out: FieldOfStudy[] = [];
  for (const f of also) {
    if (f === primary) continue;
    if (out.includes(f)) continue;
    out.push(f);
    if (out.length === ALSO_CONSIDERING_CAP) break;
  }
  return out;
}

/**
 * Toggles one field in/out of the also-considering set, respecting the cap and
 * never letting the primary in. Adding past the cap or adding the primary is a
 * no-op; removal always works, even at the cap. Keeps the wizard step dumb — the
 * rule lives here where it can be unit-tested.
 */
export function toggleAlsoConsidering(
  current: readonly FieldOfStudy[],
  field: FieldOfStudy,
  primary: FieldOfStudy | undefined,
): FieldOfStudy[] {
  if (field === primary) return [...current];
  if (current.includes(field)) return current.filter((f) => f !== field);
  if (current.length >= ALSO_CONSIDERING_CAP) return [...current];
  return [...current, field];
}
