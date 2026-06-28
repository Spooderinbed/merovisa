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
  // A quiet confirm beat (audit #25): once a milestone is recorded, acknowledge it
  // before the row advances. Deliberately neutral — "Saved", no colour, no glyph —
  // because the same control reports a refusal as well as an offer, and recording
  // bad news must never read as a celebration.
  const [confirmed, setConfirmed] = useState(false);

  const options = nextEvents.filter((e) => EVENT_LABEL[e] !== undefined);

  // The beat belongs to the step the student just left; when router.refresh brings
  // down the next legal steps, the set changes and the acknowledgment clears. Reset
  // during render (React's endorsed "adjust state on prop change" pattern) rather
  // than in an effect, so there's no extra paint of a stale "Saved".
  const eventsKey = options.join(",");
  const [seenKey, setSeenKey] = useState(eventsKey);
  if (seenKey !== eventsKey) {
    setSeenKey(eventsKey);
    setConfirmed(false);
  }

  if (options.length === 0) return null;

  async function report(eventType: EventType) {
    setPending(eventType);
    setError(null);
    // Any new attempt retires the prior acknowledgment, so a stale click that then
    // fails can never leave a contradictory "Saved" sitting beside the error.
    setConfirmed(false);
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
      setConfirmed(true);
      router.refresh();
    } catch {
      setError("We couldn’t save that just now — try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
      <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
        Report an update
        {confirmed ? (
          // Eases in promptly (no front hold) so a fast router.refresh can't clear
          // it before it's seen. Neutral on purpose — see the confirmed comment above.
          <span className="animate-fade text-ink-soft">Saved</span>
        ) : null}
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
