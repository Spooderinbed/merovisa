"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";
import { verifiedCitation, isSourced } from "@/lib/marketing/provenance";

/** Plan-step accordion (spec §4.5). A single-open accordion driven by a JS `.open`
 *  class, NOT native <details>. A closed native <details> display:none's its
 *  content, so the grid-template-rows 0fr→1fr ease has no prior frame to
 *  interpolate from and snaps open (MV-117); the `.open`-class pattern keeps the
 *  detail rendered so it animates, matching the verdict-panel dims. The open step
 *  is seeded from the data (step 02) so the rest state is server-rendered filled
 *  and hydration-stable (no window/clock read in render). */
export function PlanSteps() {
  const [openN, setOpenN] = useState<string | null>(
    () => PLAN_STEPS.find((s) => s.open)?.n ?? null,
  );
  return (
    <div className="surface steps">
      {PLAN_STEPS.map((s) => {
        const open = openN === s.n;
        return (
          <div
            key={s.n}
            className={cn("step", open && "open", s.state === "Done" && "done", s.state === "Now" && "now")}
          >
            <button
              type="button"
              className="step-head"
              aria-expanded={open}
              onClick={() => setOpenN(open ? null : s.n)}
            >
              <span className="step-n">{s.n}</span>
              <span className="step-t">{s.title}</span>
              <span className="step-pill">{s.state}</span>
              <span className="chev" aria-hidden>›</span>
            </button>
            <div className="step-detail"><div className="step-detail-inner">
              <p>{s.detail} <span className="cite">{isSourced(s.cite) ? verifiedCitation(s.cite) : s.cite.label}</span></p>
            </div></div>
          </div>
        );
      })}
    </div>
  );
}
