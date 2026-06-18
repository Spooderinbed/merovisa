"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CONFIRM_WORD = "DELETE";

/**
 * The user-facing right-to-delete control. Type-to-confirm guards an
 * irreversible action; on success the browser is sent home (the session is
 * already gone server-side). Posts same-origin so the route's CSRF check
 * receives our Origin header automatically.
 */
export function DeleteAccountSection() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD;

  async function onDelete() {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        setError("We couldn't delete your account. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("We couldn't delete your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6 lg:col-span-2">
      <h2 className="text-[18px] font-medium text-reach">Delete your account</h2>
      <p className="max-w-[64ch] text-[15px] text-ink-soft">
        This permanently removes your profile, assessments, plan, and every uploaded
        document — passport, bank statements, and the rest. It cannot be undone.
      </p>
      <label className="flex flex-col gap-1 text-[14px] text-ink-soft">
        Type <span className="font-mono text-ink">{CONFIRM_WORD}</span> to confirm
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-label={`Type ${CONFIRM_WORD} to confirm`}
          autoComplete="off"
          className="max-w-[220px] rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary"
        />
      </label>
      {error ? <p className="text-[14px] text-reach">{error}</p> : null}
      <div>
        <Button variant="ghost" className="text-reach" disabled={!armed || busy} onClick={onDelete}>
          {busy ? "Deleting…" : "Delete my account permanently"}
        </Button>
      </div>
    </section>
  );
}
