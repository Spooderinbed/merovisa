"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentKind } from "@/lib/documents/types";
import { caseScoped, useCaseScopeId } from "@/components/cases/case-scope";
import { Card } from "@/components/ui/card";
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
  // Null on /checklist/all — the route then resolves the student's own case.
  const caseId = useCaseScopeId();

  async function toggle() {
    const next = !obtained;
    setObtained(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/documents/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(caseScoped({ kind, obtained: next }, caseId)),
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
    <Card
      as="label"
      padding="sm"
      className={cn(
        "flex cursor-pointer items-center gap-3 transition-colors",
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
      <span className="text-body text-ink">{label}</span>
      {obtained ? (
        <span className="ml-auto text-small text-primary">Obtained</span>
      ) : (
        <span className="ml-auto text-small text-ink-faint">Not yet</span>
      )}
    </Card>
  );
}
