import type { FieldCompetitivenessNote } from "@/lib/scoring/field-note";

/**
 * One honest line contextualising an "also considering" field whose admission bar
 * differs materially from the primary the verdict was scored on. It never changes
 * the verdict — it only tells the student where they may have a stronger or tougher
 * shot. Renders nothing when there's no material difference (or no extra fields),
 * so it stays silent unless it has something useful to say.
 */
export function CompetitivenessNote({
  note,
}: {
  note: FieldCompetitivenessNote | null | undefined;
}) {
  if (!note) return null;
  return (
    <aside className="rounded-md border border-line bg-bg-tint px-4 py-3">
      <p className="font-mono text-caption uppercase tracking-wide text-ink-faint">
        Also considering
      </p>
      <p className="mt-1 text-meta text-ink-soft">{note.text}</p>
    </aside>
  );
}
