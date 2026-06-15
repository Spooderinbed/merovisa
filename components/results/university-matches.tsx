import type { UniversityMatch } from "@/lib/matching/universities";
import { Button } from "@/components/ui/button";
import { SourceLine } from "@/components/results/source-line";
import { cn, formatUsd } from "@/lib/utils";
import { track } from "@/lib/analytics/events";

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

function MatchCard({ m }: { m: UniversityMatch }) {
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink">{m.university.name}</span>
        <div className="flex items-center gap-2">
          {m.preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {m.preferenceChip.text}
            </span>
          ) : null}
          <span className={cn("rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", LEVEL_CLS[m.matchLevel])}>
            {LEVEL_LABEL[m.matchLevel]}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[15px] text-ink-soft">
        {m.university.city} · {formatUsd(m.university.tuitionUsdPerYear.min)}–
        {formatUsd(m.university.tuitionUsdPerYear.max)}/yr
      </p>
      <p className="mt-1 text-[15px] text-ink-soft">{m.reason}</p>
      <SourceLine url={m.university.source} lastVerified={m.university.lastVerified} surface="matches" />
    </article>
  );
}

export function UniversityMatches({
  matches,
  total,
  onUnlock,
  unlocked = false,
}: {
  matches: UniversityMatch[];
  total: number;
  onUnlock: () => void;
  unlocked?: boolean;
}) {
  const free = matches.slice(0, 3);
  const locked = matches.slice(3);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[21px]">University matches</h3>
        <span className="font-mono text-[12.5px] text-ink-faint">{total} matched your profile</span>
      </div>

      {unlocked ? (
        matches.map((m) => <MatchCard key={m.university.id} m={m} />)
      ) : (
        <>
          {free.map((m) => (
            <MatchCard key={m.university.id} m={m} />
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
                <Button
                  onClick={() => {
                    track("gate_cta_clicked");
                    onUnlock();
                  }}
                >
                  Unlock all {total} matches →
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
