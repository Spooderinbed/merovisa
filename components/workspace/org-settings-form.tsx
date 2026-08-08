"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Access-matrix cell 2 — the organization's own name and web address, owner-only.
 *
 * `slug` is the tenant's URL identity and is unique across the whole table, which
 * is why the migration reserves this to the owner: an admin holding this verb
 * could rename their organization onto a slug a competitor is about to claim, or
 * break every existing link to it. A 409 from the route is that collision, and it
 * is reported against the field rather than as a generic failure.
 */

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
        setError("Use lowercase letters, numbers and hyphens for the web address.");
      } else if (!res.ok) {
        setError("That change was not allowed.");
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
