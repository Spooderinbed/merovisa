"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveErrorMessage } from "./save-error";

/**
 * Cell 8's form — create a case for a student who has no account.
 *
 * Only two fields, and that is the whole model: `display_name` is required,
 * `email` is optional, and everything else about the row is decided by the
 * database. `operational_status` takes its `'new'` default and
 * `student_user_id` stays NULL because linking a student is Stage 5's.
 *
 * NOTHING FROM `lib/cases/permissions` IS IMPORTED HERE. That module is
 * `server-only` because the permission matrix is server business logic that must
 * not be readable in client JS; MV-169 leaked it into the browser bundle through
 * exactly this kind of component, and only `next build` failed.
 * `tests/architecture/client-server-boundary.test.ts` pins it now.
 *
 * Whether this form is rendered at all is decided on the server. That is
 * PRESENTATION: the route re-decides every request against the database, and the
 * database re-decides again under `cases_insert_admin`. Hiding a control is a
 * courtesy, never a gate (`lib/cases/README.md` §3).
 */

export interface CaseCreateFormProps {
  organizationId: string;
}

export function CaseCreateForm({ organizationId }: CaseCreateFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    const trimmedEmail = email.trim();
    try {
      const response = await fetch(`/api/org/${organizationId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A blank field is OMITTED rather than sent as "". The column is
        // nullable and "no email address on file" is a real state; an empty
        // string would be a third value that renders as an address the student
        // does not have.
        body: JSON.stringify({
          displayName: displayName.trim(),
          ...(trimmedEmail === "" ? {} : { email: trimmedEmail }),
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 422
            ? "Check the name and email address, then try again."
            : saveErrorMessage(response.status),
        );
        return;
      }

      // The new case is not navigated to. The manage page is reached from the
      // list, and sending someone straight into a surface that carries only a
      // status control would imply there is more there than there is.
      router.push(`/workspace/${organizationId}/students`);
      router.refresh();
    } catch {
      setError(saveErrorMessage(500));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-meta text-ink-soft">
          Student&apos;s full name
        </label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-meta text-ink-soft">
          Email address (optional)
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
        />
      </div>

      {error !== null ? (
        <p role="alert" className="text-meta text-reach">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={saving || displayName.trim() === ""}>
          {saving ? "Adding…" : "Add student"}
        </Button>
      </div>
    </form>
  );
}
