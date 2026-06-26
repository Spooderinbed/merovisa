"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentKind } from "@/lib/documents/types";
import { cn } from "@/lib/utils";

/**
 * The global checklist's per-kind "obtained" toggle (MV-53). A user marks a
 * document obtained whether or not they've uploaded a file. Clicking flips the
 * state optimistically and POSTs to /api/documents/status; on failure it rolls
 * back. The label doubles as the accessible name of the checkbox.
 */
export function DocumentStatusToggle({
  kind,
  label,
  initialObtained,
}: {
  kind: DocumentKind;
  label: string;
  initialObtained: boolean;
}) {
  const router = useRouter();
  const [obtained, setObtained] = useState(initialObtained);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !obtained;
    setObtained(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/documents/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, obtained: next }),
      });
      if (!res.ok) {
        setObtained(!next); // roll back
        return;
      }
      router.refresh();
    } catch {
      setObtained(!next); // roll back
    } finally {
      setPending(false);
    }
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface p-4 transition-colors",
        "hover:border-ink-faint",
        obtained && "border-primary",
      )}
    >
      <input
        type="checkbox"
        checked={obtained}
        disabled={pending}
        onChange={toggle}
        className="h-4 w-4 shrink-0 accent-primary disabled:opacity-50"
      />
      <span className="text-[15px] text-ink">{label}</span>
      {obtained ? (
        <span className="ml-auto text-[12.5px] text-primary">Obtained</span>
      ) : (
        <span className="ml-auto text-[12.5px] text-ink-faint">Not yet</span>
      )}
    </label>
  );
}
