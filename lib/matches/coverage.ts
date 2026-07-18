import type { Program } from "@/lib/programs/types";

/**
 * The student's intended field id when the catalogue actually passed in carries ZERO
 * programs for it — else null. Derived from the supplied catalogue (never a hardcoded
 * field list) so it stays correct as the live DB gains fields (audit C-10): a field the
 * DB now carries is never falsely disclosed as missing. Both the anonymous and signed-in
 * match paths call this, so they disclose identically.
 *
 * `null`/empty field ⇒ null (nothing to disclose). An EMPTY catalogue ⇒ null: listing
 * nothing is a read-outage / empty-state concern (MV-133), not a per-field statement, so
 * we never tell a student "we don't list your field" when we are listing no fields at all.
 */
export function uncoveredField(
  userField: string | null | undefined,
  programs: Program[],
): string | null {
  if (!userField) return null;
  if (programs.length === 0) return null;
  const covered = new Set(programs.map((p) => p.field));
  return covered.has(userField) ? null : userField;
}
