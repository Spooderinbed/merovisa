import type { MatchResult } from "@/lib/matches/types";
import { ShortlistButton } from "./shortlist-button";
import { SourceAnchor } from "@/components/analytics/source-anchor";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO date ("2026-06-04") → "Jun 2026"; "" for anything unparseable. No Date() — keeps it deterministic. */
function freshness(iso: string): string {
  const [year, month] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!year || !name) return "";
  return `${name} ${year}`;
}

/**
 * True when the URL points past the bare host — a real program/threshold page —
 * rather than just the provider's homepage. Drives the link label so we only
 * promise "Source" when the link actually lands on the program; a bare provider
 * domain is labelled honestly as "Provider site". Independent of dataQuality,
 * which describes the figures, not where the link goes.
 */
function isDeepLink(url: string): boolean {
  const path = url.replace(/^https?:\/\//, "").split("/").slice(1).join("/");
  return path.replace(/[/?#]+$/, "").length > 0;
}

export function ProgramCard({
  match,
  isShortlisted,
}: {
  match: MatchResult;
  isShortlisted: boolean;
}) {
  const { program: p, university: u, verdict, reasons, preferenceChip } = match;
  const isEstimated = p.dataQuality === "derived";
  const qualityWord = isEstimated ? "Estimated" : "Verified";
  const checked = freshness(p.lastVerified);
  const provenance = checked ? `${qualityWord} · checked ${checked}` : qualityWord;
  const linkLabel = isDeepLink(p.source) ? "Source" : "Provider site";
  const provenanceTone = isEstimated ? "text-ink-soft" : "text-ink-faint";
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
            {u.name} &middot; {u.city}
          </span>
          <h3 className="text-[18px] font-medium text-ink">{p.name}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
              {preferenceChip.text}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12px] ${VERDICT_CLS[verdict]}`}
          >
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
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
      {p.notes ? (
        <p className="rounded-md border border-line bg-bg-tint px-3 py-2 text-[13px] text-ink-soft">
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Good to know
          </span>
          <br />
          {p.notes}
        </p>
      ) : null}
      <footer className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className={`font-mono text-[11px] uppercase tracking-wide ${provenanceTone}`}>
            {provenance}
          </span>
          <SourceAnchor
            surface="matches"
            href={p.source}
            className="text-[12.5px] text-primary hover:underline"
          >
            {linkLabel} ↗
          </SourceAnchor>
          <a href={`/checklist/${p.id}`} className="text-[12.5px] text-primary hover:underline">
            Document checklist →
          </a>
        </div>
        <ShortlistButton programId={p.id} initialStatus={isShortlisted ? "shortlisted" : null} />
      </footer>
    </article>
  );
}
