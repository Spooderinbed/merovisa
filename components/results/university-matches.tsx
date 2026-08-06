"use client";

import type { MatchResult } from "@/lib/matches/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VerdictPill } from "@/components/ui/verdict-pill";
import { SourceLine } from "@/components/results/source-line";
import { SourceAnchor } from "@/components/analytics/source-anchor";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";
import { track } from "@/lib/analytics/events";
import { EmailInsteadLink } from "@/components/auth/email-instead-link";
import { startClaimOAuth } from "@/lib/auth/start-claim-oauth";

function tuition(p: MatchResult["program"]): string | null {
  if (p.tuitionMin == null) return null;
  const max = (p.tuitionMax ?? p.tuitionMin).toLocaleString();
  return `AUD ${p.tuitionMin.toLocaleString()}–${max}/yr`;
}

function MatchCard({ m }: { m: MatchResult }) {
  const { program: p, university: u, verdict, reasons, preferenceChip, evidence } = m;
  const fee = tuition(p);
  return (
    <Card as="article" radius="card" padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-caption uppercase tracking-wide text-ink-faint">
            {u.name} · {u.city}
          </span>
          <span className="text-ink">{p.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 text-caption text-ink-soft">
              {preferenceChip.text}
            </span>
          ) : null}
          <VerdictPill verdict={verdict} size="md" />
        </div>
      </div>
      {fee ? <p className="mt-1 text-body text-ink-soft">{fee}</p> : null}
      <ul className="mt-1 flex flex-col gap-0.5 text-meta">
        {reasons.map((r, i) => (
          <li key={i} className={r.positive ? "text-strong" : "text-ink-soft"}>
            {r.positive ? "✓" : "·"} {r.text}
          </li>
        ))}
      </ul>
      {p.notes ? (
        <Card as="p" radius="card" tone="tint" className="mt-2 px-3 py-2 text-small text-ink-soft">
          <span className="text-caption uppercase tracking-wide text-ink-faint">
            Good to know
          </span>
          <br />
          {p.notes}
        </Card>
      ) : null}
      {evidence ? (
        <SourceAnchor
          surface="matches"
          href={evidence.source}
          title="DHA document evidence level for a Nepalese passport at this provider — Streamlined means lighter documentary expectations. Check the official tool."
          className="mt-2 inline-flex text-caption text-ink-faint hover:text-primary hover:underline"
        >
          {evidence.level} evidence · Nepal ↗
        </SourceAnchor>
      ) : null}
      <SourceLine url={p.source} lastVerified={p.lastVerified} surface="matches" />
    </Card>
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
        <h3 className="text-headline">University matches</h3>
        <span className="text-small text-ink-faint">{total} matched your profile</span>
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
            <Card radius="card" className="relative overflow-hidden">
              <div className="flex flex-col gap-3 p-4 blur-[6px] select-none" aria-hidden>
                {locked.slice(0, 3).map((m) => (
                  <div key={m.program.id} className="flex items-center justify-between">
                    <span className="text-ink">{m.program.name}</span>
                    <span className="text-caption text-ink-faint">{VERDICT_LABELS[m.verdict].label}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 grid place-items-center bg-surface/60">
                <div className="flex flex-col items-center gap-2">
                  <Button onClick={unlock} disabled={!assessmentId}>
                    Unlock all {total} matches →
                  </Button>
                  <EmailInsteadLink assessmentId={assessmentId} />
                </div>
              </div>
            </Card>
          ) : (
            // ≤3 matches: nothing to blur, but anonymous users still need a way in.
            <Card radius="card" padding="sm" className="flex flex-col items-center gap-2 text-center">
              <Button onClick={unlock} disabled={!assessmentId}>
                Sign in to save your matches →
              </Button>
              <EmailInsteadLink assessmentId={assessmentId} />
            </Card>
          )}
        </>
      )}
    </section>
  );
}
