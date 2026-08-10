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
        if (response.status === 409) {
          setAssignmentError(
            "That person's access to this organization has been switched off. Reactivate them on the team page, or choose someone else.",
          );
          return;
        }
        // The one failure that changed the case anyway. The unique index forces
        // delete-then-insert, so the previous counsellor can be gone while the
        // new one was never added — and an admin told only "that didn't work"
        // would not know to reassign.
        const body: unknown = await response.json().catch(() => null);
        if (
          typeof body === "object" &&
          body !== null &&
          (body as { leftUnassigned?: unknown }).leftUnassigned === true
        ) {
          setAssignmentError(
            "We removed the previous counsellor but could not add the new one, so this student has nobody assigned right now. Please choose a counsellor again.",
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
            <p className="text-meta text-ink-soft">{assignmentNote}</p>
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
