/**
 * Trust attribution under a verdict factor: "verified <date> · <host>" with the
 * host linking out to the primary source. Matches the source-meta style used in
 * verdict-card and destination-detail (mono, faint, teal link).
 */
const hostOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

export function SourceLine({ url, lastVerified }: { url: string; lastVerified?: string }) {
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5 font-mono text-[12.5px] text-ink-faint">
      {lastVerified ? `verified ${lastVerified}` : "sourced"}
      <span className="opacity-50">·</span>
      <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {hostOf(url)}
      </a>
    </span>
  );
}
