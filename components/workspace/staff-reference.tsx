/**
 * Staff identity without a name, because no name exists to show: F-9 —
 * `organization_memberships` carries only `user_id`, and `auth.users` is not
 * readable by `authenticated`. The reference is `Role · 8-character id`, the same
 * shape the team page and the manage picker use, so one person reads the same on
 * every surface. An inactive membership is said out loud — "Access switched off"
 * is a different sentence from "assigned" (spec §1).
 */
export function StaffReference({
  role,
  userId,
  active = true,
}: {
  role: string;
  userId: string;
  active?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 text-meta text-ink-soft">
      {!active ? <span>Access switched off ·</span> : null}
      <span>{sentenceCase(role)}</span>
      <span aria-hidden="true">·</span>
      <span className="font-mono">{userId.slice(0, 8)}</span>
    </span>
  );
}

/** `counsellor` is schema; the reader gets "Counsellor". Unknown roles render as
 *  themselves rather than vanishing — same rule as `operationalStatusLabel`. */
function sentenceCase(role: string): string {
  return role.length === 0 ? role : role.charAt(0).toUpperCase() + role.slice(1);
}
