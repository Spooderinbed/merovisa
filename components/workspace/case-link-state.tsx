/**
 * The linked/unlinked marker — the refit of the students page's local `Marker`
 * (spec §4). The words are F-3's: "Self-reported" claims only what is knowable —
 * a student with an account CAN write their own name and email — never that a
 * student did, and never that either value was verified.
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
      {hasLinkedStudent ? "Self-reported" : "No student account"}
    </span>
  );
}
