import type { MatchResult } from "@/lib/matches/types";
import { ShortlistButton, type Status } from "./shortlist-button";
import { SourceAnchor } from "@/components/analytics/source-anchor";
import { Card } from "@/components/ui/card";
import { VerdictPill } from "@/components/ui/verdict-pill";
import { cricosCodeForUniversity } from "@/lib/data/cricos-lookup";
import { nepalEvidenceLevel } from "@/lib/data/nepal-evidence-lookup";
import { AU_NEPAL_EVIDENCE_SOURCE } from "@/lib/data/source/au-nepal-evidence-levels";

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
  initialStatus,
}: {
  match: MatchResult;
  initialStatus: Status;
}) {
  const { program: p, university: u, verdict, reasons, preferenceChip } = match;
  const isEstimated = p.dataQuality === "derived";
  const qualityWord = isEstimated ? "Estimated" : "Verified";
  const checked = freshness(p.lastVerified);
  const provenance = checked ? `${qualityWord} · checked ${checked}` : qualityWord;
  const linkLabel = isDeepLink(p.source) ? "Source" : "Provider site";
  const provenanceTone = isEstimated ? "text-ink-soft" : "text-ink-faint";
  const cricos = cricosCodeForUniversity(u.id);
  const evidence = cricos ? nepalEvidenceLevel(cricos.cricosCode) : null;
  return (
    <Card as="article" padding="md" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-caption uppercase tracking-wide text-ink-faint">
            {u.name} &middot; {u.city}
          </span>
          <h3 className="text-title font-medium text-ink">{p.name}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {preferenceChip ? (
            <span className="inline-flex items-center rounded-pill border border-line px-2.5 py-0.5 text-caption text-ink-soft">
              {preferenceChip.text}
            </span>
          ) : null}
          <VerdictPill verdict={verdict} size="lg" className="text-small" />
        </div>
      </header>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-soft">
        {p.tuitionMin != null && (
          <span>
            AUD {p.tuitionMin.toLocaleString()}&ndash;
            {p.tuitionMax?.toLocaleString() ?? p.tuitionMin.toLocaleString()} / yr
          </span>
        )}
        {p.durationYears != null && (
          <span>
            {p.durationYears} {p.durationYears === 1 ? "year" : "years"}
          </span>
        )}
        {p.minGrade != null && <span>Min grade {p.minGrade}%</span>}
        {p.minEnglish != null ? (
          <span>
            IELTS {p.minEnglish}
            {p.minEnglishBand != null ? ` (band ≥ ${p.minEnglishBand})` : ""}
          </span>
        ) : (
          <span className="text-ink-faint">English: confirm with provider</span>
        )}
        {p.intakes.length > 0 && <span>Intakes: {p.intakes.join(", ")}</span>}
      </div>
      <ul className="flex flex-col gap-1 text-meta">
        {reasons.map((r, i) => (
          <li key={i} className={r.positive ? "text-strong" : "text-ink-soft"}>
            {r.positive ? "✓" : "·"} {r.text}
          </li>
        ))}
      </ul>
      {p.notes ? (
        <Card as="p" radius="card" tone="tint" className="px-3 py-2 text-small text-ink-soft">
          <span className="text-caption uppercase tracking-wide text-ink-faint">
            Good to know
          </span>
          <br />
          {p.notes}
        </Card>
      ) : null}
      <footer className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className={`text-caption uppercase tracking-wide ${provenanceTone}`}>
            {provenance}
          </span>
          <SourceAnchor
            surface="matches"
            href={p.source}
            className="text-small text-primary hover:underline"
          >
            {linkLabel} ↗
          </SourceAnchor>
          <a href={`/checklist/${p.id}`} className="text-small text-primary hover:underline">
            Document checklist →
          </a>
          {cricos ? (
            // Honest framing (MV-36): this is the PROVIDER (institution) CRICOS code, not the
            // course code a student needs on visa form 157A — and the register is a WebForms
            // site with no deep-link, so the link is a search of the code, not a direct entry.
            <SourceAnchor
              surface="matches"
              href={cricos.source}
              title={`${cricos.cricosCode} is ${cricos.provider}'s provider (institution) CRICOS code — not the course code you'll need on visa form 157A. The official register has no direct link, so search this code there.`}
              className="text-caption text-ink-faint hover:text-primary hover:underline"
            >
              Provider CRICOS {cricos.cricosCode} &middot; search the register ↗
            </SourceAnchor>
          ) : null}
          {evidence ? (
            <SourceAnchor
              surface="matches"
              href={AU_NEPAL_EVIDENCE_SOURCE}
              title="DHA document evidence level for a Nepalese passport at this provider — Streamlined means lighter documentary expectations. Check the official tool."
              className="text-caption text-ink-faint hover:text-primary hover:underline"
            >
              {evidence} evidence &middot; Nepal ↗
            </SourceAnchor>
          ) : null}
        </div>
        <ShortlistButton programId={p.id} initialStatus={initialStatus} />
      </footer>
    </Card>
  );
}
