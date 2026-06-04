"use client";

import { useState } from "react";
import type { PlanItemRow } from "@/lib/plan/types";
import { ImpactPill } from "./impact-pill";

export function PlanItemCard({ item, onChanged }: { item: PlanItemRow; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(item.status === "done");
  const [dismissed, setDismissed] = useState(item.status === "dismissed");

  const setStatus = async (status: "done" | "dismissed" | "todo") => {
    setBusy(true);
    const res = await fetch("/api/plan/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status }),
    });
    if (res.ok) {
      setDone(status === "done");
      setDismissed(status === "dismissed");
      onChanged?.();
    }
    setBusy(false);
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
          <ImpactPill impact={item.impact} />
          <h3 className={`text-[18px] font-medium text-ink ${done ? "line-through" : ""}`}>
            {item.title}
          </h3>
        </div>
        {!isClosed ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStatus("done")}
              disabled={busy}
              className="rounded-pill border border-strong bg-strong-tint px-3 py-1.5 text-[13px] font-medium text-strong hover:opacity-90"
            >
              Done
            </button>
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
      {item.body ? <p className="text-[15px] text-ink-soft">{item.body}</p> : null}
      <footer className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-ink-faint">
        {item.liftEstimate ? <span>&uarr; {item.liftEstimate}</span> : null}
        {item.timeEstimate ? <span>&#8987; {item.timeEstimate}</span> : null}
      </footer>
    </article>
  );
}
