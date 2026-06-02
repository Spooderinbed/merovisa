import type { UniversityMatch } from "@/lib/matching/universities";
import { Button } from "@/components/ui/button";
import { cn, formatUsd } from "@/lib/utils";

const LEVEL_CLS = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible",
  reach: "bg-reach-tint text-reach",
} as const;

const LEVEL_LABEL = {
  strong: "Strong match",
  possible: "Possible",
  reach: "Reach",
} as const;

export function UniversityMatches({
  matches,
  total,
  onUnlock,
}: {
  matches: UniversityMatch[];
  total: number;
  onUnlock: () => void;
}) {
  const free = matches.slice(0, 3);
  const locked = matches.slice(3);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[21px]">University matches</h3>
        <span className="font-mono text-[12.5px] text-ink-faint">{total} matched your profile</span>
      </div>

      {free.map((m) => (
        <article key={m.university.id} className="rounded-md border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink">{m.university.name}</span>
            <span className={cn("rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", LEVEL_CLS[m.matchLevel])}>
              {LEVEL_LABEL[m.matchLevel]}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-ink-soft">
            {m.university.city} · {formatUsd(m.university.tuitionUsdPerYear.min)}–
            {formatUsd(m.university.tuitionUsdPerYear.max)}/yr
          </p>
          <p className="mt-1 text-[15px] text-ink-soft">{m.reason}</p>
        </article>
      ))}

      {locked.length > 0 ? (
        <div className="relative overflow-hidden rounded-md border border-line bg-surface">
          <div className="flex flex-col gap-3 p-4 blur-[6px] select-none" aria-hidden>
            {locked.slice(0, 3).map((m) => (
              <div key={m.university.id} className="flex items-center justify-between">
                <span className="text-ink">{m.university.name}</span>
                <span className="font-mono text-[11.5px] text-ink-faint">{LEVEL_LABEL[m.matchLevel]}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 grid place-items-center bg-surface/60">
            <Button onClick={onUnlock}>Unlock all {total} matches →</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
