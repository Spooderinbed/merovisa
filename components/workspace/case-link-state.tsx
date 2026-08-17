/**
 * The linked/unlinked marker — the refit of the students page's local `Marker`
 * (spec §4).
 *
 * The words are the UI spec's (§1 item 4, §2 "Link state", §3): "Student linked"
 * or "No student account". They state the schema fact — `student_user_id IS NOT
 * NULL` — and nothing more.
 *
 * **It used to read "Self-reported"** (F-3's reading (a), MV-170). That word
 * carried the caveat but dropped the fact, and it disagreed with the queue's own
 * filter, which has always been labelled "Student linked"
 * (`case-queue-toolbar.tsx`) — so a counsellor filtered by one word and read back
 * another. The caveat has not been lost: it is what the `title` says here, what
 * the All-cases legend spells out, and what the case frame prints in full next to
 * the name and email it qualifies. One word per fact, on every surface.
 */
export function CaseLinkState({ hasLinkedStudent }: { hasLinkedStudent: boolean }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft"
      title={
        hasLinkedStudent
          ? "The student has an account and can edit their own name and email address. Read those as the student's words, not as a verified identity."
          : "No student account is linked to this case yet."
      }
    >
      {hasLinkedStudent ? "Student linked" : "No student account"}
    </span>
  );
}
