"use client";

import { useId, useState } from "react";
import type { MatchResult, MatchVerdict } from "@/lib/matches/types";
import { VERDICT_LABELS } from "@/lib/scoring/verdict-labels";
import { ProgramCard } from "./program-card";
import type { Status } from "./shortlist-button";

/**
 * One verdict band on the matches page, with progressive disclosure so the page
 * opens focused instead of as a wall of ~86 cards. Shows the first
 * `initialVisible` cards (0 for Reach, which stays collapsed behind its count);
 * a "show more" toggle reveals the rest. Hidden cards are NOT mounted until
 * expanded — that's the real perf win, so the DOM holds a handful of cards, not
 * all of them. The header always shows the true total.
 */
export function VerdictGroup({
  verdict,
  matches,
  statusById,
  initialVisible = 3,
  /** Passed through to each card's checklist link — see `ProgramCard`. */
  checklistBase = "",
}: {
  verdict: MatchVerdict;
  matches: MatchResult[];
  statusById: Map<string, Status>;
  initialVisible?: number;
  checklistBase?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (matches.length === 0) return null;

  const total = matches.length;
  const canCollapse = total > initialVisible;
  const visible = expanded || !canCollapse ? matches : matches.slice(0, initialVisible);
  const hidden = total - visible.length;
  const noun = hidden === 1 ? "match" : "matches";
  // "Show N reach matches" when nothing is shown yet (collapsed Reach); "Show N
  // more strong matches" when some already are.
  const showLabel =
    visible.length === 0
      ? `Show ${hidden} ${verdict} ${noun}`
      : `Show ${hidden} more ${verdict} ${noun}`;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title font-medium text-ink">
        {VERDICT_LABELS[verdict].groupLabel} ({total})
      </h2>
      <div id={listId} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((m) => (
          <ProgramCard
            key={m.program.id}
            match={m}
            initialStatus={statusById.get(m.program.id) ?? null}
            checklistBase={checklistBase}
          />
        ))}
      </div>
      {canCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="inline-flex items-center gap-1.5 self-start rounded-pill border border-line-2 px-4 py-1.5 text-small text-ink-soft transition-colors hover:bg-bg-tint"
        >
          {expanded ? "Show fewer" : showLabel}
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </button>
      ) : null}
    </section>
  );
}
