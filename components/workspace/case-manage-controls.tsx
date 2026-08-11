"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
} from "@/lib/cases/operational-status";
import { saveErrorMessage } from "./save-error";

/**
 * Cells 9 and 10 — the two controls a case carries in Stage 3.
 *
 * `lib/cases/operational-status` IS imported here, and that is deliberate: it is
 * the one module in `lib/cases/` NOT marked `server-only`, because a status
 * vocabulary is what the control says out loud rather than a permission rule.
 * `lib/cases/permissions` and `lib/cases/write-repo` are `server-only` and are
 * not imported — MV-169 leaked the permission matrix into the browser bundle
 * through a component like this one, and only `next build` failed.
 *
 * Which controls exist is decided on the server. That is PRESENTATION: each route
 * re-decides every request against the database, and the database re-decides
 * again — `enforce_case_write_surface` for the status, `case_assignments_insert_admin`
 * for the assignment.
 */

export interface CaseManageMember {
  /** The form value. NOT the Auth user id — see the assignment route's header. */
  membershipId: string;
  /** The same short reference the team page shows, so the two surfaces agree. */
  shortReference: string;
  role: string;
  isCurrent: boolean;
}

export interface CaseManageControlsProps {
  caseId: string;
  operationalStatus: string;
  canUpdateStatus: boolean;
  canAssign: boolean;
  /** Active members only; empty when the viewer may not assign. */
  members: readonly CaseManageMember[];
}

export function CaseManageControls({
  caseId,
  operationalStatus,
  canUpdateStatus,
  canAssign,
  members,
}: CaseManageControlsProps) {
  const router = useRouter();
  const [status, setStatus] = useState(operationalStatus);
  const [membershipId, setMembershipId] = useState(
    members.find((member) => member.isCurrent)?.membershipId ?? "",
  );
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentNote, setAssignmentNote] = useState<string | null>(null);

  async function saveStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingStatus) return;
    setSavingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationalStatus: status }),
      });
      if (!response.ok) {
        setStatusError(saveErrorMessage(response.status));
        return;
      }
      router.refresh();
    } catch {
      setStatusError(saveErrorMessage(500));
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAssignment || membershipId === "") return;
    setSavingAssignment(true);
    setAssignmentError(null);
    setAssignmentNote(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/assignment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });

      if (!response.ok) {
        // Read the body ONCE, then branch on what it SAYS rather than on the status
        // it arrived with. Two of these outcomes share 409 and a third can arrive as
        // either 403 or 500, so the status is not the discriminator — `reason` and
        // `leftUnassigned` are. `.catch` covers a proxy answering with an HTML error
        // page, where `json()` rejects.
        const body: unknown = await response.json().catch(() => null);
        const failure = (typeof body === "object" && body !== null ? body : {}) as {
          leftUnassigned?: unknown;
          reason?: unknown;
        };

        // FIRST, and across every status. The one failure that changed the case
        // anyway: the unique index forces delete-then-insert, so the previous
        // counsellor can be gone while the new one was never added. It reaches here
        // as a 500 OR as a 403 — a 42501 on the replacement insert is mapped to
        // `denied` — and an admin told only "not allowed" would not know to
        // reassign.
        if (failure.leftUnassigned === true) {
          setAssignmentError(
            "We removed the previous counsellor but could not add the new one, so this student has nobody assigned right now. Please choose a counsellor again.",
          );
          return;
        }
        if (failure.reason === "member-inactive") {
          setAssignmentError(
            "That person's access to this organization has been switched off. Reactivate them on the team page, or choose someone else.",
          );
          return;
        }
        if (failure.reason === "reassignment-conflict") {
          // A lost race, not a refusal. Zero rows affected is how Postgres reports
          // both, and telling this admin they lack permission would be false — they
          // already passed `case.assign` to get here.
          setAssignmentError(
            "Somebody else changed this student's counsellor while you were choosing. Refresh the page to see who holds it now, then try again.",
          );
          return;
        }
        setAssignmentError(saveErrorMessage(response.status));
        return;
      }

      const body = (await response.json()) as { changed?: boolean };
      if (body.changed === false) {
        setAssignmentNote("That counsellor already has this student. Nothing changed.");
        return;
      }
      router.refresh();
    } catch {
      setAssignmentError(saveErrorMessage(500));
    } finally {
      setSavingAssignment(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {canUpdateStatus ? (
        <form onSubmit={saveStatus} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="operationalStatus" className="text-meta text-ink-soft">
              Status
            </label>
            <Select
              id="operationalStatus"
              name="operationalStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {OPERATIONAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {OPERATIONAL_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          {statusError !== null ? (
            <p role="alert" className="text-meta text-reach">
              {statusError}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={savingStatus || status === operationalStatus}>
              {savingStatus ? "Saving…" : "Save status"}
            </Button>
          </div>
        </form>
      ) : null}

      {canAssign ? (
        <form onSubmit={saveAssignment} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="membershipId" className="text-meta text-ink-soft">
              Primary counsellor
            </label>
            <Select
              id="membershipId"
              name="membershipId"
              value={membershipId}
              onChange={(event) => setMembershipId(event.target.value)}
            >
              <option value="">Choose a counsellor</option>
              {members.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.role} · {member.shortReference}
                  {member.isCurrent ? " (currently assigned)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <p className="max-w-[60ch] text-caption text-ink-soft">
            Staff names are not available in the workspace yet, so people are listed by their role
            and the same short reference the team page shows. A student has one primary counsellor —
            choosing someone else replaces whoever holds it now.
          </p>
          {assignmentError !== null ? (
            <p role="alert" className="text-meta text-reach">
              {assignmentError}
            </p>
          ) : null}
          {assignmentNote !== null ? (
            // ANNOUNCED, like its sibling error above. This is the outcome of a
            // submit the person deliberately made, and rendering it as plain text
            // meant a screen-reader user got silence — no error, no confirmation,
            // and no reason to believe the request had finished. `status` rather
            // than `alert` because nothing went wrong: it is polite, not assertive.
            <p role="status" className="text-meta text-ink-soft">
              {assignmentNote}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={savingAssignment || membershipId === ""}>
              {savingAssignment ? "Saving…" : "Save counsellor"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
