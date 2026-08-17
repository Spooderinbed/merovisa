/**
 * The unlinked case's standing prompt (spec §3, "Unlinked case").
 *
 * A consultancy case with no student account is the normal Stage 3 shape, not a
 * defect — but it is the fact that decides how much weight everything else on the
 * overview carries, which is why it leads rather than sits in a corner. When the
 * resolution makes invitation the case's next action, this panel IS that action
 * and carries the marker; when something more urgent outranks it, it stays as the
 * standing linkage state and the marker moves to `CaseNextAction`.
 *
 * **No control, deliberately.** Stage 5 owns invitations and nothing sends one
 * today. Spec §2: "Invitation actions become links only when Stage 5 exists;
 * before then the linkage marker remains visible without a dead control." A button
 * that did nothing would be a worse answer than a sentence that says so.
 *
 * A linked case renders none of this — the caller drops it entirely rather than
 * showing a satisfied prompt.
 */
export function CaseInviteBlock({
  hasEmail,
  isNextAction,
}: {
  hasEmail: boolean;
  isNextAction: boolean;
}) {
  return (
    <section
      data-testid={isNextAction ? "case-next-action" : undefined}
      className={
        isNextAction
          ? "flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary-tint p-5"
          : "flex flex-col gap-3 rounded-lg border border-line p-5"
      }
    >
      <div className="flex flex-col gap-1">
        {isNextAction ? (
          <span className="text-caption uppercase tracking-wide text-ink-faint">Next action</span>
        ) : null}
        <h2 className="text-title font-medium text-ink">
          {hasEmail ? "Invite the student" : "Add an email to invite"}
        </h2>
      </div>
      <p className="max-w-[64ch] text-body text-ink-soft">
        Link their account before relying on a student-entered profile or visa read.
      </p>
      <p className="max-w-[64ch] text-caption text-ink-soft">
        {hasEmail
          ? "Sending the invitation isn't built yet."
          : "There is no email address on this case to send an invitation to, and sending one isn't built yet."}
      </p>
    </section>
  );
}
