import type { MatchResult, MatchVerdict } from "@/lib/matches/types";
import { ProgramCard } from "./program-card";
import type { Status } from "./shortlist-button";

const HEADLINE = {
  strong: "Strong matches",
  possible: "Possible",
  reach: "Reach",
} as const;

export function VerdictGroup({
  verdict,
  matches,
  statusById,
}: {
  verdict: MatchVerdict;
  matches: MatchResult[];
  statusById: Map<string, Status>;
}) {
  if (matches.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[20px] font-medium text-ink">
        {HEADLINE[verdict]} ({matches.length})
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {matches.map((m) => (
          <ProgramCard
            key={m.program.id}
            match={m}
            initialStatus={statusById.get(m.program.id) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
