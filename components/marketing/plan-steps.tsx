import { cn } from "@/lib/utils";
import { PLAN_STEPS } from "@/lib/marketing/plan-steps";

/** Plan-step accordion (spec §4.5). Native <details name="mv-plan"> gives a
 *  single-open accordion with zero JS; step 02 is open at rest. Server component. */
export function PlanSteps() {
  return (
    <div className="surface steps">
      {PLAN_STEPS.map((s) => (
        <details
          key={s.n}
          name="mv-plan"
          open={s.open}
          className={cn("step", s.state === "Done" && "done", s.state === "Now" && "now")}
        >
          <summary className="step-head">
            <span className="step-n">{s.n}</span>
            <span className="step-t">{s.title}</span>
            <span className="step-pill">{s.state}</span>
            <span className="chev" aria-hidden>›</span>
          </summary>
          <div className="step-detail"><div className="step-detail-inner">
            <p>{s.detail} <span className="cite">{s.cite}</span></p>
          </div></div>
        </details>
      ))}
    </div>
  );
}
