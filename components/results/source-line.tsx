import { SourceAnchor } from "@/components/analytics/source-anchor";
import type { SourceSurface } from "@/lib/analytics/events";

/**
 * Trust attribution under a verdict factor: "verified <date> · <host>" with the
 * host linking out to the primary source. Matches the source-meta style used in
 * verdict-card and destination-detail (mono, faint, teal link).
 */
const hostOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

export function SourceLine({
  url,
  lastVerified,
  surface,
}: {
  url: string;
  lastVerified?: string;
  surface: SourceSurface;
}) {
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5 font-mono text-small text-ink-faint">
      {lastVerified ? `verified ${lastVerified}` : "sourced"}
      <span className="opacity-50">·</span>
      <SourceAnchor surface={surface} href={url} className="text-primary hover:underline">
        {hostOf(url)}
      </SourceAnchor>
    </span>
  );
}
