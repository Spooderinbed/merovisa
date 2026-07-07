import Link from "next/link";
import type { MarketingDestination } from "@/lib/marketing/destinations";
import { Card } from "@/components/ui/card";
import { IsoPill } from "@/components/ui/iso-pill";
import { VerdictPill } from "@/components/ui/verdict-pill";

export function DestinationCard({ destination }: { destination: MarketingDestination }) {
  return (
    <Card
      as={Link}
      href={`/destinations/${destination.id}`}
      padding="lg"
      className="flex flex-col gap-3 text-left hover:border-line-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IsoPill code={destination.iso} />
          <span className="text-title font-medium text-ink">{destination.name}</span>
        </div>
        {destination.supported ? (
          <VerdictPill verdict={destination.match} size="md" />
        ) : (
          <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-2.5 py-0.5 font-mono text-caption text-ink-soft">
            Not yet available
          </span>
        )}
      </div>
      <p className="text-body text-ink-soft">{destination.tagline}</p>
      <hr className="border-line" />
      <div className="flex items-center justify-between font-mono text-small text-ink-soft">
        <span>{destination.tuition}</span>
        <span>{destination.lastVerified}</span>
      </div>
    </Card>
  );
}
