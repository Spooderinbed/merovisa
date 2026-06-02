import type { IntakeTiming } from "@/lib/timing/intake";

const STATUS_CLS = {
  open: "text-strong",
  tight: "text-possible",
  closed: "text-reach",
} as const;

export function IntakeTimingCard({ intake }: { intake: IntakeTiming }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Intake timing</span>
      <p className="mt-3 text-[19px] text-ink">
        Nearest realistic intake:{" "}
        <span className="font-medium">
          {intake.nearest.name} {intake.nearest.year}
        </span>
      </p>
      <p className={`mt-1 text-[15px] ${STATUS_CLS[intake.nearest.status]}`}>{intake.nearest.note}</p>
      {intake.alternatives.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          {intake.alternatives.map((o, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-[15px]">
              <span className="text-ink-soft">
                {o.name} {o.year}
              </span>
              <span className={STATUS_CLS[o.status]}>{o.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
