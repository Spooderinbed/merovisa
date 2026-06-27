"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlanItemRow } from "@/lib/plan/types";
import { completionFor } from "@/lib/plan/completion";
import { sourcesFor } from "@/lib/plan/sources";
import { checklistStageForPlanKind } from "@/lib/checklist/plan-links";
import { SourceLine } from "@/components/results/source-line";
import { ImpactPill } from "./impact-pill";
import { track } from "@/lib/analytics/events";

/** Mono-uppercase state pill, shared by In progress / Done / Dismissed. */
const statePill =
  "rounded-pill border border-line-2 bg-bg-tint px-2.5 py-0.5 font-mono text-[11.5px] uppercase tracking-wide text-ink-soft";

export function PlanItemCard({ item, onChanged }: { item: PlanItemRow; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(item.status === "done");
  const [dismissed, setDismissed] = useState(item.status === "dismissed");
  const [started, setStarted] = useState(item.startedAt !== null);
  const [error, setError] = useState<string | null>(null);
  const meta = completionFor(item.kind);
  // Reverse Plan→Checklist link: when this action mirrors a checklist requirement,
  // tag which checklist stage it belongs to — a quiet classification (shown on open
  // and closed cards alike), in the checklist's own "now" / "after offer" vocabulary.
  const checklistStage = checklistStageForPlanKind(item.kind);

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/plan/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, ...body }),
    }).catch(() => null);
    setBusy(false);
    return !!res?.ok;
  };

  // A swallowed action (network drop or a non-ok response) used to leave the card
  // unchanged with no feedback — on a flaky connection that reads as a broken app.
  // Surface it so the student knows the tap didn't take and can retry.
  const SAVE_ERROR = "We couldn’t save that just now — try again.";

  const setStatus = async (status: "done" | "dismissed" | "todo") => {
    if (await post({ status })) {
      track("plan_action", {
        kind: item.kind,
        action: status === "todo" ? "reopened" : status,
      });
      setDone(status === "done");
      setDismissed(status === "dismissed");
      setStarted(false);
      onChanged?.();
    } else {
      setError(SAVE_ERROR);
    }
  };

  const setInProgress = async (next: boolean) => {
    if (await post({ started: next })) {
      track("plan_action", { kind: item.kind, action: next ? "started" : "reopened" });
      setStarted(next);
      onChanged?.();
    } else {
      setError(SAVE_ERROR);
    }
  };

  const isClosed = done || dismissed;
  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border p-5 ${
        isClosed ? "border-line bg-bg-tint opacity-70" : "border-line bg-surface"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <ImpactPill impact={item.impact} />
            {checklistStage ? (
              <span className={statePill}>
                Checklist · {checklistStage === "now" ? "Now" : "After offer"}
              </span>
            ) : null}
            {!isClosed && started ? <span className={statePill}>In progress</span> : null}
            {/* Done = completed; Dismissed = opted out, so its title keeps no strike. */}
            {done ? <span className={statePill}>Done</span> : null}
            {dismissed ? <span className={statePill}>Dismissed</span> : null}
          </div>
          <h3 className={`text-[18px] font-medium text-ink ${done ? "line-through" : ""}`}>
            {item.title}
          </h3>
        </div>
        {!isClosed ? (
          <div className="flex flex-wrap gap-2">
            {meta.completion === "verified" ? (
              // Verified items complete from account state — the CTA goes to the
              // surface that completes them; there is nothing to mark by hand.
              <Link
                href={meta.href}
                className="rounded-pill border border-strong bg-strong-tint px-3 py-1.5 text-[13px] font-medium text-strong hover:opacity-90"
              >
                {meta.cta}
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStatus("done")}
                  disabled={busy}
                  className="rounded-pill border border-strong bg-strong-tint px-3 py-1.5 text-[13px] font-medium text-strong hover:opacity-90"
                >
                  Done
                </button>
                {started ? (
                  <button
                    type="button"
                    onClick={() => setInProgress(false)}
                    disabled={busy}
                    className="rounded-pill border border-line-2 px-3 py-1.5 text-[13px] text-ink-soft hover:bg-bg-tint"
                  >
                    Back to open
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInProgress(true)}
                    disabled={busy}
                    className="rounded-pill border border-line-2 px-3 py-1.5 text-[13px] text-ink-soft hover:bg-bg-tint"
                  >
                    Mark as in progress
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setStatus("dismissed")}
              disabled={busy}
              className="rounded-pill border border-line-2 px-3 py-1.5 text-[13px] text-ink-soft hover:bg-bg-tint"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStatus("todo")}
            disabled={busy}
            className="rounded-pill border border-line-2 px-3 py-1.5 text-[13px] text-ink-soft hover:bg-bg-tint"
          >
            Undo
          </button>
        )}
      </header>
      {error ? (
        <p role="alert" className="text-[13px] text-reach">
          {error}
        </p>
      ) : null}
      {item.body ? <p className="text-[15px] text-ink-soft">{item.body}</p> : null}
      {sourcesFor(item.kind).map((src) => (
        <SourceLine key={src.url} url={src.url} lastVerified={src.lastVerified} surface="plan" />
      ))}
      <footer className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-ink-faint">
        {item.liftEstimate ? <span>&uarr; {item.liftEstimate}</span> : null}
        {item.timeEstimate ? <span>&#8987; {item.timeEstimate}</span> : null}
      </footer>
    </article>
  );
}
