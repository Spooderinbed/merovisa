"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveErrorMessage } from "./save-error";

/**
 * Access-matrix cell 2 — the organization's own name and web address, owner-only.
 *
 * `slug` is the tenant's URL identity and is unique across the whole table, which
 * is why the migration reserves this to the owner: an admin holding this verb
 * could rename their organization onto a slug a competitor is about to claim, or
 * break every existing link to it. A 409 from the route is that collision, and it
 * is reported against the field rather than as a generic failure.
 *
 * Every other outcome is attributed too — see `./save-error` for why a 401 and a
 * 500 must not both render as a refusal, and `validationMessage` below for why a
 * 422 must name the field the route actually rejected.
 */

/** The two fields the route validates, and what to say about each. */
const FIELD_MESSAGES = [
  { field: "name", message: "Enter an organization name, up to 120 characters." },
  { field: "slug", message: "Use lowercase letters, numbers and hyphens for the web address." },
] as const;

/**
 * WHICH field the route refused, read from the `issues` it returns.
 *
 * This used to map the 422 STATUS to one fixed sentence about the web address,
 * but `app/api/org/[organizationId]/route.ts` 422s a name that is empty after
 * trim, a name over 120 characters, a bad slug, or a key outside the grant. So
 * clearing the Organization name pointed the owner at a web address that was
 * untouched and correct. `parsed.error.flatten()` says which field failed, and
 * that is the only honest thing to render.
 *
 * The fallback covers the issues that carry no field — the "provide a name or a
 * slug" refinement and an unrecognised key both land in `formErrors` — and a
 * body we could not read at all.
 */
async function validationMessage(response: Response): Promise<string> {
  let fieldErrors: Record<string, unknown> = {};
  try {
    const body = (await response.json()) as { issues?: { fieldErrors?: Record<string, unknown> } };
    fieldErrors = body.issues?.fieldErrors ?? {};
  } catch {
    // A 422 we cannot parse is still a 422; fall through to the both-fields note.
  }

  const refused = FIELD_MESSAGES.filter(({ field }) => {
    const errors = fieldErrors[field];
    return Array.isArray(errors) && errors.length > 0;
  });
  if (refused.length === 0) return "We couldn't save that. Check the name and the web address.";
  return refused.map(({ message }) => message).join(" ");
}

export interface OrgSettingsFormProps {
  organizationId: string;
  name: string;
  slug: string;
}

export function OrgSettingsForm({ organizationId, name, slug }: OrgSettingsFormProps) {
  const router = useRouter();
  const [draftName, setDraftName] = useState(name);
  const [draftSlug, setDraftSlug] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = draftName.trim() !== name || draftSlug.trim() !== slug;

  async function onSave() {
    if (busy || !changed) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/org/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim(), slug: draftSlug.trim() }),
      });
      if (res.status === 409) {
        setError("That web address is already taken. Try another.");
      } else if (res.status === 422) {
        setError(await validationMessage(res));
      } else if (!res.ok) {
        setError(saveErrorMessage(res.status));
      } else {
        setMessage("Saved.");
        router.refresh();
      }
    } catch {
      setError("We couldn't save that change.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-meta text-ink-soft">
        Organization name
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          aria-label="Organization name"
          className="max-w-[420px] rounded-md border border-line-2 bg-surface px-3 py-2 text-control text-ink focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-meta text-ink-soft">
        Web address
        <input
          value={draftSlug}
          onChange={(event) => setDraftSlug(event.target.value)}
          aria-label="Web address"
          autoComplete="off"
          className="max-w-[420px] rounded-md border border-line-2 bg-surface px-3 py-2 font-mono text-control text-ink focus:border-primary"
        />
      </label>
      {error ? <p className="text-meta text-reach">{error}</p> : null}
      {message ? <p className="text-meta text-strong">{message}</p> : null}
      <div>
        <Button disabled={!changed} loading={busy} loadingLabel="Saving" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
