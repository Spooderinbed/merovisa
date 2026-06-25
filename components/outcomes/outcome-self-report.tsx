"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventType } from "@/lib/outcomes/types";
import { cn } from "@/lib/utils";

// Student-voice labels for the milestones a student can self-report. Only events
// present here render a button — the root 'applied' and quiet 'withdrawn' branch
// are intentionally absent (the server already filters to legal next steps, this
// is the second guard). Founder-reviewable copy.
const EVENT_LABEL: Partial<Record<EventType, string>> = {
  offer_received: "I got an offer",
  application_rejected: "I wasn't successful",
  offer_accepted: "I accepted my offer",
  coe_issued: "I got my CoE",
  visa_lodged: "I lodged my visa",
  visa_granted: "My visa was granted",
  visa_refused: "My visa was refused",
  enrolled: "I enrolled",
};

/**
 * The funnel's self-report control (MV-39): one button per legal next milestone.
 * Clicking appends a self_reported event via /api/outcomes/event, then refreshes
 * the server data so the row advances to its new stage. The legal next steps are
 * computed server-side (selfReportNextEvents), so a click is never rejected (409).
 */
export function OutcomeSelfReport({
  attemptId,
  nextEvents,
}: {
  attemptId: string;
  nextEvents: EventType[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<EventType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = nextEvents.filter((e) => EVENT_LABEL[e] !== undefined);
  if (options.length === 0) return null;

  async function report(eventType: EventType) {
    setPending(eventType);
    setError(null);
    try {
      const res = await fetch("/api/outcomes/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId, eventType, occurredAt: new Date().toISOString() }),
      });
      if (!res.ok) {
        setError("We couldn’t save that just now — try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn’t save that just now — try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
      <span className="font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
        Report an update
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((eventType) => (
          <button
            key={eventType}
            type="button"
            disabled={pending !== null}
            onClick={() => report(eventType)}
            className={cn(
              "rounded-pill border border-line px-2.5 py-1 text-[12.5px] text-ink-soft transition-colors",
              "hover:border-ink-faint hover:text-ink disabled:opacity-50",
            )}
          >
            {pending === eventType ? "Saving…" : EVENT_LABEL[eventType]}
          </button>
        ))}
      </div>
      {error ? <span className="text-[12.5px] text-reach">{error}</span> : null}
    </div>
  );
}
