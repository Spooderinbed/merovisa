import Link from "next/link";
import type { MarketingDestination } from "@/lib/marketing/destinations";

const VERDICT_STYLE = {
  strong:   { label: "Strong match", cls: "bg-strong-tint text-strong" },
  possible: { label: "Possible",     cls: "bg-possible-tint text-possible" },
  reach:    { label: "Reach",        cls: "bg-reach-tint text-reach" },
} as const;

export function DestinationCard({ destination }: { destination: MarketingDestination }) {
  const v = VERDICT_STYLE[destination.match];
  return (
    <Link
      href={`/destinations/${destination.id}`}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6 text-left hover:border-line-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-flex h-8 w-10 items-center justify-center rounded-md border border-line bg-bg-tint text-xl leading-none">
            {destination.flag}
          </span>
          <span className="text-[19px] font-medium text-ink">{destination.name}</span>
        </div>
        {destination.supported ? (
          <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 font-mono text-[11.5px] ${v.cls}`}>
            {v.label}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-2.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            Not yet available
          </span>
        )}
      </div>
      <p className="text-[15px] text-ink-soft">{destination.tagline}</p>
      <hr className="border-line" />
      <div className="flex items-center justify-between font-mono text-[12.5px] text-ink-soft">
        <span>{destination.tuition}</span>
        <span>{destination.lastVerified}</span>
      </div>
    </Link>
  );
}
