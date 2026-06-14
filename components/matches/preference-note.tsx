import type { PreferenceNote as PreferenceNoteData } from "@/lib/matches/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

export function PreferenceNote({ note }: { note: PreferenceNoteData | null | undefined }) {
  if (!note) return null;

  if (note.kind === "pr-context") {
    return (
      <p className="text-[14px] text-ink-soft">
        {note.before}
        <SourceAnchor
          surface="preference-note"
          href={note.source.href}
          title={note.source.lastVerified ? `verified ${note.source.lastVerified}` : undefined}
          className="text-ink underline underline-offset-2 hover:text-primary"
        >
          {note.linkText}
        </SourceAnchor>
        {note.after}
      </p>
    );
  }

  return <p className="text-[14px] text-ink-soft">{note.text}</p>;
}
