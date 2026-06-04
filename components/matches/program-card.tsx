import type { MatchResult } from "@/lib/matches/types";
import { ShortlistButton } from "./shortlist-button";

const VERDICT_CLS = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible",
  reach: "bg-reach-tint text-reach",
} as const;
const VERDICT_LABEL = {
  strong: "Strong match",
  possible: "Possible",
  reach: "Reach",
} as const;

export function ProgramCard({
  match,
  isShortlisted,
}: {
  match: MatchResult;
  isShortlisted: boolean;
}) {
  const { program: p, university: u, verdict, reasons } = match;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
            {u.name} &middot; {u.city}
          </span>
          <h3 className="text-[18px] font-medium text-ink">{p.name}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12px] ${VERDICT_CLS[verdict]}`}
        >
          {VERDICT_LABEL[verdict]}
        </span>
      </header>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-soft">
        {p.tuitionMin != null && (
          <span>
            AUD {p.tuitionMin.toLocaleString()}&ndash;
            {p.tuitionMax?.toLocaleString() ?? p.tuitionMin.toLocaleString()} / yr
          </span>
        )}
        {p.minGrade != null && <span>Min grade {p.minGrade}%</span>}
        {p.minEnglish != null && (
          <span>
            IELTS {p.minEnglish}
            {p.minEnglishBand != null ? ` (band ≥ ${p.minEnglishBand})` : ""}
          </span>
        )}
        {p.intakes.length > 0 && <span>Intakes: {p.intakes.join(", ")}</span>}
      </div>
      <ul className="flex flex-col gap-1 text-[14px]">
        {reasons.map((r, i) => (
          <li key={i} className={r.positive ? "text-strong" : "text-ink-soft"}>
            {r.positive ? "✓" : "·"} {r.text}
          </li>
        ))}
      </ul>
      <footer className="flex items-center justify-between">
        <a
          href={p.source}
          target="_blank"
          rel="noreferrer"
          className="text-[12.5px] text-primary hover:underline"
        >
          Source ↗
        </a>
        <ShortlistButton programId={p.id} initialStatus={isShortlisted ? "shortlisted" : null} />
      </footer>
    </article>
  );
}
