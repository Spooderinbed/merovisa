"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StaffReference } from "./staff-reference";
import { saveErrorMessage } from "./save-error";

/**
 * One membership, with the two controls cell 5 allows: change the role, or
 * deactivate. There is no "remove" — `status = 'inactive'` is the revocation
 * switch and the row deliberately survives for the audit trail.
 *
 * MV-180 makes the row a dense roster line built on `StaffReference`, so one
 * person reads identically here, in the queue, and on the manage picker — and
 * takes `canManage`, because cell 4 (read the roster) and cell 5 (change it) are
 * different cells and a counsellor holds only the first.
 *
 * The controls a viewer may not use are not rendered at all, but that is
 * PRESENTATION: the route re-decides every request against the database, and the
 * database re-decides again under RLS. Hiding a control is a courtesy, never a
 * gate (`lib/cases/README.md` §3).
 *
 * `owner` is offered in the role list only to an owner — mirroring the WITH CHECK
 * horn of `organization_memberships_update_admin`. An admin who submits it anyway
 * gets a 403, which is the actual enforcement.
 *
 * `roleOptions` ARRIVES AS A PROP and is not read from `lib/cases/permissions`.
 * That module is `server-only` precisely because the permission matrix is server
 * business logic that must never be readable in client JS (CLAUDE.md
 * §Architecture Rules — the same reasoning that keeps the scoring engine on the
 * server). Importing it here compiled the whole grid into the browser bundle; the
 * jsdom suite could not see it because `server-only` is mocked away in tests, and
 * only `next build` failed. `tests/architecture/client-server-boundary.test.ts`
 * now pins it.
 */

export interface TeamMemberRowProps {
  organizationId: string;
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  /** The viewer's own membership row — no self-management, see the lockout guard. */
  isSelf: boolean;
  /**
   * Cell 5 — does this viewer hold `org.manage`? Required rather than defaulted:
   * a default would decide the read-only case silently, and the case it would
   * decide wrong is the counsellor's.
   */
  canManage: boolean;
  viewerIsOwner: boolean;
  /** Computed on the server from `MEMBERSHIP_ROLES`; already filtered for this viewer. */
  roleOptions: readonly string[];
}

export function TeamMemberRow({
  organizationId,
  membershipId,
  userId,
  role,
  status,
  isSelf,
  canManage,
  viewerIsOwner,
  roleOptions,
}: TeamMemberRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A counsellor manages nothing here, an admin may not touch the owner's row
  // (the USING horn), and nobody may touch their own.
  const manageable = canManage && !isSelf && (viewerIsOwner || role !== "owner");

  async function patch(change: { role?: string; status?: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${organizationId}/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) {
        // This row had no status branches at all, so 401, 403, 404 and both of
        // the route's 500s all read as "that change was not allowed" — a refusal
        // of the person rather than of the request. A 404 is its own outcome
        // here: the route returns it when the membership is not in this
        // organization, which from this row means the team moved underneath it.
        setError(
          res.status === 404
            ? "That member is no longer in this organization. Refresh to see the current team."
            : saveErrorMessage(res.status),
        );
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setError("We couldn't save that change.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* No name and no email, and this is not an omission we can fix here:
            `organization_memberships` carries only `user_id`, and `auth.users` is
            not readable by `authenticated`. Recorded as F-9 on the spec — which is
            why the whole roster reads through `StaffReference`. */}
        <p className="flex flex-wrap items-baseline gap-2">
          <StaffReference role={role} userId={userId} active={status === "active"} />
          {isSelf ? <span className="text-meta text-ink-soft">(you)</span> : null}
        </p>

        {manageable ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-meta text-ink-soft">
              Role
              <select
                value={role}
                disabled={busy}
                aria-label={`Role for member ${userId.slice(0, 8)}`}
                onChange={(event) => patch({ role: event.target.value })}
                className="rounded-md border border-line-2 bg-surface px-3 py-1.5 text-control text-ink focus:border-primary"
              >
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              loading={busy}
              onClick={() => patch({ status: status === "active" ? "inactive" : "active" })}
            >
              {status === "active" ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-meta text-reach">{error}</p> : null}
    </div>
  );
}
