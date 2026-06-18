"use client";

import type { MatchResult } from "@/lib/matches/types";
import { Button } from "@/components/ui/button";
import { SourceLine } from "@/components/results/source-line";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/events";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

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

function tuition(p: MatchResult["program"]): string | null {
  if (p.tuitionMin == null) return null;
  const max = (p.tuitionMax ?? p.tuitionMin).toLocaleString();
  return `AUD ${p.tuitionMin.toLocaleString()}–${max}/yr`;
}

function MatchCard({ m }: { m: MatchResult }) {
  const { program: p, university: u, verdict, reasons, preferenceChip } = m;
  const fee = tuition(p);
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
            {u.name} · {u.city}
          </span>
          <span className="text-ink">{p.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {preferenceChip.text}
            </span>
          ) : null}
          <span className={cn("rounded-pill px-2.5 py-0.5 font-mono text-[11.5px]", LEVEL_CLS[verdict])}>
            {LEVEL_LABEL[verdict]}
          </span>
        </div>
      </div>
      {fee ? <p className="mt-1 text-[15px] text-ink-soft">{fee}</p> : null}
      <ul className="mt-1 flex flex-col gap-0.5 text-[14px]">
        {reasons.map((r, i) => (
          <li key={i} className={r.positive ? "text-strong" : "text-ink-soft"}>
            {r.positive ? "✓" : "·"} {r.text}
          </li>
        ))}
      </ul>
      <SourceLine url={p.source} lastVerified={p.lastVerified} surface="matches" />
    </article>
  );
}

export function UniversityMatches({
  matches,
  total,
  assessmentId = null,
  unlocked = false,
}: {
  matches: MatchResult[];
  total: number;
  assessmentId?: string | null;
  unlocked?: boolean;
}) {
  const free = matches.slice(0, 3);
  const locked = matches.slice(3);

  // Every anonymous unlock starts Google OAuth directly (via the shared
  // sign-claim → signInWithOAuth flow), instead of scrolling to a separate CTA.
  const unlock = () => {
    track("gate_cta_clicked");
    void startClaimOAuth(assessmentId);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[21px]">University matches</h3>
        <span className="font-mono text-[12.5px] text-ink-faint">{total} matched your profile</span>
      </div>

      {unlocked ? (
        matches.map((m) => <MatchCard key={m.program.id} m={m} />)
      ) : (
        <>
          {free.map((m) => (
            <MatchCard key={m.program.id} m={m} />
          ))}
          {locked.length > 0 ? (
            // >3 matches: peek-through blur over the remaining rows, unlock overlaid.
            <div className="relative overflow-hidden rounded-md border border-line bg-surface">
              <div className="flex flex-col gap-3 p-4 blur-[6px] select-none" aria-hidden>
                {locked.slice(0, 3).map((m) => (
                  <div key={m.program.id} className="flex items-center justify-between">
                    <span className="text-ink">{m.program.name}</span>
                    <span className="font-mono text-[11.5px] text-ink-faint">{LEVEL_LABEL[m.verdict]}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 grid place-items-center bg-surface/60">
                <Button onClick={unlock} disabled={!assessmentId}>
                  Unlock all {total} matches →
                </Button>
              </div>
            </div>
          ) : (
            // ≤3 matches: nothing to blur, but anonymous users still need a way in.
            <div className="rounded-md border border-line bg-surface p-4 text-center">
              <Button onClick={unlock} disabled={!assessmentId}>
                Sign in to save your matches →
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
