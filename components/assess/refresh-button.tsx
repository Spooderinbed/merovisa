"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * MV-17: triggers an in-place re-score of the signed-in user's primary assessment
 * via /api/assess/refresh, then navigates to the refreshed result. Scoring runs
 * entirely server-side (F16) — this button only fires the request and routes on
 * the returned id.
 */
export function RefreshButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/assess/refresh", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        router.push(`/assessment/${data.id}`);
        router.refresh();
        return;
      }
      // No primary (409) → build a fresh one; other errors → fall back to the result.
      if (res.status === 409) {
        const data = (await res.json()) as { redirect?: string };
        router.push(data.redirect ?? "/assess?new=1");
        return;
      }
      router.push(`/assessment/${assessmentId}`);
    } catch {
      router.push(`/assessment/${assessmentId}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Button size="lg" onClick={onClick} loading={pending} loadingLabel="Refreshing">
      Refresh assessment
    </Button>
  );
}
