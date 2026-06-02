import type { ProfileAccuracy } from "@/lib/results/accuracy";

export function AccuracyMeter({ accuracy }: { accuracy: ProfileAccuracy }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Profile accuracy</span>
        <span className="font-mono text-[12.5px] text-ink-soft">
          {accuracy.completeness}% · {accuracy.level}
        </span>
      </div>
      <span className="mt-3 block h-2 w-full overflow-hidden rounded-pill bg-bg-tint">
        <span
          className="block h-full rounded-pill bg-accent transition-[width] duration-700 ease-calm"
          style={{ width: `${accuracy.completeness}%` }}
        />
      </span>
      <p className="mt-4 text-[15px] text-ink-soft">Sharpen your results:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {accuracy.suggestions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="text-ink">{s.label}</span>
            <span className="text-ink-faint">→ {s.gain}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
