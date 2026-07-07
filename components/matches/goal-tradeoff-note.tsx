import type { GoalTradeoffNote as GoalTradeoffNoteData } from "@/lib/goals/conflicts";

/**
 * Renders the single honest goal trade-off note as a calm, non-blocking line —
 * a sibling of <PreferenceNote>, never a modal (a goal tension is knowable, not
 * fixable). Returns nothing when there is no note.
 */
export function GoalTradeoffNote({
  note,
}: {
  note: GoalTradeoffNoteData | null | undefined;
}) {
  if (!note) return null;
  return <p className="text-meta text-ink-soft">{note.text}</p>;
}
